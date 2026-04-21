import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeDatabase, getDatabase } from './config/database.js';
import { seedIfEmpty } from './models/seed.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import indicationsRoutes from './routes/indications.js';
import commissionsRoutes from './routes/commissions.js';
import nfesRoutes from './routes/nfes.js';
import materialsRoutes from './routes/materials.js';
import notificationsRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import hubspotRoutes from './routes/hubspot.js';
import groupsRoutes from './routes/groups.js';
import cnpjAgentRoutes from './routes/cnpjAgent.js';
import diretoriaRoutes from './routes/diretoria.js';
import whatsappRoutes from './routes/whatsapp.js';
import conveniosRoutes from './routes/convenios.js';
import pipelinesRoutes from './routes/pipelines.js';
import teamsRoutes from './routes/teams.js';
import productsRoutes from './routes/products.js';
import googleRoutes from './routes/google.js';
import proposalsRoutes from './routes/proposals.js';
import contractsRoutes from './routes/contracts.js';
import permissionsRoutes from './routes/permissions.js';
import leadsRoutes from './routes/leads.js';
import cadencesRoutes from './routes/cadences.js';
import landingPagesRoutes from './routes/landingPages.js';
import workflowsRoutes from './routes/workflows.js';
import inboxRoutes from './routes/inbox.js';
import aiAgentRoutes from './routes/aiAgent.js';
import netsuiteRoutes from './routes/netsuite.js';
import { startHubSpotScheduler } from './services/hubspotSync.js';
import { startCadenceRunner } from './services/cadenceRunner.js';
import { startNetSuiteScheduler } from './services/netsuiteSync.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (behind Nginx in production/staging)
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting (exclude webhook and polling routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // 600 requests per 15min (~40/min)
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) =>
    req.path.startsWith('/whatsapp/webhook') ||
    req.path.startsWith('/whatsapp/instance/qr') ||
    req.path.startsWith('/whatsapp/instance/status') ||
    req.path.startsWith('/notifications') ||
    req.path.startsWith('/landing-pages/public'),
});
app.use('/api/', limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts, please try again later.' }
});
app.use('/api/auth/login', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize database (async — must complete before first request)
await initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/indications', indicationsRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/nfes', nfesRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/hubspot', hubspotRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/cnpj-agent', cnpjAgentRoutes);
app.use('/api/diretoria', diretoriaRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/convenios', conveniosRoutes);
app.use('/api/pipelines', pipelinesRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/cadences', cadencesRoutes);
app.use('/api/landing-pages', landingPagesRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/ai', aiAgentRoutes);
app.use('/api/netsuite', netsuiteRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const db = getDatabase();
  res.json({ status: 'ok', database: db.type, timestamp: new Date().toISOString() });
});

// Teste temporário da Lemit API — remover depois
app.get('/api/test-lemit', async (req, res) => {
  try {
    const token = process.env.LEMIT_API_TOKEN;
    if (!token) return res.json({ error: 'LEMIT_API_TOKEN não configurado' });

    // Descobre o IP de saída do servidor
    let serverIp = 'unknown';
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      serverIp = ipData.ip;
    } catch {}

    // Testa saldo
    const saldoRes = await fetch('https://api.lemit.com.br/api/v1/saldo', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const saldoBody = await saldoRes.text();

    // Testa consulta empresa - varias formas
    const tests = {};

    // Forma 1: x-www-form-urlencoded (como na doc)
    const emp1 = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: 'documento=33000167000101',
    });
    tests.form_default = { status: emp1.status, body: await emp1.text() };

    // Forma 2: com Content-Type explícito
    const emp2 = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'documento=33000167000101',
    });
    tests.form_explicit = { status: emp2.status, body: await emp2.text() };

    // Forma 3: com CNPJ no path (como na doc mostra /empresa/{cnpj})
    const emp3 = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa/33000167000101', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    tests.path_param = { status: emp3.status, body: await emp3.text() };

    // Forma 4: JSON body
    const emp4 = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento: '33000167000101' }),
    });
    tests.json_body = { status: emp4.status, body: await emp4.text() };

    // Forma 5: URLSearchParams
    const emp5 = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: new URLSearchParams({ documento: '33000167000101' }),
    });
    tests.urlsearchparams = { status: emp5.status, body: await emp5.text() };

    res.json({
      server_ip: serverIp,
      lemit_token_preview: token.substring(0, 8) + '...',
      saldo: { status: saldoRes.status, body: saldoBody },
      tests,
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Serve frontend static files in production/staging
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, _next) => {
  if (process.env.NODE_ENV === 'production') {
    // Sanitized log: avoid leaking stack traces / tokens / PII in production.
    console.error('[error]', {
      timestamp: new Date().toISOString(),
      status: err.status || 500,
      message: (err.message || '').slice(0, 200),
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
  } else {
    console.error(err.stack);
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  seedIfEmpty(getDatabase()).catch(e => console.error('Seed error:', e.message));
  startHubSpotScheduler(getDatabase());
  startCadenceRunner(getDatabase());
  startNetSuiteScheduler(getDatabase());
});

export default app;
