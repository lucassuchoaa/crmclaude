import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /teams - list all teams (super_admin sees all, others see their teams)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    let rows;
    if (req.user.role === 'super_admin') {
      rows = await db.prepare(`SELECT t.*, u.name as creator_name FROM teams t LEFT JOIN users u ON t.created_by = u.id WHERE t.is_active = 1 ORDER BY t.name`).all();
    } else {
      rows = await db.prepare(`SELECT t.*, u.name as creator_name FROM teams t LEFT JOIN users u ON t.created_by = u.id INNER JOIN team_members tm ON tm.team_id = t.id WHERE tm.user_id = ? AND t.is_active = 1 ORDER BY t.name`).all(req.user.id);
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /teams/:id - get team with members
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const team = await db.prepare(`SELECT t.*, u.name as creator_name FROM teams t LEFT JOIN users u ON t.created_by = u.id WHERE t.id = ?`).get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Equipe não encontrada' });
    const members = await db.prepare(`SELECT u.id, u.name, u.email, u.role, u.avatar FROM users u INNER JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = ?`).all(req.params.id);
    res.json({ ...team, members });
  } catch (err) {
    console.error('GET /teams/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /teams/user/my-teams - get current user's teams with modules
router.get('/user/my-teams', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`SELECT t.id, t.name, t.modules FROM teams t INNER JOIN team_members tm ON tm.team_id = t.id WHERE tm.user_id = ? AND t.is_active = 1 ORDER BY t.name`).all(req.user.id);
    res.json(rows);
  } catch (err) {
    console.error('GET /teams/user/my-teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /teams - create team (super_admin only)
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { name, description, modules, members } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const id = uuidv4();
    const modulesJson = JSON.stringify(modules || []);
    await db.prepare(`INSERT INTO teams (id, name, description, modules, created_by) VALUES (?, ?, ?, ?, ?)`)
      .run(id, name, description || null, modulesJson, req.user.id);

    if (members && members.length > 0) {
      for (const userId of members) {
        await db.prepare(`INSERT INTO team_members (team_id, user_id) VALUES (?, ?)`).run(id, userId);
      }
    }

    res.status(201).json({ id, name });
  } catch (err) {
    console.error('POST /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /teams/:id - update team (super_admin only)
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { name, description, modules, members } = req.body;

    const modulesJson = JSON.stringify(modules || []);
    await db.prepare(`UPDATE teams SET name = ?, description = ?, modules = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name, description || null, modulesJson, req.params.id);

    if (members) {
      await db.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(req.params.id);
      for (const userId of members) {
        await db.prepare(`INSERT INTO team_members (team_id, user_id) VALUES (?, ?)`).run(req.params.id, userId);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /teams/:id - deactivate team (super_admin only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    await db.prepare(`UPDATE teams SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
