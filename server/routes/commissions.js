import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getDatabase } from '../config/database.js';
import { hasPermission, canViewAllFinancial } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';
import { validateStatus, COMMISSION_STATUSES } from '../utils/validators.js';
import { createNotification } from '../utils/notificationHelper.js';

const isPg = !!process.env.DATABASE_URL;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.png', '.jpg', '.jpeg'];
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    cb(null, allowed.includes(ext));
  }
});

const router = express.Router();

// Get commissions
router.get('/', authenticate, async (req, res) => {
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

    if (!hasPermission(req.user.role, 'executivo') && !canViewAllFinancial(req.user.role)) {
      query += ` AND c.user_id = ?`;
      params.push(req.user.id);
    } else if (user_id) {
      query += ` AND c.user_id = ?`;
      params.push(user_id);
    }

    if (status) { query += ` AND c.status = ?`; params.push(status); }
    if (from_date) { query += ` AND c.created_at >= ?`; params.push(from_date); }
    if (to_date) { query += ` AND c.created_at <= ?`; params.push(to_date); }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const commissions = await db.prepare(query).all(...params);

    let totalsQuery = `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_total,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_total,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_total
      FROM commissions WHERE 1=1
    `;
    const totalsParams = [];

    if (!hasPermission(req.user.role, 'executivo') && !canViewAllFinancial(req.user.role)) {
      totalsQuery += ` AND user_id = ?`; totalsParams.push(req.user.id);
    } else if (user_id) {
      totalsQuery += ` AND user_id = ?`; totalsParams.push(user_id);
    }

    const totals = await db.prepare(totalsQuery).get(...totalsParams);

    res.json({ commissions, totals });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({ error: 'Failed to get commissions' });
  }
});

// Create commission
router.post('/', authenticate, requireMinRole('gerente'), upload.single('file'), async (req, res) => {
  try {
    const { indication_id, user_id, amount, percentage } = req.body;

    if (!user_id || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'user_id and amount are required' });
    }

    const db = getDatabase();

    // Validate indication if provided
    if (indication_id) {
      const indication = await db.prepare('SELECT * FROM indications WHERE id = ?').get(indication_id);
      if (!indication) return res.status(404).json({ error: 'Indication not found' });
      if (indication.status !== 'fechado') return res.status(400).json({ error: 'Indication must be closed to create commission' });
    }

    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const id = uuidv4();

    const indIdValue = indication_id || '';
    const numericAmount = parseFloat(amount) || 0;
    const numericPercentage = parseFloat(percentage) || 0;
    const fileData = req.file ? req.file.buffer : null;
    const fileName = req.file ? req.file.originalname : null;
    await db.prepare(`
      INSERT INTO commissions (id, indication_id, user_id, amount, percentage, file_data, file_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, indIdValue, user_id, numericAmount, numericPercentage, fileData, fileName);

    const commission = await db.prepare(`
      SELECT c.*, i.razao_social, u.name as user_name
      FROM commissions c
      LEFT JOIN indications i ON c.indication_id = i.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(id);

    await createNotification({
      userId: user_id,
      title: 'Nova comissao',
      message: `Voce tem uma nova comissao de R$ ${numericAmount.toFixed(2)} pendente`,
      type: 'success',
      link: `/commissions/${id}`
    });

    res.status(201).json({ commission });
  } catch (error) {
    console.error('Create commission error:', error.message, error.stack);
    const body = { error: 'Failed to create commission' };
    if (process.env.NODE_ENV !== 'production') body.detail = error.message;
    res.status(500).json(body);
  }
});

// Update commission status
router.patch('/:id/status', authenticate, requireMinRole('diretor'), async (req, res) => {
  try {
    const { status, payment_date } = req.body;
    const { valid, error: statusError } = validateStatus(status, COMMISSION_STATUSES);
    if (!valid) return res.status(400).json({ error: statusError });

    const db = getDatabase();
    const commission = await db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.id);
    if (!commission) return res.status(404).json({ error: 'Commission not found' });

    await db.prepare(`
      UPDATE commissions SET status = ?, payment_date = ? WHERE id = ?
    `).run(status, status === 'paid' ? (payment_date || new Date().toISOString()) : null, req.params.id);

    const statusMessages = {
      approved: 'Sua comissao foi aprovada',
      paid: 'Sua comissao foi paga',
      cancelled: 'Sua comissao foi cancelada'
    };

    if (statusMessages[status]) {
      await createNotification({
        userId: commission.user_id,
        title: 'Atualizacao de comissao',
        message: statusMessages[status],
        type: status === 'cancelled' ? 'warning' : 'success',
        link: `/commissions/${req.params.id}`
      });
    }

    const updated = await db.prepare(`
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

// Download commission file
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const comm = await db.prepare('SELECT file_data, file_name, user_id FROM commissions WHERE id = ?').get(req.params.id);
    if (!comm) return res.status(404).json({ error: 'Commission not found' });

    if (!hasPermission(req.user.role, 'diretor') && !canViewAllFinancial(req.user.role) && comm.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!comm.file_data) return res.status(404).json({ error: 'Nenhum arquivo anexado a esta comissão' });

    const ext = (comm.file_name || '').match(/\.[^.]+$/)?.[0] || '.pdf';
    const mimeMap = { '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${comm.file_name || 'comissao' + ext}"`);
    res.send(Buffer.from(comm.file_data));
  } catch (error) {
    console.error('Download commission file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Export commissions as CSV
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'diretor') && !canViewAllFinancial(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDatabase();
    const { status, from_date, to_date } = req.query;

    let query = `
      SELECT c.amount, c.percentage, c.status, c.payment_date, c.created_at,
             i.cnpj, i.razao_social, i.nome_fantasia,
             u.name as user_name, u.email as user_email
      FROM commissions c
      LEFT JOIN indications i ON c.indication_id = i.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ` AND c.status = ?`; params.push(status); }
    if (from_date) { query += ` AND c.created_at >= ?`; params.push(from_date); }
    if (to_date) { query += ` AND c.created_at <= ?`; params.push(to_date); }

    query += ` ORDER BY c.created_at DESC`;

    const commissions = await db.prepare(query).all(...params);

    const header = 'Parceiro,Email,CNPJ,Razao_Social,Valor,Percentual,Status,Data_Pagamento,Criado_em\n';
    const csvRows = commissions.map(c => {
      const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
      return [esc(c.user_name), esc(c.user_email), esc(c.cnpj), esc(c.razao_social), c.amount, c.percentage, c.status, c.payment_date || '', c.created_at].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=comissoes_export_${new Date().toISOString().slice(0,10)}.csv`);
    res.send('\uFEFF' + header + csvRows);
  } catch (error) {
    console.error('Export commissions CSV error:', error);
    res.status(500).json({ error: 'Failed to export commissions' });
  }
});

// Get commission summary by user
router.get('/summary', authenticate, async (req, res) => {
  try {
    if (!hasPermission(req.user.role, 'diretor') && !canViewAllFinancial(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
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

    if (from_date) { query += ` AND c.created_at >= ?`; params.push(from_date); }
    if (to_date) { query += ` AND c.created_at <= ?`; params.push(to_date); }

    query += ` GROUP BY u.id, u.name, u.avatar, u.role ORDER BY total_amount DESC`;

    const summary = await db.prepare(query).all(...params);
    res.json({ summary });
  } catch (error) {
    console.error('Get commission summary error:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

export default router;
