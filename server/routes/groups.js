import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { phoneToJid } from '../utils/phoneUtils.js';
import * as evo from '../services/evolutionApi.js';

const router = express.Router();

/**
 * GET /api/groups
 * Lista grupos do usuário (par gerente-parceiro derivado de manager_id)
 * Parceiro NÃO tem acesso (comunicação via WhatsApp)
 */
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { role, id: userId } = req.user;

    if (role === 'parceiro') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    let groups = [];

    if (role === 'gerente') {
      // Gerente vê seus parceiros
      groups = db.prepare(`
        SELECT u.id as parceiro_id, u.name as parceiro_name, u.empresa as parceiro_empresa, u.avatar as parceiro_avatar,
               ? as gerente_id, (SELECT name FROM users WHERE id = ?) as gerente_name, (SELECT avatar FROM users WHERE id = ?) as gerente_avatar,
               (SELECT COUNT(*) FROM indications WHERE owner_id = u.id) as indications_count,
               (SELECT COUNT(*) FROM indications WHERE owner_id = u.id AND status NOT IN ('fechado','perdido')) as active_count,
               (SELECT MAX(created_at) FROM messages WHERE group_gerente_id = ? AND group_parceiro_id = u.id) as last_message_at,
               (SELECT COUNT(*) FROM messages WHERE group_gerente_id = ? AND group_parceiro_id = u.id AND is_read = 0 AND sender_id != ?) as unread_count
        FROM users u
        WHERE u.manager_id = ? AND u.role = 'parceiro' AND u.is_active = 1
        ORDER BY last_message_at DESC NULLS LAST, u.name ASC
      `).all(userId, userId, userId, userId, userId, userId, userId);
    } else if (hasPermission(role, 'diretor')) {
      // Diretor+ vê grupos dos seus gerentes (ou todos para executivo/super_admin)
      let gerenteFilter = '';
      const params = [];

      if (role === 'diretor') {
        gerenteFilter = 'AND g.manager_id = ?';
        params.push(userId);
      }

      groups = db.prepare(`
        SELECT p.id as parceiro_id, p.name as parceiro_name, p.empresa as parceiro_empresa, p.avatar as parceiro_avatar,
               g.id as gerente_id, g.name as gerente_name, g.avatar as gerente_avatar,
               (SELECT COUNT(*) FROM indications WHERE owner_id = p.id) as indications_count,
               (SELECT COUNT(*) FROM indications WHERE owner_id = p.id AND status NOT IN ('fechado','perdido')) as active_count,
               (SELECT MAX(created_at) FROM messages WHERE group_gerente_id = g.id AND group_parceiro_id = p.id) as last_message_at,
               0 as unread_count
        FROM users p
        JOIN users g ON p.manager_id = g.id AND g.role = 'gerente'
        WHERE p.role = 'parceiro' AND p.is_active = 1 ${gerenteFilter}
        ORDER BY g.name ASC, last_message_at DESC NULLS LAST
      `).all(...params);
    }

    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Erro ao buscar grupos.' });
  }
});

/**
 * GET /api/groups/:gId/:pId/messages
 * Mensagens do chat (com paginação)
 */
router.get('/:gId/:pId/messages', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { gId, pId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const { role, id: userId } = req.user;

    // Parceiro não tem acesso
    if (role === 'parceiro') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    if (role === 'gerente' && userId !== gId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    if (role === 'diretor') {
      const gerente = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(gId);
      if (!gerente || gerente.manager_id !== userId) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    // Marcar mensagens como lidas (apenas gerente)
    if (role === 'gerente') {
      db.prepare(`
        UPDATE messages SET is_read = 1
        WHERE group_gerente_id = ? AND group_parceiro_id = ? AND sender_id != ? AND is_read = 0
      `).run(gId, pId, userId);
    }

    const messages = db.prepare(`
      SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.group_gerente_id = ? AND m.group_parceiro_id = ?
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `).all(gId, pId, Number(limit), Number(offset));

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE group_gerente_id = ? AND group_parceiro_id = ?
    `).get(gId, pId);

    res.json({ messages, total: total.count });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
});

/**
 * POST /api/groups/:gId/:pId/messages
 * Enviar mensagem no chat (apenas gerente). Envia via WhatsApp se conectado.
 */
router.post('/:gId/:pId/messages', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { gId, pId } = req.params;
    const { content } = req.body;
    const { role, id: userId } = req.user;

    // Apenas gerente pode enviar
    if (role !== 'gerente' || userId !== gId) {
      return res.status(403).json({ error: 'Apenas o gerente do grupo pode enviar mensagens.' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Conteúdo da mensagem é obrigatório.' });
    }

    let source = 'crm';

    // Tentar enviar via WhatsApp
    const instance = db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ? AND status = ?').get(userId, 'connected');
    if (instance) {
      const parceiro = db.prepare('SELECT tel FROM users WHERE id = ?').get(pId);
      if (parceiro?.tel) {
        try {
          const jid = phoneToJid(parceiro.tel);
          await evo.sendText(instance.instance_name, jid, content.trim());
          source = 'crm_to_whatsapp';
        } catch (e) {
          console.warn('WhatsApp send fallback to CRM-only:', e.message);
          // Fallback: fica só no CRM
        }
      }
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, source)
      VALUES (?, ?, ?, ?, 'user', ?, 'text', ?)
    `).run(id, gId, pId, userId, content.trim(), source);

    const message = db.prepare(`
      SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(id);

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

export default router;
