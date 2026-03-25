import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { calculateScore, recalculateAllScores } from '../services/scoringEngine.js';
import { triggerWorkflow } from '../services/workflowEngine.js';
import { lookupCnpj } from '../utils/cnpjLookup.js';

const router = express.Router();

// ── Helper: filter by role ──
function addOwnerFilter(query, params, user, alias = 'l') {
  if (user.role === 'super_admin' || user.role === 'executivo') return query;
  if (user.role === 'diretor') {
    query += ` AND (${alias}.owner_id = ? OR ${alias}.owner_id IN (
      SELECT id FROM users WHERE manager_id = ?
      UNION SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?)
    ))`;
    params.push(user.id, user.id, user.id);
  } else if (user.role === 'gerente') {
    query += ` AND (${alias}.owner_id = ? OR ${alias}.owner_id IN (SELECT id FROM users WHERE manager_id = ?))`;
    params.push(user.id, user.id);
  } else {
    query += ` AND ${alias}.owner_id = ?`;
    params.push(user.id);
  }
  return query;
}

// ══════════════════════════════════════════════
// LEADS CRUD
// ══════════════════════════════════════════════

// GET /leads — list with filters, pagination, sort
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { status, source, temperature, owner_id, search, tag, segment_id, sort_by, sort_dir, page, limit: lim } = req.query;
    const limit = Math.min(Number(lim) || 50, 200);
    const offset = ((Number(page) || 1) - 1) * limit;

    let query = `SELECT l.*, u.name as owner_name FROM leads l LEFT JOIN users u ON l.owner_id = u.id WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM leads l WHERE 1=1`;
    const params = [];
    const countParams = [];

    const addFilter = (cond, val) => {
      query += cond; countQuery += cond;
      params.push(val); countParams.push(val);
    };

    if (status) addFilter(` AND l.status = ?`, status);
    if (source) addFilter(` AND l.source = ?`, source);
    if (temperature) addFilter(` AND l.temperature = ?`, temperature);
    if (owner_id) addFilter(` AND l.owner_id = ?`, owner_id);
    if (search) {
      const s = `%${search}%`;
      query += ` AND (l.name LIKE ? OR l.email LIKE ? OR l.company LIKE ? OR l.cnpj LIKE ? OR l.phone LIKE ?)`;
      countQuery += ` AND (l.name LIKE ? OR l.email LIKE ? OR l.company LIKE ? OR l.cnpj LIKE ? OR l.phone LIKE ?)`;
      params.push(s, s, s, s, s);
      countParams.push(s, s, s, s, s);
    }
    if (tag) {
      addFilter(` AND l.tags LIKE ?`, `%${tag}%`);
    }

    // Segment filter
    if (segment_id) {
      const segment = await db.prepare('SELECT filters, match_type FROM lead_segments WHERE id = ?').get(segment_id);
      if (segment) {
        const filters = JSON.parse(segment.filters || '[]');
        const segConds = buildSegmentConditions(filters, params, countParams);
        if (segConds) {
          const joiner = segment.match_type === 'any' ? ' OR ' : ' AND ';
          query += ` AND (${segConds.join(joiner)})`;
          countQuery += ` AND (${segConds.join(joiner)})`;
        }
      }
    }

    // Owner filter by role
    const ownerBefore = params.length;
    query = addOwnerFilter(query, params, req.user);
    // Apply same owner filter to count
    const ownerParams = params.slice(ownerBefore);
    countQuery = addOwnerFilter(countQuery, countParams, req.user);

    const sortCol = ['name', 'company', 'total_score', 'status', 'created_at', 'updated_at', 'last_activity_at'].includes(sort_by) ? sort_by : 'created_at';
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY l.${sortCol} ${dir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      db.prepare(query).all(...params),
      db.prepare(countQuery).get(...countParams),
    ]);

    // Parse JSON fields
    const leads = rows.map(r => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
      custom_fields: JSON.parse(r.custom_fields || '{}'),
    }));

    res.json({ leads, total: Number(countRow?.total || 0), page: Number(page) || 1, limit });
  } catch (err) {
    console.error('GET /leads error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/dashboard/overview
router.get('/dashboard/overview', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const params = [];
    let where = 'WHERE 1=1';
    where = addOwnerFilter(where.replace('WHERE ', ''), params, req.user);
    where = 'WHERE 1=1' + (where.startsWith(' AND') ? where : '');

    // Actually let's build it properly
    let baseWhere = '1=1';
    const baseParams = [];
    let tmp = addOwnerFilter('', baseParams, req.user);
    baseWhere += tmp;

    const [total, byStatus, bySource, byTemp, recentCount] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE ${baseWhere}`).get(...baseParams),
      db.prepare(`SELECT status, COUNT(*) as c FROM leads l WHERE ${baseWhere} GROUP BY status`).all(...baseParams),
      db.prepare(`SELECT source, COUNT(*) as c FROM leads l WHERE ${baseWhere} GROUP BY source`).all(...baseParams),
      db.prepare(`SELECT temperature, COUNT(*) as c FROM leads l WHERE ${baseWhere} GROUP BY temperature`).all(...baseParams),
      db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE ${baseWhere} AND l.created_at >= ?`).get(...baseParams, new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    res.json({
      total: Number(total?.c || 0),
      new_this_week: Number(recentCount?.c || 0),
      by_status: byStatus,
      by_source: bySource,
      by_temperature: byTemp,
    });
  } catch (err) {
    console.error('GET /leads/dashboard error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/dashboard/funnel
router.get('/dashboard/funnel', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const baseParams = [];
    let filter = addOwnerFilter('', baseParams, req.user);

    const statuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'];
    const funnel = [];
    for (const st of statuses) {
      const row = await db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE status = ?${filter}`).get(st, ...baseParams);
      funnel.push({ status: st, count: Number(row?.c || 0) });
    }
    res.json(funnel);
  } catch (err) {
    console.error('GET /leads/dashboard/funnel error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/dashboard/sources
router.get('/dashboard/sources', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const p = [];
    let f = addOwnerFilter('', p, req.user);
    const rows = await db.prepare(`SELECT source, COUNT(*) as count, AVG(total_score) as avg_score FROM leads l WHERE 1=1${f} GROUP BY source ORDER BY count DESC`).all(...p);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/dashboard/team-performance
router.get('/dashboard/team-performance', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`
      SELECT u.id, u.name, COUNT(l.id) as total_leads,
        SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as converted,
        SUM(CASE WHEN l.status = 'qualified' THEN 1 ELSE 0 END) as qualified,
        AVG(l.total_score) as avg_score
      FROM users u LEFT JOIN leads l ON l.owner_id = u.id
      WHERE u.is_active = 1 AND u.role NOT IN ('parceiro', 'convenio')
      GROUP BY u.id, u.name ORDER BY total_leads DESC LIMIT 20
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// GERADOR DE LISTAS
// ══════════════════════════════════════════════

// GET /leads/list-generator — busca leads com filtros avançados para prospecção
router.get('/list-generator', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { cnae, num_func_min, num_func_max, uf, municipio, search, page, limit: lim } = req.query;
    const limit = Math.min(Number(lim) || 50, 200);
    const offset = ((Number(page) || 1) - 1) * limit;

    let query = `SELECT l.*, u.name as owner_name FROM leads l LEFT JOIN users u ON l.owner_id = u.id WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM leads l WHERE 1=1`;
    const params = [];
    const countParams = [];

    const addFilter = (cond, ...vals) => {
      query += cond; countQuery += cond;
      params.push(...vals); countParams.push(...vals);
    };

    if (cnae) addFilter(` AND l.cnae LIKE ?`, `%${cnae}%`);
    if (uf) {
      query += ` AND (l.uf = ? OR l.endereco LIKE ?)`;
      countQuery += ` AND (l.uf = ? OR l.endereco LIKE ?)`;
      params.push(uf, `%/${uf}`); countParams.push(uf, `%/${uf}`);
    }
    if (municipio) {
      query += ` AND (l.municipio LIKE ? OR l.endereco LIKE ?)`;
      countQuery += ` AND (l.municipio LIKE ? OR l.endereco LIKE ?)`;
      params.push(`%${municipio}%`, `%${municipio}%`); countParams.push(`%${municipio}%`, `%${municipio}%`);
    }
    if (num_func_min) addFilter(` AND l.num_funcionarios >= ?`, Number(num_func_min));
    if (num_func_max) addFilter(` AND l.num_funcionarios <= ?`, Number(num_func_max));
    if (search) {
      const s = `%${search}%`;
      query += ` AND (l.name LIKE ? OR l.company LIKE ? OR l.razao_social LIKE ? OR l.cnpj LIKE ?)`;
      countQuery += ` AND (l.name LIKE ? OR l.company LIKE ? OR l.razao_social LIKE ? OR l.cnpj LIKE ?)`;
      params.push(s, s, s, s); countParams.push(s, s, s, s);
    }

    // Owner filter
    query = addOwnerFilter(query, params, req.user);
    countQuery = addOwnerFilter(countQuery, countParams, req.user);

    query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      db.prepare(query).all(...params),
      db.prepare(countQuery).get(...countParams),
    ]);

    const leads = rows.map(r => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
      custom_fields: JSON.parse(r.custom_fields || '{}'),
    }));

    res.json({ leads, total: Number(countRow?.total || 0), page: Number(page) || 1, limit });
  } catch (err) {
    console.error('GET /leads/list-generator error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/list-generator/filters — retorna valores únicos para filtros
router.get('/list-generator/filters', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const [ufs, municipios, cnaes] = await Promise.all([
      db.prepare("SELECT DISTINCT uf FROM leads WHERE uf IS NOT NULL AND uf != '' ORDER BY uf").all(),
      db.prepare("SELECT DISTINCT municipio FROM leads WHERE municipio IS NOT NULL AND municipio != '' ORDER BY municipio").all(),
      db.prepare("SELECT DISTINCT cnae FROM leads WHERE cnae IS NOT NULL AND cnae != '' ORDER BY cnae").all(),
    ]);
    res.json({
      ufs: ufs.map(r => r.uf),
      municipios: municipios.map(r => r.municipio),
      cnaes: cnaes.map(r => r.cnae),
    });
  } catch (err) {
    console.error('GET /leads/list-generator/filters error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /leads/list-generator/enrich-cnpjs — enriquece lista de CNPJs via BrasilAPI e importa como leads
router.post('/list-generator/enrich-cnpjs', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { cnpjs } = req.body;
    if (!cnpjs || !Array.isArray(cnpjs) || cnpjs.length === 0) {
      return res.status(400).json({ error: 'Informe uma lista de CNPJs' });
    }
    if (cnpjs.length > 50) {
      return res.status(400).json({ error: 'Máximo 50 CNPJs por vez' });
    }

    const results = [];
    const errors = [];

    for (const rawCnpj of cnpjs) {
      const clean = rawCnpj.replace(/\D/g, '');
      if (clean.length !== 14) { errors.push({ cnpj: rawCnpj, error: 'CNPJ inválido' }); continue; }

      // Check if already exists
      const existing = await db.prepare('SELECT id, company, razao_social FROM leads WHERE cnpj = ?').get(clean);
      if (existing) { errors.push({ cnpj: rawCnpj, error: 'Já existe como lead', name: existing.company || existing.razao_social }); continue; }

      try {
        const data = await lookupCnpj(clean);
        if (!data) { errors.push({ cnpj: rawCnpj, error: 'Não encontrado' }); continue; }

        results.push({
          cnpj: clean,
          razao_social: data.razao_social,
          nome_fantasia: data.nome_fantasia,
          cnae: data.cnae_principal,
          cnae_codigo: data.cnae_codigo,
          uf: data.endereco?.uf || null,
          municipio: data.endereco?.municipio || null,
          bairro: data.endereco?.bairro || null,
          logradouro: data.endereco?.logradouro || null,
          numero: data.endereco?.numero || null,
          endereco_completo: data.endereco?.completo || null,
          abertura: data.data_inicio_atividade,
          porte: data.porte,
          capital_social: data.capital_social,
          situacao: data.situacao,
          telefone: data.telefone,
          email: data.email,
        });
      } catch (e) {
        errors.push({ cnpj: rawCnpj, error: e.message || 'Erro na consulta' });
      }

      // Rate limit - wait 1.5s between requests to avoid 429
      if (cnpjs.indexOf(rawCnpj) < cnpjs.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    res.json({ companies: results, errors, total: results.length });
  } catch (err) {
    console.error('POST /leads/list-generator/enrich-cnpjs error:', err);
    res.status(500).json({ error: 'Erro no enriquecimento' });
  }
});

// POST /leads/list-generator/import — importa empresas externas como leads
router.post('/list-generator/import', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { companies } = req.body;
    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ error: 'Nenhuma empresa para importar' });
    }

    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    for (const c of companies) {
      try {
        const cleanCnpj = (c.cnpj || '').replace(/\D/g, '');
        if (!cleanCnpj) { skipped++; continue; }

        // Dedup by CNPJ
        const existing = await db.prepare('SELECT id FROM leads WHERE cnpj = ?').get(cleanCnpj);
        if (existing) { skipped++; continue; }

        const id = uuidv4();
        const endereco = c.endereco_completo || [c.logradouro, c.numero, c.bairro, c.municipio, c.uf].filter(Boolean).join(', ');

        // Try with uf/municipio columns first, fallback without
        try {
          await db.prepare(`
            INSERT INTO leads (id, name, company, cnpj, email, phone, source, owner_id, status,
              razao_social, nome_fantasia, capital, abertura, cnae, endereco, uf, municipio, num_funcionarios,
              tags, custom_fields, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'prospecting_list', ?, 'new',
              ?, ?, ?, ?, ?, ?, ?, ?, ?,
              '[]', '{}', ?, ?)
          `).run(
            id, c.nome_fantasia || c.razao_social || null, c.nome_fantasia || c.razao_social || null,
            cleanCnpj, c.email || null, c.telefone || null, req.user.id,
            c.razao_social || null, c.nome_fantasia || null, c.capital_social ? Number(c.capital_social) : null,
            c.abertura || null, c.cnae || null, endereco || null, c.uf || null, c.municipio || null,
            c.porte === 'MICRO EMPRESA' ? 10 : c.porte === 'PEQUENO PORTE' ? 50 : c.porte === 'DEMAIS' ? 100 : null,
            now, now
          );
        } catch (colErr) {
          // Fallback: without uf/municipio columns (migration may not have run)
          await db.prepare(`
            INSERT INTO leads (id, name, company, cnpj, email, phone, source, owner_id, status,
              razao_social, nome_fantasia, capital, abertura, cnae, endereco, num_funcionarios,
              tags, custom_fields, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'prospecting_list', ?, 'new',
              ?, ?, ?, ?, ?, ?, ?,
              '[]', '{}', ?, ?)
          `).run(
            id, c.nome_fantasia || c.razao_social || null, c.nome_fantasia || c.razao_social || null,
            cleanCnpj, c.email || null, c.telefone || null, req.user.id,
            c.razao_social || null, c.nome_fantasia || null, c.capital_social ? Number(c.capital_social) : null,
            c.abertura || null, c.cnae || null, endereco || null,
            c.porte === 'MICRO EMPRESA' ? 10 : c.porte === 'PEQUENO PORTE' ? 50 : c.porte === 'DEMAIS' ? 100 : null,
            now, now
          );
        }

        try { await calculateScore(id); } catch {}
        imported++;
      } catch (rowErr) {
        console.error('Import row error:', rowErr.message, c.cnpj);
        skipped++;
      }
    }

    res.json({ imported, skipped, total: companies.length });
  } catch (err) {
    console.error('POST /leads/list-generator/import error:', err);
    res.status(500).json({ error: 'Erro na importação: ' + (err.message || err) });
  }
});

// GET /leads/:id — detail with activities
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const lead = await db.prepare('SELECT l.*, u.name as owner_name FROM leads l LEFT JOIN users u ON l.owner_id = u.id WHERE l.id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const activities = await db.prepare('SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);

    // Check active cadence
    const enrollment = await db.prepare(`
      SELECT ce.*, c.name as cadence_name FROM cadence_enrollments ce
      JOIN cadences c ON ce.cadence_id = c.id
      WHERE ce.lead_id = ? AND ce.status = 'active' LIMIT 1
    `).get(req.params.id);

    res.json({
      ...lead,
      tags: JSON.parse(lead.tags || '[]'),
      custom_fields: JSON.parse(lead.custom_fields || '{}'),
      activities,
      active_enrollment: enrollment || null,
    });
  } catch (err) {
    console.error('GET /leads/:id error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /leads — create lead
router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const {
      email, phone, name, company, cnpj, job_title, linkedin_url, website,
      source, source_id, owner_id, status, tags, custom_fields,
    } = req.body;

    await db.prepare(`
      INSERT INTO leads (id, email, phone, name, company, cnpj, job_title, linkedin_url, website,
        source, source_id, owner_id, status, tags, custom_fields, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email || null, phone || null, name || null, company || null, cnpj || null,
      job_title || null, linkedin_url || null, website || null,
      source || 'manual', source_id || null, owner_id || req.user.id,
      status || 'new', JSON.stringify(tags || []), JSON.stringify(custom_fields || {}), now, now);

    // Activity
    await db.prepare(`
      INSERT INTO lead_activities (lead_id, user_id, type, description, created_at)
      VALUES (?, ?, 'status_change', 'Lead criado', ?)
    `).run(id, req.user.id, now);

    // Score
    await calculateScore(id);

    // Trigger workflows
    await triggerWorkflow('lead_created', { lead_id: id, user_id: req.user.id, source: source || 'manual' });

    const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    res.status(201).json({ ...lead, tags: JSON.parse(lead.tags || '[]'), custom_fields: JSON.parse(lead.custom_fields || '{}') });
  } catch (err) {
    console.error('POST /leads error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /leads/:id — update
router.put('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const existing = await db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lead não encontrado' });

    const now = new Date().toISOString();
    const fields = ['email', 'phone', 'name', 'company', 'cnpj', 'job_title', 'linkedin_url', 'website',
      'source', 'owner_id', 'status', 'lost_reason'];
    const updates = [];
    const params = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }
    if (req.body.tags) { updates.push('tags = ?'); params.push(JSON.stringify(req.body.tags)); }
    if (req.body.custom_fields) { updates.push('custom_fields = ?'); params.push(JSON.stringify(req.body.custom_fields)); }

    if (updates.length === 0) return res.json({ ok: true });

    updates.push('updated_at = ?');
    params.push(now, req.params.id);

    await db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Status change activity
    if (req.body.status && req.body.status !== existing.status) {
      await db.prepare(`
        INSERT INTO lead_activities (lead_id, user_id, type, description, metadata, created_at)
        VALUES (?, ?, 'status_change', ?, ?, ?)
      `).run(req.params.id, req.user.id, `Status: ${existing.status} → ${req.body.status}`,
        JSON.stringify({ old: existing.status, new: req.body.status }), now);

      await triggerWorkflow('status_changed', {
        lead_id: req.params.id, user_id: req.user.id, status: req.body.status, old_status: existing.status,
      });
    }

    // Recalculate score
    await calculateScore(req.params.id);

    const updated = await db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), custom_fields: JSON.parse(updated.custom_fields || '{}') });
  } catch (err) {
    console.error('PUT /leads/:id error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /leads/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /leads/:id/enrich — via CNPJ
router.post('/:id/enrich', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    if (!lead.cnpj) return res.status(400).json({ error: 'Lead sem CNPJ' });

    const clean = lead.cnpj.replace(/\D/g, '');
    const data = await lookupCnpj(clean);
    if (!data) return res.status(404).json({ error: 'CNPJ não encontrado' });

    const now = new Date().toISOString();
    const enrichPhone = data.telefone || (data.telefones?.[0]) || null;
    const enrichEmail = data.email || (data.emails?.[0]) || null;

    try {
      await db.prepare(`
        UPDATE leads SET razao_social = ?, nome_fantasia = ?, capital = ?, abertura = ?,
          cnae = ?, endereco = ?, uf = ?, municipio = ?, num_funcionarios = COALESCE(?, num_funcionarios),
          phone = COALESCE(phone, ?), email = COALESCE(email, ?),
          company = COALESCE(company, ?), updated_at = ? WHERE id = ?
      `).run(
        data.razao_social, data.nome_fantasia, data.capital_social, data.data_inicio_atividade,
        data.cnae_principal, data.endereco?.completo || null,
        data.endereco?.uf || null, data.endereco?.municipio || null,
        data.num_funcionarios || null, enrichPhone, enrichEmail,
        data.nome_fantasia || data.razao_social, now, req.params.id
      );
    } catch {
      // Fallback without uf/municipio columns
      await db.prepare(`
        UPDATE leads SET razao_social = ?, nome_fantasia = ?, capital = ?, abertura = ?,
          cnae = ?, endereco = ?, phone = COALESCE(phone, ?), email = COALESCE(email, ?),
          company = COALESCE(company, ?), updated_at = ? WHERE id = ?
      `).run(
        data.razao_social, data.nome_fantasia, data.capital_social, data.data_inicio_atividade,
        data.cnae_principal, data.endereco?.completo || null,
        enrichPhone, enrichEmail,
        data.nome_fantasia || data.razao_social, now, req.params.id
      );
    }

    const source = data._source || 'api';
    await db.prepare(`
      INSERT INTO lead_activities (lead_id, user_id, type, description, created_at)
      VALUES (?, ?, 'note', ?, ?)
    `).run(req.params.id, req.user.id, `Lead enriquecido via CNPJ (${source})`, now);

    await calculateScore(req.params.id);

    const updated = await db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), cnpj_data: data });
  } catch (err) {
    console.error('POST /leads/:id/enrich error:', err);
    res.status(500).json({ error: 'Erro ao enriquecer lead' });
  }
});

// POST /leads/import — CSV import
router.post('/import', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { leads: rows } = req.body;
    if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: 'Formato inválido' });

    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      // Deduplicate by email or CNPJ
      if (row.email) {
        const dup = await db.prepare('SELECT id FROM leads WHERE email = ?').get(row.email);
        if (dup) { skipped++; continue; }
      }
      if (row.cnpj) {
        const cleanCnpj = row.cnpj.replace(/\D/g, '');
        const dup = await db.prepare('SELECT id FROM leads WHERE cnpj = ?').get(cleanCnpj);
        if (dup) { skipped++; continue; }
      }

      const id = uuidv4();
      await db.prepare(`
        INSERT INTO leads (id, email, phone, name, company, cnpj, job_title, source, owner_id, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, '[]', ?, ?)
      `).run(id, row.email || null, row.phone || null, row.name || null, row.company || null,
        row.cnpj ? row.cnpj.replace(/\D/g, '') : null, row.job_title || null, req.user.id, now, now);

      await calculateScore(id);
      imported++;
    }

    await triggerWorkflow('lead_created', { user_id: req.user.id, source: 'import', count: imported });

    res.json({ imported, skipped, total: rows.length });
  } catch (err) {
    console.error('POST /leads/import error:', err);
    res.status(500).json({ error: 'Erro na importação' });
  }
});

// POST /leads/:id/convert — convert to deal
router.post('/:id/convert', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const { pipeline_id, stage_id, value, title } = req.body;
    if (!pipeline_id || !stage_id) return res.status(400).json({ error: 'Pipeline e stage obrigatórios' });

    const dealId = uuidv4();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO deals (id, pipeline_id, stage_id, title, company, value, contact_name, contact_phone, contact_email, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dealId, pipeline_id, stage_id, title || lead.company || lead.name || 'Lead convertido',
      lead.company || lead.razao_social, value || 0, lead.name, lead.phone, lead.email,
      lead.owner_id || req.user.id, now, now);

    // Update lead
    await db.prepare('UPDATE leads SET status = ?, converted_deal_id = ?, converted_at = ?, updated_at = ? WHERE id = ?')
      .run('converted', dealId, now, now, req.params.id);

    await db.prepare(`
      INSERT INTO lead_activities (lead_id, user_id, type, description, metadata, created_at)
      VALUES (?, ?, 'status_change', 'Lead convertido em deal', ?, ?)
    `).run(req.params.id, req.user.id, JSON.stringify({ deal_id: dealId }), now);

    // Unenroll from active cadences
    await db.prepare("UPDATE cadence_enrollments SET status = 'completed', completed_at = ?, updated_at = ? WHERE lead_id = ? AND status = 'active'")
      .run(now, now, req.params.id);

    res.json({ deal_id: dealId, lead_id: req.params.id });
  } catch (err) {
    console.error('POST /leads/:id/convert error:', err);
    res.status(500).json({ error: 'Erro na conversão' });
  }
});

// GET /leads/:id/activities
router.get('/:id/activities', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db.prepare('SELECT la.*, u.name as user_name FROM lead_activities la LEFT JOIN users u ON la.user_id = u.id WHERE la.lead_id = ? ORDER BY la.created_at DESC LIMIT ?')
      .all(req.params.id, limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /leads/:id/activities — add note/activity
router.post('/:id/activities', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const { type, channel, subject, description } = req.body;

    await db.prepare(`
      INSERT INTO lead_activities (lead_id, user_id, type, channel, subject, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, req.user.id, type || 'note', channel || null, subject || null, description || '', now);

    await db.prepare('UPDATE leads SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, req.params.id);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /leads/:id/assign
router.patch('/:id/assign', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { owner_id } = req.body;
    if (!owner_id) return res.status(400).json({ error: 'owner_id obrigatório' });
    const now = new Date().toISOString();
    await db.prepare('UPDATE leads SET owner_id = ?, updated_at = ? WHERE id = ?').run(owner_id, now, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// SCORING RULES
// ══════════════════════════════════════════════

router.get('/scoring/rules', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT * FROM lead_scoring_rules ORDER BY type, created_at').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/scoring/rules', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { name, type, field, operator, value, score } = req.body;
    if (!name || !type || !field || !operator) return res.status(400).json({ error: 'Campos obrigatórios: name, type, field, operator' });

    await db.prepare(`
      INSERT INTO lead_scoring_rules (id, name, type, field, operator, value, score, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, field, operator, value || null, Number(score) || 0, req.user.id, now, now);

    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/scoring/rules/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { name, type, field, operator, value, score, is_active } = req.body;
    const now = new Date().toISOString();
    await db.prepare(`
      UPDATE lead_scoring_rules SET name = ?, type = ?, field = ?, operator = ?, value = ?, score = ?, is_active = ?, updated_at = ? WHERE id = ?
    `).run(name, type, field, operator, value || null, Number(score) || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, now, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/scoring/rules/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM lead_scoring_rules WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /leads/scoring/recalculate
router.post('/scoring/recalculate', authenticate, async (req, res) => {
  try {
    const result = await recalculateAllScores();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// SEGMENTS
// ══════════════════════════════════════════════

router.get('/segments', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT * FROM lead_segments ORDER BY created_at DESC').all();
    res.json(rows.map(r => ({ ...r, filters: JSON.parse(r.filters || '[]') })));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/segments', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { name, description, filters, match_type, is_dynamic } = req.body;

    await db.prepare(`
      INSERT INTO lead_segments (id, name, description, filters, match_type, is_dynamic, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, JSON.stringify(filters || []), match_type || 'all',
      is_dynamic !== undefined ? (is_dynamic ? 1 : 0) : 1, req.user.id, now, now);

    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/segments/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { name, description, filters, match_type } = req.body;
    const now = new Date().toISOString();
    await db.prepare(`
      UPDATE lead_segments SET name = ?, description = ?, filters = ?, match_type = ?, updated_at = ? WHERE id = ?
    `).run(name, description || null, JSON.stringify(filters || []), match_type || 'all', now, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/segments/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM lead_segments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /leads/segments/:id/leads — get leads in a segment
router.get('/segments/:id/leads', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const segment = await db.prepare('SELECT * FROM lead_segments WHERE id = ?').get(req.params.id);
    if (!segment) return res.status(404).json({ error: 'Segmento não encontrado' });

    const filters = JSON.parse(segment.filters || '[]');
    const params = [];
    const countParams = [];
    let query = 'SELECT l.*, u.name as owner_name FROM leads l LEFT JOIN users u ON l.owner_id = u.id WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM leads l WHERE 1=1';

    const segConds = buildSegmentConditions(filters, params, countParams);
    if (segConds.length) {
      const joiner = segment.match_type === 'any' ? ' OR ' : ' AND ';
      query += ` AND (${segConds.join(joiner)})`;
      countQuery += ` AND (${segConds.join(joiner)})`;
    }

    query = addOwnerFilter(query, params, req.user);
    countQuery = addOwnerFilter(countQuery, countParams, req.user);

    query += ' ORDER BY l.total_score DESC LIMIT 200';

    const [rows, countRow] = await Promise.all([
      db.prepare(query).all(...params),
      db.prepare(countQuery).get(...countParams),
    ]);

    // Update segment lead count
    await db.prepare('UPDATE lead_segments SET lead_count = ? WHERE id = ?').run(Number(countRow?.total || 0), req.params.id);

    res.json({ leads: rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })), total: Number(countRow?.total || 0) });
  } catch (err) {
    console.error('GET /leads/segments/:id/leads error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── Helpers ──

function buildSegmentConditions(filters, params, countParams) {
  const conds = [];
  for (const f of filters) {
    const col = `l.${f.field}`;
    switch (f.operator) {
      case 'equals':
        conds.push(`${col} = ?`);
        params.push(f.value); countParams.push(f.value);
        break;
      case 'contains':
        conds.push(`${col} LIKE ?`);
        params.push(`%${f.value}%`); countParams.push(`%${f.value}%`);
        break;
      case 'greater_than':
        conds.push(`CAST(${col} AS REAL) > ?`);
        params.push(Number(f.value)); countParams.push(Number(f.value));
        break;
      case 'less_than':
        conds.push(`CAST(${col} AS REAL) < ?`);
        params.push(Number(f.value)); countParams.push(Number(f.value));
        break;
      case 'exists':
        conds.push(`${col} IS NOT NULL AND ${col} != ''`);
        break;
    }
  }
  return conds;
}

export default router;
