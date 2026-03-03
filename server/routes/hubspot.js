import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDatabase } from '../config/database.js';
import { validateCnpj } from '../utils/validators.js';

const router = express.Router();

router.post('/search', authenticate, async (req, res) => {
  try {
    const { cnpj } = req.body;
    const { valid, cleaned: cleanCnpj, error: cnpjError } = validateCnpj(cnpj);
    if (!valid) return res.status(400).json({ error: cnpjError });

    const db = getDatabase();
    const config = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');

    if (!config?.value) {
      return res.status(400).json({ error: 'HubSpot não configurado', configured: false });
    }

    const apiKey = config.value;
    const pipelineConfig = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_pipeline_id');
    const configuredPipelineId = pipelineConfig?.value || null;
    const hubspotBaseUrl = 'https://api.hubapi.com';

    const searchResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/companies/search`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: 'cnpj', operator: 'EQ', value: cleanCnpj }] },
          { filters: [{ propertyName: 'cnpj', operator: 'EQ', value: cnpj }] }
        ],
        properties: ['name', 'cnpj', 'domain', 'phone', 'city', 'state', 'hs_lead_status']
      })
    });

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      console.error('HubSpot search error:', errorData);
      if (errorData.message?.includes('cnpj')) {
        return res.json({ found: false, company: null, deals: [], message: 'Propriedade CNPJ não configurada no HubSpot' });
      }
      throw new Error(`HubSpot API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const companies = searchData.results || [];

    if (companies.length === 0) {
      const localIndication = await db.prepare('SELECT * FROM indications WHERE cnpj = ?').get(cleanCnpj);
      return res.json({
        found: false, company: null, deals: [],
        localIndication: localIndication ? { id: localIndication.id, razao_social: localIndication.razao_social, status: localIndication.status, owner: localIndication.owner_id } : null
      });
    }

    const company = companies[0];
    const companyId = company.id;

    const dealsResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/companies/${companyId}/associations/deals`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    let deals = [];
    let openDeals = [];

    if (dealsResponse.ok) {
      const dealsData = await dealsResponse.json();
      const dealIds = dealsData.results?.map(d => d.id) || [];

      if (dealIds.length > 0) {
        const dealsDetailsResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/deals/batch/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: dealIds.map(id => ({ id })),
            properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 'hs_deal_stage_probability']
          })
        });

        if (dealsDetailsResponse.ok) {
          const dealsDetails = await dealsDetailsResponse.json();
          deals = dealsDetails.results?.map(d => ({
            id: d.id, name: d.properties.dealname, stage: d.properties.dealstage,
            amount: d.properties.amount, closeDate: d.properties.closedate,
            pipeline: d.properties.pipeline, probability: d.properties.hs_deal_stage_probability
          })) || [];

          if (configuredPipelineId) deals = deals.filter(d => d.pipeline === configuredPipelineId);
          openDeals = deals.filter(d => !['closedwon', 'closedlost', 'closed_won', 'closed_lost', 'ganhou', 'perdeu'].includes(d.stage?.toLowerCase()));
        }
      }
    }

    res.json({
      found: true,
      company: { id: companyId, name: company.properties.name, cnpj: company.properties.cnpj, domain: company.properties.domain, phone: company.properties.phone, city: company.properties.city, state: company.properties.state, leadStatus: company.properties.hs_lead_status },
      deals, openDeals, hasOpenDeals: openDeals.length > 0,
      message: openDeals.length > 0 ? `Empresa já possui ${openDeals.length} oportunidade(s) aberta(s)` : 'Empresa encontrada sem oportunidades abertas'
    });
  } catch (error) {
    console.error('HubSpot search error:', error);
    res.status(500).json({ error: 'Erro ao consultar HubSpot. Verifique a configuração.' });
  }
});

router.get('/test', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const config = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');
    if (!config?.value) return res.json({ connected: false, message: 'API Key não configurada' });

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
      headers: { 'Authorization': `Bearer ${config.value}`, 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      res.json({ connected: true, message: 'Conexão com HubSpot estabelecida' });
    } else {
      const error = await response.json();
      res.json({ connected: false, message: error.message || 'Falha na autenticação' });
    }
  } catch (error) {
    console.error('HubSpot test error:', error);
    res.json({ connected: false, message: 'Erro ao conectar com HubSpot' });
  }
});

router.post('/config', authenticate, async (req, res) => {
  try {
    const { apiKey, pipelineId } = req.body;
    if (!['super_admin', 'executivo'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão para configurar HubSpot' });

    const db = getDatabase();
    const now = new Date().toISOString();

    const upsert = async (key, value) => {
      if (!value) return;
      const existing = await db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
      if (existing) {
        await db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(value, now, key);
      } else {
        await db.prepare('INSERT INTO settings (key, value, created_at) VALUES (?, ?, ?)').run(key, value, now);
      }
    };

    if (apiKey) await upsert('hubspot_api_key', apiKey);
    if (pipelineId) await upsert('hubspot_pipeline_id', pipelineId);

    res.json({ success: true, message: 'Configuração salva' });
  } catch (error) {
    console.error('HubSpot config error:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

router.get('/config', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'executivo'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });

    const db = getDatabase();
    const apiKey = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');
    const pipelineId = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_pipeline_id');

    res.json({
      hasApiKey: !!apiKey?.value,
      apiKeyPreview: apiKey?.value ? `...${apiKey.value.slice(-8)}` : null,
      pipelineId: pipelineId?.value || null
    });
  } catch (error) {
    console.error('HubSpot get config error:', error);
    res.status(500).json({ error: 'Erro ao obter configuração' });
  }
});

router.get('/pipelines', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'executivo'].includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });

    const db = getDatabase();
    const config = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');
    if (!config?.value) return res.status(400).json({ error: 'API Key não configurada' });

    const response = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: { 'Authorization': `Bearer ${config.value}`, 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message || 'Erro ao buscar pipelines' });
    }

    const data = await response.json();
    const pipelines = (data.results || []).map(p => ({
      id: p.id, label: p.label,
      stages: (p.stages || []).map(s => ({ id: s.id, label: s.label, displayOrder: s.displayOrder })).sort((a, b) => a.displayOrder - b.displayOrder)
    }));

    res.json({ pipelines });
  } catch (error) {
    console.error('HubSpot pipelines error:', error);
    res.status(500).json({ error: 'Erro ao buscar pipelines' });
  }
});

export default router;
