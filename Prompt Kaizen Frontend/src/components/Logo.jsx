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
          d="M5 14.5L10 9.5L13 12.5L19 6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="6.5" r="1.8" fill="currentColor" />
        <path
          d="M5 18.5H19"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </motion.div>
  );
}
