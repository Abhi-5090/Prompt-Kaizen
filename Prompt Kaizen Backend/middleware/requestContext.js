const crypto = require('crypto');

/**
 * Per-request identity and structured access logging.
 *
 * morgan's `combined` format produces a line per request with no way to tie it
 * to the error that followed, and no way to trace one user's path through the
 * logs. Every request now carries an id that appears in its access log line,
 * in any error logged while handling it, and in the response headers — so a
 * user reporting "it failed at 14:32" can be matched to the exact request.
 *
 * JSON output in production because log aggregators parse it; a short human
 * line in development because a person reads it.
 */

// Header a proxy or client may already have set, so a trace survives hops.
const INBOUND_HEADERS = ['x-request-id', 'x-correlation-id', 'cf-ray'];

function requestId(req, res, next) {
  let id = null;
  for (const h of INBOUND_HEADERS) {
    const v = req.headers[h];
    // Only accept a sane-looking inbound id — it lands in logs, so an
    // unbounded or control-character-laden header would be a log-forging vector.
    if (typeof v === 'string' && /^[\w.:-]{1,64}$/.test(v)) { id = v; break; }
  }
  req.id = id || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/** Fields that must never be written to a log line. */
const REDACT = new Set(['password', 'confirmPassword', 'token', 'otp', 'authorization']);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}

function accessLog({ isProd } = {}) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

      // Health checks fire constantly and say nothing; keep them out unless
      // they actually failed.
      if ((req.path === '/api/health' || req.path === '/api/ready') && res.statusCode < 400) return;

      const entry = {
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        reqId: req.id,
        method: req.method,
        path: req.route ? req.baseUrl + req.route.path : req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        // Identify the actor when authenticated — by id, never by email, so
        // the logs do not become a PII store.
        userId: req.user?._id ? String(req.user._id) : undefined,
        ip: req.ip,
        ua: String(req.headers['user-agent'] || '').slice(0, 120) || undefined,
      };

      if (isProd) {
        console.log(JSON.stringify(entry));
      } else {
        const colour = entry.status >= 500 ? '\x1b[31m' : entry.status >= 400 ? '\x1b[33m' : '\x1b[32m';
        console.log(
          `${colour}${entry.status}\x1b[0m ${entry.method} ${entry.path} ` +
          `${entry.durationMs}ms \x1b[90m${entry.reqId.slice(0, 8)}\x1b[0m`
        );
      }
    });

    next();
  };
}

module.exports = { requestId, accessLog, redact };
