import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const VALID_STATUSES = ['novo', 'em_contato', 'proposta', 'negociacao', 'fechado', 'perdido'];

// Get all indications
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { status, owner_id, search, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT i.*,
             u.name as owner_name, u.avatar as owner_avatar,
             m.name as manager_name
      FROM indications i
      LEFT JOIN users u ON i.owner_id = u.id
      LEFT JOIN users m ON i.manager_id = m.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by access
    if (!hasPermission(req.user.role, 'executivo')) {
      if (req.user.role === 'diretor' || req.user.role === 'gerente') {
        // See own and team's indications
        query += ` AND (i.owner_id = ? OR i.owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
        params.push(req.user.id, req.user.id);
      } else {
        // Parceiros see only their own
        query += ` AND i.owner_id = ?`;
        params.push(req.user.id);
      }
    }

    if (status) {
      query += ` AND i.status = ?`;
      params.push(status);
    }

    if (owner_id) {
      query += ` AND i.owner_id = ?`;
      params.push(owner_id);
    }

    if (search) {
      query += ` AND (i.cnpj LIKE ? OR i.razao_social LIKE ? OR i.nome_fantasia LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const indications = db.prepare(query).all(...params);

    // Get total count
    let countQuery = query.replace(/SELECT i\.\*.*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY.*$/, '');
    const countParams = params.slice(0, -2);
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({ indications, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    console.error('Get indications error:', error);
    res.status(500).json({ error: 'Failed to get indications' });
  }
});

// Get indication by ID
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const indication = db.prepare(`
      SELECT i.*,
             u.name as owner_name, u.avatar as owner_avatar,
             m.name as manager_name
      FROM indications i
      LEFT JOIN users u ON i.owner_id = u.id
      LEFT JOIN users m ON i.manager_id = m.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!indication) {
      return res.status(404).json({ error: 'Indication not found' });
    }

    // Check access
    if (!hasPermission(req.user.role, 'executivo') && indication.owner_id !== req.user.id) {
      const team = db.prepare('SELECT id FROM users WHERE manager_id = ?').all(req.user.id);
      const teamIds = team.map(t => t.id);
      if (!teamIds.includes(indication.owner_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get history
    const historyRaw = db.prepare(`
      SELECT h.id, h.action, h.old_value, h.new_value, h.txt, h.created_at,
             u.name as user_name, u.id as user_id
      FROM indication_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.indication_id = ?
      ORDER BY h.created_at DESC
    `).all(req.params.id);

    // Map to frontend-friendly format: hist array with dt, autor, txt
    const hist = historyRaw.map(h => ({
      id: h.id,
      dt: h.created_at,
      autor: h.user_name,
      autorId: h.user_id,
      action: h.action,
      txt: h.txt || h.new_value || h.action,
      oldValue: h.old_value,
      newValue: h.new_value,
    }));

    res.json({ indication, history: historyRaw, hist });
  } catch (error) {
    console.error('Get indication error:', error);
    res.status(500).json({ error: 'Failed to get indication' });
  }
});

// Create indication
router.post('/', authenticate, (req, res) => {
  try {
    const {
      cnpj,
      razao_social,
      nome_fantasia,
      contato_nome,
      contato_telefone,
      contato_email,
      num_funcionarios,
      hubspot_id,
      hubspot_status,
      liberacao_status,
      liberacao_data,
      liberacao_expiry,
      capital,
      abertura,
      cnae,
      endereco,
      value,
      notes,
      manager_id,
    } = req.body;

    if (!cnpj || !razao_social) {
      return res.status(400).json({ error: 'CNPJ and Razao Social required' });
    }

    const db = getDatabase();

    // Check for duplicate CNPJ
    const existing = db.prepare('SELECT id FROM indications WHERE cnpj = ?').get(cnpj.replace(/\D/g, ''));
    if (existing) {
      return res.status(409).json({ error: 'CNPJ already registered', existingId: existing.id });
    }

    const id = uuidv4();
    const cleanCnpj = cnpj.replace(/\D/g, '');

    db.prepare(`
      INSERT INTO indications (
        id, cnpj, razao_social, nome_fantasia,
        contato_nome, contato_telefone, contato_email,
        num_funcionarios, owner_id, manager_id,
        hubspot_id, hubspot_status,
        liberacao_status, liberacao_data, liberacao_expiry,
        capital, abertura, cnae, endereco,
        value, notes
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id, cleanCnpj, razao_social, nome_fantasia || null,
      contato_nome || null, contato_telefone || null, contato_email || null,
      num_funcionarios !== undefined ? num_funcionarios : null,
      req.user.id,
      manager_id || null,
      hubspot_id || null, hubspot_status || null,
      liberacao_status || null, liberacao_data || null, liberacao_expiry || null,
      capital !== undefined ? capital : null,
      abertura || null, cnae || null, endereco || null,
      value || 0, notes || null
    );

    // Log history
    db.prepare(`
      INSERT INTO indication_history (indication_id, user_id, action, new_value)
      VALUES (?, ?, 'created', 'novo')
    `).run(id, req.user.id);

    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(id);

    res.status(201).json({ indication });
  } catch (error) {
    console.error('Create indication error:', error);
    res.status(500).json({ error: 'Failed to create indication' });
  }
});

// Update indication
router.put('/:id', authenticate, (req, res) => {
  try {
    const {
      status,
      contato_nome,
      contato_telefone,
      contato_email,
      num_funcionarios,
      hubspot_id,
      hubspot_status,
      liberacao_status,
      liberacao_data,
      liberacao_expiry,
      capital,
      abertura,
      cnae,
      endereco,
      value,
      notes,
      manager_id,
      obs,
    } = req.body;

    const db = getDatabase();
    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(req.params.id);

    if (!indication) {
      return res.status(404).json({ error: 'Indication not found' });
    }

    // Check access
    if (!hasPermission(req.user.role, 'executivo') && indication.owner_id !== req.user.id) {
      const team = db.prepare('SELECT id FROM users WHERE manager_id = ?').all(req.user.id);
      const teamIds = team.map(t => t.id);
      if (!teamIds.includes(indication.owner_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Validate status
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Log status change
    if (status && status !== indication.status) {
      db.prepare(`
        INSERT INTO indication_history (indication_id, user_id, action, old_value, new_value)
        VALUES (?, ?, 'status_change', ?, ?)
      `).run(req.params.id, req.user.id, indication.status, status);
    }

    // Support 'obs' as alias for 'notes'
    const resolvedNotes = obs !== undefined ? obs : (notes !== undefined ? notes : indication.notes);

    db.prepare(`
      UPDATE indications SET
        status = ?,
        contato_nome = ?,
        contato_telefone = ?,
        contato_email = ?,
        num_funcionarios = ?,
        hubspot_id = ?,
        hubspot_status = ?,
        liberacao_status = ?,
        liberacao_data = ?,
        liberacao_expiry = ?,
        capital = ?,
        abertura = ?,
        cnae = ?,
        endereco = ?,
        value = ?,
        notes = ?,
        manager_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      status || indication.status,
      contato_nome !== undefined ? contato_nome : indication.contato_nome,
      contato_telefone !== undefined ? contato_telefone : indication.contato_telefone,
      contato_email !== undefined ? contato_email : indication.contato_email,
      num_funcionarios !== undefined ? num_funcionarios : indication.num_funcionarios,
      hubspot_id !== undefined ? hubspot_id : indication.hubspot_id,
      hubspot_status !== undefined ? hubspot_status : indication.hubspot_status,
      liberacao_status !== undefined ? liberacao_status : indication.liberacao_status,
      liberacao_data !== undefined ? liberacao_data : indication.liberacao_data,
      liberacao_expiry !== undefined ? liberacao_expiry : indication.liberacao_expiry,
      capital !== undefined ? capital : indication.capital,
      abertura !== undefined ? abertura : indication.abertura,
      cnae !== undefined ? cnae : indication.cnae,
      endereco !== undefined ? endereco : indication.endereco,
      value !== undefined ? value : indication.value,
      resolvedNotes,
      manager_id !== undefined ? manager_id : indication.manager_id,
      new Date().toISOString(),
      req.params.id
    );

    const updated = db.prepare(`
      SELECT i.*, u.name as owner_name, u.avatar as owner_avatar
      FROM indications i
      LEFT JOIN users u ON i.owner_id = u.id
      WHERE i.id = ?
    `).get(req.params.id);

    res.json({ indication: updated });
  } catch (error) {
    console.error('Update indication error:', error);
    res.status(500).json({ error: 'Failed to update indication' });
  }
});

// Delete indication
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(req.params.id);

    if (!indication) {
      return res.status(404).json({ error: 'Indication not found' });
    }

    // Only owner or higher roles can delete
    if (!hasPermission(req.user.role, 'diretor') && indication.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Soft delete by moving to 'perdido' status
    db.prepare(`
      UPDATE indications SET status = 'perdido', updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), req.params.id);

    db.prepare(`
      INSERT INTO indication_history (indication_id, user_id, action, old_value, new_value)
      VALUES (?, ?, 'deleted', ?, 'perdido')
    `).run(req.params.id, req.user.id, indication.status);

    res.json({ message: 'Indication deleted' });
  } catch (error) {
    console.error('Delete indication error:', error);
    res.status(500).json({ error: 'Failed to delete indication' });
  }
});

// Add history entry (observation) to indication
router.post('/:id/history', authenticate, (req, res) => {
  try {
    const { txt, action = 'obs' } = req.body;

    if (!txt) {
      return res.status(400).json({ error: 'txt (text) is required' });
    }

    const db = getDatabase();
    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(req.params.id);

    if (!indication) {
      return res.status(404).json({ error: 'Indication not found' });
    }

    // Check access
    if (!hasPermission(req.user.role, 'executivo') && indication.owner_id !== req.user.id) {
      const team = db.prepare('SELECT id FROM users WHERE manager_id = ?').all(req.user.id);
      const teamIds = team.map(t => t.id);
      if (!teamIds.includes(indication.owner_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    db.prepare(`
      INSERT INTO indication_history (indication_id, user_id, action, txt)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, req.user.id, action, txt);

    // Return updated hist array
    const historyRaw = db.prepare(`
      SELECT h.id, h.action, h.old_value, h.new_value, h.txt, h.created_at,
             u.name as user_name, u.id as user_id
      FROM indication_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.indication_id = ?
      ORDER BY h.created_at DESC
    `).all(req.params.id);

    const hist = historyRaw.map(h => ({
      id: h.id,
      dt: h.created_at,
      autor: h.user_name,
      autorId: h.user_id,
      action: h.action,
      txt: h.txt || h.new_value || h.action,
      oldValue: h.old_value,
      newValue: h.new_value,
    }));

    res.status(201).json({ hist });
  } catch (error) {
    console.error('Add history error:', error);
    res.status(500).json({ error: 'Failed to add history entry' });
  }
});

// Get Kanban board data
router.get('/board/kanban', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    let query = `
      SELECT i.*, u.name as owner_name, u.avatar as owner_avatar
      FROM indications i
      LEFT JOIN users u ON i.owner_id = u.id
      WHERE i.status != 'perdido'
    `;
    const params = [];

    if (!hasPermission(req.user.role, 'executivo')) {
      if (req.user.role === 'diretor' || req.user.role === 'gerente') {
        query += ` AND (i.owner_id = ? OR i.owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
        params.push(req.user.id, req.user.id);
      } else {
        query += ` AND i.owner_id = ?`;
        params.push(req.user.id);
      }
    }

    query += ` ORDER BY i.updated_at DESC`;

    const indications = db.prepare(query).all(...params);

    // Group by status
    const columns = {
      novo: [],
      em_contato: [],
      proposta: [],
      negociacao: [],
      fechado: []
    };

    indications.forEach(ind => {
      if (columns[ind.status]) {
        columns[ind.status].push(ind);
      }
    });

    res.json({ columns });
  } catch (error) {
    console.error('Get kanban error:', error);
    res.status(500).json({ error: 'Failed to get kanban data' });
  }
});

export default router;
