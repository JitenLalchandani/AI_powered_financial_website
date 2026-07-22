require("dotenv").config({ path: __dirname + "/.env" });
/**
 * FinWise AI — Express Server v3.0
 * Serves BOTH the API and the frontend from a single Node.js process.
 * Run: node server.js  OR  npm start
 * Open: http://localhost:5000
 */
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const connectDB = require('./config/db');

// ── Connect MongoDB ──────────────────────────────────────────────────────────
connectDB();

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true, methods: ['GET','POST','PATCH','DELETE','OPTIONS'] }));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Rate Limiters ────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  message: { success: false, message: 'Too many requests — please try again in 15 minutes.' }
}));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: 'Too many login attempts — please wait 15 minutes.' }
}));
app.use('/api/ai/chat',    rateLimit({ windowMs: 60 * 1000, max: 15, message: { success: false, message: 'AI rate limit reached — wait a moment.' } }));
app.use('/api/ai/analyse', rateLimit({ windowMs: 60 * 1000, max: 10, message: { success: false, message: 'AI rate limit reached — wait a moment.' } }));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/ai',           require('./routes/ai'));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status: 'ok', version: '3.0.0', timestamp: new Date().toISOString(),
  services: {
    mongodb: process.env.MONGO_URI ? 'configured' : 'MISSING — add MONGO_URI to .env',
    ai:      process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING — add ANTHROPIC_API_KEY to .env'
  }
}));

// ── Serve Frontend (always — works for both local and production) ─────────────
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         FinWise AI  —  v3.0              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  🌐  App (frontend):  http://localhost:${PORT}`);
  console.log(`  🔌  API:             http://localhost:${PORT}/api`);
  console.log(`  ❤️   Health check:   http://localhost:${PORT}/api/health`);
  console.log(`  🍃  MongoDB:  ${process.env.MONGO_URI        ? '✅ configured' : '❌ MISSING — open .env and add MONGO_URI'}`);
  console.log(`  🤖  Claude:   ${process.env.ANTHROPIC_API_KEY ? '✅ configured' : '❌ MISSING — open .env and add ANTHROPIC_API_KEY'}`);
  console.log('');
});

module.exports = app;
