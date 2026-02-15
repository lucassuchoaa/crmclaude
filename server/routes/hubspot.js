import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDatabase } from '../config/database.js';

const router = express.Router();

/**
 * Busca empresa no HubSpot pelo CNPJ e verifica oportunidades abertas
 * POST /api/hubspot/search
 */
router.post('/search', authenticate, async (req, res) => {
  try {
    const { cnpj } = req.body;

    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ é obrigatório' });
    }

    // Limpa o CNPJ para busca
    const cleanCnpj = cnpj.replace(/[^\d]/g, '');

    // Obtém a API Key do HubSpot das configurações
    const db = getDatabase();
    const config = db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');

    if (!config?.value) {
      return res.status(400).json({
        error: 'HubSpot não configurado',
        configured: false
      });
    }

    const apiKey = config.value;
    const hubspotBaseUrl = 'https://api.hubapi.com';

    // 1. Buscar empresa pelo CNPJ (propriedade customizada ou no campo de identificação fiscal)
    // Usando a API de busca do HubSpot
    const searchResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/companies/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'cnpj', // Propriedade customizada no HubSpot
                operator: 'EQ',
                value: cleanCnpj
              }
            ]
          },
          {
            filters: [
              {
                propertyName: 'cnpj',
                operator: 'EQ',
                value: cnpj // Busca com formatação também
              }
            ]
          }
        ],
        properties: ['name', 'cnpj', 'domain', 'phone', 'city', 'state', 'hs_lead_status']
      })
    });

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      console.error('HubSpot search error:', errorData);

      // Se a propriedade cnpj não existir, retorna como não encontrado
      if (errorData.message?.includes('cnpj')) {
        return res.json({
          found: false,
          company: null,
          deals: [],
          message: 'Propriedade CNPJ não configurada no HubSpot'
        });
      }

      throw new Error(`HubSpot API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const companies = searchData.results || [];

    if (companies.length === 0) {
      // Também verificar nas indicações locais se já existe
      const localIndication = db.prepare('SELECT * FROM indications WHERE cnpj = ?').get(cleanCnpj);

      return res.json({
        found: false,
        company: null,
        deals: [],
        localIndication: localIndication ? {
          id: localIndication.id,
          razao_social: localIndication.razao_social,
          status: localIndication.status,
          owner: localIndication.owner_id
        } : null
      });
    }

    const company = companies[0];
    const companyId = company.id;

    // 2. Buscar deals (oportunidades) associados à empresa
    const dealsResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/companies/${companyId}/associations/deals`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    let deals = [];
    let openDeals = [];

    if (dealsResponse.ok) {
      const dealsData = await dealsResponse.json();
      const dealIds = dealsData.results?.map(d => d.id) || [];

      // Buscar detalhes dos deals
      if (dealIds.length > 0) {
        const dealsDetailsResponse = await fetch(`${hubspotBaseUrl}/crm/v3/objects/deals/batch/read`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: dealIds.map(id => ({ id })),
            properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 'hs_deal_stage_probability']
          })
        });

        if (dealsDetailsResponse.ok) {
          const dealsDetails = await dealsDetailsResponse.json();
          deals = dealsDetails.results?.map(d => ({
            id: d.id,
            name: d.properties.dealname,
            stage: d.properties.dealstage,
            amount: d.properties.amount,
            closeDate: d.properties.closedate,
            pipeline: d.properties.pipeline,
            probability: d.properties.hs_deal_stage_probability
          })) || [];

          // Filtrar deals abertos (não fechados/perdidos)
          // Stages típicos de fechado: closedwon, closedlost
          openDeals = deals.filter(d =>
            !['closedwon', 'closedlost', 'closed_won', 'closed_lost', 'ganhou', 'perdeu'].includes(d.stage?.toLowerCase())
          );
        }
      }
    }

    res.json({
      found: true,
      company: {
        id: companyId,
        name: company.properties.name,
        cnpj: company.properties.cnpj,
        domain: company.properties.domain,
        phone: company.properties.phone,
        city: company.properties.city,
        state: company.properties.state,
        leadStatus: company.properties.hs_lead_status
      },
      deals: deals,
      openDeals: openDeals,
      hasOpenDeals: openDeals.length > 0,
      message: openDeals.length > 0
        ? `Empresa já possui ${openDeals.length} oportunidade(s) aberta(s)`
        : 'Empresa encontrada sem oportunidades abertas'
    });

  } catch (error) {
    console.error('HubSpot search error:', error);
    res.status(500).json({ error: 'Erro ao consultar HubSpot. Verifique a configuração.' });
  }
});

/**
 * Testa conexão com HubSpot
 * GET /api/hubspot/test
 */
router.get('/test', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const config = db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');

    if (!config?.value) {
      return res.json({
        connected: false,
        message: 'API Key não configurada'
      });
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
      headers: {
        'Authorization': `Bearer ${config.value}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      res.json({
        connected: true,
        message: 'Conexão com HubSpot estabelecida'
      });
    } else {
      const error = await response.json();
      res.json({
        connected: false,
        message: error.message || 'Falha na autenticação'
      });
    }
  } catch (error) {
    console.error('HubSpot test error:', error);
    res.json({
      connected: false,
      message: 'Erro ao conectar com HubSpot'
    });
  }
});

/**
 * Salva configuração do HubSpot
 * POST /api/hubspot/config
 */
router.post('/config', authenticate, async (req, res) => {
  try {
    const { apiKey } = req.body;

    // Verifica se usuário tem permissão (super_admin ou executivo)
    if (!['super_admin', 'executivo'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para configurar HubSpot' });
    }

    const db = getDatabase();

    // Upsert na tabela settings
    const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get('hubspot_api_key');

    if (existing) {
      db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
        .run(apiKey, new Date().toISOString(), 'hubspot_api_key');
    } else {
      db.prepare('INSERT INTO settings (key, value, created_at) VALUES (?, ?, ?)')
        .run('hubspot_api_key', apiKey, new Date().toISOString());
    }

    res.json({ success: true, message: 'Configuração salva' });
  } catch (error) {
    console.error('HubSpot config error:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

export default router;
