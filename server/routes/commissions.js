import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

// Get commissions
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { user_id, status, from_date, to_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT c.*,
             i.cnpj, i.razao_social, i.nome_fantasia,
             u.name as user_name, u.avatar as user_avatar
      FROM commissions c
      LEFT JOIN indications i ON c.indication_id = i.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by access
    if (!hasPermission(req.user.role, 'executivo')) {
      query += ` AND c.user_id = ?`;
      params.push(req.user.id);
    } else if (user_id) {
      query += ` AND c.user_id = ?`;
      params.push(user_id);
    }

    if (status) {
      query += ` AND c.status = ?`;
      params.push(status);
    }

    if (from_date) {
      query += ` AND c.created_at >= ?`;
      params.push(from_date);
    }

    if (to_date) {
      query += ` AND c.created_at <= ?`;
      params.push(to_date);
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const commissions = db.prepare(query).all(...params);

    // Calculate totals
    let totalsQuery = `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_total,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_total,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_total
      FROM commissions WHERE 1=1
    `;
    const totalsParams = [];

    if (!hasPermission(req.user.role, 'executivo')) {
      totalsQuery += ` AND user_id = ?`;
      totalsParams.push(req.user.id);
    } else if (user_id) {
      totalsQuery += ` AND user_id = ?`;
      totalsParams.push(user_id);
    }

    const totals = db.prepare(totalsQuery).get(...totalsParams);

    res.json({ commissions, totals });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({ error: 'Failed to get commissions' });
  }
});

// Create commission (when indication is closed)
router.post('/', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const { indication_id, user_id, amount, percentage } = req.body;

    if (!indication_id || !user_id || !amount || !percentage) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const db = getDatabase();

    // Verify indication exists and is closed
    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(indication_id);
    if (!indication) {
      return res.status(404).json({ error: 'Indication not found' });
    }

    if (indication.status !== 'fechado') {
      return res.status(400).json({ error: 'Indication must be closed to create commission' });
    }

    // Verify user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO commissions (id, indication_id, user_id, amount, percentage)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, indication_id, user_id, amount, percentage);

    const commission = db.prepare(`
      SELECT c.*, i.razao_social, u.name as user_name
      FROM commissions c
      LEFT JOIN indications i ON c.indication_id = i.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(id);

    // Create notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, 'success', ?)
    `).run(
      uuidv4(),
      user_id,
      'Nova comissao',
      `Voce tem uma nova comissao de R$ ${amount.toFixed(2)} pendente`,
      `/commissions/${id}`
    );

    res.status(201).json({ commission });
  } catch (error) {
    console.error('Create commission error:', error);
    res.status(500).json({ error: 'Failed to create commission' });
  }
});

// Update commission status
router.patch('/:id/status', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const { status, payment_date } = req.body;
    const validStatuses = ['pending', 'approved', 'paid', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const db = getDatabase();
    const commission = db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.id);

    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    db.prepare(`
      UPDATE commissions SET status = ?, payment_date = ? WHERE id = ?
    `).run(status, status === 'paid' ? (payment_date || new Date().toISOString()) : null, req.params.id);

    // Notify user
    const statusMessages = {
      approved: 'Sua comissao foi aprovada',
      paid: 'Sua comissao foi paga',
      cancelled: 'Sua comissao foi cancelada'
    };

    if (statusMessages[status]) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        commission.user_id,
        'Atualizacao de comissao',
        statusMessages[status],
        status === 'cancelled' ? 'warning' : 'success',
        `/commissions/${req.params.id}`
      );
    }

    const updated = db.prepare(`
      SELECT c.*, i.razao_social, u.name as user_name
      FROM commissions c
      LEFT JOIN indications i ON c.indication_id = i.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);

    res.json({ commission: updated });
  } catch (error) {
    console.error('Update commission error:', error);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});

// Get commission summary by user
router.get('/summary', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const db = getDatabase();
    const { from_date, to_date } = req.query;

    let query = `
      SELECT
        u.id, u.name, u.avatar, u.role,
        COUNT(c.id) as total_commissions,
        SUM(c.amount) as total_amount,
        SUM(CASE WHEN c.status = 'pending' THEN c.amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN c.status = 'approved' THEN c.amount ELSE 0 END) as approved_amount,
        SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END) as paid_amount
      FROM users u
      LEFT JOIN commissions c ON u.id = c.user_id
      WHERE u.is_active = 1
    `;
    const params = [];

    if (from_date) {
      query += ` AND c.created_at >= ?`;
      params.push(from_date);
    }

    if (to_date) {
      query += ` AND c.created_at <= ?`;
      params.push(to_date);
    }

    query += ` GROUP BY u.id ORDER BY total_amount DESC`;

    const summary = db.prepare(query).all(...params);

    res.json({ summary });
  } catch (error) {
    console.error('Get commission summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

export default router;
