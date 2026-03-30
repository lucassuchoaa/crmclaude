import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

/**
 * NetSuite REST API Client using OAuth 1.0 Token-Based Authentication (TBA)
 */
export class NetSuiteClient {
  constructor({ account_id, consumer_key, consumer_secret, token_id, token_secret }) {
    this.accountId = account_id;
    this.baseUrl = `https://${account_id.replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest`;

    this.oauth = OAuth({
      consumer: { key: consumer_key, secret: consumer_secret },
      signature_method: 'HMAC-SHA256',
      hash_function(baseString, key) {
        return crypto.createHmac('sha256', key).update(baseString).digest('base64');
      },
    });

    this.token = { key: token_id, secret: token_secret };
  }

  async request(method, url, body = null) {
    const requestData = { url, method };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, this.token)
    );

    const headers = {
      ...authHeader,
      'Content-Type': 'application/json',
      'Prefer': 'respond-async',
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NetSuite API error ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  async get(endpoint) {
    return this.request('GET', `${this.baseUrl}${endpoint}`);
  }

  async post(endpoint, body) {
    return this.request('POST', `${this.baseUrl}${endpoint}`, body);
  }

  async patch(endpoint, body) {
    return this.request('PATCH', `${this.baseUrl}${endpoint}`, body);
  }

  // --- Convenience methods ---

  async testConnection() {
    // Try to get company info via SuiteTalk REST
    const result = await this.get('/record/v1/metadata-catalog/');
    return { connected: true, message: 'Conexão com NetSuite estabelecida com sucesso.' };
  }

  async createVendor(data) {
    return this.post('/record/v1/vendor', data);
  }

  async getVendor(id) {
    return this.get(`/record/v1/vendor/${id}`);
  }

  async createVendorBill(data) {
    return this.post('/record/v1/vendorBill', data);
  }

  async getVendorBill(id) {
    return this.get(`/record/v1/vendorBill/${id}`);
  }

  async createJournalEntry(data) {
    return this.post('/record/v1/journalEntry', data);
  }

  async getJournalEntry(id) {
    return this.get(`/record/v1/journalEntry/${id}`);
  }

  // Search for vendor bills with payment applied (for pulling payment confirmations)
  async searchPaidVendorBills(lastSyncDate) {
    const query = encodeURIComponent(
      `SELECT id, tranId, entity, status, total FROM vendorBill WHERE status = 'VendBill:B' AND lastModifiedDate >= '${lastSyncDate}'`
    );
    return this.get(`/query/v1/suiteql?q=${query}`);
  }
}

/**
 * Retrieve NetSuite configuration from settings table
 */
export async function getNetSuiteConfig(db) {
  const keys = [
    'netsuite_account_id', 'netsuite_consumer_key', 'netsuite_consumer_secret',
    'netsuite_token_id', 'netsuite_token_secret'
  ];

  const config = {};
  for (const key of keys) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    config[key.replace('netsuite_', '')] = row?.value || null;
  }

  if (!config.account_id || !config.consumer_key || !config.token_id) return null;
  return config;
}
