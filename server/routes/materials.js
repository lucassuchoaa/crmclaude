import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.mp4', '.pptx', '.ppt', '.png', '.jpg', '.jpeg', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${ext}`));
  }
});

const router = express.Router();

// Get materials
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { category, search } = req.query;

    let query = `
      SELECT m.*, u.name as created_by_name
      FROM materials m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by role access
    query += ` AND (m.roles_allowed LIKE ? OR m.roles_allowed LIKE '%all%')`;
    params.push(`%${req.user.role}%`);

    if (category) {
      query += ` AND m.category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (m.title LIKE ? OR m.description LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY m.created_at DESC`;

    const materials = db.prepare(query).all(...params);

    res.json({ materials });
  } catch (error) {
    console.error('Get materials error:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

// Get material by ID
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const material = db.prepare(`
      SELECT m.*, u.name as created_by_name
      FROM materials m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.id = ?
    `).get(req.params.id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // Check access
    const rolesAllowed = material.roles_allowed.split(',');
    if (!rolesAllowed.includes('all') && !rolesAllowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ material });
  } catch (error) {
    console.error('Get material error:', error);
    res.status(500).json({ error: 'Failed to get material' });
  }
});

// Create material (with optional file upload)
router.post('/', authenticate, requireMinRole('gerente'), upload.single('file'), (req, res) => {
  try {
    const { title, description, category, file_type, roles_allowed } = req.body;

    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category required' });
    }

    const db = getDatabase();
    const id = uuidv4();

    const validRoles = ['all', 'super_admin', 'executivo', 'diretor', 'gerente', 'parceiro'];
    const roles = roles_allowed ? roles_allowed.split(',').filter(r => validRoles.includes(r.trim())) : ['all'];

    const filePath = req.file ? req.file.filename : null;
    const detectedType = req.file
      ? path.extname(req.file.originalname).replace('.', '').toLowerCase()
      : (file_type || null);
    const fileSize = req.file ? req.file.size : null;
    const fileDesc = fileSize
      ? `${description || ''} | Tamanho: ${(fileSize / (1024 * 1024)).toFixed(1)} MB`.trim()
      : (description || null);

    db.prepare(`
      INSERT INTO materials (id, title, description, category, file_path, file_type, roles_allowed, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, fileDesc, category, filePath, detectedType, roles.join(','), req.user.id);

    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);

    res.status(201).json({ material });
  } catch (error) {
    console.error('Create material error:', error);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// Download material file
router.get('/:id/download', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);

    if (!material) return res.status(404).json({ error: 'Material not found' });

    const rolesAllowed = material.roles_allowed.split(',');
    if (!rolesAllowed.includes('all') && !rolesAllowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!material.file_path) return res.status(404).json({ error: 'No file attached' });

    const filePath = path.join(uploadsDir, material.file_path);
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    const filename = `${material.title}.${material.file_type || 'bin'}`;
    res.download(filePath, filename);
  } catch (error) {
    console.error('Download material error:', error);
    res.status(500).json({ error: 'Failed to download' });
  }
});

// Update material
router.put('/:id', authenticate, requireMinRole('gerente'), (req, res) => {
  try {
    const { title, description, category, file_path, file_type, roles_allowed } = req.body;

    const db = getDatabase();
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // Only creator or higher roles can edit
    if (material.created_by !== req.user.id && !hasPermission(req.user.role, 'diretor')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validRoles = ['all', 'super_admin', 'executivo', 'diretor', 'gerente', 'parceiro'];
    const roles = roles_allowed ? roles_allowed.split(',').filter(r => validRoles.includes(r.trim())) : material.roles_allowed.split(',');

    db.prepare(`
      UPDATE materials SET
        title = ?, description = ?, category = ?,
        file_path = ?, file_type = ?, roles_allowed = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      title || material.title,
      description !== undefined ? description : material.description,
      category || material.category,
      file_path !== undefined ? file_path : material.file_path,
      file_type !== undefined ? file_type : material.file_type,
      roles.join(','),
      new Date().toISOString(),
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);

    res.json({ material: updated });
  } catch (error) {
    console.error('Update material error:', error);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// Delete material
router.delete('/:id', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const db = getDatabase();
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);

    res.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('Delete material error:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Get categories
router.get('/meta/categories', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const categories = db.prepare(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM materials
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

export default router;
