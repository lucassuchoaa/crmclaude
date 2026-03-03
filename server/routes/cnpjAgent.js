import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { lookupCnpj } from '../utils/cnpjLookup.js';
import { validateCnpj } from '../utils/validators.js';
import { createNotification } from '../utils/notificationHelper.js';

const router = express.Router();

router.get('/lookup/:cnpj', authenticate, async (req, res) => {
  try {
    const { valid, cleaned, error } = validateCnpj(req.params.cnpj);
    if (!valid) return res.status(400).json({ error });
    const result = await lookupCnpj(cleaned);
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('CNPJ lookup error:', error);
    res.status(500).json({ error: 'Erro ao consultar CNPJ. Tente novamente.' });
  }
});

router.post('/check', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { cnpj, gerente_id, parceiro_id } = req.body;
    const { role } = req.user;

    if (!hasPermission(role, 'gerente')) return res.status(403).json({ error: 'Acesso negado.' });
    if (!cnpj || !gerente_id || !parceiro_id) return res.status(400).json({ error: 'CNPJ, gerente_id e parceiro_id são obrigatórios.' });

    const { valid, cleaned: cleanCnpj, error: cnpjError } = validateCnpj(cnpj);
    if (!valid) return res.status(400).json({ error: cnpjError });

    let cnpjData;
    try {
      cnpjData = await lookupCnpj(cleanCnpj);
    } catch (error) {
      const msgId = uuidv4();
      await db.prepare(`
        INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
        VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_query', ?)
      `).run(msgId, gerente_id, parceiro_id, req.user.id, `Erro ao consultar CNPJ ${cleanCnpj}: ${error.message}`, null);
      return res.status(error.status || 500).json({ error: error.message });
    }

    const existing = await db.prepare(`
      SELECT i.*, u.name as owner_name FROM indications i JOIN users u ON i.owner_id = u.id
      WHERE i.cnpj = ? AND i.status NOT IN ('perdido')
    `).get(cleanCnpj);

    if (existing) {
      const msgId = uuidv4();
      const metadata = JSON.stringify({
        cnpj_data: cnpjData,
        duplicate: { indication_id: existing.id, status: existing.status, owner_name: existing.owner_name, razao_social: existing.razao_social, created_at: existing.created_at }
      });

      await db.prepare(`
        INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
        VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_duplicate', ?)
      `).run(msgId, gerente_id, parceiro_id, req.user.id,
        `CNPJ ${cleanCnpj} (${cnpjData.razao_social}) já possui oportunidade ativa.`, metadata);

      await createNotification({
        userId: gerente_id, title: 'CNPJ Duplicado',
        message: `O CNPJ ${cleanCnpj} (${cnpjData.razao_social}) já está cadastrado por ${existing.owner_name} com status "${existing.status}".`,
        type: 'warning'
      });

      const message = await db.prepare(`
        SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
      `).get(msgId);

      return res.json({ message, cnpj_data: cnpjData, duplicate: true, can_create: false, existing });
    }

    const msgId = uuidv4();
    const metadata = JSON.stringify({ cnpj_data: cnpjData });

    await db.prepare(`
      INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
      VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_result', ?)
    `).run(msgId, gerente_id, parceiro_id, req.user.id,
      `Dados do CNPJ ${cleanCnpj}: ${cnpjData.razao_social} - ${cnpjData.situacao || 'N/A'}`, metadata);

    const message = await db.prepare(`
      SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
    `).get(msgId);

    res.json({ message, cnpj_data: cnpjData, duplicate: false, can_create: true });
  } catch (error) {
    console.error('CNPJ Agent check error:', error);
    res.status(500).json({ error: 'Erro ao consultar CNPJ.' });
  }
});

router.post('/create-indication', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { cnpj, gerente_id, parceiro_id, cnpj_data } = req.body;
    const { role } = req.user;

    if (!hasPermission(role, 'gerente')) return res.status(403).json({ error: 'Acesso negado.' });
    if (!cnpj || !gerente_id || !parceiro_id || !cnpj_data) return res.status(400).json({ error: 'Dados incompletos.' });

    const cleanCnpj = cnpj.replace(/[^\d]/g, '');

    const existing = await db.prepare(`
      SELECT id FROM indications WHERE cnpj = ? AND status NOT IN ('perdido')
    `).get(cleanCnpj);
    if (existing) return res.status(409).json({ error: 'CNPJ já cadastrado.', existingId: existing.id });

    const indId = uuidv4();
    const enderecoStr = cnpj_data.endereco?.completo || '';

    await db.prepare(`
      INSERT INTO indications (id, cnpj, razao_social, nome_fantasia, owner_id, manager_id, capital, abertura, cnae, endereco, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')
    `).run(indId, cleanCnpj, cnpj_data.razao_social, cnpj_data.nome_fantasia || null,
      parceiro_id, gerente_id, cnpj_data.capital_social || null, cnpj_data.data_inicio_atividade || null,
      cnpj_data.cnae_principal || null, enderecoStr || null);

    await db.prepare(`
      INSERT INTO indication_history (indication_id, user_id, action, new_value) VALUES (?, ?, 'created', 'novo')
    `).run(indId, req.user.id);

    const msgId = uuidv4();
    await db.prepare(`
      INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
      VALUES (?, ?, ?, ?, 'bot', ?, 'indication_created', ?)
    `).run(msgId, gerente_id, parceiro_id, req.user.id,
      `Indicação criada com sucesso: ${cnpj_data.razao_social} (${cleanCnpj})`,
      JSON.stringify({ indication_id: indId, cnpj_data }));

    await createNotification({
      userId: gerente_id, title: 'Nova Indicação Criada',
      message: `Indicação ${cnpj_data.razao_social} (${cleanCnpj}) criada via Agente CNPJ.`,
      type: 'success'
    });

    const indication = await db.prepare('SELECT * FROM indications WHERE id = ?').get(indId);
    const message = await db.prepare(`
      SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
    `).get(msgId);

    res.status(201).json({ indication, message });
  } catch (error) {
    console.error('Create indication from agent error:', error);
    res.status(500).json({ error: 'Erro ao criar indicação.' });
  }
});

export default router;
