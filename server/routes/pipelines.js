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

function addPipelineVisibility(query, params, user, alias = 'p', teamId = null) {
  if (teamId) {
    query += ` AND ${alias}.team_id = ?`;
    params.push(teamId);
  }
  if (user.role === 'super_admin') return query;
  // Non-admin: only see pipelines from their teams
  query += ` AND (${alias}.team_id IS NULL OR ${alias}.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?))`;
  params.push(user.id);
  return query;
}

// ══════════════════════════════════════════════
// PIPELINES CRUD
// ══════════════════════════════════════════════

// GET /pipelines - list all visible pipelines
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { team_id } = req.query;
    let query = `SELECT p.*, u.name as creator_name, t.name as team_name FROM pipelines p LEFT JOIN users u ON p.created_by = u.id LEFT JOIN teams t ON p.team_id = t.id WHERE p.is_active = 1`;
    const params = [];
    query = addPipelineVisibility(query, params, req.user, 'p', team_id);
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
    const { name, stages, team_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const id = uuidv4();
    await db.prepare(`INSERT INTO pipelines (id, name, created_by, team_id) VALUES (?, ?, ?, ?)`).run(id, name, req.user.id, team_id || null);

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
    let query = `SELECT d.*, u.name as owner_name, pr.name as product_name FROM deals d LEFT JOIN users u ON d.owner_id = u.id LEFT JOIN products pr ON d.product_id = pr.id WHERE d.pipeline_id = ?`;
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
    const { title, company, value, priority, stage_id, contact_name, contact_phone, contact_email, notes, num_employees, product_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });

    // If no stage_id provided, use first stage of pipeline
    let stageId = stage_id;
    if (!stageId) {
      const first = await db.prepare(`SELECT id FROM pipeline_stages WHERE pipeline_id = ? ORDER BY display_order LIMIT 1`).get(req.params.pipelineId);
      if (!first) return res.status(400).json({ error: 'Pipeline sem etapas' });
      stageId = first.id;
    }

    const id = uuidv4();
    await db.prepare(`INSERT INTO deals (id, pipeline_id, stage_id, title, company, value, owner_id, priority, contact_name, contact_phone, contact_email, notes, num_employees, product_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.params.pipelineId, stageId, title, company || null, value || 0, req.user.id, priority || 'medium', contact_name || null, contact_phone || null, contact_email || null, notes || null, num_employees || null, product_id || null);

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
    const { title, company, value, priority, stage_id, contact_name, contact_phone, contact_email, notes, num_employees, product_id } = req.body;
    await db.prepare(`UPDATE deals SET title = ?, company = ?, value = ?, priority = ?, stage_id = ?, contact_name = ?, contact_phone = ?, contact_email = ?, notes = ?, num_employees = ?, product_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(title, company || null, value || 0, priority || 'medium', stage_id, contact_name || null, contact_phone || null, contact_email || null, notes || null, num_employees || null, product_id || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT deal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /deals/:id/stage - move deal to a different stage (with automation)
router.patch('/deals/:id/stage', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { stage_id, loss_reason } = req.body;
    if (!stage_id) return res.status(400).json({ error: 'stage_id obrigatório' });

    // Get deal info before move
    const deal = await db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal não encontrado' });

    // Move deal
    await db.prepare('UPDATE deals SET stage_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stage_id, req.params.id);

    // If moving to a lost stage, save loss reason
    const targetStage = await db.prepare('SELECT is_lost FROM pipeline_stages WHERE id = ?').get(stage_id);
    if (targetStage && Number(targetStage.is_lost) && loss_reason) {
      await db.prepare('UPDATE deals SET loss_reason = ? WHERE id = ?').run(loss_reason, req.params.id);
    }

    // Check for automations on this stage
    const automations = await db.prepare('SELECT * FROM pipeline_automations WHERE pipeline_id = ? AND trigger_stage_id = ? AND is_active = 1').all(deal.pipeline_id, stage_id);

    const created_deals = [];
    for (const auto of automations) {
      if (auto.action_type === 'copy_to_pipeline' && auto.target_pipeline_id) {
        // Get target stage (first stage if not specified)
        let targetStageId = auto.target_stage_id;
        if (!targetStageId) {
          const first = await db.prepare('SELECT id FROM pipeline_stages WHERE pipeline_id = ? ORDER BY display_order LIMIT 1').get(auto.target_pipeline_id);
          if (first) targetStageId = first.id;
        }
        if (!targetStageId) continue;

        // Copy deal to target pipeline
        const newId = uuidv4();
        await db.prepare(`INSERT INTO deals (id, pipeline_id, stage_id, title, company, value, owner_id, priority, contact_name, contact_phone, contact_email, notes, num_employees, product_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(newId, auto.target_pipeline_id, targetStageId, deal.title, deal.company, deal.value, deal.owner_id, deal.priority, deal.contact_name, deal.contact_phone, deal.contact_email, deal.notes, deal.num_employees, deal.product_id);

        // Copy contacts
        const contacts = await db.prepare('SELECT * FROM deal_contacts WHERE deal_id = ?').all(deal.id);
        for (const c of contacts) {
          await db.prepare('INSERT INTO deal_contacts (id, deal_id, name, phone, email, role, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), newId, c.name, c.phone, c.email, c.role, c.is_primary);
        }

        // Copy history/activities if configured
        if (Number(auto.copy_history)) {
          const acts = await db.prepare('SELECT * FROM deal_activities WHERE deal_id = ?').all(deal.id);
          for (const a of acts) {
            await db.prepare('INSERT INTO deal_activities (deal_id, user_id, type, description, scheduled_at) VALUES (?, ?, ?, ?, ?)')
              .run(newId, a.user_id, a.type, `[Copiado] ${a.description}`, a.scheduled_at);
          }
        }

        // Create auto tasks if configured
        if (auto.auto_tasks) {
          try {
            const tasks = JSON.parse(auto.auto_tasks);
            for (const task of tasks) {
              const dueDate = task.due_days ? new Date(Date.now() + task.due_days * 86400000).toISOString().split('T')[0] : null;
              await db.prepare('INSERT INTO deal_tasks (deal_id, assigned_to, title, due_date) VALUES (?, ?, ?, ?)')
                .run(newId, deal.owner_id, task.title, dueDate);
            }
          } catch (e) { console.error('Auto tasks parse error:', e); }
        }

        created_deals.push({ id: newId, pipeline_id: auto.target_pipeline_id });
      }

      if (auto.action_type === 'create_tasks') {
        // Create auto tasks on the current deal
        if (auto.auto_tasks) {
          try {
            const tasks = JSON.parse(auto.auto_tasks);
            for (const task of tasks) {
              const dueDate = task.due_days ? new Date(Date.now() + task.due_days * 86400000).toISOString().split('T')[0] : null;
              await db.prepare('INSERT INTO deal_tasks (deal_id, assigned_to, title, due_date) VALUES (?, ?, ?, ?)')
                .run(deal.id, deal.owner_id, task.title, dueDate);
            }
          } catch (e) { console.error('Auto tasks parse error:', e); }
        }
      }
    }

    res.json({ ok: true, automations_triggered: automations.length, created_deals });
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
// DEAL CONTACTS (multiple contacts per deal)
// ══════════════════════════════════════════════

// GET /deals/:dealId/contacts
router.get('/deals/:dealId/contacts', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT * FROM deal_contacts WHERE deal_id = ? ORDER BY is_primary DESC, created_at').all(req.params.dealId);
    res.json(rows);
  } catch (err) {
    console.error('GET contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /deals/:dealId/contacts
router.post('/deals/:dealId/contacts', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { name, phone, email, role, is_primary } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uuidv4();
    // If setting as primary, unset others
    if (is_primary) {
      await db.prepare('UPDATE deal_contacts SET is_primary = 0 WHERE deal_id = ?').run(req.params.dealId);
    }
    await db.prepare('INSERT INTO deal_contacts (id, deal_id, name, phone, email, role, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.params.dealId, name, phone || null, email || null, role || null, is_primary ? 1 : 0);
    res.status(201).json({ id, ok: true });
  } catch (err) {
    console.error('POST contact error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /deals/contacts/:id
router.delete('/deals/contacts/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM deal_contacts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE contact error:', err);
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

// ══════════════════════════════════════════════
// PIPELINE AUTOMATIONS
// ══════════════════════════════════════════════

// GET /pipelines/:id/automations
router.get('/:id/automations', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`SELECT a.*, ps.name as stage_name, tp.name as target_pipeline_name
      FROM pipeline_automations a
      LEFT JOIN pipeline_stages ps ON a.trigger_stage_id = ps.id
      LEFT JOIN pipelines tp ON a.target_pipeline_id = tp.id
      WHERE a.pipeline_id = ? ORDER BY a.created_at`).all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('GET automations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /pipelines/:id/automations
router.post('/:id/automations', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente')) return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { trigger_stage_id, action_type, target_pipeline_id, target_stage_id, copy_history, auto_tasks } = req.body;
    if (!trigger_stage_id || !action_type) return res.status(400).json({ error: 'Dados incompletos' });
    const id = uuidv4();
    await db.prepare(`INSERT INTO pipeline_automations (id, pipeline_id, trigger_stage_id, action_type, target_pipeline_id, target_stage_id, copy_history, auto_tasks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.params.id, trigger_stage_id, action_type, target_pipeline_id || null, target_stage_id || null, copy_history ? 1 : 0, auto_tasks ? JSON.stringify(auto_tasks) : null);
    res.status(201).json({ id, ok: true });
  } catch (err) {
    console.error('POST automation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /automations/:id
router.delete('/automations/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM pipeline_automations WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE automation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// BI / ANALYTICS
// ══════════════════════════════════════════════

// GET /pipelines/bi/overview - General metrics
router.get('/bi/overview', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, date_from, date_to, owner_id } = req.query;
    let dateFilter = '';
    let ownerFilter = '';
    const params = [];

    if (date_from) { dateFilter += ' AND d.created_at >= ?'; params.push(date_from); }
    if (date_to) { dateFilter += ' AND d.created_at <= ?'; params.push(date_to + 'T23:59:59'); }
    if (owner_id) { ownerFilter = ' AND d.owner_id = ?'; params.push(owner_id); }

    let pipeFilter = '';
    if (pipeline_id) { pipeFilter = ' AND d.pipeline_id = ?'; params.push(pipeline_id); }

    // Apply visibility filter
    let visFilter = '';
    const visParams = [];
    if (req.user.role !== 'super_admin') {
      if (req.user.role === 'executivo') {
        // sees all in their teams
      } else if (req.user.role === 'diretor') {
        visFilter = ' AND (d.owner_id = ? OR d.owner_id IN (SELECT id FROM users WHERE manager_id = ?))';
        visParams.push(req.user.id, req.user.id);
      } else if (req.user.role === 'gerente') {
        visFilter = ' AND d.owner_id = ?';
        visParams.push(req.user.id);
      }
    }

    const allParams = [...params, ...visParams];

    const total = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total_value FROM deals d WHERE 1=1 ${dateFilter} ${ownerFilter} ${pipeFilter} ${visFilter}`).get(...allParams);
    const won = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(d.value),0) as total_value FROM deals d INNER JOIN pipeline_stages s ON d.stage_id = s.id WHERE s.is_win = 1 ${dateFilter} ${ownerFilter} ${pipeFilter} ${visFilter}`).get(...allParams);
    const lost = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(d.value),0) as total_value FROM deals d INNER JOIN pipeline_stages s ON d.stage_id = s.id WHERE s.is_lost = 1 ${dateFilter} ${ownerFilter} ${pipeFilter} ${visFilter}`).get(...allParams);
    const open = await db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(d.value),0) as total_value FROM deals d INNER JOIN pipeline_stages s ON d.stage_id = s.id WHERE s.is_win = 0 AND s.is_lost = 0 ${dateFilter} ${ownerFilter} ${pipeFilter} ${visFilter}`).get(...allParams);

    const conversionRate = Number(total.count) > 0 ? (Number(won.count) / Number(total.count) * 100).toFixed(1) : 0;

    res.json({
      total: { count: Number(total.count), value: Number(total.total_value) },
      won: { count: Number(won.count), value: Number(won.total_value) },
      lost: { count: Number(lost.count), value: Number(lost.total_value) },
      open: { count: Number(open.count), value: Number(open.total_value) },
      conversion_rate: Number(conversionRate),
    });
  } catch (err) {
    console.error('BI overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/bi/by-owner - Deals grouped by owner
router.get('/bi/by-owner', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, date_from, date_to } = req.query;
    let filters = '';
    const params = [];
    if (pipeline_id) { filters += ' AND d.pipeline_id = ?'; params.push(pipeline_id); }
    if (date_from) { filters += ' AND d.created_at >= ?'; params.push(date_from); }
    if (date_to) { filters += ' AND d.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

    const rows = await db.prepare(`
      SELECT d.owner_id, u.name as owner_name,
        COUNT(*) as total,
        SUM(CASE WHEN s.is_win = 1 THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN s.is_lost = 1 THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN s.is_win = 0 AND s.is_lost = 0 THEN 1 ELSE 0 END) as open,
        COALESCE(SUM(d.value),0) as total_value,
        COALESCE(SUM(CASE WHEN s.is_win = 1 THEN d.value ELSE 0 END),0) as won_value
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      LEFT JOIN pipeline_stages s ON d.stage_id = s.id
      WHERE 1=1 ${filters}
      GROUP BY d.owner_id
      ORDER BY won DESC, total DESC
    `).all(...params);

    res.json(rows.map(r => ({ ...r, total: Number(r.total), won: Number(r.won), lost: Number(r.lost), open: Number(r.open), total_value: Number(r.total_value), won_value: Number(r.won_value) })));
  } catch (err) {
    console.error('BI by-owner error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/bi/by-stage - Deals grouped by stage (funnel view)
router.get('/bi/by-stage', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, date_from, date_to } = req.query;
    let filters = '';
    const params = [];
    if (pipeline_id) { filters += ' AND d.pipeline_id = ?'; params.push(pipeline_id); }
    if (date_from) { filters += ' AND d.created_at >= ?'; params.push(date_from); }
    if (date_to) { filters += ' AND d.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

    const rows = await db.prepare(`
      SELECT s.id as stage_id, s.name as stage_name, s.color, s.display_order, s.is_win, s.is_lost,
        COUNT(d.id) as count,
        COALESCE(SUM(d.value),0) as total_value,
        AVG(JULIANDAY(d.updated_at) - JULIANDAY(d.created_at)) as avg_days
      FROM pipeline_stages s
      LEFT JOIN deals d ON d.stage_id = s.id ${filters ? 'AND 1=1 ' + filters : ''}
      WHERE s.pipeline_id = ?
      GROUP BY s.id
      ORDER BY s.display_order
    `).all(...params, pipeline_id || '');

    res.json(rows.map(r => ({ ...r, count: Number(r.count), total_value: Number(r.total_value), avg_days: r.avg_days ? Number(Number(r.avg_days).toFixed(1)) : 0, is_win: Number(r.is_win), is_lost: Number(r.is_lost) })));
  } catch (err) {
    console.error('BI by-stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/bi/loss-reasons - Loss reasons breakdown
router.get('/bi/loss-reasons', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, date_from, date_to } = req.query;
    let filters = '';
    const params = [];
    if (pipeline_id) { filters += ' AND d.pipeline_id = ?'; params.push(pipeline_id); }
    if (date_from) { filters += ' AND d.created_at >= ?'; params.push(date_from); }
    if (date_to) { filters += ' AND d.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

    const rows = await db.prepare(`
      SELECT COALESCE(d.loss_reason, 'Não informado') as reason, COUNT(*) as count, COALESCE(SUM(d.value),0) as lost_value
      FROM deals d
      INNER JOIN pipeline_stages s ON d.stage_id = s.id
      WHERE s.is_lost = 1 ${filters}
      GROUP BY COALESCE(d.loss_reason, 'Não informado')
      ORDER BY count DESC
    `).all(...params);

    res.json(rows.map(r => ({ ...r, count: Number(r.count), lost_value: Number(r.lost_value) })));
  } catch (err) {
    console.error('BI loss-reasons error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/bi/timeline - Deals created/won/lost over time
router.get('/bi/timeline', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, period, date_from, date_to } = req.query;
    let filters = '';
    const params = [];
    if (pipeline_id) { filters += ' AND d.pipeline_id = ?'; params.push(pipeline_id); }
    if (date_from) { filters += ' AND d.created_at >= ?'; params.push(date_from); }
    if (date_to) { filters += ' AND d.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

    const groupBy = period === 'weekly' ? "STRFTIME('%Y-W%W', d.created_at)" : period === 'daily' ? "DATE(d.created_at)" : "STRFTIME('%Y-%m', d.created_at)";

    const rows = await db.prepare(`
      SELECT ${groupBy} as period,
        COUNT(*) as created,
        SUM(CASE WHEN s.is_win = 1 THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN s.is_lost = 1 THEN 1 ELSE 0 END) as lost,
        COALESCE(SUM(d.value),0) as total_value,
        COALESCE(SUM(CASE WHEN s.is_win = 1 THEN d.value ELSE 0 END),0) as won_value
      FROM deals d
      LEFT JOIN pipeline_stages s ON d.stage_id = s.id
      WHERE 1=1 ${filters}
      GROUP BY ${groupBy}
      ORDER BY period
    `).all(...params);

    res.json(rows.map(r => ({ ...r, created: Number(r.created), won: Number(r.won), lost: Number(r.lost), total_value: Number(r.total_value), won_value: Number(r.won_value) })));
  } catch (err) {
    console.error('BI timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pipelines/bi/activity-ranking - Most active users
router.get('/bi/activity-ranking', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { pipeline_id, date_from, date_to } = req.query;
    let filters = '';
    const params = [];
    if (date_from) { filters += ' AND a.created_at >= ?'; params.push(date_from); }
    if (date_to) { filters += ' AND a.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

    let pipeFilter = '';
    if (pipeline_id) { pipeFilter = ' AND d.pipeline_id = ?'; params.push(pipeline_id); }

    const rows = await db.prepare(`
      SELECT a.user_id, u.name as user_name, a.type,
        COUNT(*) as count
      FROM deal_activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN deals d ON a.deal_id = d.id
      WHERE 1=1 ${filters} ${pipeFilter}
      GROUP BY a.user_id, a.type
      ORDER BY count DESC
    `).all(...params);

    // Group by user
    const userMap = {};
    for (const r of rows) {
      if (!userMap[r.user_id]) userMap[r.user_id] = { user_id: r.user_id, user_name: r.user_name, total: 0, by_type: {} };
      userMap[r.user_id].total += Number(r.count);
      userMap[r.user_id].by_type[r.type] = Number(r.count);
    }

    res.json(Object.values(userMap).sort((a, b) => b.total - a.total));
  } catch (err) {
    console.error('BI activity-ranking error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
