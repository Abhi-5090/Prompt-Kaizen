import { motion } from 'framer-motion';

export default function ChartCard({ title, subtitle, Icon, children, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon ? (
            <span className="stat-icon"><Icon className="w-5 h-5" strokeWidth={2} /></span>
          ) : null}
          <div className="min-w-0">
            <h3 className="font-semibold text-ink truncate">{title}</h3>
            {subtitle ? <p className="text-xs text-brand-text mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="h-72">{children}</div>
    </motion.div>
  );
}
