const { forbidden } = require('../utils/asyncHandler');

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  // Routed through the central error handler so this carries a requestId and
  // is logged the same way every other rejection is.
  return next(forbidden('Forbidden: Admin access required'));
};

module.exports = { adminOnly };
