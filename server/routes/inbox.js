import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /inbox — list messages (unified inbox)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { channel, lead_id, deal_id, is_read, search, page, limit: lim } = req.query;
    const limit = Math.min(Number(lim) || 50, 200);
    const offset = ((Number(page) || 1) - 1) * limit;

    let query = `SELECT im.*, l.name as lead_name, l.email as lead_email, l.company as lead_company,
      u.name as user_name FROM inbox_messages im
      LEFT JOIN leads l ON im.lead_id = l.id
      LEFT JOIN users u ON im.user_id = u.id
      WHERE im.user_id = ?`;
    const params = [req.user.id];

    if (channel) { query += ` AND im.channel = ?`; params.push(channel); }
    if (lead_id) { query += ` AND im.lead_id = ?`; params.push(lead_id); }
    if (deal_id) { query += ` AND im.deal_id = ?`; params.push(deal_id); }
    if (is_read !== undefined) { query += ` AND im.is_read = ?`; params.push(Number(is_read)); }
    if (search) {
      const s = `%${search}%`;
      query += ` AND (im.subject LIKE ? OR im.body LIKE ? OR im.from_address LIKE ?)`;
      params.push(s, s, s);
    }

    query += ` ORDER BY im.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.prepare(query).all(...params);

    // Unread count
    const unread = await db.prepare('SELECT COUNT(*) as c FROM inbox_messages WHERE user_id = ? AND is_read = 0').get(req.user.id);

    res.json({
      messages: rows.map(r => ({ ...r, attachments: JSON.parse(r.attachments || '[]'), metadata: JSON.parse(r.metadata || '{}') })),
      unread: Number(unread?.c || 0),
    });
  } catch (err) {
    console.error('GET /inbox error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /inbox/threads — grouped by lead/thread
router.get('/threads', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`
      SELECT im.lead_id, l.name as lead_name, l.email as lead_email, l.company as lead_company,
        MAX(im.created_at) as last_message_at,
        COUNT(*) as message_count,
        SUM(CASE WHEN im.is_read = 0 THEN 1 ELSE 0 END) as unread_count,
        (SELECT body FROM inbox_messages WHERE lead_id = im.lead_id AND user_id = ? ORDER BY created_at DESC LIMIT 1) as last_message
      FROM inbox_messages im
      LEFT JOIN leads l ON im.lead_id = l.id
      WHERE im.user_id = ? AND im.lead_id IS NOT NULL
      GROUP BY im.lead_id
      ORDER BY last_message_at DESC
      LIMIT 100
    `).all(req.user.id, req.user.id);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /inbox — compose/send message
router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { lead_id, deal_id, channel, to_address, subject, body, body_html } = req.body;

    if (!channel || !body) return res.status(400).json({ error: 'channel e body obrigatórios' });

    // Store outbound message
    await db.prepare(`
      INSERT INTO inbox_messages (id, lead_id, deal_id, user_id, channel, direction, from_address, to_address,
        subject, body, body_html, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, 1, ?)
    `).run(id, lead_id || null, deal_id || null, req.user.id, channel, null, to_address || null,
      subject || null, body, body_html || null, now);

    // Actually send via channel
    if (channel === 'email' && to_address) {
      // Try Gmail
      try {
        const tokens = await db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.id);
        if (tokens) {
          const raw = buildRawEmail(tokens.email || '', to_address, subject || '', body_html || body);
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw }),
          });
        }
      } catch (emailErr) {
        console.error('Inbox email send error:', emailErr.message);
      }
    } else if (channel === 'whatsapp' && to_address) {
      // Try WhatsApp
      try {
        const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
        const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
        const instance = await db.prepare("SELECT * FROM whatsapp_instances WHERE gerente_id = ? AND status = 'connected'").get(req.user.id);
        if (instance) {
          const phone = to_address.replace(/\D/g, '');
          const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
          await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ number: jid, text: body }),
          });
        }
      } catch (waErr) {
        console.error('Inbox WhatsApp send error:', waErr.message);
      }
    }

    // Lead activity
    if (lead_id) {
      await db.prepare(`
        INSERT INTO lead_activities (lead_id, user_id, type, channel, subject, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(lead_id, req.user.id, channel === 'email' ? 'email_sent' : 'whatsapp_sent',
        channel, subject || null, body.substring(0, 200), now);

      await db.prepare('UPDATE leads SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, lead_id);
    }

    res.status(201).json({ id });
  } catch (err) {
    console.error('POST /inbox error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /inbox/:id/read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('UPDATE inbox_messages SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /inbox/mark-all-read
router.post('/mark-all-read', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('UPDATE inbox_messages SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

function buildRawEmail(from, to, subject, body) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}

export default router;
