import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, Send, ArrowLeft, MailCheck, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import AuthShell from '../components/AuthShell.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState(null);
  // The server owns the code's lifetime (RESET_TTL_MINUTES). Echoing what it
  // reports keeps this copy from quietly lying when that value is changed.
  const [ttl, setTtl] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Please enter your email address.');
    try {
      setSubmitting(true);
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      // The server replies identically whether or not the address exists, so
      // this screen must not imply anything either way.
      setSent(true);
      setNotice(data?.delivery?.message || null);
      setTtl(Number(data?.ttlMinutes) || null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the reset code.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Forgotten your password?"
      subtitle="Enter the email on your account and we'll send you a code to choose a new password."
      bullets={['Codes expire quickly', 'Each code works only once', 'All other sessions are signed out']}
    >
      {sent ? (
        <div className="card p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Check your inbox</h1>
          <p className="mt-2 text-sm text-brand-text leading-relaxed">
            If an account exists for <span className="font-semibold text-ink">{email.trim()}</span>,
            a 6-digit reset code is on its way.{ttl ? ` It expires in ${ttl} minutes.` : ''}
          </p>
          {notice && (
            <p className="mt-3 text-xs text-ink-soft bg-surface-sunken border border-line rounded-xl p-3">
              {notice}
            </p>
          )}
          {/* The code is useless without this screen, so carry the address
              across rather than making the user retype it. */}
          <Link
            to={`/reset-password?email=${encodeURIComponent(email.trim())}`}
            className="btn-primary w-full mt-6"
          >
            <KeyRound className="w-4 h-4" /> Enter my code
          </Link>
          <Link to="/login" className="btn-ghost w-full mt-3">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="card p-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Reset your password</h1>
          <p className="mt-1.5 text-sm text-brand-text">We'll email you a 6-digit code.</p>

          <div className="mt-6">
            <label htmlFor="email" className="label">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-9"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full mt-6" disabled={submitting}>
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin-slow" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send reset code</>}
          </button>

          <Link to="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
