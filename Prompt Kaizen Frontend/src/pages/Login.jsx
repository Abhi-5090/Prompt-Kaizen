import { useState, useId } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, LogIn, Eye, EyeOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';

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
      const result = await login(form.email.trim(), form.password);
      if (result?.needsVerification) {
        // The server detected this account hasn't verified its email and
        // sent a fresh OTP. Send the user to the verify-email screen.
        toast(result.message || 'Please verify your email — we sent you a new code.');
        navigate('/verify-email', {
          replace: true,
          state: { email: result.email || form.email.trim().toLowerCase() },
        });
        return;
      }
      toast.success('Welcome back!');
      const to = location.state?.from?.pathname || '/dashboard';
      navigate(to, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Left brand panel */}
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
            Welcome back. Let's write your next great prompt.
          </h2>
          <p className="mt-3 text-panel-soft/70 leading-relaxed">
            Pick up where you left off — your dashboard, heatmaps, and prompt history are waiting.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              'Real-world scenarios, scored deterministically',
              'Heatmaps that show what is missing',
              'One-click improved prompt rewrites',
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-[10px] font-bold">✓</span>
                <span className="text-panel-fg/90">{t}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center px-4 py-10 bg-surface/40">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="card p-8">
            <div className="flex items-center gap-2 text-ink-soft">
              <Sparkles className="w-4 h-4 text-panel-soft" />
              <span className="text-xs uppercase tracking-[0.18em] font-semibold">Sign in</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Welcome back</h1>
            <p className="text-sm text-brand-text mt-1">Log in to continue improving your prompts.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field
                label="Email"
                icon={Mail}
                name="email"
                type="email"
                value={form.email}
                onChange={onChange}
                placeholder="you@example.com"
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

              <div className="flex justify-end -mt-1">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-brand-text hover:text-ink transition"
                >
                  Forgot your password?
                </Link>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin-slow" /> Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" /> Log in
                  </>
                )}
              </motion.button>
            </form>

            <p className="mt-6 text-sm text-brand-text text-center">
              New here?{' '}
              <Link to="/register" className="font-semibold text-ink underline-offset-4 hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, trailing, id, ...inputProps }) {
  // The label used to be a plain <label> with no `htmlFor`, and the input had
  // no `id` — so the text was purely visual and a screen reader announced the
  // field as an unlabelled "edit text". useId() generates a collision-free id
  // per instance so the two are properly associated.
  const generated = useId();
  const inputId = id || `${generated}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={inputId}>{label}</label>
      <div className="relative">
        {Icon ? (
          <Icon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        ) : null}
        <input id={inputId} {...inputProps} className={`input ${Icon ? 'pl-9' : ''} ${trailing ? 'pr-9' : ''}`} />
        {trailing ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>
    </div>
  );
}
