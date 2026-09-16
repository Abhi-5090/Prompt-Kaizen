import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, Layers, Compass, Award, Trophy, Crown,
  ShieldCheck, Medal, Flame, Star, Calendar, Zap, Lock,
} from 'lucide-react';
import api, { errorMessage } from '../api/axiosInstance.js';

// Map server `icon` strings to actual lucide components.
const ICON_MAP = {
  Sparkles, Layers, Compass, Award, Trophy, Crown,
  ShieldCheck, Medal, Flame, Star, Calendar, Zap,
};

const TIER_STYLES = {
  bronze: 'from-surface-sunken to-surface-sunken',
  silver: 'from-surface-sunken to-line',
  gold:   'from-line to-line',
};

export default function BadgesPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/badges')
      .then((res) => setData(res.data))
      .catch((e) => setError(errorMessage(err, 'Failed to load badges.')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonPanel />;
  if (error)   return null; // silent fail — badges are secondary

  const { badges = [], earned = 0, total = 0 } = data || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="stat-icon"><Trophy className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink truncate">Badges</h3>
            <p className="text-xs text-brand-text mt-0.5">Unlocked through your prompting milestones</p>
          </div>
        </div>
        <span className="badge-cream">{earned} / {total}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {badges.map((b, i) => (
          <BadgeTile key={b.id} badge={b} delay={i * 0.03} />
        ))}
      </div>
    </motion.div>
  );
}

function BadgeTile({ badge, delay }) {
  const Icon = ICON_MAP[badge.icon] || Sparkles;
  const tierGrad = TIER_STYLES[badge.tier] || TIER_STYLES.bronze;
  const pct = Math.min(100, Math.round((badge.progress.current / badge.progress.target) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -2 }}
      className={`group relative rounded-2xl p-4 transition-all duration-200 ${
        badge.unlocked
          ? 'bg-surface border border-line shadow-soft'
          : 'bg-surface/60 border border-line'
      }`}
      title={badge.description}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            badge.unlocked
              ? `bg-gradient-to-br ${tierGrad} text-ink`
              : 'bg-surface border border-line text-ink-faint'
          }`}
        >
          {badge.unlocked
            ? <Icon className="w-5 h-5" strokeWidth={2.2} />
            : <Lock className="w-4 h-4" strokeWidth={2.2} />}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${badge.unlocked ? 'text-ink' : 'text-brand-text'}`}>
            {badge.name}
          </p>
          <p className="text-[11px] text-brand-text mt-0.5 leading-snug line-clamp-2">
            {badge.description}
          </p>
        </div>
      </div>

      {!badge.unlocked && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-surface overflow-hidden border border-line">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: delay + 0.15, ease: 'easeOut' }}
              className="h-full bg-surface-sunken"
            />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-brand-text mt-1.5 font-semibold">
            {badge.progress.current} / {badge.progress.target}
          </p>
        </div>
      )}

      {badge.unlocked && (
        <p className="mt-3 text-[10px] uppercase tracking-wider font-semibold text-ink-soft">
          ✓ Unlocked · {badge.tier}
        </p>
      )}
    </motion.div>
  );
}

function SkeletonPanel() {
  return (
    <div className="card p-5">
      <div className="h-5 w-32 bg-surface-sunken rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface/60 shimmer-bg animate-shimmer" />
        ))}
      </div>
    </div>
  );
}
