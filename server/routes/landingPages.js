import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { calculateScore } from '../services/scoringEngine.js';
import { triggerWorkflow } from '../services/workflowEngine.js';
import { lookupCnpj } from '../utils/cnpjLookup.js';

const router = express.Router();

// ══════════════════════════════════════════════
// LANDING PAGES CRUD (authenticated)
// ══════════════════════════════════════════════

router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare('SELECT lp.*, u.name as owner_name FROM landing_pages lp LEFT JOIN users u ON lp.owner_id = u.id ORDER BY lp.created_at DESC').all();
    res.json(rows.map(r => ({ ...r, form_fields: JSON.parse(r.form_fields || '[]') })));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const lp = await db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id);
    if (!lp) return res.status(404).json({ error: 'Landing page não encontrada' });
    res.json({ ...lp, form_fields: JSON.parse(lp.form_fields || '[]') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const { name, slug, template_type, html_content, css_content, form_fields,
      thank_you_message, redirect_url, meta_title, meta_description, team_id } = req.body;

    if (!name || !slug) return res.status(400).json({ error: 'Nome e slug obrigatórios' });

    // Check slug uniqueness
    const existing = await db.prepare('SELECT id FROM landing_pages WHERE slug = ?').get(slug);
    if (existing) return res.status(400).json({ error: 'Slug já em uso' });

    await db.prepare(`
      INSERT INTO landing_pages (id, name, slug, template_type, html_content, css_content, form_fields,
        thank_you_message, redirect_url, meta_title, meta_description, owner_id, team_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, template_type || 'blank', html_content || '', css_content || '',
      JSON.stringify(form_fields || []), thank_you_message || 'Obrigado! Entraremos em contato.',
      redirect_url || null, meta_title || name, meta_description || null, req.user.id, team_id || null, now, now);

    const lp = await db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(id);
    res.status(201).json({ ...lp, form_fields: JSON.parse(lp.form_fields || '[]') });
  } catch (err) {
    console.error('POST /landing-pages error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const { name, slug, html_content, css_content, form_fields, thank_you_message,
      redirect_url, meta_title, meta_description, status } = req.body;

    // Check slug uniqueness (except self)
    if (slug) {
      const dup = await db.prepare('SELECT id FROM landing_pages WHERE slug = ? AND id != ?').get(slug, req.params.id);
      if (dup) return res.status(400).json({ error: 'Slug já em uso' });
    }

    await db.prepare(`
      UPDATE landing_pages SET name = COALESCE(?, name), slug = COALESCE(?, slug),
        html_content = COALESCE(?, html_content), css_content = COALESCE(?, css_content),
        form_fields = COALESCE(?, form_fields), thank_you_message = COALESCE(?, thank_you_message),
        redirect_url = ?, meta_title = COALESCE(?, meta_title), meta_description = ?,
        status = COALESCE(?, status), updated_at = ? WHERE id = ?
    `).run(name, slug, html_content, css_content, form_fields ? JSON.stringify(form_fields) : null,
      thank_you_message, redirect_url || null, meta_title, meta_description || null,
      status, now, req.params.id);

    const lp = await db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id);
    res.json({ ...lp, form_fields: JSON.parse(lp.form_fields || '[]') });
  } catch (err) {
    console.error('PUT /landing-pages/:id error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.prepare('DELETE FROM landing_pages WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /landing-pages/:id/duplicate
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const orig = await db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Landing page não encontrada' });

    const id = uuidv4();
    const now = new Date().toISOString();
    const newSlug = `${orig.slug}-copy-${Date.now().toString(36)}`;

    await db.prepare(`
      INSERT INTO landing_pages (id, name, slug, template_type, html_content, css_content, form_fields,
        thank_you_message, redirect_url, meta_title, meta_description, owner_id, team_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `${orig.name} (cópia)`, newSlug, orig.template_type, orig.html_content, orig.css_content,
      orig.form_fields, orig.thank_you_message, orig.redirect_url, orig.meta_title, orig.meta_description,
      req.user.id, orig.team_id, now, now);

    const lp = await db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(id);
    res.status(201).json({ ...lp, form_fields: JSON.parse(lp.form_fields || '[]') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /landing-pages/:id/submissions
router.get('/:id/submissions', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.prepare(`
      SELECT lps.*, l.name as lead_name, l.email as lead_email
      FROM landing_page_submissions lps LEFT JOIN leads l ON lps.lead_id = l.id
      WHERE lps.landing_page_id = ? ORDER BY lps.created_at DESC LIMIT 200
    `).all(req.params.id);
    res.json(rows.map(r => ({ ...r, form_data: JSON.parse(r.form_data || '{}') })));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /landing-pages/:id/stats
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const lp = await db.prepare('SELECT views, submissions, conversion_rate FROM landing_pages WHERE id = ?').get(req.params.id);
    if (!lp) return res.status(404).json({ error: 'Landing page não encontrada' });
    res.json(lp);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ══════════════════════════════════════════════
// PUBLIC ROUTES (no auth)
// ══════════════════════════════════════════════

// GET /lp/:slug — serve landing page
router.get('/public/:slug', async (req, res) => {
  try {
    const db = getDatabase();
    const lp = await db.prepare("SELECT * FROM landing_pages WHERE slug = ? AND status = 'published'").get(req.params.slug);
    if (!lp) return res.status(404).json({ error: 'Página não encontrada' });

    // Increment views
    await db.prepare('UPDATE landing_pages SET views = views + 1 WHERE id = ?').run(lp.id);

    const formFields = JSON.parse(lp.form_fields || '[]');
    const html = buildLandingPageHtml(lp, formFields);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Erro interno');
  }
});

// POST /lp/:slug/submit — form submission
router.post('/public/:slug/submit', async (req, res) => {
  try {
    const db = getDatabase();
    const lp = await db.prepare("SELECT * FROM landing_pages WHERE slug = ? AND status = 'published'").get(req.params.slug);
    if (!lp) return res.status(404).json({ error: 'Página não encontrada' });

    const now = new Date().toISOString();
    const formData = req.body;

    // Validate CNPJ if provided
    const rawCnpj = (formData.cnpj || '').replace(/\D/g, '');
    if (formData.cnpj && rawCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Deve conter 14 dígitos.' });
    }

    // Create or find lead
    const email = formData.email;
    const phone = formData.phone || formData.telefone;
    let leadId = null;

    if (email) {
      const existing = await db.prepare('SELECT id FROM leads WHERE email = ?').get(email);
      if (existing) {
        leadId = existing.id;
        // Update lead with new data
        const updates = [];
        const params = [];
        if (formData.name || formData.nome) { updates.push('name = ?'); params.push(formData.name || formData.nome); }
        if (phone) { updates.push('phone = ?'); params.push(phone); }
        if (formData.company || formData.empresa) { updates.push('company = ?'); params.push(formData.company || formData.empresa); }
        if (rawCnpj) { updates.push('cnpj = ?'); params.push(rawCnpj); }
        if (formData.cargo || formData.job_title) { updates.push('job_title = ?'); params.push(formData.cargo || formData.job_title); }
        if (updates.length) {
          updates.push('updated_at = ?');
          params.push(now, leadId);
          await db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
      }
    }

    if (!leadId) {
      leadId = uuidv4();
      await db.prepare(`
        INSERT INTO leads (id, email, phone, name, company, cnpj, job_title, source, source_id, owner_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'landing_page', ?, ?, ?, ?)
      `).run(leadId, email || null, phone || null,
        formData.name || formData.nome || null,
        formData.company || formData.empresa || null,
        rawCnpj || null,
        formData.cargo || formData.job_title || null,
        lp.id, lp.owner_id, now, now);

      await calculateScore(leadId);
    }

    // Auto-enrich via CNPJ if provided
    if (rawCnpj) {
      try {
        const cnpjData = await lookupCnpj(rawCnpj);
        if (cnpjData) {
          const enrichUpdates = [];
          const enrichParams = [];
          if (cnpjData.razao_social) { enrichUpdates.push('razao_social = ?'); enrichParams.push(cnpjData.razao_social); }
          if (cnpjData.nome_fantasia) { enrichUpdates.push('nome_fantasia = ?'); enrichParams.push(cnpjData.nome_fantasia); }
          if (cnpjData.capital_social) { enrichUpdates.push('capital = ?'); enrichParams.push(cnpjData.capital_social); }
          if (cnpjData.data_inicio_atividade) { enrichUpdates.push('abertura = ?'); enrichParams.push(cnpjData.data_inicio_atividade); }
          if (cnpjData.cnae_principal) { enrichUpdates.push('cnae = ?'); enrichParams.push(cnpjData.cnae_principal); }
          if (cnpjData.endereco?.completo) { enrichUpdates.push('endereco = ?'); enrichParams.push(cnpjData.endereco.completo); }
          if (cnpjData.porte) { enrichUpdates.push('num_funcionarios = ?'); enrichParams.push(cnpjData.porte === 'MICRO EMPRESA' ? 10 : cnpjData.porte === 'PEQUENO PORTE' ? 50 : cnpjData.porte === 'DEMAIS' ? 100 : null); }
          if (!formData.company && !formData.empresa && cnpjData.nome_fantasia) {
            enrichUpdates.push('company = ?'); enrichParams.push(cnpjData.nome_fantasia);
          }
          if (enrichUpdates.length) {
            enrichUpdates.push('updated_at = ?');
            enrichParams.push(now, leadId);
            await db.prepare(`UPDATE leads SET ${enrichUpdates.join(', ')} WHERE id = ?`).run(...enrichParams);
          }
          // Recalculate score after enrichment
          await calculateScore(leadId);
        }
      } catch (enrichErr) {
        console.error('Auto-enrich CNPJ error (non-blocking):', enrichErr.message);
      }
    }

    // Record submission
    await db.prepare(`
      INSERT INTO landing_page_submissions (landing_page_id, lead_id, form_data, ip_address, user_agent, referrer,
        utm_source, utm_medium, utm_campaign, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lp.id, leadId, JSON.stringify(formData), req.ip, req.headers['user-agent'] || null,
      req.headers.referer || null, formData.utm_source || null, formData.utm_medium || null,
      formData.utm_campaign || null, now);

    // Update landing page stats
    const subs = await db.prepare('SELECT COUNT(*) as c FROM landing_page_submissions WHERE landing_page_id = ?').get(lp.id);
    const views = Number(lp.views) || 1;
    const convRate = Math.round((Number(subs?.c || 0) / views) * 10000) / 100;
    await db.prepare('UPDATE landing_pages SET submissions = ?, conversion_rate = ?, updated_at = ? WHERE id = ?')
      .run(Number(subs?.c || 0), convRate, now, lp.id);

    // Lead activity
    await db.prepare(`
      INSERT INTO lead_activities (lead_id, type, channel, description, metadata, created_at)
      VALUES (?, 'form_submit', 'landing_page', ?, ?, ?)
    `).run(leadId, `Formulário preenchido: ${lp.name}`, JSON.stringify({ landing_page_id: lp.id }), now);

    // Trigger workflows
    await triggerWorkflow('form_submitted', {
      lead_id: leadId, landing_page_id: lp.id, source: 'landing_page',
    });
    await triggerWorkflow('lead_created', {
      lead_id: leadId, source: 'landing_page', landing_page_id: lp.id,
    });

    // Return thank you or redirect
    if (lp.redirect_url) {
      res.json({ redirect: lp.redirect_url });
    } else {
      res.json({ message: lp.thank_you_message || 'Obrigado!' });
    }
  } catch (err) {
    console.error('POST /lp/:slug/submit error:', err);
    res.status(500).json({ error: 'Erro ao processar formulário' });
  }
});

function buildLandingPageHtml(lp, formFields) {
  const formFieldsHtml = formFields.map(f => {
    const required = f.required ? 'required' : '';
    const type = f.type || 'text';
    return `<div style="margin-bottom:12px">
      <label style="display:block;margin-bottom:4px;font-weight:500">${f.label || f.name}</label>
      <input type="${type}" name="${f.name}" placeholder="${f.placeholder || ''}" ${required}
        style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px" />
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lp.meta_title || lp.name}</title>
  ${lp.meta_description ? `<meta name="description" content="${lp.meta_description}">` : ''}
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8f9fa; color:#333; }
    .container { max-width:600px; margin:40px auto; padding:20px; }
    .card { background:#fff; border-radius:12px; padding:32px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size:24px; margin-bottom:8px; }
    .desc { color:#666; margin-bottom:24px; }
    button[type=submit] { width:100%; padding:12px; background:#6366f1; color:#fff; border:none; border-radius:6px; font-size:16px; cursor:pointer; }
    button[type=submit]:hover { background:#4f46e5; }
    .thanks { text-align:center; padding:40px 20px; }
    .thanks h2 { color:#22c55e; margin-bottom:12px; }
    ${lp.css_content || ''}
  </style>
</head>
<body>
  <div class="container">
    ${lp.html_content || `<div class="card">
      <h1>${lp.name}</h1>
      <p class="desc">Preencha o formulário abaixo</p>
      <form id="lpForm">
        ${formFieldsHtml || '<div style="margin-bottom:12px"><label>Nome</label><input type="text" name="nome" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div><div style="margin-bottom:12px"><label>Email</label><input type="email" name="email" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px"></div>'}
        <button type="submit">Enviar</button>
      </form>
      <div id="thanks" class="thanks" style="display:none">
        <h2>✓</h2>
        <p>${lp.thank_you_message || 'Obrigado!'}</p>
      </div>
    </div>`}
  </div>
  <script>
    // CNPJ mask
    document.querySelectorAll('input[name="cnpj"]').forEach(el => {
      el.addEventListener('input', function(e) {
        let v = e.target.value.replace(/\\D/g, '').slice(0, 14);
        if (v.length > 12) v = v.replace(/(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{1,2})/, '$1.$2.$3/$4-$5');
        else if (v.length > 8) v = v.replace(/(\\d{2})(\\d{3})(\\d{3})(\\d{1,4})/, '$1.$2.$3/$4');
        else if (v.length > 5) v = v.replace(/(\\d{2})(\\d{3})(\\d{1,3})/, '$1.$2.$3');
        else if (v.length > 2) v = v.replace(/(\\d{2})(\\d{1,3})/, '$1.$2');
        e.target.value = v;
      });
    });
    document.getElementById('lpForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      // Validate CNPJ if present
      if (data.cnpj) {
        const digits = data.cnpj.replace(/\\D/g, '');
        if (digits.length !== 14) { alert('CNPJ inválido. Deve conter 14 dígitos.'); return; }
      }
      // Add UTM params
      const url = new URL(window.location.href);
      ['utm_source','utm_medium','utm_campaign'].forEach(k => { if(url.searchParams.get(k)) data[k]=url.searchParams.get(k); });
      try {
        const res = await fetch('/api/landing-pages/public/${lp.slug}/submit', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) { alert(json.error || 'Erro ao enviar.'); return; }
        if (json.redirect) { window.location.href = json.redirect; return; }
        e.target.style.display='none';
        document.getElementById('thanks').style.display='block';
      } catch(err) { alert('Erro ao enviar. Tente novamente.'); }
    });
  </script>
</body>
</html>`;
}

export default router;
