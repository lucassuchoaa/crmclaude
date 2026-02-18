import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { normalizePhone, jidToPhone } from '../utils/phoneUtils.js';
import * as evo from '../services/evolutionApi.js';

const router = express.Router();

/**
 * POST /api/whatsapp/instance/connect
 * Cria instância (se necessário) e retorna QR code
 */
router.post('/instance/connect', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Apenas gerentes podem conectar WhatsApp.' });

    const db = getDatabase();
    let instance = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    const instanceName = `crm_gerente_${userId.replace(/-/g, '').slice(0, 12)}`;

    if (!instance) {
      // Criar instância na Evolution API
      try {
        await evo.createInstance(instanceName);
      } catch (e) {
        // Instância pode já existir na Evolution mas não no DB
        console.warn('createInstance warning:', e.message);
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO whatsapp_instances (id, gerente_id, instance_name, status)
        VALUES (?, ?, ?, 'connecting')
      `).run(id, userId, instanceName);
      instance = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    }

    // Conectar e obter QR
    let qrData = null;
    try {
      const connectRes = await evo.connectInstance(instance.instance_name);
      if (connectRes?.base64) {
        qrData = connectRes.base64;
        db.prepare(`
          UPDATE whatsapp_instances SET status = 'qr_pending', qr_code = ?, qr_expires_at = datetime('now', '+2 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE gerente_id = ?
        `).run(qrData, userId);
      } else if (connectRes?.instance?.state === 'open') {
        db.prepare(`
          UPDATE whatsapp_instances SET status = 'connected', updated_at = CURRENT_TIMESTAMP
          WHERE gerente_id = ?
        `).run(userId);
      }
    } catch (e) {
      console.error('connectInstance error:', e.message);
    }

    const updated = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    res.json({
      status: updated.status,
      qr_code: updated.qr_code,
      instance_name: updated.instance_name,
    });
  } catch (error) {
    console.error('WhatsApp connect error:', error);
    res.status(500).json({ error: 'Erro ao conectar WhatsApp.' });
  }
});

/**
 * GET /api/whatsapp/instance/status
 */
router.get('/instance/status', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    if (!instance) {
      return res.json({ status: 'disconnected', connected: false });
    }

    // Verificar status real na Evolution API
    try {
      const state = await evo.getInstanceStatus(instance.instance_name);
      const realStatus = state?.instance?.state === 'open' ? 'connected' : instance.status;
      if (realStatus !== instance.status) {
        db.prepare('UPDATE whatsapp_instances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE gerente_id = ?')
          .run(realStatus, userId);
      }
      return res.json({
        status: realStatus,
        connected: realStatus === 'connected',
        connected_phone: instance.connected_phone,
        instance_name: instance.instance_name,
      });
    } catch {
      return res.json({
        status: instance.status,
        connected: instance.status === 'connected',
        connected_phone: instance.connected_phone,
      });
    }
  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ error: 'Erro ao verificar status.' });
  }
});

/**
 * GET /api/whatsapp/instance/qr
 */
router.get('/instance/qr', authenticate, (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = db.prepare('SELECT qr_code, status, qr_expires_at FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    if (!instance) return res.json({ qr_code: null, status: 'disconnected' });

    res.json({
      qr_code: instance.qr_code,
      status: instance.status,
      expired: instance.qr_expires_at && new Date(instance.qr_expires_at) < new Date(),
    });
  } catch (error) {
    console.error('WhatsApp QR error:', error);
    res.status(500).json({ error: 'Erro ao obter QR code.' });
  }
});

/**
 * POST /api/whatsapp/instance/disconnect
 */
router.post('/instance/disconnect', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    if (instance) {
      try {
        await evo.logoutInstance(instance.instance_name);
      } catch (e) {
        console.warn('logoutInstance warning:', e.message);
      }
      db.prepare(`
        UPDATE whatsapp_instances SET status = 'disconnected', qr_code = NULL, connected_phone = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE gerente_id = ?
      `).run(userId);
    }

    res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('WhatsApp disconnect error:', error);
    res.status(500).json({ error: 'Erro ao desconectar.' });
  }
});

/**
 * POST /api/whatsapp/webhook
 * Recebe eventos da Evolution API
 */
router.post('/webhook', (req, res) => {
  try {
    // Validar API key
    const apiKey = req.headers.apikey || req.query.apikey;
    if (apiKey !== process.env.EVOLUTION_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { event, data, instance } = req.body;
    const instanceName = instance || data?.instance;

    if (!event || !instanceName) {
      return res.status(200).json({ ok: true });
    }

    const db = getDatabase();
    const inst = db.prepare('SELECT * FROM whatsapp_instances WHERE instance_name = ?').get(instanceName);

    if (!inst) {
      console.warn(`Webhook: unknown instance "${instanceName}"`);
      return res.status(200).json({ ok: true });
    }

    // CONNECTION_UPDATE
    if (event === 'connection.update') {
      const state = data?.state || data?.status;
      let newStatus = inst.status;
      if (state === 'open' || state === 'connected') newStatus = 'connected';
      else if (state === 'close' || state === 'disconnected') newStatus = 'disconnected';
      else if (state === 'connecting') newStatus = 'connecting';

      const phone = data?.phoneNumber || data?.wuid?.split(':')[0] || null;
      db.prepare(`
        UPDATE whatsapp_instances SET status = ?, connected_phone = COALESCE(?, connected_phone), qr_code = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStatus, phone, inst.id);
    }

    // QRCODE_UPDATED
    if (event === 'qrcode.updated') {
      const qr = data?.qrcode?.base64 || data?.base64 || null;
      if (qr) {
        db.prepare(`
          UPDATE whatsapp_instances SET status = 'qr_pending', qr_code = ?, qr_expires_at = datetime('now', '+2 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(qr, inst.id);
      }
    }

    // MESSAGES_UPSERT
    if (event === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : (data?.messages || [data]);
      for (const m of msgs) {
        if (!m) continue;
        const key = m.key || {};
        // Skip mensagens enviadas por nós
        if (key.fromMe) continue;

        const remoteJid = key.remoteJid || '';
        // Skip grupo e status
        if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        if (!text) continue;

        const waMessageId = key.id;
        // Dedup: skip se já existe
        if (waMessageId) {
          const existing = db.prepare('SELECT id FROM messages WHERE whatsapp_message_id = ?').get(waMessageId);
          if (existing) continue;
        }

        const senderPhone = jidToPhone(remoteJid);
        const gerenteId = inst.gerente_id;

        // Buscar parceiro pelo telefone
        const parceiros = db.prepare(`
          SELECT id, tel FROM users WHERE role = 'parceiro' AND manager_id = ? AND is_active = 1
        `).all(gerenteId);

        const parceiro = parceiros.find(p => normalizePhone(p.tel) === senderPhone);

        if (!parceiro) {
          console.warn(`Webhook: no parceiro match for phone ${senderPhone} (gerente ${gerenteId})`);
          continue;
        }

        const msgId = uuidv4();
        db.prepare(`
          INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, source, whatsapp_message_id)
          VALUES (?, ?, ?, ?, 'user', ?, 'text', 'whatsapp', ?)
        `).run(msgId, gerenteId, parceiro.id, parceiro.id, text, waMessageId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ok: true }); // Sempre 200 para não travar retry da Evolution
  }
});

export default router;
