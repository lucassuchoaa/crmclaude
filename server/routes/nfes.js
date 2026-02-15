import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

// Get NFEs
router.get('/', authenticate, (req, res) => {
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
      query += ` AND n.user_id = ?`;
      params.push(req.user.id);
    } else if (user_id) {
      query += ` AND n.user_id = ?`;
      params.push(user_id);
    }

    if (status) {
      query += ` AND n.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const nfes = db.prepare(query).all(...params);

    res.json({ nfes });
  } catch (error) {
    console.error('Get NFEs error:', error);
    res.status(500).json({ error: 'Failed to get NFEs' });
  }
});

// Get NFE by ID
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const nfe = db.prepare(`
      SELECT n.*, u.name as user_name, u.avatar as user_avatar
      FROM nfes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `).get(req.params.id);

    if (!nfe) {
      return res.status(404).json({ error: 'NFE not found' });
    }

    // Check access
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
router.post('/', authenticate, (req, res) => {
  try {
    const { number, value, notes } = req.body;

    if (!number || !value) {
      return res.status(400).json({ error: 'Number and value required' });
    }

    const db = getDatabase();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO nfes (id, user_id, number, value, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user.id, number, value, notes || null);

    const nfe = db.prepare('SELECT * FROM nfes WHERE id = ?').get(id);

    // Notify admins
    const admins = db.prepare(`
      SELECT id FROM users WHERE role IN ('super_admin', 'executivo') AND is_active = 1
    `).all();

    admins.forEach(admin => {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, 'info', ?)
      `).run(
        uuidv4(),
        admin.id,
        'Nova NFE enviada',
        `${req.user.name} enviou uma nova NFE no valor de R$ ${value.toFixed(2)}`,
        `/nfes/${id}`
      );
    });

    res.status(201).json({ nfe });
  } catch (error) {
    console.error('Create NFE error:', error);
    res.status(500).json({ error: 'Failed to create NFE' });
  }
});

// Update NFE status
router.patch('/:id/status', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected', 'paid'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const db = getDatabase();
    const nfe = db.prepare('SELECT * FROM nfes WHERE id = ?').get(req.params.id);

    if (!nfe) {
      return res.status(404).json({ error: 'NFE not found' });
    }

    db.prepare(`
      UPDATE nfes SET status = ?, notes = ?, updated_at = ? WHERE id = ?
    `).run(status, notes || nfe.notes, new Date().toISOString(), req.params.id);

    // Notify user
    const statusMessages = {
      approved: 'Sua NFE foi aprovada',
      rejected: 'Sua NFE foi rejeitada',
      paid: 'Sua NFE foi paga'
    };

    if (statusMessages[status]) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        nfe.user_id,
        'Atualizacao de NFE',
        statusMessages[status],
        status === 'rejected' ? 'warning' : 'success',
        `/nfes/${req.params.id}`
      );
    }

    const updated = db.prepare(`
      SELECT n.*, u.name as user_name
      FROM nfes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.id = ?
    `).get(req.params.id);

    res.json({ nfe: updated });
  } catch (error) {
    console.error('Update NFE error:', error);
    res.status(500).json({ error: 'Failed to update NFE' });
  }
});

// Delete NFE (only pending)
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const nfe = db.prepare('SELECT * FROM nfes WHERE id = ?').get(req.params.id);

    if (!nfe) {
      return res.status(404).json({ error: 'NFE not found' });
    }

    // Only owner can delete, and only if pending
    if (nfe.user_id !== req.user.id && !hasPermission(req.user.role, 'diretor')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (nfe.status !== 'pending') {
      return res.status(400).json({ error: 'Can only delete pending NFEs' });
    }

    db.prepare('DELETE FROM nfes WHERE id = ?').run(req.params.id);

    res.json({ message: 'NFE deleted' });
  } catch (error) {
    console.error('Delete NFE error:', error);
    res.status(500).json({ error: 'Failed to delete NFE' });
  }
});

// Get NFE summary
router.get('/stats/summary', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const db = getDatabase();

    const summary = db.prepare(`
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
