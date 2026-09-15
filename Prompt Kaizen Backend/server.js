require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
// ipKeyGenerator normalises IPv6 into a /64 subnet key. Using req.ip raw in a
// custom keyGenerator lets an IPv6 client rotate through addresses in its own
// prefix to get a fresh bucket each request.
const { ipKeyGenerator } = require('express-rate-limit');
const mongoose = require('mongoose');

const { loadEnv } = require('./config/env');

// Validate configuration BEFORE anything else. A missing or placeholder
// JWT_SECRET used to let the process boot and only fail per-request inside
// jwt.sign(); now it stops the deploy with a readable reason.
let env;
try {
  env = loadEnv();
} catch (err) {
  process.exit(1);
}

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const promptRoutes = require('./routes/promptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { userRouter: contestUserRoutes, adminRouter: contestAdminRoutes } = require('./routes/contestRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { verifyMailConnection, getMailHealth } = require('./utils/mailer');
const { requestId, accessLog } = require('./middleware/requestContext');

const app = express();
const isProd = env.isProd;

// Render/Heroku/most reverse-proxy hosts terminate TLS upstream. Without this
// the real client IP is hidden behind the proxy IP — which breaks per-IP rate
// limiting (everyone shares the same load-balancer IP) and any IP logging.
app.set('trust proxy', 1);
// Don't advertise the framework.
app.disable('x-powered-by');

// --- Security headers ------------------------------------------------------
// CSP is disabled because this is a JSON API consumed by separate SPA origins,
// not a server-rendered site. helmet's other defaults (HSTS, no-sniff, frame
// guard, etc.) are kept.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// --- Compression -----------------------------------------------------------
app.use(compression());

// --- CORS ------------------------------------------------------------------
const allowedOrigins = env.allowedOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests with no Origin header (curl, Postman, server-to-server, and
      // same-origin health checks) are allowed — CORS is a browser control and
      // these are not browser cross-origin requests.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Tag the error so errorMiddleware renders a 403 rather than a 500 with
      // the rejected origin echoed back in the message.
      const err = new Error('Origin not allowed.');
      err.code = 'CORS_BLOCKED';
      return callback(err);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // cache preflight for a day
  })
);

app.use(express.json({ limit: '1mb' }));

// --- Request identity + logging --------------------------------------------
// requestId runs before everything that might log, so even a rejected request
// is traceable. Replaces morgan: its output could not be correlated with the
// errors that followed it.
app.use(requestId);
app.use(accessLog({ isProd }));

// --- Rate limiting ---------------------------------------------------------
// Sized for ~5k concurrent users at human cadences: the goal is to cap abuse
// and runaway clients, not to slow real users down.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL_PER_MIN) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_PER_MIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth attempts, please wait a minute.' },
});

// Password reset and OTP resend each send an email per call. Left on the
// general 300/min ceiling, one IP could use them to flood an inbox — which
// is both an abuse vector and a fast way to get the sending domain blocked.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_EMAIL_PER_15MIN) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for that. Please wait a few minutes and try again.' },
});

// Per-USER limiter for analysis. The IP limiter does not constrain a single
// authenticated account behind one address, and every /analyze both writes a
// document and (from Phase 2) costs money per call.
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ANALYZE_PER_MIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Key on the authenticated user when present so one user on a shared NAT
  // cannot exhaust the quota for everyone behind it.
  keyGenerator: (req, res) => (req.user?._id ? `u:${req.user._id}` : `ip:${ipKeyGenerator(req, res)}`),
  message: { message: 'You are analyzing prompts very quickly — please wait a moment.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/auth/forgot-password', emailLimiter);
app.use('/api/auth/resend-otp', emailLimiter);

// --- Health / root ---------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Prompt Kaizen API' });
});

// Liveness: the process is up. Used by the platform to decide whether to
// restart the container.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Readiness: the process can actually serve traffic. The old health check
// reported "ok" while MongoDB was unreachable, so a broken instance stayed
// in the load balancer pool.
app.get('/api/ready', (req, res) => {
  const state = mongoose.connection.readyState; // 1 = connected
  const db = ['disconnected', 'connected', 'connecting', 'disconnecting'][state] || 'unknown';
  const mail = getMailHealth();

  // The database is the hard dependency — without it nothing works, so a
  // failure here should pull the instance out of the pool.
  if (state !== 1) {
    return res.status(503).json({ status: 'not_ready', db, mail: { healthy: mail.healthy } });
  }

  // Mail is a soft dependency: existing users can sign in and use the product
  // without it, so a mail outage must NOT take the instance out of rotation.
  // It is reported as degraded instead, because in that state no new user can
  // complete signup — a condition that is otherwise completely invisible.
  return res.json({
    status: mail.healthy ? 'ready' : 'degraded',
    db,
    mail: {
      healthy: mail.healthy,
      configured: mail.configured,
      verified: mail.verified,
      consecutiveFailures: mail.consecutiveFailures,
      ...(mail.healthy ? {} : {
        impact: 'New users cannot receive verification codes and will be unable to sign in.',
        lastError: mail.lastError,
      }),
    },
  });
});

// --- Routes ----------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/prompts', analyzeLimiter, promptRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/contests', contestAdminRoutes);
app.use('/api/contests', contestUserRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = env.port;

connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Prompt Kaizen API listening on http://localhost:${PORT} (pid ${process.pid})`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);

    // Check the mail path once at startup so a broken SMTP config is a line
    // in the deploy log rather than a stream of "I never got my code" reports.
    // Deliberately after listen() and not awaited: mail is a soft dependency
    // and must not delay the port opening.
    verifyMailConnection().catch(() => {});
  });

  // --- Graceful shutdown ---------------------------------------------------
  // cluster.js documents that workers "exit when their HTTP server finishes
  // in-flight requests", but nothing implemented that: on SIGTERM the process
  // died instantly and dropped whatever it was serving. Every deploy on Render
  // sends SIGTERM, so this ran on every release.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing server to new connections`);

    // Stop accepting connections; the callback fires once in-flight requests
    // have finished.
    server.close(async () => {
      try {
        await mongoose.connection.close(false);
        console.log('[shutdown] MongoDB connection closed');
      } catch (err) {
        console.error('[shutdown] error closing MongoDB:', err.message);
      }
      console.log('[shutdown] clean exit');
      process.exit(0);
    });

    // Failsafe: a hung long-lived request must not block the deploy forever.
    setTimeout(() => {
      console.warn('[shutdown] forced exit after 15s timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // A promise rejection with no handler leaves the process in an undefined
  // state. Log it and shut down cleanly so the platform restarts a healthy one.
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandled promise rejection:', reason);
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaught exception:', err);
    shutdown('uncaughtException');
  });
});

module.exports = app;
