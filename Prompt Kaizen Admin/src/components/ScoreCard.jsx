import { motion, useMotionValue, animate, useTransform } from 'framer-motion';
import { useEffect } from 'react';

export default function ScoreCard({ title, value, suffix, hint, Icon, variant = 'light', delay = 0 }) {
  const numeric = typeof value === 'number';
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (latest) =>
    numeric ? (Number.isInteger(value) ? Math.round(latest) : Math.round(latest * 10) / 10) : 0
  );

  useEffect(() => {
    if (!numeric) return;
    const controls = animate(mv, value, { duration: 1.0, ease: 'easeOut', delay });
    return controls.stop;
  }, [value, numeric, delay, mv]);

  // Variants share one rule: value dark for readability, /100 suffix brand
  // orange across all light variants for consistent accent.
  const variants = {
    light: 'bg-surface border-line',
    flame: 'bg-panel text-panel-fg border-panel',
    cream: 'bg-surface-sunken text-ink border-line',
  };
  const titleClr  = variant === 'flame' ? 'text-panel-soft' : 'text-brand-text';
  const valueClr  = variant === 'flame' ? 'text-panel-fg' : 'text-ink';
  const suffixClr = variant === 'flame' ? 'text-panel-soft' : 'text-brand-text';
  const hintClr   = variant === 'flame' ? 'text-panel-soft' : 'text-ink-muted';
  const iconBox   = 'bg-brand text-brand-fg';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className={`rounded-2xl border shadow-soft p-5 transition-shadow hover:shadow-[0_18px_50px_-18px_rgba(33,37,41,0.25)] ${variants[variant]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] uppercase tracking-[0.16em] font-semibold ${titleClr}`}>{title}</p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${valueClr}`}>
            {numeric ? <motion.span>{rounded}</motion.span> : value}
            {suffix ? <span className={`ml-1 text-sm font-semibold ${suffixClr}`}>{suffix}</span> : null}
          </p>
          {hint ? <p className={`text-[11px] mt-1 ${hintClr}`}>{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
            <Icon className="w-5 h-5" strokeWidth={2} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
