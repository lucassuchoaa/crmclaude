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
// Global helmet with strict defaults; landing pages set their own per-response CSP.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"],
      "object-src": ["'none'"],
      "form-action": ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS — accepts comma-separated list via CORS_ORIGIN, rejects '*' with credentials
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .filter(o => o !== '*');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
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

// Auth rate limiting (stricter) — per IP+email to reduce credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const email = (req.body && req.body.email ? String(req.body.email) : '').toLowerCase();
    return `${req.ip}|${email}`;
  },
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
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
  console.error(err.stack);
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
