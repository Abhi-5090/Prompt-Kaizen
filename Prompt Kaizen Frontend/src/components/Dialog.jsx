import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

/**
 * In-app modal replacement for native `window.confirm` / `window.prompt`.
 *
 * Native dialogs are unreliable in embedded webviews / kiosk browsers
 * (silently auto-dismiss after the second one within a window, can be
 * disabled by the user, can't be styled). They also block the JS thread.
 *
 * Wrap the app in <DialogProvider> and pull the helpers via:
 *   const dialog = useDialog();
 *   const ok = await dialog.confirm({ title, message, destructive });
 *   const value = await dialog.prompt({ title, message, placeholder, validate });
 *
 * Both helpers return a promise that resolves with the result (boolean or
 * string) or null on cancel / Escape / backdrop click.
 */
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  // Stack of pending dialogs. Most flows only ever show one, but the array
  // lets a dialog open another without losing context.
  const [stack, setStack] = useState([]);

  const open = useCallback((descriptor) => {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      setStack((s) => [...s, { ...descriptor, id, resolve }]);
    });
  }, []);

  const close = useCallback((id, result) => {
    setStack((s) => {
      const found = s.find((d) => d.id === id);
      if (found) found.resolve(result);
      return s.filter((d) => d.id !== id);
    });
  }, []);

  const confirm = useCallback(
    ({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false }) =>
      open({ kind: 'confirm', title, message, confirmLabel, cancelLabel, destructive }),
    [open]
  );

  const prompt = useCallback(
    ({
      title = 'Enter a value',
      message = '',
      placeholder = '',
      initialValue = '',
      confirmLabel = 'Save',
      cancelLabel = 'Cancel',
      type = 'text',
      validate,
    }) =>
      open({
        kind: 'prompt', title, message, placeholder, initialValue,
        confirmLabel, cancelLabel, type, validate,
      }),
    [open]
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <AnimatePresence>
        {stack.map((d) => (
          <DialogShell key={d.id} descriptor={d} onClose={(result) => close(d.id, result)} />
        ))}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within <DialogProvider>');
  return ctx;
}

function DialogShell({ descriptor, onClose }) {
  const { kind } = descriptor;
  const [value, setValue] = useState(descriptor.initialValue || '');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(null);

  // Autofocus the input (prompt) or the cancel button (confirm) on mount so
  // keyboard users immediately have a sensible target.
  useEffect(() => {
    const t = setTimeout(() => {
      if (kind === 'prompt') inputRef.current?.focus();
      else cancelRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [kind]);

  // Escape cancels.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (kind === 'confirm') return onClose(true);
    const trimmed = String(value);
    if (descriptor.validate) {
      const err = descriptor.validate(trimmed);
      if (err) { setError(err); return; }
    }
    onClose(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog" aria-modal="true" aria-labelledby={`dlg-title-${descriptor.id}`}
    >
      <div
        className="absolute inset-0 bg-panel/60 backdrop-blur-sm"
        onClick={() => onClose(null)}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative w-full max-w-md card p-5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && kind === 'prompt') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <button
          onClick={() => onClose(null)}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-brand-text hover:bg-surface-sunken flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          {descriptor.destructive && (
            <span className="w-9 h-9 rounded-xl bg-brand text-brand-fg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0 flex-1 pr-6">
            <h2 id={`dlg-title-${descriptor.id}`} className="text-lg font-bold text-ink">
              {descriptor.title}
            </h2>
            {descriptor.message && (
              <p className="mt-1 text-sm text-brand-text whitespace-pre-wrap">{descriptor.message}</p>
            )}
          </div>
        </div>

        {kind === 'prompt' && (
          <div className="mt-4">
            <input
              ref={inputRef}
              type={descriptor.type || 'text'}
              value={value}
              onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
              placeholder={descriptor.placeholder}
              className="input"
            />
            {error && <p className="mt-1.5 text-xs text-ink-soft">{error}</p>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => onClose(null)}
            className="btn-ghost text-sm"
          >
            {descriptor.cancelLabel}
          </button>
          <button
            onClick={submit}
            className={descriptor.destructive ? 'btn-primary text-sm bg-panel hover:bg-panel focus:ring-ink/40' : 'btn-primary text-sm'}
          >
            {descriptor.confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
