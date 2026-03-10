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
import { startHubSpotScheduler } from './services/hubspotSync.js';

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
    req.path.startsWith('/notifications'),
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
});

export default app;
