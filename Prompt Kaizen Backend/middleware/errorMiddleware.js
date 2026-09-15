const { HttpError } = require('../utils/asyncHandler');

const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

/**
 * Translates a thrown error into an HTTP response.
 *
 * Previously every error became a 500 with `err.message` echoed back. Two
 * problems with that: a bad ObjectId in a URL (`/api/prompts/nope`) produced
 * a 500 rather than a 404, and raw Mongo errors — including duplicate-key
 * messages that quote the offending value — were forwarded to the client.
 *
 * Mapping is explicit, and anything unrecognised is reported as a generic
 * 500 with the real detail kept server-side.
 */
function classify(err) {
  // Errors we raised deliberately.
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, details: err.details };
  }

  // Bad ObjectId / uncastable query value → the resource cannot exist.
  if (err.name === 'CastError') {
    return { status: 404, message: 'Not found.' };
  }

  // Mongoose schema validation.
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return {
      status: 400,
      message: details[0] || 'Validation failed.',
      details: details.length > 1 ? details : undefined,
    };
  }

  // Duplicate key. Name the field but never echo the value — for the users
  // collection that value is an email address.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return {
      status: 409,
      message: field
        ? `That ${field} is already in use.`
        : 'That record already exists.',
    };
  }

  // Malformed JSON body (body-parser).
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'Request body is not valid JSON.' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large.' };
  }

  // Multer upload failures.
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large (2 MB maximum).'
      : 'File upload failed.';
    return { status: 400, message };
  }

  // JWT failures that escape the auth middleware.
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Not authorized, token failed.' };
  }

  // CORS rejection raised by the origin callback in server.js.
  if (err.code === 'CORS_BLOCKED') {
    return { status: 403, message: 'Origin not allowed.' };
  }

  return { status: 500, message: 'Internal Server Error.' };
}

const errorHandler = (err, req, res, next) => {
  const { status, message, details } = classify(err);

  // Log everything the client isn't told. 5xx is a real defect, so log the
  // stack; 4xx is routine and only worth a one-liner.
  // The request id ties this to its access-log line, and is returned to the
  // client so a bug report can name the exact request.
  if (status >= 500) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(), level: 'error', reqId: req.id,
      method: req.method, path: req.originalUrl, status,
      message: err.message, stack: err.stack,
    }));
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(JSON.stringify({
      ts: new Date().toISOString(), level: 'warn', reqId: req.id,
      method: req.method, path: req.originalUrl, status, message: err.message,
    }));
  }

  // Stack traces are attached only to 5xx, and only in explicit development.
  //
  // Two reasons for the status gate. A 4xx is expected behaviour, not a defect,
  // so its stack is noise. More importantly, the stack encodes which branch
  // produced the error — two responses with deliberately identical messages
  // (the "invalid or expired code" reply returned for both a real and a
  // non-existent account) were still distinguishable by their line numbers,
  // which reopened the account-enumeration hole in any environment running
  // with NODE_ENV=development.
  //
  // The NODE_ENV check stays strict-equality: any other value — undefined,
  // 'staging', a typo — is treated as production.
  const includeStack = process.env.NODE_ENV === 'development' && status >= 500;

  res.status(status).json({
    message,
    ...(details ? { details } : {}),
    // Surfaced so a user can quote it in a support request and it can be found
    // in the logs directly.
    ...(req.id ? { requestId: req.id } : {}),
    ...(includeStack ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };
