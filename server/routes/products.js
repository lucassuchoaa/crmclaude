import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /products - list all active products
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT p.*, u.name as creator_name FROM products p LEFT JOIN users u ON p.created_by = u.id WHERE p.is_active = 1 ORDER BY p.name').all();
    res.json(rows);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /products - create product (super_admin only)
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uuidv4();
    await db.prepare('INSERT INTO products (id, name, description, created_by) VALUES (?, ?, ?, ?)').run(id, name, description || null, req.user.id);
    res.status(201).json({ id, name });
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/:id - update product
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    const { name, description } = req.body;
    await db.prepare('UPDATE products SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, description || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id - soft delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
    const db = getDatabase();
    await db.prepare('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /products error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
