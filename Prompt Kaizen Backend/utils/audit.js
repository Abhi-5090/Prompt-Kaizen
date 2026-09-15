const AuditLog = require('../models/AuditLog');

/**
 * Writes an audit record. Deliberately best-effort: an audit failure must
 * never fail the action the operator actually requested, so errors are
 * logged and swallowed. Callers do not need to await it, but awaiting keeps
 * ordering deterministic in tests.
 */
async function recordAudit(req, { action, targetType, targetId, targetLabel, metadata }) {
  try {
    await AuditLog.create({
      actorId: req?.user?._id || null,
      actorEmail: req?.user?.email || '',
      action,
      targetType: targetType || '',
      targetId: targetId || null,
      targetLabel: targetLabel || '',
      metadata: metadata || {},
      ip: req?.ip || '',
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300),
    });
  } catch (err) {
    console.error(`[audit] failed to record "${action}":`, err.message);
  }
}

module.exports = { recordAudit };
