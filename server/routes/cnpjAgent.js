import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { lookupCnpj } from '../utils/cnpjLookup.js';

const router = express.Router();

/**
 * POST /api/cnpj-agent/check
 * Consulta CNPJ + verifica duplicidade, insere mensagem bot no chat
 */
router.post('/check', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { cnpj, gerente_id, parceiro_id } = req.body;
    const { role } = req.user;

    if (!hasPermission(role, 'gerente')) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (!cnpj || !gerente_id || !parceiro_id) {
      return res.status(400).json({ error: 'CNPJ, gerente_id e parceiro_id são obrigatórios.' });
    }

    const cleanCnpj = cnpj.replace(/[^\d]/g, '');
    if (cleanCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Deve conter 14 dígitos.' });
    }

    // Consulta CNPJ
    let cnpjData;
    try {
      cnpjData = await lookupCnpj(cleanCnpj);
    } catch (error) {
      // Insere mensagem bot de erro
      const msgId = uuidv4();
      db.prepare(`
        INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
        VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_query', ?)
      `).run(msgId, gerente_id, parceiro_id, req.user.id, `Erro ao consultar CNPJ ${cleanCnpj}: ${error.message}`, null);

      return res.status(error.status || 500).json({ error: error.message });
    }

    // Verifica duplicidade
    const existing = db.prepare(`
      SELECT i.*, u.name as owner_name
      FROM indications i
      JOIN users u ON i.owner_id = u.id
      WHERE i.cnpj = ? AND i.status NOT IN ('perdido')
    `).get(cleanCnpj);

    if (existing) {
      // CNPJ duplicado - insere mensagem bot
      const msgId = uuidv4();
      const metadata = JSON.stringify({
        cnpj_data: cnpjData,
        duplicate: {
          indication_id: existing.id,
          status: existing.status,
          owner_name: existing.owner_name,
          razao_social: existing.razao_social,
          created_at: existing.created_at
        }
      });

      db.prepare(`
        INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
        VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_duplicate', ?)
      `).run(msgId, gerente_id, parceiro_id, req.user.id,
        `CNPJ ${cleanCnpj} (${cnpjData.razao_social}) já possui oportunidade ativa.`,
        metadata
      );

      // Notificação para o gerente
      const notifId = uuidv4();
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'warning')
      `).run(notifId, gerente_id, 'CNPJ Duplicado',
        `O CNPJ ${cleanCnpj} (${cnpjData.razao_social}) já está cadastrado por ${existing.owner_name} com status "${existing.status}".`
      );

      const message = db.prepare(`
        SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
      `).get(msgId);

      return res.json({ message, cnpj_data: cnpjData, duplicate: true, can_create: false, existing });
    }

    // CNPJ limpo - insere mensagem bot com dados
    const msgId = uuidv4();
    const metadata = JSON.stringify({ cnpj_data: cnpjData });

    db.prepare(`
      INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
      VALUES (?, ?, ?, ?, 'bot', ?, 'cnpj_result', ?)
    `).run(msgId, gerente_id, parceiro_id, req.user.id,
      `Dados do CNPJ ${cleanCnpj}: ${cnpjData.razao_social} - ${cnpjData.situacao || 'N/A'}`,
      metadata
    );

    const message = db.prepare(`
      SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
    `).get(msgId);

    res.json({ message, cnpj_data: cnpjData, duplicate: false, can_create: true });
  } catch (error) {
    console.error('CNPJ Agent check error:', error);
    res.status(500).json({ error: 'Erro ao consultar CNPJ.' });
  }
});

/**
 * POST /api/cnpj-agent/create-indication
 * Cria indicação direto do chat
 */
router.post('/create-indication', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { cnpj, gerente_id, parceiro_id, cnpj_data } = req.body;
    const { role } = req.user;

    if (!hasPermission(role, 'gerente')) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (!cnpj || !gerente_id || !parceiro_id || !cnpj_data) {
      return res.status(400).json({ error: 'Dados incompletos.' });
    }

    const cleanCnpj = cnpj.replace(/[^\d]/g, '');

    // Re-verifica duplicidade (guard contra race condition)
    const existing = db.prepare(`
      SELECT id FROM indications WHERE cnpj = ? AND status NOT IN ('perdido')
    `).get(cleanCnpj);

    if (existing) {
      return res.status(409).json({ error: 'CNPJ já cadastrado.', existingId: existing.id });
    }

    // Cria indicação
    const indId = uuidv4();
    const enderecoStr = cnpj_data.endereco?.completo || '';

    db.prepare(`
      INSERT INTO indications (
        id, cnpj, razao_social, nome_fantasia,
        owner_id, manager_id,
        capital, abertura, cnae, endereco,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')
    `).run(
      indId, cleanCnpj, cnpj_data.razao_social, cnpj_data.nome_fantasia || null,
      parceiro_id, gerente_id,
      cnpj_data.capital_social || null, cnpj_data.data_inicio_atividade || null,
      cnpj_data.cnae_principal || null, enderecoStr || null
    );

    // Log history
    db.prepare(`
      INSERT INTO indication_history (indication_id, user_id, action, new_value)
      VALUES (?, ?, 'created', 'novo')
    `).run(indId, req.user.id);

    // Insere mensagem bot de confirmação
    const msgId = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, group_gerente_id, group_parceiro_id, sender_id, sender_type, content, message_type, metadata)
      VALUES (?, ?, ?, ?, 'bot', ?, 'indication_created', ?)
    `).run(msgId, gerente_id, parceiro_id, req.user.id,
      `Indicação criada com sucesso: ${cnpj_data.razao_social} (${cleanCnpj})`,
      JSON.stringify({ indication_id: indId, cnpj_data })
    );

    // Notificação para o gerente
    const notifId = uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'success')
    `).run(notifId, gerente_id, 'Nova Indicação Criada',
      `Indicação ${cnpj_data.razao_social} (${cleanCnpj}) criada via Agente CNPJ.`
    );

    const indication = db.prepare('SELECT * FROM indications WHERE id = ?').get(indId);
    const message = db.prepare(`
      SELECT m.*, u.name as sender_name FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.id = ?
    `).get(msgId);

    res.status(201).json({ indication, message });
  } catch (error) {
    console.error('Create indication from agent error:', error);
    res.status(500).json({ error: 'Erro ao criar indicação.' });
  }
});

export default router;
