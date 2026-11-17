import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, AlertTriangle, KeyRound, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

const MIN_LENGTH = 8;

/**
 * Second half of the password reset:
 *   /reset-password?email=<address>
 *
 * The user arrives here from the request page carrying only their address;
 * the 6-digit code comes out of their inbox and is typed in below. The code
 * is single-use, expires server-side and allows a handful of wrong guesses
 * before it is discarded, so this screen collects it and reports whatever
 * the server decides rather than validating it locally.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  // Prefilled from the request page; still editable, because a user who
  // opens the emailed code on a different device has no query string.
  const emailParam = params.get('email') || '';

  const [form, setForm] = useState({
    email: emailParam,
    otp: '',
    password: '',
    confirmPassword: '',
  });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    // Codes get pasted out of mail clients with stray spaces, and some
    // clients helpfully format them as "418 209". Keep only the digits so a
    // correct code is not rejected over whitespace.
    setForm((f) => ({ ...f, [name]: name === 'otp' ? value.replace(/\D/g, '').slice(0, 6) : value }));
  };

  const tooShort = form.password.length > 0 && form.password.length < MIN_LENGTH;
  const mismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) {
      return toast.error('Please enter your email address.');
    }
    if (form.otp.length !== 6) {
      return toast.error('Enter the 6-digit code from your email.');
    }
    if (form.password.length < MIN_LENGTH) {
      return toast.error(`Password must be at least ${MIN_LENGTH} characters.`);
    }
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match.');
    }
    try {
      setSubmitting(true);
      const { data } = await api.post('/auth/reset-password', {
        email: form.email.trim(),
        otp: form.otp,
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
      bullets={['Minimum 8 characters', 'Cannot reuse your current password', 'The code works only once']}
    >
      <form onSubmit={onSubmit} className="card p-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Set a new password</h1>
        <p className="mt-1.5 text-sm text-brand-text">
          Enter the 6-digit code we emailed you, then choose a new password.
        </p>

        {!emailParam && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-surface-sunken p-3">
            <AlertTriangle className="w-4 h-4 text-brand-text mt-0.5 shrink-0" />
            <p className="text-xs text-ink-soft leading-relaxed">
              Haven't requested a code yet? Get one from the
              {' '}<Link to="/forgot-password" className="font-semibold text-ink underline">forgot password</Link> page.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className="label">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={onChange}
                className="input pl-9"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="otp" className="label">Reset code</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="otp"
                name="otp"
                // `inputMode` + `autoComplete="one-time-code"` let phones
                // offer the code straight from the notification instead of
                // making the user switch to their mail app and back.
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus={Boolean(emailParam)}
                value={form.otp}
                onChange={onChange}
                className="input pl-9 tracking-[0.4em] font-mono"
                placeholder="000000"
              />
            </div>
          </div>

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
          disabled={submitting || tooShort || mismatch || !form.password || form.otp.length !== 6}
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
