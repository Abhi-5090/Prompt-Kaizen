const mongoose = require('mongoose');

/**
 * Append-only record of privileged actions.
 *
 * Previously the only trace of an admin resetting a user's password was a
 * console.warn — which survives exactly as long as the host's log retention
 * and cannot be queried. Anything that destroys data or changes someone
 * else's access is recorded here instead.
 *
 * Documents expire after two years so the collection cannot grow without
 * bound; raise AUDIT_RETENTION_DAYS if a longer window is required.
 */
const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS) || 730;

const auditLogSchema = new mongoose.Schema(
  {
    // Who performed it. Denormalised email so the log stays readable after
    // the actor's account is deleted.
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: { type: String, default: '' },

    // What happened, e.g. 'user.delete', 'user.password_reset',
    // 'contest.publish', 'auth.lockout'.
    action: { type: String, required: true, index: true },

    // What it happened to.
    targetType: { type: String, default: '' },   // 'User' | 'Contest' | ...
    targetId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    targetLabel:{ type: String, default: '' },   // email / title at the time

    // Anything else worth keeping. Never store secrets or password material.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },

    // No `index: true` here — the two explicit indexes below cover it (a
    // descending index for listing, an ascending TTL index for expiry).
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Newest-first listing for an admin activity view.
auditLogSchema.index({ createdAt: -1 });
// TTL cleanup.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
