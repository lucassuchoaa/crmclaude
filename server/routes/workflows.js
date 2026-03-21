import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /workflows — list all
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT w.*, u.name as owner_name FROM workflow_automations w LEFT JOIN users u ON w.owner_id = u.id ORDER BY w.created_at DESC').all();
    res.json(rows.map(r => ({
      ...r,
      trigger_config: JSON.parse(r.trigger_config || '{}'),
      actions: JSON.parse(r.actions || '[]'),
    })));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /workflows/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const w = await db.prepare('SELECT * FROM workflow_automations WHERE id = ?').get(req.params.id);
    if (!w) return res.status(404).json({ error: 'Workflow não encontrado' });
    res.json({ ...w, trigger_config: JSON.parse(w.trigger_config || '{}'), actions: JSON.parse(w.actions || '[]') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /workflows — create
router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { name, description, trigger_type, trigger_config, actions } = req.body;

    if (!name || !trigger_type) return res.status(400).json({ error: 'name e trigger_type obrigatórios' });

    await db.prepare(`
      INSERT INTO workflow_automations (id, name, description, trigger_type, trigger_config, actions, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, trigger_type,
      JSON.stringify(trigger_config || {}), JSON.stringify(actions || []),
      req.user.id, now, now);

    const w = await db.prepare('SELECT * FROM workflow_automations WHERE id = ?').get(id);
    res.status(201).json({ ...w, trigger_config: JSON.parse(w.trigger_config || '{}'), actions: JSON.parse(w.actions || '[]') });
  } catch (err) {
    console.error('POST /workflows error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /workflows/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const { name, description, trigger_type, trigger_config, actions } = req.body;

    await db.prepare(`
      UPDATE workflow_automations SET name = ?, description = ?, trigger_type = ?,
        trigger_config = ?, actions = ?, updated_at = ? WHERE id = ?
    `).run(name, description || null, trigger_type,
      JSON.stringify(trigger_config || {}), JSON.stringify(actions || []),
      now, req.params.id);

    const w = await db.prepare('SELECT * FROM workflow_automations WHERE id = ?').get(req.params.id);
    res.json({ ...w, trigger_config: JSON.parse(w.trigger_config || '{}'), actions: JSON.parse(w.actions || '[]') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /workflows/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM workflow_automations WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /workflows/:id/toggle — activate/deactivate
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const w = await db.prepare('SELECT is_active FROM workflow_automations WHERE id = ?').get(req.params.id);
    if (!w) return res.status(404).json({ error: 'Workflow não encontrado' });
    const newState = w.is_active ? 0 : 1;
    await db.prepare('UPDATE workflow_automations SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(newState, new Date().toISOString(), req.params.id);
    res.json({ is_active: !!newState });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
