import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

const MIN_LENGTH = 8;

/**
 * Landing page for the emailed reset link:
 *   /reset-password?token=<opaque>&email=<address>
 *
 * The token is single-use and expires server-side; this screen only collects
 * the new password and reports whatever the server decides.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // A link that arrived without its query string cannot work; say so up front
  // rather than after the user has typed a password twice.
  const linkIncomplete = !token || !email;

  useEffect(() => {
    if (linkIncomplete) {
      toast.error('That reset link is incomplete. Please request a new one.');
    }
  }, [linkIncomplete]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const tooShort = form.password.length > 0 && form.password.length < MIN_LENGTH;
  const mismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < MIN_LENGTH) {
      return toast.error(`Password must be at least ${MIN_LENGTH} characters.`);
    }
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match.');
    }
    try {
      setSubmitting(true);
      const { data } = await api.post('/auth/reset-password', {
        email, token,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      // The server issues a fresh token, so the user lands signed in rather
      // than being bounced to a login form immediately after proving identity.
      if (data.token) {
        localStorage.setItem('pk_token', data.token);
        localStorage.setItem('pk_user', JSON.stringify(data.user));
        setUser(data.user);
        toast.success(data.message || 'Password updated.');
        navigate('/dashboard', { replace: true });
        return;
      }
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not reset your password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Once it's set, every other device signed into this account will be signed out."
      bullets={['Minimum 8 characters', 'Cannot reuse your current password', 'This link works only once']}
    >
      <form onSubmit={onSubmit} className="card p-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Set a new password</h1>
        {email && (
          <p className="mt-1.5 text-sm text-brand-text">
            for <span className="font-semibold text-ink">{email}</span>
          </p>
        )}

        {linkIncomplete && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-surface-sunken p-3">
            <AlertTriangle className="w-4 h-4 text-brand-text mt-0.5 shrink-0" />
            <p className="text-xs text-ink-soft leading-relaxed">
              This link is missing information. Request a fresh one from the
              {' '}<Link to="/forgot-password" className="font-semibold text-ink underline">forgot password</Link> page.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="password" className="label">New password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="password"
                name="password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={onChange}
                disabled={linkIncomplete}
                className="input pl-9 pr-10"
                placeholder="At least 8 characters"
                aria-invalid={tooShort || undefined}
                aria-describedby={tooShort ? 'password-hint' : undefined}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {tooShort && (
              <p id="password-hint" className="mt-1 text-xs text-brand-text">
                {MIN_LENGTH - form.password.length} more character{MIN_LENGTH - form.password.length === 1 ? '' : 's'} needed.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="label">Confirm new password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={onChange}
                disabled={linkIncomplete}
                className="input pl-9"
                placeholder="Type it again"
                aria-invalid={mismatch || undefined}
                aria-describedby={mismatch ? 'confirm-hint' : undefined}
              />
            </div>
            {mismatch && (
              <p id="confirm-hint" className="mt-1 text-xs text-brand-text">Passwords do not match.</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full mt-6"
          disabled={submitting || linkIncomplete || tooShort || mismatch || !form.password}
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin-slow" /> Updating…</>
            : <><ShieldCheck className="w-4 h-4" /> Update password</>}
        </button>

        <Link to="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-text hover:text-ink transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
