import { Router } from 'express';
import { getDatabase } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Helper: get app setting
async function getSetting(key) {
  const db = getDatabase();
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row?.value || null;
}

// Helper: set app setting
async function setSetting(key, value) {
  const db = getDatabase();
  const existing = await db.get('SELECT key FROM app_settings WHERE key = ?', [key]);
  if (existing) {
    await db.run('UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [value, key]);
  } else {
    await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

// Helper: get Google OAuth config
async function getGoogleConfig() {
  const clientId = await getSetting('google_client_id');
  const clientSecret = await getSetting('google_client_secret');
  const redirectUri = await getSetting('google_redirect_uri');
  return { clientId, clientSecret, redirectUri };
}

// Helper: exchange code for tokens
async function exchangeCode(code, config) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return resp.json();
}

// Helper: refresh access token
async function refreshAccessToken(refreshToken, config) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Failed to refresh token');
  return resp.json();
}

// Helper: get valid access token for user
async function getValidToken(userId) {
  const db = getDatabase();
  const tokens = await db.get('SELECT * FROM google_tokens WHERE user_id = ?', [userId]);
  if (!tokens) return null;

  // Check if token expired
  if (tokens.token_expiry && new Date(tokens.token_expiry) < new Date()) {
    const config = await getGoogleConfig();
    if (!config.clientId || !config.clientSecret) return null;
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token, config);
      const expiry = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString();
      await db.run(
        'UPDATE google_tokens SET access_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [newTokens.access_token, expiry, userId]
      );
      return newTokens.access_token;
    } catch {
      return null;
    }
  }
  return tokens.access_token;
}

// ── Admin: Get/Save Google config ──

router.get('/config', authenticate, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
  try {
    const clientId = await getSetting('google_client_id');
    const clientSecret = await getSetting('google_client_secret');
    const redirectUri = await getSetting('google_redirect_uri');
    res.json({
      clientId: clientId || '',
      clientIdPreview: clientId ? clientId.slice(0, 20) + '...' : '',
      hasSecret: !!clientSecret,
      redirectUri: redirectUri || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/config', authenticate, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Sem permissão' });
  try {
    const { clientId, clientSecret, redirectUri } = req.body;
    if (clientId !== undefined) await setSetting('google_client_id', clientId);
    if (clientSecret) await setSetting('google_client_secret', clientSecret);
    if (redirectUri !== undefined) await setSetting('google_redirect_uri', redirectUri);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── OAuth flow ──

// Step 1: Get auth URL (user clicks "Conectar Google")
router.get('/auth-url', authenticate, async (req, res) => {
  try {
    const config = await getGoogleConfig();
    if (!config.clientId || !config.redirectUri) {
      return res.status(400).json({ error: 'Google não configurado. Peça ao administrador para configurar.' });
    }
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: req.user.id,
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2: OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or state');

    const config = await getGoogleConfig();
    const tokens = await exchangeCode(code, config);

    // Get user email from Google
    let email = '';
    try {
      const infoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = await infoResp.json();
      email = info.email || '';
    } catch {}

    const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
    const db = getDatabase();

    // Upsert tokens
    const existing = await db.get('SELECT user_id FROM google_tokens WHERE user_id = ?', [userId]);
    if (existing) {
      await db.run(
        'UPDATE google_tokens SET access_token = ?, refresh_token = ?, token_expiry = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [tokens.access_token, tokens.refresh_token, expiry, email, userId]
      );
    } else {
      await db.run(
        'INSERT INTO google_tokens (user_id, access_token, refresh_token, token_expiry, email) VALUES (?, ?, ?, ?, ?)',
        [userId, tokens.access_token, tokens.refresh_token, expiry, email]
      );
    }

    // Redirect back to app
    res.send(`<html><body><script>window.close();window.opener&&window.opener.postMessage('google-connected','*');</script><p>Conectado! Pode fechar esta janela.</p></body></html>`);
  } catch (e) {
    res.status(500).send(`Erro: ${e.message}`);
  }
});

// ── User: Check connection status ──

router.get('/status', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const tokens = await db.get('SELECT email, created_at FROM google_tokens WHERE user_id = ?', [req.user.id]);
    res.json({ connected: !!tokens, email: tokens?.email || null, since: tokens?.created_at || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── User: Disconnect ──

router.post('/disconnect', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    await db.run('DELETE FROM google_tokens WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Calendar: List events ──

router.get('/calendar/events', authenticate, async (req, res) => {
  try {
    const token = await getValidToken(req.user.id);
    if (!token) return res.status(401).json({ error: 'Google não conectado' });

    const { timeMin, timeMax, maxResults = 50 } = req.query;
    const min = timeMin || new Date().toISOString();
    const max = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({ timeMin: min, timeMax: max, maxResults: String(maxResults), singleEvents: 'true', orderBy: 'startTime' });
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('Failed to fetch calendar events');
    const data = await resp.json();
    res.json(data.items || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Calendar: Create event ──

router.post('/calendar/events', authenticate, async (req, res) => {
  try {
    const token = await getValidToken(req.user.id);
    if (!token) return res.status(401).json({ error: 'Google não conectado' });

    const { summary, description, startDateTime, endDateTime, attendees } = req.body;
    const event = {
      summary,
      description,
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime || new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'America/Sao_Paulo' },
    };
    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email }));
    }

    const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Calendar API error: ${err}`);
    }
    const created = await resp.json();
    res.json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Gmail: Send email ──

router.post('/gmail/send', authenticate, async (req, res) => {
  try {
    const token = await getValidToken(req.user.id);
    if (!token) return res.status(401).json({ error: 'Google não conectado' });

    const { to, subject, body, cc, bcc } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body são obrigatórios' });

    // Build RFC 2822 message
    const db = getDatabase();
    const tokens = await db.get('SELECT email FROM google_tokens WHERE user_id = ?', [req.user.id]);
    const from = tokens?.email || '';

    let message = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\n`;
    if (cc) message += `Cc: ${cc}\r\n`;
    if (bcc) message += `Bcc: ${bcc}\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n\r\n${body}`;

    // Base64url encode
    const encoded = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const resp = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gmail API error: ${err}`);
    }
    const sent = await resp.json();
    res.json({ ok: true, messageId: sent.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
