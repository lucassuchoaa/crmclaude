import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'proposals');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const isPg = !!process.env.DATABASE_URL;

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage: isPg ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.docx', '.doc', '.pdf', '.pptx', '.ppt', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipo não permitido: ${ext}. Use: ${allowed.join(', ')}`));
  }
});

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'executivo', 'diretor', 'gerente'];

function checkProposalAccess(req, res, next) {
  if (!ALLOWED_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Sem permissão para propostas' });
  }
  next();
}

// GET /templates - List proposal templates
router.get('/templates', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const templates = await db.prepare(`
      SELECT pt.*, u.name as created_by_name
      FROM proposal_templates pt
      LEFT JOIN users u ON u.id = pt.created_by
      WHERE pt.is_active = 1
      ORDER BY pt.name
    `).all();
    res.json({ templates });
  } catch (error) {
    console.error('Get proposal templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// POST /templates - Create template (upload file)
router.post('/templates', authenticate, checkProposalAccess, upload.single('file'), async (req, res) => {
  try {
    const { name, description, editable_fields } = req.body;
    if (!name || !req.file) {
      return res.status(400).json({ error: 'Nome e arquivo são obrigatórios' });
    }

    const db = getDatabase();
    const id = uuidv4();
    const fileOriginalName = req.file.originalname;
    const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');

    // Parse editable_fields JSON
    let fields = '[]';
    try { fields = editable_fields || '[]'; } catch { fields = '[]'; }

    if (isPg) {
      const fileData = req.file.buffer;
      await db.prepare(`
        INSERT INTO proposal_templates (id, name, description, file_data, file_original_name, file_type, editable_fields, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), description || null, fileData, fileOriginalName, fileType, fields, req.user.id);
    } else {
      const filePath = req.file.filename;
      await db.prepare(`
        INSERT INTO proposal_templates (id, name, description, file_path, file_original_name, file_type, editable_fields, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), description || null, filePath, fileOriginalName, fileType, fields, req.user.id);
    }

    const template = await db.prepare('SELECT * FROM proposal_templates WHERE id = ?').get(id);
    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /templates/:id - Update template metadata
router.put('/templates/:id', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const { name, description, editable_fields } = req.body;
    const db = getDatabase();

    const existing = await db.prepare('SELECT * FROM proposal_templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template não encontrado' });

    await db.prepare(`
      UPDATE proposal_templates SET name = ?, description = ?, editable_fields = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      editable_fields || existing.editable_fields,
      new Date().toISOString(),
      req.params.id
    );

    const template = await db.prepare('SELECT * FROM proposal_templates WHERE id = ?').get(req.params.id);
    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /templates/:id - Deactivate template
router.delete('/templates/:id', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('UPDATE proposal_templates SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);
    res.json({ message: 'Template removido' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// GET /templates/:id/download - Download template file
router.get('/templates/:id/download', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const cols = isPg ? 'id, file_data, file_original_name, file_type' : 'id, file_path, file_original_name, file_type';
    const template = await db.prepare(`SELECT ${cols} FROM proposal_templates WHERE id = ?`).get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });

    if (isPg) {
      if (!template.file_data) return res.status(404).json({ error: 'Arquivo não encontrado' });
      const safeName = path.basename(template.file_original_name || 'download').replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(template.file_data);
    } else {
      if (!template.file_path) return res.status(404).json({ error: 'Arquivo não encontrado' });
      const filePath = path.resolve(uploadsDir, path.basename(template.file_path));
      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado no disco' });
      }
      const safeName = path.basename(template.file_original_name || 'download').replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      return res.sendFile(filePath);
    }
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// POST /generate - Generate a proposal from template with filled fields
router.post('/generate', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const { template_id, entity_type, entity_id, field_values, title } = req.body;
    if (!template_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'template_id, entity_type e entity_id são obrigatórios' });
    }

    const db = getDatabase();
    const template = await db.prepare('SELECT * FROM proposal_templates WHERE id = ?').get(template_id);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO proposals (id, template_id, entity_type, entity_id, title, field_values, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)
    `).run(id, template_id, entity_type, entity_id, title || template.name, JSON.stringify(field_values || {}), req.user.id);

    const proposal = await db.prepare(`
      SELECT p.*, pt.name as template_name, pt.file_original_name, pt.file_type, u.name as created_by_name
      FROM proposals p
      LEFT JOIN proposal_templates pt ON pt.id = p.template_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
    `).get(id);

    res.status(201).json({ proposal });
  } catch (error) {
    console.error('Generate proposal error:', error);
    res.status(500).json({ error: 'Failed to generate proposal' });
  }
});

// GET /entity/:type/:id - Get proposals for an entity (deal or indication)
router.get('/entity/:type/:id', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const proposals = await db.prepare(`
      SELECT p.*, pt.name as template_name, pt.file_original_name, pt.file_type, u.name as created_by_name
      FROM proposals p
      LEFT JOIN proposal_templates pt ON pt.id = p.template_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.entity_type = ? AND p.entity_id = ?
      ORDER BY p.created_at DESC
    `).all(req.params.type, req.params.id);
    res.json({ proposals });
  } catch (error) {
    console.error('Get entity proposals error:', error);
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

// PATCH /:id/status - Update proposal status
router.patch('/:id/status', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['rascunho', 'enviada', 'aceita', 'recusada'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const sentAt = status === 'enviada' ? new Date().toISOString() : null;

    await db.prepare(`
      UPDATE proposals SET status = ?, sent_at = COALESCE(?, sent_at), updated_at = ? WHERE id = ?
    `).run(status, sentAt, new Date().toISOString(), req.params.id);

    const proposal = await db.prepare(`
      SELECT p.*, pt.name as template_name, u.name as created_by_name
      FROM proposals p
      LEFT JOIN proposal_templates pt ON pt.id = p.template_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
    `).get(req.params.id);

    res.json({ proposal });
  } catch (error) {
    console.error('Update proposal status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /:id - Delete proposal
router.delete('/:id', authenticate, checkProposalAccess, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM proposals WHERE id = ?').run(req.params.id);
    res.json({ message: 'Proposta removida' });
  } catch (error) {
    console.error('Delete proposal error:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

export default router;
