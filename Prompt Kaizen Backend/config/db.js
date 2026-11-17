const mongoose = require('mongoose');

// Last connection failure, surfaced by GET /api/ready. Without this a broken
// deploy reports "not_ready" with no reason, and the only way to learn why was
// to scroll the platform's log — which is gone after a restart.
let lastError = null;

// Connection strings carry credentials (mongodb+srv://user:pass@host). Mongo
// driver errors quote the URI in some failure modes, so never let one reach an
// HTTP response unredacted.
const redact = (msg = '') => String(msg).replace(/\/\/[^@\s]+@/g, '//***:***@');

const getDbHealth = () => ({
  readyState: mongoose.connection.readyState,
  name: mongoose.connection.name || null,
  lastError,
});

/**
 * Connects to MongoDB, retrying with backoff.
 *
 * This used to call process.exit(1) on the first failure. On a host that only
 * marks a deploy live once the app binds a port, that was the worst possible
 * behaviour: a wrong MONGO_URI killed the process *before* app.listen(), so the
 * platform saw no open port, reported "no open ports detected", and sat in a
 * restart loop for the full port-scan timeout with the real reason buried in
 * one line near the top of the log.
 *
 * The database is still a hard dependency — /api/ready returns 503 while it is
 * down, so the instance stays out of the load-balancer pool — but the process
 * stays up, keeps retrying, and can explain itself over HTTP.
 */
const connectDB = async ({ retries = Infinity, baseDelayMs = 2000, maxDelayMs = 30000 } = {}) => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    // loadEnv() already makes this fatal at boot; kept as a guard for the
    // seed scripts and tests, which call connectDB directly.
    throw new Error('MONGO_URI is not defined in environment variables.');
  }

  // Tuned for ~5k concurrent users.
  // - maxPoolSize: 100 — every worker holds up to 100 sockets to MongoDB.
  //   With 4 cluster workers that's 400 sockets total — well within Atlas M10 limits.
  // - minPoolSize: 5 — keep a warm pool so the first burst of traffic
  //   doesn't pay TCP handshakes.
  // - serverSelectionTimeoutMS: 5000 — fail fast if Mongo is unreachable
  //   instead of hanging requests indefinitely.
  // - socketTimeoutMS: 45000 — long enough for the heaviest aggregation,
  //   short enough to recycle dead sockets.
  // - maxIdleTimeMS: 60000 — close idle sockets after a minute so the pool
  //   stays healthy when traffic dips.
  const options = {
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 100,
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 60000,
  };

  mongoose.set('strictQuery', true);

  // Surface connection-pool health in logs so operators can see
  // disconnect/reconnect cycles instead of guessing from 5xx spikes.
  // Registered once, before the first attempt — registering them after a
  // successful connect (as this did previously) meant a connection that
  // dropped during the initial handshake was never reported.
  mongoose.connection.removeAllListeners('disconnected');
  mongoose.connection.removeAllListeners('reconnected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => {
    lastError = null;
    console.log('MongoDB reconnected.');
  });
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', redact(err.message)));

  for (let attempt = 1; ; attempt += 1) {
    try {
      const conn = await mongoose.connect(uri, options);
      lastError = null;
      console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (err) {
      lastError = redact(err.message);
      console.error(`MongoDB connection error (attempt ${attempt}): ${lastError}`);

      // DNS failure on an SRV host is almost always a typo'd or placeholder
      // connection string, not a transient outage. Retrying forever without
      // saying so is how a 30-second mistake becomes a 30-minute one.
      if (/ENOTFOUND|EAI_AGAIN/.test(err.message) && /mongodb\+srv/.test(uri)) {
        console.error(
          '  → The SRV hostname could not be resolved. Check MONGO_URI: this is ' +
          'what a placeholder host (e.g. cluster0.xxxxx.mongodb.net) looks like.'
        );
      }
      if (/Authentication failed|bad auth/i.test(err.message)) {
        console.error('  → Credentials rejected. Check the username/password in MONGO_URI.');
      }
      if (/timed out|ETIMEDOUT/i.test(err.message)) {
        console.error(
          '  → Reached DNS but not the server. In MongoDB Atlas, check Network Access ' +
          'allows this host\'s IP (0.0.0.0/0 for platforms with dynamic egress IPs).'
        );
      }

      if (attempt >= retries) throw err;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.error(`  → retrying in ${Math.round(delay / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.getDbHealth = getDbHealth;
