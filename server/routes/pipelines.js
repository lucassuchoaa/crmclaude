import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ── Helper: filter by role (same pattern as indications.js) ──
function addOwnerFilter(query, params, user, alias = 'd') {
  if (user.role === 'super_admin' || user.role === 'executivo') return query;
  if (user.role === 'diretor') {
    query += ` AND (${alias}.owner_id = ? OR ${alias}.owner_id IN (
      SELECT id FROM users WHERE manager_id = ?
      UNION SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?)
    ))`;
    params.push(user.id, user.id, user.id);
  } else if (user.role === 'gerente') {
    query += ` AND (${alias}.owner_id = ? OR ${alias}.owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
    params.push(user.id, user.id);
  } else {
    query += ` AND ${alias}.owner_id = ?`;
    params.push(user.id);
  }
  return query;
}

function addPipelineVisibility(query, params, user, alias = 'p') {
  if (user.role === 'super_admin' || user.role === 'executivo') return query;
  if (user.role === 'diretor') {
    query += ` AND (${alias}.created_by = ? OR ${alias}.created_by IN (
      SELECT id FROM users WHERE manager_id = ?
      UNION SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?)
    ))`;
    params.push(user.id, user.id, user.id);
  } else if (user.role === 'gerente') {
    query += ` AND (${alias}.created_by = ? OR ${alias}.created_by IN (SELECT id FROM users WHERE manager_id = ?))`;
    params.push(user.id, user.id);
  } else {
    query += ` AND ${alias}.created_by = ?`;
    params.push(user.id);
  }
  return query;
}

// ══════════════════════════════════════════════
// PIPELINES CRUD
// ══════════════════════════════════════════════

// GET /pipelines - list all visible pipelines
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    let query = `SELECT p.*, u.name as creator_name FROM pipelines p LEFT JOIN users u ON p.created_by = u.id WHERE p.is_active = 1`;
    const params = [];
    query = addPipelineVisibility(query, params, req.user);
    query += ` ORDER BY p.created_at DESC`;
    const rows = await db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET /pipelines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /pipelines - create pipeline with stages
router.post('/', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente')) return res.status(403).json({ error: 'Sem permissão' });
    if (req.user.role === 'diretor') return res.status(403).json({ error: 'Sem permissão' });

    const db = getDatabase();
    const { name, stages } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const id = uuidv4();
    await db.prepare(`INSERT INTO pipelines (id, name, created_by) VALUES (?, ?, ?)`).run(id, name, req.user.id);

    if (stages && stages.length > 0) {
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        await db.prepare(`INSERT INTO pipeline_stages (id, pipeline_id, name, color, display_order, is_win, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(uuidv4(), id, s.name, s.color || '#6366f1', i, s.is_win ? 1 : 0, s.is_lost ? 1 : 0);
      }
    }

    res.status(201).json({ id, name });
  } catch (err) {
    console.error('POST /pipelines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /pipelines/:id - update pipeline
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente')) return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { name, stages } = req.body;
    await db.prepare(`UPDATE pipelines SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(name, req.params.id);

    if (stages) {
      // Delete old stages
      await db.prepare(`DELETE FROM pipeline_stages WHERE pipeline_id = ?`).run(req.params.id);
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        await db.prepare(`INSERT INTO pipeline_stages (id, pipeline_id, name, color, display_order, is_win, is_lost) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(s.id || uuidv4(), req.params.id, s.name, s.color || '#6366f1', i, s.is_win ? 1 : 0, s.is_lost ? 1 : 0);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /pipelines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /pipelines/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente')) return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    await db.prepare(`UPDATE pipelines SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /pipelines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/:id/stages
router.get('/:id/stages', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY display_order`).all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('GET stages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// DEALS CRUD
// ══════════════════════════════════════════════

// GET /pipelines/:id/deals
router.get('/:id/deals', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    let query = `SELECT d.*, u.name as owner_name FROM deals d LEFT JOIN users u ON d.owner_id = u.id WHERE d.pipeline_id = ?`;
    const params = [req.params.id];
    query = addOwnerFilter(query, params, req.user);
    query += ` ORDER BY d.created_at DESC`;
    const rows = await db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET deals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /pipelines/:pipelineId/deals
router.post('/:pipelineId/deals', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente') || req.user.role === 'diretor') {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    const db = getDatabase();
    const { title, company, value, priority, stage_id, contact_name, contact_phone, contact_email, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });

    // If no stage_id provided, use first stage of pipeline
    let stageId = stage_id;
    if (!stageId) {
      const first = await db.prepare(`SELECT id FROM pipeline_stages WHERE pipeline_id = ? ORDER BY display_order LIMIT 1`).get(req.params.pipelineId);
      if (!first) return res.status(400).json({ error: 'Pipeline sem etapas' });
      stageId = first.id;
    }

    const id = uuidv4();
    await db.prepare(`INSERT INTO deals (id, pipeline_id, stage_id, title, company, value, owner_id, priority, contact_name, contact_phone, contact_email, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.params.pipelineId, stageId, title, company || null, value || 0, req.user.id, priority || 'medium', contact_name || null, contact_phone || null, contact_email || null, notes || null);

    res.status(201).json({ id, title, stage_id: stageId });
  } catch (err) {
    console.error('POST deal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /deals/:id
router.put('/deals/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, company, value, priority, stage_id, contact_name, contact_phone, contact_email, notes } = req.body;
    await db.prepare(`UPDATE deals SET title = ?, company = ?, value = ?, priority = ?, stage_id = ?, contact_name = ?, contact_phone = ?, contact_email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(title, company || null, value || 0, priority || 'medium', stage_id, contact_name || null, contact_phone || null, contact_email || null, notes || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT deal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /deals/:id/stage - move deal to a different stage
router.patch('/deals/:id/stage', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { stage_id } = req.body;
    if (!stage_id) return res.status(400).json({ error: 'stage_id obrigatório' });
    await db.prepare(`UPDATE deals SET stage_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stage_id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH deal stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /deals/:id
router.delete('/deals/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare(`DELETE FROM deals WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE deal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// ACTIVITIES
// ══════════════════════════════════════════════

// GET /deals/:dealId/activities
router.get('/deals/:dealId/activities', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`SELECT a.*, u.name as user_name FROM deal_activities a LEFT JOIN users u ON a.user_id = u.id WHERE a.deal_id = ? ORDER BY a.created_at DESC`).all(req.params.dealId);
    res.json(rows);
  } catch (err) {
    console.error('GET activities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /deals/:dealId/activities
router.post('/deals/:dealId/activities', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { type, description, scheduled_at } = req.body;
    if (!description) return res.status(400).json({ error: 'Descrição obrigatória' });
    const result = await db.prepare(`INSERT INTO deal_activities (deal_id, user_id, type, description, scheduled_at) VALUES (?, ?, ?, ?, ?)`)
      .run(req.params.dealId, req.user.id, type || 'note', description, scheduled_at || null);
    res.status(201).json({ id: result.lastInsertRowid || result.changes, ok: true });
  } catch (err) {
    console.error('POST activity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════

// GET /deals/:dealId/tasks
router.get('/deals/:dealId/tasks', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`SELECT t.*, u.name as assigned_name FROM deal_tasks t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.deal_id = ? ORDER BY t.is_completed, t.due_date`).all(req.params.dealId);
    res.json(rows);
  } catch (err) {
    console.error('GET tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /deals/:dealId/tasks
router.post('/deals/:dealId/tasks', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, assigned_to, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });
    const result = await db.prepare(`INSERT INTO deal_tasks (deal_id, assigned_to, title, due_date) VALUES (?, ?, ?, ?)`)
      .run(req.params.dealId, assigned_to || req.user.id, title, due_date || null);
    res.status(201).json({ id: result.lastInsertRowid || result.changes, ok: true });
  } catch (err) {
    console.error('POST task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /tasks/:id/complete
router.patch('/tasks/:id/complete', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { is_completed } = req.body;
    await db.prepare(`UPDATE deal_tasks SET is_completed = ? WHERE id = ?`).run(is_completed ? 1 : 0, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tasks/:id
router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare(`DELETE FROM deal_tasks WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE task error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════

router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'diretor')) return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();

    const pipelines = await db.prepare(`SELECT COUNT(*) as count FROM pipelines WHERE is_active = 1`).get();
    const deals = await db.prepare(`SELECT COUNT(*) as count, SUM(value) as total_value FROM deals`).get();
    const won = await db.prepare(`SELECT COUNT(*) as count, SUM(d.value) as total FROM deals d INNER JOIN pipeline_stages s ON d.stage_id = s.id WHERE s.is_win = 1`).get();
    const lost = await db.prepare(`SELECT COUNT(*) as count FROM deals d INNER JOIN pipeline_stages s ON d.stage_id = s.id WHERE s.is_lost = 1`).get();

    res.json({
      pipelines: Number(pipelines.count),
      deals: Number(deals.count),
      total_value: Number(deals.total_value) || 0,
      won: Number(won.count),
      won_value: Number(won.total) || 0,
      lost: Number(lost.count),
    });
  } catch (err) {
    console.error('GET stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
