import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ShieldCheck, Loader2, RefreshCw, ArrowLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import { errorMessage } from '../api/axiosInstance.js';

const OTP_LENGTH = 6;

export default function VerifyEmail() {
  const { verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pulled from navigation state when redirected here from Register or Login.
  const email = location.state?.email || '';
  const initialTtl = Number(location.state?.otpTtlMinutes) || 10;

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Countdown to next allowed resend. Set after each successful resend.
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputsRef = useRef([]);

  // If user lands here without an email in state, push them back to register.
  useEffect(() => {
    if (!email) {
      toast.error('No email to verify. Please register first.');
      navigate('/register', { replace: true });
    }
  }, [email, navigate]);

  // Focus the first input on mount.
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Tick the resend cooldown.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const otp = useMemo(() => digits.join(''), [digits]);
  const complete = otp.length === OTP_LENGTH && /^\d{6}$/.test(otp);

  const setDigit = (idx, value) => {
    const ch = String(value).replace(/\D/g, '').slice(-1); // last digit typed
    setDigits((arr) => {
      const next = arr.slice();
      next[idx] = ch;
      return next;
    });
    if (ch && idx < OTP_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
      inputsRef.current[idx + 1]?.focus();
    } else if (e.key === 'Enter' && complete) {
      onSubmit();
    }
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const onSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!complete || submitting) return;
    try {
      setSubmitting(true);
      await verifyOtp(email, otp);
      toast.success('Email verified — welcome!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Verification failed.'));
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (resending || resendCooldown > 0) return;
    try {
      setResending(true);
      const data = await resendOtp(email);
      toast.success(data?.message || 'A new code was sent.');
      setResendCooldown(30);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not resend the code.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex relative items-center justify-center bg-panel text-panel-fg overflow-hidden">
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative max-w-md p-10"
        >
          <Logo size="lg" />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-panel-fg text-balance">
            One last step — verify your email.
          </h2>
          <p className="mt-3 text-panel-soft/70 leading-relaxed">
            We sent a 6-digit code to your inbox. Enter it on the right to
            unlock your dashboard and start scoring prompts.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              { Icon: ShieldCheck, label: 'Confirms you own the email address.' },
              { Icon: Mail,        label: 'Lets us send you nothing but receipts you ask for.' },
              { Icon: Sparkles,    label: 'Takes 10 seconds — then you’re in.' },
            ].map((t, i) => (
              <motion.li
                key={t.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 w-7 h-7 rounded-lg bg-surface-sunken text-ink flex items-center justify-center">
                  <t.Icon className="w-4 h-4" />
                </span>
                <span className="text-panel-fg/90">{t.label}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10 bg-surface/40">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="card p-8">
            <Link
              to="/register"
              className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
            <div className="mt-2 flex items-center gap-2 text-ink-soft">
              <ShieldCheck className="w-4 h-4 text-brand-text" />
              <span className="text-xs uppercase tracking-[0.18em] font-semibold">Verify email</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Enter your code</h1>
            <p className="text-sm text-brand-text mt-1">
              We sent a {OTP_LENGTH}-digit code to{' '}
              <span className="font-semibold text-ink break-all">{email}</span>.
              It expires in {initialTtl} minutes.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
              <div className="flex items-center justify-between gap-2" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={1}
                    aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                    className="w-12 h-14 text-center text-2xl font-bold tabular-nums rounded-xl border border-line-strong bg-surface text-ink focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/40 transition-all"
                  />
                ))}
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={!complete || submitting}
                className="btn-primary w-full py-2.5"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin-slow" /> Verifying…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Verify &amp; continue</>
                )}
              </motion.button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <span className="text-brand-text">Didn&apos;t get the code?</span>
              <button
                type="button"
                onClick={onResend}
                disabled={resending || resendCooldown > 0}
                className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand-text transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin-slow" /> Sending…</>
                ) : resendCooldown > 0 ? (
                  <><RefreshCw className="w-3.5 h-3.5" /> Resend in {resendCooldown}s</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /> Resend code</>
                )}
              </button>
            </div>

            <p className="mt-6 text-[11px] text-brand-text">
              Wrong email?{' '}
              <Link to="/register" className="font-semibold text-ink underline-offset-4 hover:underline">
                Go back and re-register
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
