import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { NetSuiteClient, getNetSuiteConfig } from '../services/netsuiteClient.js';
import { runNetSuiteSync } from '../services/netsuiteSync.js';

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!['super_admin', 'executivo'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  next();
}

// GET /netsuite/config — Retrieve config (masked)
router.get('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const keys = ['netsuite_account_id', 'netsuite_consumer_key', 'netsuite_consumer_secret', 'netsuite_token_id', 'netsuite_token_secret'];
    const config = {};

    for (const key of keys) {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      const shortKey = key.replace('netsuite_', '');
      if (row?.value) {
        // Mask secrets, show account_id in full
        if (shortKey === 'account_id') {
          config[shortKey] = row.value;
        } else {
          config[shortKey] = `...${row.value.slice(-8)}`;
        }
        config[`${shortKey}_configured`] = true;
      } else {
        config[shortKey] = null;
        config[`${shortKey}_configured`] = false;
      }
    }

    const hasCredentials = config.account_id_configured && config.consumer_key_configured && config.token_id_configured;
    res.json({ config, hasCredentials });
  } catch (error) {
    console.error('Get NetSuite config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /netsuite/config — Save credentials
router.post('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const { account_id, consumer_key, consumer_secret, token_id, token_secret } = req.body;
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

    await upsert('netsuite_account_id', account_id);
    await upsert('netsuite_consumer_key', consumer_key);
    await upsert('netsuite_consumer_secret', consumer_secret);
    await upsert('netsuite_token_id', token_id);
    await upsert('netsuite_token_secret', token_secret);

    res.json({ success: true, message: 'Configuração NetSuite salva com sucesso.' });
  } catch (error) {
    console.error('Save NetSuite config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// GET /netsuite/test — Test connection
router.get('/test', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const config = await getNetSuiteConfig(db);
    if (!config) {
      return res.json({ connected: false, message: 'NetSuite não configurado. Salve as credenciais primeiro.' });
    }

    const client = new NetSuiteClient(config);
    const result = await client.testConnection();
    res.json(result);
  } catch (error) {
    console.error('NetSuite test connection error:', error);
    res.json({ connected: false, message: `Falha na conexão: ${error.message}` });
  }
});

// POST /netsuite/sync — Manual sync trigger
router.post('/sync', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const result = await runNetSuiteSync(db);
    if (result.skipped) {
      return res.json({ success: false, message: 'NetSuite não configurado.' });
    }
    res.json({ success: true, result });
  } catch (error) {
    console.error('NetSuite manual sync error:', error);
    res.status(500).json({ error: 'Falha na sincronização' });
  }
});

// GET /netsuite/sync-log — Recent sync history
router.get('/sync-log', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const logs = await db.prepare('SELECT * FROM netsuite_sync_log ORDER BY synced_at DESC LIMIT 20').all();
    res.json({ logs });
  } catch (error) {
    console.error('Get NetSuite sync log error:', error);
    res.status(500).json({ error: 'Failed to get sync log' });
  }
});

// GET /netsuite/mappings — Entity mapping status
router.get('/mappings', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();

    const vendorStats = await db.prepare(`
      SELECT
        COUNT(*) as total_parceiros,
        SUM(CASE WHEN netsuite_vendor_id IS NOT NULL AND netsuite_vendor_id != '' THEN 1 ELSE 0 END) as synced
      FROM users WHERE role = 'parceiro' AND is_active = 1
    `).get();

    const nfeStats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN netsuite_id IS NOT NULL AND netsuite_id != '' THEN 1 ELSE 0 END) as synced
      FROM nfes WHERE status IN ('approved', 'paid')
    `).get();

    const commStats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN netsuite_id IS NOT NULL AND netsuite_id != '' THEN 1 ELSE 0 END) as synced
      FROM commissions WHERE status IN ('approved', 'paid')
    `).get();

    res.json({
      vendors: { total: Number(vendorStats.total_parceiros), synced: Number(vendorStats.synced) },
      vendor_bills: { total: Number(nfeStats.total), synced: Number(nfeStats.synced) },
      journal_entries: { total: Number(commStats.total), synced: Number(commStats.synced) },
    });
  } catch (error) {
    console.error('Get NetSuite mappings error:', error);
    res.status(500).json({ error: 'Failed to get mappings' });
  }
});

export default router;
