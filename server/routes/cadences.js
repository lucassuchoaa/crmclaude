import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ══════════════════════════════════════════════
// CADENCES CRUD
// ══════════════════════════════════════════════

// GET /cadences — list all
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { status } = req.query;
    let query = `SELECT c.*, u.name as owner_name FROM cadences c LEFT JOIN users u ON c.owner_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { query += ` AND c.status = ?`; params.push(status); }
    query += ` ORDER BY c.created_at DESC`;
    const rows = await db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('GET /cadences error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /cadences/:id — detail with steps
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const cadence = await db.prepare('SELECT c.*, u.name as owner_name FROM cadences c LEFT JOIN users u ON c.owner_id = u.id WHERE c.id = ?').get(req.params.id);
    if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

    const steps = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(req.params.id);
    res.json({ ...cadence, steps });
  } catch (err) {
    console.error('GET /cadences/:id error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /cadences — create
router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { name, description, type, steps, team_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    await db.prepare(`
      INSERT INTO cadences (id, name, description, type, total_steps, owner_id, team_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, type || 'outbound', (steps || []).length, req.user.id, team_id || null, now, now);

    // Insert steps
    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await db.prepare(`
          INSERT INTO cadence_steps (cadence_id, step_order, channel, delay_days, delay_hours,
            email_subject, email_body, whatsapp_message, call_script, linkedin_action, linkedin_message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, i, s.channel || 'email', s.delay_days || 0, s.delay_hours || 0,
          s.email_subject || null, s.email_body || null, s.whatsapp_message || null,
          s.call_script || null, s.linkedin_action || null, s.linkedin_message || null, now);
      }
    }

    const cadence = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(id);
    const insertedSteps = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(id);
    res.status(201).json({ ...cadence, steps: insertedSteps });
  } catch (err) {
    console.error('POST /cadences error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /cadences/:id — update cadence + steps
router.put('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const { name, description, type, steps, team_id } = req.body;

    await db.prepare(`
      UPDATE cadences SET name = ?, description = ?, type = ?, total_steps = ?, team_id = ?, updated_at = ? WHERE id = ?
    `).run(name, description || null, type || 'outbound', (steps || []).length, team_id || null, now, req.params.id);

    // Replace steps
    if (steps) {
      await db.prepare('DELETE FROM cadence_steps WHERE cadence_id = ?').run(req.params.id);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await db.prepare(`
          INSERT INTO cadence_steps (cadence_id, step_order, channel, delay_days, delay_hours,
            email_subject, email_body, whatsapp_message, call_script, linkedin_action, linkedin_message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, i, s.channel || 'email', s.delay_days || 0, s.delay_hours || 0,
          s.email_subject || null, s.email_body || null, s.whatsapp_message || null,
          s.call_script || null, s.linkedin_action || null, s.linkedin_message || null, now);
      }
    }

    const cadence = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(req.params.id);
    const updatedSteps = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(req.params.id);
    res.json({ ...cadence, steps: updatedSteps });
  } catch (err) {
    console.error('PUT /cadences/:id error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /cadences/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM cadence_steps WHERE cadence_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM cadence_enrollments WHERE cadence_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM cadences WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /cadences/:id/status — activate/pause/archive
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { status } = req.body;
    if (!['draft', 'active', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const now = new Date().toISOString();
    await db.prepare('UPDATE cadences SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);

    // If pausing, pause all active enrollments
    if (status === 'paused') {
      await db.prepare("UPDATE cadence_enrollments SET status = 'paused', updated_at = ? WHERE cadence_id = ? AND status = 'active'")
        .run(now, req.params.id);
    }
    // If reactivating, resume paused enrollments
    if (status === 'active') {
      await db.prepare("UPDATE cadence_enrollments SET status = 'active', updated_at = ? WHERE cadence_id = ? AND status = 'paused'")
        .run(now, req.params.id);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /cadences/:id/duplicate — duplicate cadence
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const original = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Cadência não encontrada' });

    const newId = uuidv4();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO cadences (id, name, description, type, total_steps, owner_id, team_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, `${original.name} (cópia)`, original.description, original.type, original.total_steps, req.user.id, original.team_id, now, now);

    const steps = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(req.params.id);
    for (const s of steps) {
      await db.prepare(`
        INSERT INTO cadence_steps (cadence_id, step_order, channel, delay_days, delay_hours,
          email_subject, email_body, whatsapp_message, call_script, linkedin_action, linkedin_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, s.step_order, s.channel, s.delay_days, s.delay_hours,
        s.email_subject, s.email_body, s.whatsapp_message, s.call_script, s.linkedin_action, s.linkedin_message, now);
    }

    const cadence = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(newId);
    const newSteps = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(newId);
    res.status(201).json({ ...cadence, steps: newSteps });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// STEPS (individual management)
// ══════════════════════════════════════════════

router.get('/:id/steps', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? ORDER BY step_order').all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/steps', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const s = req.body;
    // Get max step_order
    const max = await db.prepare('SELECT MAX(step_order) as m FROM cadence_steps WHERE cadence_id = ?').get(req.params.id);
    const order = (Number(max?.m) || -1) + 1;

    await db.prepare(`
      INSERT INTO cadence_steps (cadence_id, step_order, channel, delay_days, delay_hours,
        email_subject, email_body, whatsapp_message, call_script, linkedin_action, linkedin_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, order, s.channel || 'email', s.delay_days || 0, s.delay_hours || 0,
      s.email_subject || null, s.email_body || null, s.whatsapp_message || null,
      s.call_script || null, s.linkedin_action || null, s.linkedin_message || null, now);

    // Update total
    await db.prepare('UPDATE cadences SET total_steps = total_steps + 1, updated_at = ? WHERE id = ?').run(now, req.params.id);

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// ENROLLMENTS
// ══════════════════════════════════════════════

// POST /cadences/:id/enroll — enroll leads
router.post('/:id/enroll', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { lead_ids } = req.body;
    if (!lead_ids || !lead_ids.length) return res.status(400).json({ error: 'lead_ids obrigatório' });

    const cadence = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(req.params.id);
    if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

    const now = new Date().toISOString();
    let enrolled = 0;

    // Get first step delay
    const firstStep = await db.prepare('SELECT * FROM cadence_steps WHERE cadence_id = ? AND step_order = 0 AND is_active = 1').get(req.params.id);
    const delayMs = firstStep ? ((firstStep.delay_days || 0) * 86400000) + ((firstStep.delay_hours || 0) * 3600000) : 0;
    const nextAt = new Date(Date.now() + delayMs).toISOString();

    for (const leadId of lead_ids) {
      // Check not already enrolled
      const existing = await db.prepare("SELECT id FROM cadence_enrollments WHERE cadence_id = ? AND lead_id = ? AND status = 'active'").get(req.params.id, leadId);
      if (existing) continue;

      const enrollId = uuidv4();
      await db.prepare(`
        INSERT INTO cadence_enrollments (id, cadence_id, lead_id, status, current_step, next_step_at, enrolled_by, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?)
      `).run(enrollId, req.params.id, leadId, nextAt, req.user.id, now, now);

      // Activity on lead
      await db.prepare(`
        INSERT INTO lead_activities (lead_id, user_id, type, description, created_at)
        VALUES (?, ?, 'cadence_step', ?, ?)
      `).run(leadId, req.user.id, `Inscrito na cadência "${cadence.name}"`, now);

      enrolled++;
    }

    // Update enrolled count
    await db.prepare('UPDATE cadences SET enrolled_count = enrolled_count + ?, updated_at = ? WHERE id = ?').run(enrolled, now, req.params.id);

    res.json({ enrolled });
  } catch (err) {
    console.error('POST /cadences/:id/enroll error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /cadences/:id/unenroll — unenroll leads
router.post('/:id/unenroll', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { lead_ids } = req.body;
    if (!lead_ids || !lead_ids.length) return res.status(400).json({ error: 'lead_ids obrigatório' });

    const now = new Date().toISOString();
    for (const leadId of lead_ids) {
      await db.prepare("UPDATE cadence_enrollments SET status = 'completed', completed_at = ?, updated_at = ? WHERE cadence_id = ? AND lead_id = ? AND status IN ('active', 'paused')")
        .run(now, now, req.params.id, leadId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /cadences/:id/enrollments
router.get('/:id/enrollments', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`
      SELECT ce.*, l.name as lead_name, l.email as lead_email, l.company as lead_company, l.total_score
      FROM cadence_enrollments ce
      JOIN leads l ON ce.lead_id = l.id
      WHERE ce.cadence_id = ?
      ORDER BY ce.created_at DESC
    `).all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /cadences/:id/stats
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const cadence = await db.prepare('SELECT * FROM cadences WHERE id = ?').get(req.params.id);
    if (!cadence) return res.status(404).json({ error: 'Cadência não encontrada' });

    const enrollmentStats = await db.prepare(`
      SELECT status, COUNT(*) as c FROM cadence_enrollments WHERE cadence_id = ? GROUP BY status
    `).all(req.params.id);

    const executionStats = await db.prepare(`
      SELECT channel, status, COUNT(*) as c FROM cadence_executions WHERE cadence_id = ? GROUP BY channel, status
    `).all(req.params.id);

    const stepStats = await db.prepare(`
      SELECT cs.step_order, cs.channel,
        COUNT(CASE WHEN ce.status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN ce.status = 'opened' THEN 1 END) as opened,
        COUNT(CASE WHEN ce.status = 'replied' THEN 1 END) as replied,
        COUNT(CASE WHEN ce.status = 'bounced' THEN 1 END) as bounced,
        COUNT(CASE WHEN ce.status = 'failed' THEN 1 END) as failed
      FROM cadence_steps cs
      LEFT JOIN cadence_executions ce ON ce.step_id = cs.id AND ce.cadence_id = cs.cadence_id
      WHERE cs.cadence_id = ?
      GROUP BY cs.step_order, cs.channel
      ORDER BY cs.step_order
    `).all(req.params.id);

    res.json({
      ...cadence,
      enrollment_breakdown: enrollmentStats,
      execution_breakdown: executionStats,
      step_stats: stepStats,
    });
  } catch (err) {
    console.error('GET /cadences/:id/stats error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
