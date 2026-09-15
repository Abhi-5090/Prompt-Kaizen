import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { PARAMETER_KEYS, heatmapClass, normalizeToTen } from '../utils/scoreUtils.js';

export default function Heatmap({ scores, normalized, title = 'Parameter Heatmap' }) {
  const cells = PARAMETER_KEYS.map((p) => {
    const raw = scores ? scores[p.key] ?? 0 : null;
    const value = normalized ? normalized[p.key] ?? 0 : normalizeToTen(raw, p.max);
    return { ...p, value };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="stat-icon"><Activity className="w-5 h-5" /></span>
          <h3 className="font-semibold text-ink">{title}</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-brand-text">
          <LegendDot className="bg-brand" label="Strong (≥ 8)" />
          <LegendDot className="bg-surface-sunken ring-1 ring-line" label="Okay (5–7)" />
          <LegendDot className="bg-panel" label="Weak (< 5)" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {cells.map((c, idx) => (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: idx * 0.04, ease: 'easeOut' }}
            whileHover={{ y: -2 }}
            className={`rounded-xl px-3 py-3 flex flex-col items-center justify-center transition-shadow hover:shadow-soft ${heatmapClass(c.value)}`}
            title={`${c.label}: ${c.value}/10`}
          >
            <span className="text-[10px] uppercase tracking-wider opacity-80">{c.label}</span>
            <span className="text-xl font-bold mt-1">{c.value}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
