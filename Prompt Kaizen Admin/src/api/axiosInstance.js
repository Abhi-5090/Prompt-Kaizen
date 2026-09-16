import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pk_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401s coming back from /auth/login are wrong-password rejections, not
// session-expired signals — never wipe storage based on those.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/verify-otp', '/auth/resend-otp'];

// Module-level flag prevents a thundering herd of toasts + redirects when the
// dashboard fires several admin calls in parallel and the token has just
// expired. The first 401 starts the redirect; subsequent 401s are tagged so
// their rejection can be silently swallowed downstream.
//
// The flag is normally cleared by the full-page reload that
// `window.location.href = '/login'` triggers. But if the redirect path is
// suppressed (e.g. the user is already on /login when the 401 lands, or
// they SPA-navigate back to the app after a manual login) the flag would
// stay set for the rest of the bundle's lifetime. `resetSessionExpired()`
// is exported so AuthContext.login() can clear it after a successful sign-in.
let sessionExpired = false;
export function resetSessionExpired() { sessionExpired = false; }
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired.');
    this.name = 'SessionExpiredError';
    this.sessionExpired = true;
  }
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const requestUrl = err?.config?.url || '';
      const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => requestUrl.includes(p));
      if (!isAuthEndpoint) {
        if (!sessionExpired) {
          sessionExpired = true;
          localStorage.removeItem('pk_admin_token');
          localStorage.removeItem('pk_admin_user');
          if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
        // Reject with a sentinel error so component-level .catch handlers
        // can opt out of showing a stale "Failed to load..." toast while the
        // page is being yanked out from under them.
        return Promise.reject(new SessionExpiredError());
      }
    }
    return Promise.reject(err);
  }
);

/**
 * Turns an Axios error into something a user can act on.
 *
 * `err.response?.data?.message || 'Something failed'` is the usual shape, and
 * it is actively misleading: when the request never reached the server there
 * IS no response, so every transport problem — API not running, wrong port,
 * DNS, CORS rejection, offline — collapses into the same generic sentence.
 * That sends people hunting for a bug in the feature when the server simply
 * was not up.
 *
 * @param {unknown} err       the rejected Axios error
 * @param {string}  fallback  message for a genuine server-side failure
 */
export function errorMessage(err, fallback = 'Something went wrong.') {
  // The server answered — it knows best what went wrong.
  if (err?.response?.data?.message) return err.response.data.message;

  if (err?.response) {
    // Answered, but with no usable body.
    return `${fallback} (server returned ${err.response.status})`;
  }

  if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
    return 'Request cancelled.';
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  // No response at all: the request never completed. Name the address we
  // tried, because the usual cause is the API not running or the wrong
  // VITE_API_BASE_URL baked into the build.
  return `Could not reach the server at ${baseURL}. Is the API running?`;
}

export default api;
