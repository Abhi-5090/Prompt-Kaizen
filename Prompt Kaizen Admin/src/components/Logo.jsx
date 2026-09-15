import { motion } from 'framer-motion';

export default function Logo({ size = 'md' }) {
  const dims = size === 'lg' ? 'w-9 h-9' : 'w-7 h-7';
  return (
    <motion.div
      whileHover={{ rotate: 6, scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      className={`${dims} rounded-xl bg-brand text-brand-fg flex items-center justify-center shadow-soft`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-4/5 h-4/5">
        <path
          d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}
