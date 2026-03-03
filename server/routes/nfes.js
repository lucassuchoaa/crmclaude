import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';
import { validateStatus, NFE_STATUSES } from '../utils/validators.js';
import { createNotification } from '../utils/notificationHelper.js';

const router = express.Router();

// Get NFEs
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { user_id, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT n.*, u.name as user_name, u.avatar as user_avatar
      FROM nfes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!hasPermission(req.user.role, 'diretor')) {
      if (req.user.role === 'gerente') {
        query += ` AND (n.user_id = ? OR n.user_id IN (SELECT id FROM users WHERE manager_id = ?))`;
        params.push(req.user.id, req.user.id);
      } else {
        query += ` AND n.user_id = ?`;
        params.push(req.user.id);
      }
    } else if (user_id) {
      query += ` AND n.user_id = ?`;
      params.push(user_id);
    }

    if (status) { query += ` AND n.status = ?`; params.push(status); }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const nfes = await db.prepare(query).all(...params);
    res.json({ nfes });
  } catch (error) {
    console.error('Get NFEs error:', error);
    res.status(500).json({ error: 'Failed to get NFEs' });
  }
});

// Get NFE by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const nfe = await db.prepare(`
      SELECT n.*, u.name as user_name, u.avatar as user_avatar
      FROM nfes n LEFT JOIN users u ON n.user_id = u.id WHERE n.id = ?
    `).get(req.params.id);

    if (!nfe) return res.status(404).json({ error: 'NFE not found' });
    if (!hasPermission(req.user.role, 'diretor') && nfe.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ nfe });
  } catch (error) {
    console.error('Get NFE error:', error);
    res.status(500).json({ error: 'Failed to get NFE' });
  }
});

// Create NFE
router.post('/', authenticate, async (req, res) => {
  try {
    const { number, value, notes } = req.body;
    if (!number || !value) return res.status(400).json({ error: 'Number and value required' });

    const db = getDatabase();
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO nfes (id, user_id, number, value, notes) VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.id, number, value, notes || null);

    const nfe = await db.prepare('SELECT * FROM nfes WHERE id = ?').get(id);

    const admins = await db.prepare(`
      SELECT id FROM users WHERE role IN ('super_admin', 'executivo') AND is_active = 1
    `).all();

    const owner = await db.prepare('SELECT manager_id FROM users WHERE id = ?').get(req.user.id);
    if (owner && owner.manager_id) admins.push({ id: owner.manager_id });

    const notifiedIds = new Set();
    for (const admin of admins) {
      if (notifiedIds.has(admin.id)) continue;
      notifiedIds.add(admin.id);
      await createNotification({
        userId: admin.id,
        title: 'Nova NFE enviada',
        message: `${req.user.name} enviou uma nova NFE no valor de R$ ${parseFloat(value).toFixed(2)}`,
        type: 'info',
        link: `/nfes/${id}`
      });
    }

    res.status(201).json({ nfe });
  } catch (error) {
    console.error('Create NFE error:', error);
    res.status(500).json({ error: 'Failed to create NFE' });
  }
});

// Update NFE status
router.patch('/:id/status', authenticate, requireMinRole('diretor'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { valid, error: statusError } = validateStatus(status, NFE_STATUSES);
    if (!valid) return res.status(400).json({ error: statusError });

    const db = getDatabase();
    const nfe = await db.prepare('SELECT * FROM nfes WHERE id = ?').get(req.params.id);
    if (!nfe) return res.status(404).json({ error: 'NFE not found' });

    await db.prepare(`
      UPDATE nfes SET status = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(status, notes || nfe.notes, new Date().toISOString(), req.params.id);

    const statusMessages = { approved: 'Sua NFE foi aprovada', rejected: 'Sua NFE foi rejeitada', paid: 'Sua NFE foi paga' };
    if (statusMessages[status]) {
      await createNotification({
        userId: nfe.user_id,
        title: 'Atualizacao de NFE',
        message: statusMessages[status],
        type: status === 'rejected' ? 'warning' : 'success',
        link: `/nfes/${req.params.id}`
      });
    }

    const updated = await db.prepare(`
      SELECT n.*, u.name as user_name FROM nfes n LEFT JOIN users u ON n.user_id = u.id WHERE n.id = ?
    `).get(req.params.id);

    res.json({ nfe: updated });
  } catch (error) {
    console.error('Update NFE error:', error);
    res.status(500).json({ error: 'Failed to update NFE' });
  }
});

// Delete NFE (only pending)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const nfe = await db.prepare('SELECT * FROM nfes WHERE id = ?').get(req.params.id);
    if (!nfe) return res.status(404).json({ error: 'NFE not found' });
    if (nfe.user_id !== req.user.id && !hasPermission(req.user.role, 'diretor')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (nfe.status !== 'pending') return res.status(400).json({ error: 'Can only delete pending NFEs' });

    await db.prepare('DELETE FROM nfes WHERE id = ?').run(req.params.id);
    res.json({ message: 'NFE deleted' });
  } catch (error) {
    console.error('Delete NFE error:', error);
    res.status(500).json({ error: 'Failed to delete NFE' });
  }
});

// Get NFE summary
router.get('/stats/summary', authenticate, requireMinRole('diretor'), async (req, res) => {
  try {
    const db = getDatabase();
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(value) as total_value,
        SUM(CASE WHEN status = 'pending' THEN value ELSE 0 END) as pending_value,
        SUM(CASE WHEN status = 'paid' THEN value ELSE 0 END) as paid_value
      FROM nfes
    `).get();
    res.json({ summary });
  } catch (error) {
    console.error('Get NFE summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

export default router;
