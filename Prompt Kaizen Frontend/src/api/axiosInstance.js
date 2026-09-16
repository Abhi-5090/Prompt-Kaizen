import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pk_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Endpoints where a 401 is a normal form-validation failure (wrong password,
// expired OTP, etc.) and must NOT wipe an existing valid session. Without
// this guard, a logged-in user who opens /login in a second tab and types a
// wrong password would have their good session silently destroyed.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/verify-otp', '/auth/resend-otp'];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const requestUrl = err?.config?.url || '';
      const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => requestUrl.includes(p));
      if (!isAuthEndpoint) {
        localStorage.removeItem('pk_token');
        localStorage.removeItem('pk_user');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
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
