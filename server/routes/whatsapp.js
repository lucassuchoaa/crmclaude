import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { normalizePhone, jidToPhone } from '../utils/phoneUtils.js';
import * as evo from '../services/evolutionApi.js';
import { recordInboxMessage } from '../services/cadenceRunner.js';

const router = express.Router();

router.post('/instance/connect', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Apenas gerentes podem conectar WhatsApp.' });

    const db = getDatabase();
    let instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    const instanceName = `crm_gerente_${userId.replace(/-/g, '').slice(0, 12)}`;

    if (!instance) {
      try { await evo.createInstance(instanceName); } catch (e) { console.warn('createInstance warning:', e.message); }

      const id = uuidv4();
      await db.prepare(`
        INSERT INTO whatsapp_instances (id, gerente_id, instance_name, status) VALUES (?, ?, ?, 'connecting')
      `).run(id, userId, instanceName);
      instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    }

    let qrData = null;
    try {
      const connectRes = await evo.connectInstance(instance.instance_name);
      console.log('Evolution connectInstance response keys:', Object.keys(connectRes || {}));

      const qr = connectRes?.base64 || connectRes?.qrcode?.base64 || connectRes?.qrcode || null;
      if (qr && typeof qr === 'string') {
        qrData = qr;
        await db.prepare(`
          UPDATE whatsapp_instances SET status = 'qr_pending', qr_code = ?, qr_expires_at = datetime('now', '+2 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE gerente_id = ?
        `).run(qrData, userId);
      } else if (connectRes?.instance?.state === 'open' || connectRes?.state === 'open') {
        await db.prepare(`
          UPDATE whatsapp_instances SET status = 'connected', updated_at = CURRENT_TIMESTAMP WHERE gerente_id = ?
        `).run(userId);
      }
    } catch (e) { console.error('connectInstance error:', e.message); }

    const updated = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    res.json({ status: updated.status, qr_code: updated.qr_code, instance_name: updated.instance_name });
  } catch (error) {
    console.error('WhatsApp connect error:', error);
    res.status(500).json({ error: 'Erro ao conectar WhatsApp.' });
  }
});

router.get('/instance/status', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    if (!instance) return res.json({ status: 'disconnected', connected: false });

    try {
      const state = await evo.getInstanceStatus(instance.instance_name);
      const realStatus = state?.instance?.state === 'open' ? 'connected' : instance.status;
      if (realStatus !== instance.status) {
        await db.prepare('UPDATE whatsapp_instances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE gerente_id = ?')
          .run(realStatus, userId);
      }
      return res.json({ status: realStatus, connected: realStatus === 'connected', connected_phone: instance.connected_phone, instance_name: instance.instance_name });
    } catch {
      return res.json({ status: instance.status, connected: instance.status === 'connected', connected_phone: instance.connected_phone });
    }
  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ error: 'Erro ao verificar status.' });
  }
});

router.get('/instance/qr', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);
    if (!instance) return res.json({ qr_code: null, status: 'disconnected' });
    if (instance.status === 'connected') return res.json({ qr_code: null, status: 'connected', expired: false });

    const isExpired = !instance.qr_code || !instance.qr_expires_at || new Date(instance.qr_expires_at) < new Date();

    if (isExpired && instance.instance_name) {
      try {
        const connectRes = await evo.connectInstance(instance.instance_name);
        if (connectRes?.base64) {
          const qr = connectRes.base64;
          await db.prepare(`
            UPDATE whatsapp_instances SET status = 'qr_pending', qr_code = ?, qr_expires_at = datetime('now', '+2 minutes'), updated_at = CURRENT_TIMESTAMP
            WHERE gerente_id = ?
          `).run(qr, userId);
          return res.json({ qr_code: qr, status: 'qr_pending', expired: false });
        }
        if (connectRes?.instance?.state === 'open') {
          await db.prepare('UPDATE whatsapp_instances SET status = ?, qr_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE gerente_id = ?')
            .run('connected', userId);
          return res.json({ qr_code: null, status: 'connected', expired: false });
        }
      } catch (e) { console.warn('QR refresh from Evolution API failed:', e.message); }
    }

    res.json({ qr_code: instance.qr_code, status: instance.status, expired: isExpired });
  } catch (error) {
    console.error('WhatsApp QR error:', error);
    res.status(500).json({ error: 'Erro ao obter QR code.' });
  }
});

router.post('/instance/disconnect', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    if (role !== 'gerente') return res.status(403).json({ error: 'Acesso negado.' });

    const db = getDatabase();
    const instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ?').get(userId);

    if (instance) {
      try { await evo.logoutInstance(instance.instance_name); } catch (e) { console.warn('logoutInstance warning:', e.message); }
      await db.prepare(`
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

router.post('/webhook', async (req, res) => {
  try {
    const apiKey = req.headers.apikey || req.headers['x-api-key'] || req.query.apikey;
    const expectedKey = process.env.EVOLUTION_API_KEY;
    if (expectedKey && apiKey !== expectedKey) {
      console.warn('Webhook: invalid API key received. Header keys:', Object.keys(req.headers).join(', '));
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const body = req.body;
    console.log('[Webhook] Event received:', body?.event, 'Instance:', body?.instance || body?.data?.instance);

    const { event, data, instance } = body;
    const instanceName = instance || data?.instance;
    if (!event || !instanceName) return res.status(200).json({ ok: true });

    const db = getDatabase();
    const inst = await db.prepare('SELECT * FROM whatsapp_instances WHERE instance_name = ?').get(instanceName);
    if (!inst) {
      console.warn(`Webhook: unknown instance "${instanceName}"`);
      return res.status(200).json({ ok: true });
    }

    if (event === 'connection.update') {
      const state = data?.state || data?.status;
      let newStatus = inst.status;
      if (state === 'open' || state === 'connected') newStatus = 'connected';
      else if (state === 'close' || state === 'disconnected') newStatus = 'disconnected';
      else if (state === 'connecting') newStatus = 'connecting';

      const phone = data?.phoneNumber || data?.wuid?.split(':')[0] || null;
      await db.prepare(`
        UPDATE whatsapp_instances SET status = ?, connected_phone = COALESCE(?, connected_phone), qr_code = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStatus, phone, inst.id);
    }

    if (event === 'qrcode.updated') {
      const qr = data?.qrcode?.base64 || data?.base64 || null;
      if (qr) {
        await db.prepare(`
          UPDATE whatsapp_instances SET status = 'qr_pending', qr_code = ?, qr_expires_at = datetime('now', '+2 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(qr, inst.id);
      }
    }

    if (event === 'messages.upsert') {
      const msgs = Array.isArray(data) ? data : (data?.messages || [data]);
      for (const m of msgs) {
        if (!m) continue;
        const key = m.key || {};
        if (key.fromMe) continue;

        const remoteJid = key.remoteJid || '';
        if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        if (!text) continue;

        const waMessageId = key.id;
        if (waMessageId) {
          const existing = await db.prepare('SELECT id FROM messages WHERE whatsapp_message_id = ?').get(waMessageId);
          if (existing) continue;
        }

        const senderPhone = jidToPhone(remoteJid);
        const gerenteId = inst.gerente_id;

        const parceiros = await db.prepare(`
          SELECT id, tel FROM users WHERE role = 'parceiro' AND manager_id = ? AND is_active = 1
        `).all(gerenteId);

        const parceiro = parceiros.find(p => normalizePhone(p.tel) === senderPhone);

        // Check if sender is a lead — record in inbox
        const allLeadsWithPhone = await db.prepare(`SELECT id, phone, owner_id FROM leads WHERE phone IS NOT NULL`).all();
        const matchedLead = allLeadsWithPhone.find(l => normalizePhone(l.phone) === senderPhone);

        if (matchedLead) {
          // Record inbound WhatsApp from lead into inbox
          const ownerId = matchedLead.owner_id || gerenteId;
          await recordInboxMessage(db, {
            lead_id: matchedLead.id, user_id: ownerId,
            channel: 'whatsapp', direction: 'inbound',
            from_address: senderPhone, to_address: null,
            subject: null, body: text,
          });
          // Record lead activity
          const now = new Date().toISOString();
          await db.prepare(`
            INSERT INTO lead_activities (lead_id, user_id, type, channel, description, created_at)
            VALUES (?, ?, 'whatsapp_replied', 'whatsapp', ?, ?)
          `).run(matchedLead.id, ownerId, text.substring(0, 200), now);
          await db.prepare('UPDATE leads SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, matchedLead.id);

          // Check if lead is in active cadence — mark as replied
          const enrollment = await db.prepare(`
            SELECT id, cadence_id FROM cadence_enrollments WHERE lead_id = ? AND status = 'active'
          `).get(matchedLead.id);
          if (enrollment) {
            await db.prepare(`UPDATE cadence_enrollments SET status = 'replied', updated_at = ? WHERE id = ?`).run(now, enrollment.id);
            await db.prepare(`UPDATE cadences SET replied_count = replied_count + 1, updated_at = ? WHERE id = ?`).run(now, enrollment.cadence_id);
          }
        }

        if (!parceiro) {
          if (!matchedLead) console.warn(`Webhook: no parceiro/lead match for phone ${senderPhone} (gerente ${gerenteId})`);
          continue;
        }

        const msgId = uuidv4();
        await db.prepare(`
          INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, source, whatsapp_message_id)
          VALUES (?, ?, ?, ?, 'user', ?, 'text', 'whatsapp', ?)
        `).run(msgId, gerenteId, parceiro.id, parceiro.id, text, waMessageId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ok: true });
  }
});

export default router;
