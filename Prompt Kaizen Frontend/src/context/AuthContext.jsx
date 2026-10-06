import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axiosInstance.js';

const AuthContext = createContext(null);

function persistSession(data, setUser) {
  localStorage.setItem('pk_token', data.token);
  localStorage.setItem('pk_user', JSON.stringify(data.user));
  setUser(data.user);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('pk_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('pk_token');
    if (token && !user) {
      setLoading(true);
      api
        .get('/auth/me')
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('pk_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          localStorage.removeItem('pk_token');
          localStorage.removeItem('pk_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Returns { needsVerification, email } if the server requires an OTP step;
   * otherwise persists the session and returns the user.
   */
  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      persistSession(data, setUser);
      return { user: data.user };
    } catch (err) {
      const body = err?.response?.data;
      if (err?.response?.status === 403 && body?.needsVerification) {
        return { needsVerification: true, email: body.email, message: body.message };
      }
      throw err;
    }
  };

  // `register` was removed along with public sign-up: the endpoint now returns
  // 403, and accounts are created by an administrator. Keeping a dead method on
  // the context would invite someone to wire a button back up to a 403.

  const verifyOtp = async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    persistSession(data, setUser);
    return data.user;
  };

  const resendOtp = async (email) => {
    const { data } = await api.post('/auth/resend-otp', { email });
    return data;
  };

  const logout = () => {
    localStorage.removeItem('pk_token');
    localStorage.removeItem('pk_user');
    setUser(null);
  };

  /**
   * Merge fresh fields into the cached user (and the persisted copy).
   * Used after /analyze succeeds so the new dictation count surfaces in the
   * Analyzer UI without needing a full /auth/me refetch.
   */
  const updateUser = (patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try { localStorage.setItem('pk_user', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, verifyOtp, resendOtp, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
