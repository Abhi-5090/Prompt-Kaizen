import { motion } from 'framer-motion';
import Logo from './Logo.jsx';

/**
 * Shared split-panel chrome for the unauthenticated screens.
 *
 * Login and Register each carried their own copy of this markup, so the two
 * had already drifted apart. The password-reset screens use it rather than
 * adding a third copy.
 */
export default function AuthShell({ title, subtitle, bullets = [], children }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="hidden lg:flex relative items-center justify-center bg-panel text-panel-fg overflow-hidden">
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
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
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-panel-fg text-balance">{title}</h2>
          {subtitle && <p className="mt-3 text-panel-soft/70 leading-relaxed">{subtitle}</p>}

          {bullets.length > 0 && (
            <ul className="mt-8 space-y-3 text-sm">
              {bullets.map((t, i) => (
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
          )}
        </motion.div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
