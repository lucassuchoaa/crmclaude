import express from 'express';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard stats
router.get('/stats', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const isAdmin = hasPermission(req.user.role, 'executivo');

    let indicationsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'novo' THEN 1 ELSE 0 END) as novo,
        SUM(CASE WHEN status = 'em_contato' THEN 1 ELSE 0 END) as em_contato,
        SUM(CASE WHEN status = 'proposta' THEN 1 ELSE 0 END) as proposta,
        SUM(CASE WHEN status = 'negociacao' THEN 1 ELSE 0 END) as negociacao,
        SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) as fechado,
        SUM(CASE WHEN status = 'perdido' THEN 1 ELSE 0 END) as perdido,
        SUM(value) as total_value,
        SUM(CASE WHEN status = 'fechado' THEN value ELSE 0 END) as closed_value
      FROM indications
    `;
    const indicationParams = [];

    if (!isAdmin) {
      indicationsQuery += ` WHERE owner_id = ? OR owner_id IN (SELECT id FROM users WHERE manager_id = ?)`;
      indicationParams.push(req.user.id, req.user.id);
    }

    const indications = db.prepare(indicationsQuery).get(...indicationParams);

    // Commissions stats
    let commissionsQuery = `
      SELECT
        SUM(amount) as total,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid
      FROM commissions
    `;
    const commissionParams = [];

    if (!isAdmin) {
      commissionsQuery += ` WHERE user_id = ?`;
      commissionParams.push(req.user.id);
    }

    const commissions = db.prepare(commissionsQuery).get(...commissionParams);

    // Recent activity
    let activityQuery = `
      SELECT
        'indication' as type,
        i.id,
        i.razao_social as title,
        i.status,
        i.updated_at,
        u.name as user_name
      FROM indications i
      LEFT JOIN users u ON i.owner_id = u.id
    `;

    if (!isAdmin) {
      activityQuery += ` WHERE i.owner_id = ? OR i.owner_id IN (SELECT id FROM users WHERE manager_id = ?)`;
    }

    activityQuery += ` ORDER BY i.updated_at DESC LIMIT 10`;

    const recentActivity = isAdmin
      ? db.prepare(activityQuery).all()
      : db.prepare(activityQuery).all(req.user.id, req.user.id);

    // Conversion rate
    const conversionRate = indications.total > 0
      ? ((indications.fechado / indications.total) * 100).toFixed(1)
      : 0;

    // This month stats
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    let monthlyQuery = `
      SELECT COUNT(*) as new_indications
      FROM indications
      WHERE created_at >= ?
    `;
    const monthlyParams = [thisMonth.toISOString()];

    if (!isAdmin) {
      monthlyQuery += ` AND (owner_id = ? OR owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
      monthlyParams.push(req.user.id, req.user.id);
    }

    const monthly = db.prepare(monthlyQuery).get(...monthlyParams);

    res.json({
      indications: {
        total: indications.total || 0,
        byStatus: {
          novo: indications.novo || 0,
          em_contato: indications.em_contato || 0,
          proposta: indications.proposta || 0,
          negociacao: indications.negociacao || 0,
          fechado: indications.fechado || 0,
          perdido: indications.perdido || 0
        },
        totalValue: indications.total_value || 0,
        closedValue: indications.closed_value || 0,
        conversionRate: parseFloat(conversionRate)
      },
      commissions: {
        total: commissions.total || 0,
        pending: commissions.pending || 0,
        approved: commissions.approved || 0,
        paid: commissions.paid || 0
      },
      monthly: {
        newIndications: monthly.new_indications || 0
      },
      recentActivity
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get team performance (for managers)
router.get('/team-performance', authenticate, (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'gerente')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDatabase();
    const isAdmin = hasPermission(req.user.role, 'executivo');

    let query = `
      SELECT
        u.id,
        u.name,
        u.avatar,
        u.role,
        COUNT(DISTINCT i.id) as total_indications,
        SUM(CASE WHEN i.status = 'fechado' THEN 1 ELSE 0 END) as closed_indications,
        SUM(CASE WHEN i.status = 'fechado' THEN i.value ELSE 0 END) as closed_value,
        SUM(c.amount) as total_commissions
      FROM users u
      LEFT JOIN indications i ON u.id = i.owner_id
      LEFT JOIN commissions c ON u.id = c.user_id AND c.status = 'paid'
      WHERE u.is_active = 1
    `;

    if (!isAdmin) {
      query += ` AND (u.id = ? OR u.manager_id = ?)`;
    }

    query += ` GROUP BY u.id ORDER BY closed_value DESC`;

    const team = isAdmin
      ? db.prepare(query).all()
      : db.prepare(query).all(req.user.id, req.user.id);

    res.json({ team });
  } catch (error) {
    console.error('Get team performance error:', error);
    res.status(500).json({ error: 'Failed to get team performance' });
  }
});

// Get charts data
router.get('/charts', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { period = '30' } = req.query;
    const isAdmin = hasPermission(req.user.role, 'executivo');

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    // Indications over time
    let timelineQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) as closed
      FROM indications
      WHERE created_at >= ?
    `;
    const timelineParams = [daysAgo.toISOString()];

    if (!isAdmin) {
      timelineQuery += ` AND (owner_id = ? OR owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
      timelineParams.push(req.user.id, req.user.id);
    }

    timelineQuery += ` GROUP BY DATE(created_at) ORDER BY date`;

    const timeline = db.prepare(timelineQuery).all(...timelineParams);

    // Status distribution
    let statusQuery = `
      SELECT status, COUNT(*) as count
      FROM indications
      WHERE status != 'perdido'
    `;
    const statusParams = [];

    if (!isAdmin) {
      statusQuery += ` AND (owner_id = ? OR owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
      statusParams.push(req.user.id, req.user.id);
    }

    statusQuery += ` GROUP BY status`;

    const statusDistribution = db.prepare(statusQuery).all(...statusParams);

    // Value by status
    let valueQuery = `
      SELECT status, SUM(value) as total_value
      FROM indications
    `;
    const valueParams = [];

    if (!isAdmin) {
      valueQuery += ` WHERE (owner_id = ? OR owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
      valueParams.push(req.user.id, req.user.id);
    }

    valueQuery += ` GROUP BY status`;

    const valueByStatus = db.prepare(valueQuery).all(...valueParams);

    res.json({
      timeline,
      statusDistribution,
      valueByStatus
    });
  } catch (error) {
    console.error('Get charts error:', error);
    res.status(500).json({ error: 'Failed to get charts data' });
  }
});

export default router;
