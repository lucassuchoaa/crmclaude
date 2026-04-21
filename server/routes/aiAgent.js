import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { chatWithAI } from '../services/aiAgent.js';

const router = express.Router();

// POST /ai/chat — send message to AI
router.post('/chat', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { conversation_id, message, context_type, lead_id } = req.body;
    if (!message) return res.status(400).json({ error: 'message obrigatório' });

    const now = new Date().toISOString();
    let convId = conversation_id;
    let existingMessages = [];

    // Get or create conversation
    if (convId) {
      const conv = await db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(convId);
      if (conv) {
        existingMessages = JSON.parse(conv.messages || '[]');
      }
    }

    if (!convId) {
      convId = uuidv4();
      await db.prepare(`
        INSERT INTO ai_conversations (id, lead_id, user_id, context_type, messages, created_at, updated_at)
        VALUES (?, ?, ?, ?, '[]', ?, ?)
      `).run(convId, lead_id || null, req.user.id, context_type || 'general', now, now);
    }

    // Build context
    const context = { type: context_type || 'general' };
    if (lead_id) {
      context.lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
      context.activities = await db.prepare('SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 10').all(lead_id);
    }

    // Add user message
    existingMessages.push({ role: 'user', content: message });

    // Call AI
    const aiResponse = await chatWithAI(existingMessages, context, db);

    // Add assistant response
    existingMessages.push({ role: 'assistant', content: aiResponse.text });

    // Update conversation
    await db.prepare(`
      UPDATE ai_conversations SET messages = ?, tokens_used = tokens_used + ?, model = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(existingMessages), aiResponse.tokens_used || 0, aiResponse.model || '', now, convId);

    res.json({
      conversation_id: convId,
      response: aiResponse.text,
      tokens_used: aiResponse.tokens_used,
      model: aiResponse.model,
    });
  } catch (err) {
    console.error('POST /ai/chat error:', err);
    const fallback = 'Erro ao processar IA';
    const body = { error: fallback };
    if (process.env.NODE_ENV !== 'production' && err?.message) body.detail = err.message;
    res.status(500).json(body);
  }
});

// GET /ai/conversations — list user's conversations
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`
      SELECT ac.*, l.name as lead_name FROM ai_conversations ac
      LEFT JOIN leads l ON ac.lead_id = l.id
      WHERE ac.user_id = ?
      ORDER BY ac.updated_at DESC LIMIT 50
    `).all(req.user.id);

    res.json(rows.map(r => {
      const msgs = JSON.parse(r.messages || '[]');
      return {
        ...r,
        message_count: msgs.length,
        last_message: msgs[msgs.length - 1]?.content?.substring(0, 100) || '',
        messages: undefined, // Don't send full messages in list
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /ai/conversations/:id — get full conversation
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const conv = await db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json({ ...conv, messages: JSON.parse(conv.messages || '[]') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /ai/conversations/:id
router.delete('/conversations/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
