import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(path.join(__dirname, '..', 'data', 'contracts'));
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function isInsideDir(candidate, base) {
  const resolved = path.resolve(candidate);
  const baseResolved = path.resolve(base) + path.sep;
  return resolved === path.resolve(base) || resolved.startsWith(baseResolved);
}

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

function checkAccess(req, res, next) {
  if (!ALLOWED_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Sem permissão para contratos' });
  }
  next();
}

// ── Helper: get ClickSign config ──
async function getClickSignConfig() {
  const db = getDatabase();
  const cfg = await db.prepare('SELECT * FROM clicksign_config ORDER BY id DESC LIMIT 1').get();
  if (!cfg || !cfg.api_key) return null;
  const baseUrl = cfg.environment === 'production'
    ? 'https://app.clicksign.com/api/v1'
    : 'https://sandbox.clicksign.com/api/v1';
  return { apiKey: cfg.api_key, baseUrl, environment: cfg.environment };
}

// ── Helper: ClickSign API call ──
async function clicksignRequest(method, endpoint, body, cfg) {
  const url = `${cfg.baseUrl}${endpoint}?access_token=${cfg.apiKey}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickSign ${method} ${endpoint}: ${res.status} - ${text}`);
  }
  // 202 may have empty body
  if (res.status === 202) return { status: 'accepted' };
  return res.json();
}

// ════════════════════════════════════════
// CONTRACT TEMPLATES
// ════════════════════════════════════════

// GET /templates
router.get('/templates', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const templates = await db.prepare(`
      SELECT ct.*, u.name as created_by_name
      FROM contract_templates ct
      LEFT JOIN users u ON u.id = ct.created_by
      WHERE ct.is_active = 1
      ORDER BY ct.name
    `).all();
    res.json({ templates });
  } catch (error) {
    console.error('Get contract templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// POST /templates
router.post('/templates', authenticate, checkAccess, upload.single('file'), async (req, res) => {
  try {
    const { name, description, editable_fields } = req.body;
    if (!name || !req.file) {
      return res.status(400).json({ error: 'Nome e arquivo são obrigatórios' });
    }
    const db = getDatabase();
    const id = uuidv4();
    const fileOriginalName = req.file.originalname;
    const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    let fields = '[]';
    try { fields = editable_fields || '[]'; } catch { fields = '[]'; }

    if (isPg) {
      await db.prepare(`
        INSERT INTO contract_templates (id, name, description, file_data, file_original_name, file_type, editable_fields, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), description || null, req.file.buffer, fileOriginalName, fileType, fields, req.user.id);
    } else {
      await db.prepare(`
        INSERT INTO contract_templates (id, name, description, file_path, file_original_name, file_type, editable_fields, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), description || null, req.file.filename, fileOriginalName, fileType, fields, req.user.id);
    }

    const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id);
    res.status(201).json({ template });
  } catch (error) {
    console.error('Create contract template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /templates/:id
router.put('/templates/:id', authenticate, checkAccess, async (req, res) => {
  try {
    const { name, description, editable_fields } = req.body;
    const db = getDatabase();
    const existing = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Modelo não encontrado' });

    await db.prepare(`
      UPDATE contract_templates SET name = ?, description = ?, editable_fields = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      editable_fields || existing.editable_fields,
      new Date().toISOString(),
      req.params.id
    );

    const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
    res.json({ template });
  } catch (error) {
    console.error('Update contract template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /templates/:id
router.delete('/templates/:id', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('UPDATE contract_templates SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);
    res.json({ message: 'Modelo removido' });
  } catch (error) {
    console.error('Delete contract template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// GET /templates/:id/download
router.get('/templates/:id/download', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const cols = isPg ? 'id, file_data, file_original_name, file_type' : 'id, file_path, file_original_name, file_type';
    const template = await db.prepare(`SELECT ${cols} FROM contract_templates WHERE id = ?`).get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Modelo não encontrado' });

    if (isPg) {
      if (!template.file_data) return res.status(404).json({ error: 'Arquivo não encontrado' });
      const safeName = path.basename(template.file_original_name || 'download').replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(template.file_data);
    } else {
      if (!template.file_path) return res.status(404).json({ error: 'Arquivo não encontrado' });
      const filePath = path.resolve(uploadsDir, path.basename(template.file_path));
      if (!isInsideDir(filePath, uploadsDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado no disco' });
      }
      const safeName = path.basename(template.file_original_name || 'download').replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      return res.sendFile(filePath);
    }
  } catch (error) {
    console.error('Download contract template error:', error);
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// ════════════════════════════════════════
// CONTRACTS
// ════════════════════════════════════════

// POST /generate
router.post('/generate', authenticate, checkAccess, async (req, res) => {
  try {
    const { template_id, entity_type, entity_id, field_values, title } = req.body;
    if (!template_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'template_id, entity_type e entity_id são obrigatórios' });
    }

    const db = getDatabase();
    const template = await db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(template_id);
    if (!template) return res.status(404).json({ error: 'Modelo não encontrado' });

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO contracts (id, template_id, entity_type, entity_id, title, field_values, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)
    `).run(id, template_id, entity_type, entity_id, title || template.name, JSON.stringify(field_values || {}), req.user.id);

    const contract = await db.prepare(`
      SELECT c.*, ct.name as template_name, ct.file_original_name, ct.file_type, u.name as created_by_name
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
    `).get(id);

    res.status(201).json({ contract });
  } catch (error) {
    console.error('Generate contract error:', error);
    res.status(500).json({ error: 'Failed to generate contract' });
  }
});

// GET /entity/:type/:id
router.get('/entity/:type/:id', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const contracts = await db.prepare(`
      SELECT c.*, ct.name as template_name, ct.file_original_name, ct.file_type, u.name as created_by_name
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.entity_type = ? AND c.entity_id = ?
      ORDER BY c.created_at DESC
    `).all(req.params.type, req.params.id);
    res.json({ contracts });
  } catch (error) {
    console.error('Get entity contracts error:', error);
    res.status(500).json({ error: 'Failed to get contracts' });
  }
});

// PATCH /:id/status
router.patch('/:id/status', authenticate, checkAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['rascunho', 'enviado', 'assinado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const sentAt = status === 'enviado' ? new Date().toISOString() : null;
    const signedAt = status === 'assinado' ? new Date().toISOString() : null;

    await db.prepare(`
      UPDATE contracts SET status = ?, sent_at = COALESCE(?, sent_at), signed_at = COALESCE(?, signed_at), updated_at = ? WHERE id = ?
    `).run(status, sentAt, signedAt, new Date().toISOString(), req.params.id);

    const contract = await db.prepare(`
      SELECT c.*, ct.name as template_name, u.name as created_by_name
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
    `).get(req.params.id);

    res.json({ contract });
  } catch (error) {
    console.error('Update contract status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Contrato removido' });
  } catch (error) {
    console.error('Delete contract error:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

// ════════════════════════════════════════
// CLICKSIGN INTEGRATION
// ════════════════════════════════════════

// GET /clicksign/config
router.get('/clicksign/config', authenticate, checkAccess, async (req, res) => {
  try {
    const db = getDatabase();
    const cfg = await db.prepare('SELECT api_key, environment, updated_at FROM clicksign_config ORDER BY id DESC LIMIT 1').get();
    res.json({
      configured: !!cfg,
      environment: cfg?.environment || 'sandbox',
      apiKeyPreview: cfg?.api_key ? cfg.api_key.slice(0, 8) + '...' : null,
      updatedAt: cfg?.updated_at || null,
    });
  } catch (error) {
    console.error('Get ClickSign config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /clicksign/config
router.post('/clicksign/config', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Apenas super_admin pode configurar ClickSign' });
    const { apiKey, environment } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key obrigatória' });

    const db = getDatabase();
    // Upsert: delete old + insert new
    await db.prepare('DELETE FROM clicksign_config').run();
    await db.prepare('INSERT INTO clicksign_config (api_key, environment, updated_by, updated_at) VALUES (?, ?, ?, ?)')
      .run(apiKey, environment || 'sandbox', req.user.id, new Date().toISOString());

    res.json({ message: 'Configuração salva', environment: environment || 'sandbox' });
  } catch (error) {
    console.error('Save ClickSign config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /clicksign/test
router.post('/clicksign/test', authenticate, checkAccess, async (req, res) => {
  try {
    const cfg = await getClickSignConfig();
    if (!cfg) return res.status(400).json({ error: 'ClickSign não configurado' });

    // Test by listing documents (lightweight)
    const result = await clicksignRequest('GET', '/documents', null, cfg);
    res.json({ connected: true, environment: cfg.environment, message: 'Conexão OK' });
  } catch (error) {
    console.error('ClickSign test error:', error.message);
    res.json({ connected: false, error: error.message });
  }
});

// POST /clicksign/send - Upload document to ClickSign and send for signature
router.post('/clicksign/send', authenticate, checkAccess, async (req, res) => {
  try {
    const { contract_id, signers, message } = req.body;
    if (!contract_id || !signers || signers.length === 0) {
      return res.status(400).json({ error: 'contract_id e pelo menos um signatário são obrigatórios' });
    }

    const cfg = await getClickSignConfig();
    if (!cfg) return res.status(400).json({ error: 'ClickSign não configurado. Vá em Configurações > Integrações > ClickSign.' });

    const db = getDatabase();
    const contract = await db.prepare(`
      SELECT c.*, ct.file_path, ct.file_data, ct.file_original_name, ct.file_type
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      WHERE c.id = ?
    `).get(contract_id);

    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });

    // 1. Get file content as base64
    let fileBase64;
    let mimeType = 'application/pdf';
    const ext = contract.file_type || 'pdf';
    if (ext === 'docx' || ext === 'doc') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'pdf') mimeType = 'application/pdf';

    if (isPg && contract.file_data) {
      fileBase64 = Buffer.from(contract.file_data).toString('base64');
    } else if (contract.file_path) {
      const safeFile = path.basename(contract.file_path);
      // Check in contracts dir first, then proposals dir (template file)
      const contractPath = path.join(uploadsDir, safeFile);
      const proposalsPath = path.join(uploadsDir, '..', 'proposals', safeFile);
      let actualPath = null;
      if (fs.existsSync(contractPath)) actualPath = contractPath;
      else if (fs.existsSync(proposalsPath)) actualPath = proposalsPath;
      if (!actualPath) {
        return res.status(404).json({ error: 'Arquivo do modelo não encontrado no disco' });
      }
      fileBase64 = fs.readFileSync(actualPath).toString('base64');
    } else {
      return res.status(404).json({ error: 'Arquivo do modelo não encontrado' });
    }

    // 2. Create document on ClickSign
    const docResult = await clicksignRequest('POST', '/documents', {
      document: {
        path: `/${contract.title.replace(/[/\\]/g, '-')}-${Date.now()}.${ext === 'docx' || ext === 'doc' ? ext : 'pdf'}`,
        content_base64: `data:${mimeType};base64,${fileBase64}`,
        deadline_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        auto_close: true,
        locale: 'pt-BR',
        remind_interval: 3,
      }
    }, cfg);

    const documentKey = docResult.document?.key;
    if (!documentKey) {
      console.error('ClickSign document creation response:', docResult);
      return res.status(500).json({ error: 'Falha ao criar documento no ClickSign' });
    }

    // 3. Create signers and add to signature list
    const signerResults = [];
    for (const signer of signers) {
      // Create signer
      const signerResult = await clicksignRequest('POST', '/signers', {
        signer: {
          email: signer.email,
          name: signer.name,
          auths: [signer.auth || 'email'],
          phone_number: signer.phone || undefined,
          documentation: signer.cpf || undefined,
          has_documentation: !!signer.cpf,
        }
      }, cfg);

      const signerKey = signerResult.signer?.key;
      if (!signerKey) {
        console.error('ClickSign signer creation failed for:', signer.email, signerResult);
        return res.status(500).json({ error: `Falha ao criar signatário: ${signer.name} (${signer.email})` });
      }

      // Add signer to document signature list
      await clicksignRequest('POST', '/lists', {
        list: {
          document_key: documentKey,
          signer_key: signerKey,
          sign_as: signer.role || 'sign',
        }
      }, cfg);

      signerResults.push({
        key: signerKey,
        name: signer.name,
        email: signer.email,
        role: signer.role || 'sign',
      });
    }

    // 4. Send notification to signers
    let requestSignatureKey = null;
    for (const sr of signerResults) {
      try {
        // Get the request_signature_key from the list
        const docDetails = await clicksignRequest('GET', `/documents/${documentKey}`, null, cfg);
        const sigList = docDetails.document?.signers || [];
        const found = sigList.find(s => s.signer?.key === sr.key);
        if (found) {
          requestSignatureKey = found.request_signature_key;
          await clicksignRequest('POST', '/notifications', {
            request_signature_key: found.request_signature_key,
            message: message || `Prezado(a) ${sr.name},\nPor favor assine o contrato: ${contract.title}.\n\nAtenciosamente.`,
          }, cfg);
        }
      } catch (notifErr) {
        console.error('ClickSign notification error:', notifErr.message);
      }
    }

    // 5. Update contract with ClickSign data
    await db.prepare(`
      UPDATE contracts SET
        clicksign_document_key = ?,
        clicksign_request_signature_key = ?,
        clicksign_status = 'pending',
        clicksign_url = ?,
        signers = ?,
        status = 'enviado',
        sent_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      documentKey,
      requestSignatureKey,
      `https://${cfg.environment === 'production' ? 'app' : 'sandbox'}.clicksign.com/sign/${documentKey}`,
      JSON.stringify(signerResults),
      new Date().toISOString(),
      new Date().toISOString(),
      contract_id
    );

    const updated = await db.prepare(`
      SELECT c.*, ct.name as template_name, u.name as created_by_name
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
    `).get(contract_id);

    res.json({ contract: updated, clicksign: { documentKey, signers: signerResults } });
  } catch (error) {
    console.error('ClickSign send error:', error);
    res.status(500).json({ error: error.message || 'Falha ao enviar para ClickSign' });
  }
});

// POST /clicksign/status - Check document status on ClickSign
router.post('/clicksign/status', authenticate, checkAccess, async (req, res) => {
  try {
    const { contract_id } = req.body;
    const db = getDatabase();
    const contract = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contract_id);
    if (!contract || !contract.clicksign_document_key) {
      return res.status(404).json({ error: 'Contrato sem documento ClickSign vinculado' });
    }

    const cfg = await getClickSignConfig();
    if (!cfg) return res.status(400).json({ error: 'ClickSign não configurado' });

    const docResult = await clicksignRequest('GET', `/documents/${contract.clicksign_document_key}`, null, cfg);
    const doc = docResult.document;
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado no ClickSign' });

    // Update local status
    const csStatus = doc.status; // pending, running, closed, canceled
    let localStatus = contract.status;
    let signedAt = contract.signed_at;
    if (csStatus === 'closed') { localStatus = 'assinado'; signedAt = signedAt || new Date().toISOString(); }
    else if (csStatus === 'canceled') { localStatus = 'cancelado'; }

    await db.prepare(`
      UPDATE contracts SET clicksign_status = ?, status = ?, signed_at = COALESCE(?, signed_at), updated_at = ? WHERE id = ?
    `).run(csStatus, localStatus, signedAt, new Date().toISOString(), contract_id);

    res.json({
      clicksign_status: csStatus,
      status: localStatus,
      signers: doc.signers?.map(s => ({
        name: s.signer?.name,
        email: s.signer?.email,
        signed: !!s.signed_at,
        signed_at: s.signed_at,
      })) || [],
    });
  } catch (error) {
    console.error('ClickSign status check error:', error);
    res.status(500).json({ error: error.message || 'Falha ao verificar status' });
  }
});

export default router;
