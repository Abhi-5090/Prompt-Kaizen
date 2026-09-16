import { useState, useId } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, LogIn, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import { errorMessage } from '../api/axiosInstance.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Please fill in all fields.');
    try {
      setSubmitting(true);
      await login(form.email.trim(), form.password);
      toast.success('Signed in.');
      const to = location.state?.from?.pathname || '/';
      navigate(to, { replace: true });
    } catch (err) {
      toast.error(err?.code === 'NOT_ADMIN'
        ? 'This account does not have admin privileges.'
        : errorMessage(err, 'Login failed.'));
    } finally {
      setSubmitting(false);
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
            Operator console for the Prompt Kaizen platform.
          </h2>
          <p className="mt-3 text-panel-soft/75 leading-relaxed">
            Inspect users, audit prompt evaluations, and watch platform-wide health from one place.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              { Icon: ShieldCheck, label: 'Admin-only — non-admin accounts are rejected.' },
              { Icon: KeyRound, label: 'Isolated session, separate from the user app.' },
              { Icon: LogIn, label: 'Sign in once and stay until you log out.' },
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
      <div className="flex items-center justify-center px-4 py-10 bg-surface">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="card p-8">
            <div className="flex items-center gap-2 text-ink-soft">
              <ShieldCheck className="w-4 h-4 text-ink-muted" />
              <span className="text-xs uppercase tracking-[0.18em] font-semibold">Admin sign-in</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Welcome, operator</h1>
            <p className="text-sm text-brand-text mt-1">Restricted access. Admins only.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field
                label="Admin ID or Email"
                icon={Mail}
                name="email"
                type="text"
                value={form.email}
                onChange={onChange}
                placeholder="Admin"
                autoComplete="username"
              />
              <Field
                label="Password"
                icon={Lock}
                name="password"
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={onChange}
                placeholder="••••••••"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="text-brand-text hover:text-ink transition"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin-slow" /> Signing in...</>
                ) : (
                  <><LogIn className="w-4 h-4" /> Sign in</>
                )}
              </motion.button>
            </form>

            <p className="mt-6 text-xs text-brand-text text-center">
              No admin account? Ask the backend operator to run{' '}
              <code className="bg-surface-sunken text-ink-soft rounded px-1.5 py-0.5">npm run seed:admin</code>.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, id, icon: Icon, trailing, ...inputProps }) {
  // Associates the visible label with its input; previously the label was
  // decorative only and screen readers announced an unlabelled field.
  const generated = useId();
  const inputId = id || `${generated}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={inputId}>{label}</label>
      <div className="relative">
        {Icon ? <Icon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" /> : null}
        <input id={inputId} {...inputProps} className={`input ${Icon ? 'pl-9' : ''} ${trailing ? 'pr-9' : ''}`} />
        {trailing ? <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span> : null}
      </div>
    </div>
  );
}
