/**
 * Wraps an async Express handler so a rejected promise reaches the central
 * error middleware instead of becoming an unhandled rejection.
 *
 * Express 4 does not await handlers, so `async (req,res) => { throw x }`
 * silently hangs the request. Every controller in this codebase used to
 * carry its own try/catch that logged and returned a generic 500 — which
 * also meant a CastError (bad ObjectId in the URL) was reported to the
 * client as "Failed to load evaluation" with status 500 instead of a 404.
 *
 * With this wrapper, controllers throw and `errorMiddleware` decides the
 * status code and message.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * An error carrying an explicit HTTP status. Throw this from controllers
 * for expected failures ("not found", "already submitted", ...) so the
 * error middleware doesn't have to guess.
 */
class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    // `expose` marks a message as safe to show the client verbatim.
    this.expose = options.expose !== false;
    if (options.code) this.code = options.code;
    if (options.details) this.details = options.details;
  }
}

// Sugar for the statuses this API actually returns.
const badRequest   = (msg, o) => new HttpError(400, msg, o);
const unauthorized = (msg = 'Not authorized.', o) => new HttpError(401, msg, o);
const forbidden    = (msg = 'Forbidden.', o) => new HttpError(403, msg, o);
const notFound     = (msg = 'Not found.', o) => new HttpError(404, msg, o);
const conflict     = (msg, o) => new HttpError(409, msg, o);
const tooMany      = (msg, o) => new HttpError(429, msg, o);

module.exports = {
  asyncHandler,
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooMany,
};
