import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, Loader2, Copy, Check, KeyRound, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';

/**
 * Grants an email address access to the application.
 *
 * With self-registration closed, this is how accounts come into existence, so
 * the dialog has two jobs: create the account, and reliably hand over the
 * initial password. That password exists in plaintext exactly once — in the
 * response — because the server stores only a bcrypt hash. If it is lost the
 * only remedy is a reset, so the success state is deliberately sticky: it does
 * not auto-dismiss, and it makes copying the credentials the obvious action.
 */
export default function GrantAccessDialog({ open, onClose, onGranted }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'user' });
  const [submitting, setSubmitting] = useState(false);
  const [granted, setGranted] = useState(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    setForm({ name: '', email: '', role: 'user' });
    setGranted(null);
    setCopied(false);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      return toast.error('Name and email are both required.');
    }
    try {
      setSubmitting(true);
      const { data } = await api.post('/admin/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setGranted(data);
      onGranted?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not grant access.'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    const text = `Prompt Kaizen sign-in\nEmail: ${granted.user.email}\nPassword: ${granted.initialPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be denied; the values stay on screen to read.
      toast.error('Could not copy — select the text above instead.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-panel/60 backdrop-blur-sm"
          // Backdrop click closes only the form; once an account exists the
          // password must not be dismissed by a stray click.
          onClick={() => { if (!granted) close(); }}
          role="dialog" aria-modal="true" aria-labelledby="grant-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="card p-6 w-full max-w-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-brand text-brand-fg flex items-center justify-center">
                  {granted ? <ShieldCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </span>
                <h2 id="grant-title" className="font-bold text-ink">
                  {granted ? 'Access granted' : 'Grant access'}
                </h2>
              </div>
              <button type="button" onClick={close} className="btn-ghost p-1.5" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {granted ? (
              <div className="mt-5">
                <p className="text-sm text-ink-soft leading-relaxed">
                  <span className="font-semibold text-ink">{granted.user.email}</span> can now sign in.
                  Send them these credentials.
                </p>

                <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label !mb-0">Email</span>
                    <span className="text-sm font-mono text-ink break-all">{granted.user.email}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label !mb-0">Password</span>
                    <span className="text-base font-mono font-bold text-ink tracking-wide select-all">
                      {granted.initialPassword}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-sunken p-3">
                  <KeyRound className="w-4 h-4 text-brand-text mt-0.5 shrink-0" />
                  <p className="text-xs text-ink-muted leading-relaxed">
                    This password is shown <span className="font-semibold text-ink">once</span> — it is
                    stored only as a hash and cannot be retrieved later. They'll be prompted to
                    change it after signing in. If it's lost, use <em>Reset password</em>.
                  </p>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <button type="button" onClick={copyCredentials} className="btn-primary flex-1">
                    {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy credentials</>}
                  </button>
                  <button type="button" onClick={close} className="btn-ghost">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <p className="text-sm text-ink-muted leading-relaxed">
                  Adding an email address is what grants access — there is no public sign-up.
                  A password is generated and shown to you once.
                </p>

                <div>
                  <label className="label" htmlFor="grant-name">Full name</label>
                  <input
                    id="grant-name" className="input" autoFocus
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Asha Menon"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="grant-email">Email address</label>
                  <input
                    id="grant-email" type="email" className="input"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="asha@example.com"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="grant-role">Role</label>
                  <select
                    id="grant-role" className="input"
                    value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="user">User — can analyze prompts and take contests</option>
                    <option value="admin">Admin — full access to this console</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={close} className="btn-ghost">Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin-slow" /> Granting…</>
                      : <><UserPlus className="w-4 h-4" /> Grant access</>}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
