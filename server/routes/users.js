import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hashPassword, hasPermission, canManageUser } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

// Get all users (with filtering based on role)
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { role, manager_id, is_active } = req.query;

    let query = `
      SELECT u.id, u.email, u.name, u.role, u.avatar, u.manager_id, u.is_active,
             u.empresa, u.tel, u.com_tipo, u.com_val, u.created_at,
             m.name as manager_name
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by role if not super_admin/executivo
    if (!hasPermission(req.user.role, 'executivo')) {
      if (req.user.role === 'diretor') {
        // Directors see their gerentes and parceiros
        query += ` AND (u.manager_id = ? OR u.id = ?)`;
        params.push(req.user.id, req.user.id);
      } else if (req.user.role === 'gerente') {
        // Gerentes see their parceiros
        query += ` AND (u.manager_id = ? OR u.id = ?)`;
        params.push(req.user.id, req.user.id);
      } else {
        // Parceiros see only themselves
        query += ` AND u.id = ?`;
        params.push(req.user.id);
      }
    }

    if (role) {
      query += ` AND u.role = ?`;
      params.push(role);
    }

    if (manager_id) {
      query += ` AND u.manager_id = ?`;
      params.push(manager_id);
    }

    if (is_active !== undefined) {
      query += ` AND u.is_active = ?`;
      params.push(is_active === 'true' ? 1 : 0);
    }

    query += ` ORDER BY u.created_at DESC`;

    const users = db.prepare(query).all(...params);
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get user by ID
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const user = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.avatar, u.manager_id, u.is_active,
             u.empresa, u.tel, u.com_tipo, u.com_val, u.created_at,
             m.name as manager_name
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      WHERE u.id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check access permission
    if (!hasPermission(req.user.role, 'executivo') && user.id !== req.user.id) {
      // Check if user is managed by requester
      if (user.manager_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user
router.post('/', authenticate, requireMinRole('gerente'), async (req, res) => {
  try {
    const { email, password, name, role, manager_id, empresa, tel, com_tipo, com_val } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name and role required' });
    }

    // Check if requester can create this role
    if (!canManageUser(req.user.role, role)) {
      return res.status(403).json({ error: 'Cannot create user with this role' });
    }

    // Validate com_tipo if provided
    if (com_tipo && !['pct', 'valor'].includes(com_tipo)) {
      return res.status(400).json({ error: 'com_tipo must be "pct" or "valor"' });
    }

    const db = getDatabase();

    // Check if email exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashedPassword = await hashPassword(password);
    const id = uuidv4();
    const avatar = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    db.prepare(`
      INSERT INTO users (id, email, password, name, role, avatar, manager_id, empresa, tel, com_tipo, com_val)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, email.toLowerCase(), hashedPassword, name, role, avatar,
      manager_id || null,
      empresa || null,
      tel || null,
      com_tipo || null,
      com_val !== undefined ? com_val : null
    );

    const user = db.prepare(`
      SELECT id, email, name, role, avatar, manager_id, empresa, tel, com_tipo, com_val, is_active, created_at
      FROM users WHERE id = ?
    `).get(id);

    res.status(201).json({ user });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, role, manager_id, is_active, empresa, tel, com_tipo, com_val } = req.body;
    const userId = req.params.id;

    // Validate com_tipo if provided
    if (com_tipo && !['pct', 'valor'].includes(com_tipo)) {
      return res.status(400).json({ error: 'com_tipo must be "pct" or "valor"' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions
    const isSelf = userId === req.user.id;
    const canManage = hasPermission(req.user.role, 'gerente') && canManageUser(req.user.role, user.role);

    if (!isSelf && !canManage && !hasPermission(req.user.role, 'executivo')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Users can only update their own name and parceiro profile fields
    if (isSelf && !hasPermission(req.user.role, 'gerente')) {
      db.prepare(`
        UPDATE users SET name = ?, empresa = ?, tel = ?, com_tipo = ?, com_val = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name || user.name,
        empresa !== undefined ? empresa : user.empresa,
        tel !== undefined ? tel : user.tel,
        com_tipo !== undefined ? com_tipo : user.com_tipo,
        com_val !== undefined ? com_val : user.com_val,
        new Date().toISOString(),
        userId
      );
    } else {
      // Managers can update more fields
      const newRole = role && canManageUser(req.user.role, role) ? role : user.role;

      db.prepare(`
        UPDATE users SET name = ?, role = ?, manager_id = ?, is_active = ?,
          empresa = ?, tel = ?, com_tipo = ?, com_val = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name || user.name,
        newRole,
        manager_id !== undefined ? manager_id : user.manager_id,
        is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
        empresa !== undefined ? empresa : user.empresa,
        tel !== undefined ? tel : user.tel,
        com_tipo !== undefined ? com_tipo : user.com_tipo,
        com_val !== undefined ? com_val : user.com_val,
        new Date().toISOString(),
        userId
      );
    }

    const updatedUser = db.prepare(`
      SELECT id, email, name, role, avatar, manager_id, empresa, tel, com_tipo, com_val, is_active, created_at
      FROM users WHERE id = ?
    `).get(userId);

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (soft delete)
router.delete('/:id', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!canManageUser(req.user.role, user.role)) {
      return res.status(403).json({ error: 'Cannot delete user with this role' });
    }

    // Soft delete
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);

    // Invalidate refresh tokens
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.params.id);

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get team for a manager
router.get('/:id/team', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    // Check access
    if (req.params.id !== req.user.id && !hasPermission(req.user.role, 'executivo')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const team = db.prepare(`
      SELECT id, email, name, role, avatar, is_active, empresa, tel, com_tipo, com_val, created_at
      FROM users
      WHERE manager_id = ?
      ORDER BY role, name
    `).all(req.params.id);

    res.json({ team });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

export default router;
