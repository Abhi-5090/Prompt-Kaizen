import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import {
  Trophy, Calendar, Clock, Inbox, CheckCircle2, ChevronRight, Sparkles,
  Layers, TrendingDown, BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';

export default function Contests() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contests')
      .then((res) => setContests(res.data.contests || []))
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load contests.'))
      .finally(() => setLoading(false));
  }, []);

  const live      = contests.filter((c) => c.live);
  const upcoming  = contests.filter((c) => c.upcoming);
  const past      = contests.filter((c) => c.past);

  const stats = useMemo(() => computeStats(contests), [contests]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Trophy className="w-3.5 h-3.5" /> Contests</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Your contests</h1>
          <p className="text-brand-text text-sm">
            Tests you've been invited to. Live contests can be taken today (IST).
          </p>
        </div>
        <Link to="/contests/leaderboard" className="btn-primary">
          <Trophy className="w-4 h-4" /> Leaderboard
        </Link>
      </motion.div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface/60" />
          ))}
        </div>
      ) : contests.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
            <Inbox className="w-6 h-6" />
          </div>
          <p className="mt-3 font-semibold text-ink">No contests assigned</p>
          <p className="text-sm text-brand-text mt-1">
            You'll see contests here once an admin adds your email to one.
          </p>
        </div>
      ) : (
        <>
          <StatsStrip stats={stats} />
          <Section title="Live today" Icon={Sparkles} items={live} live />
          <Section title="Upcoming" Icon={Calendar} items={upcoming} />
          <Section title="Past contests" Icon={Trophy} items={past} muted />
        </>
      )}
    </div>
  );
}

/* -------------------------------- Stats strip -------------------------------- */

function computeStats(contests) {
  const submitted = contests.filter((c) => c.mySubmission?.status === 'submitted');
  const scores = submitted.map((c) => c.mySubmission.averageScore || 0);
  const has = scores.length > 0;
  return {
    assigned: contests.length,
    attended: submitted.length,
    highest: has ? Math.max(...scores) : 0,
    lowest:  has ? Math.min(...scores) : 0,
    average: has ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
  };
}

function StatsStrip({ stats }) {
  const items = [
    { label: 'Assigned Contest', value: stats.assigned, Icon: Layers,        variant: 'light' },
    { label: 'Attended Contest', value: stats.attended, Icon: CheckCircle2,  variant: 'flame',  hint: `of ${stats.assigned}` },
    { label: 'Highest Score',    value: stats.highest,  suffix: '/100', Icon: Trophy,        variant: 'cream' },
    { label: 'Lowest Score',     value: stats.lowest,   suffix: '/100', Icon: TrendingDown,  variant: 'light' },
    { label: 'Average Score',    value: stats.average,  suffix: '/100', Icon: BarChart3,     variant: 'light',
      hint: stats.attended > 0 ? `Across ${stats.attended} ${stats.attended === 1 ? 'contest' : 'contests'}` : 'No data yet' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map((it, i) => (
        // The 5th item spans the trailing empty cell of the 2-col grid below lg
        // so the row doesn't leave a blank slot at tablet/mobile widths.
        <div key={it.label} className={i === 4 ? 'col-span-2 lg:col-span-1' : ''}>
          <StatTile {...it} delay={i * 0.04} />
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, suffix, hint, Icon, variant = 'light', delay = 0 }) {
  // Same rule as ScoreCard: value dark, /100 suffix orange, icon orange.
  const cardClasses = {
    light: 'bg-surface border-line text-ink',
    flame: 'bg-panel border-panel text-panel-fg',
    cream: 'bg-surface-sunken border-line text-ink',
  }[variant];
  const labelClr  = variant === 'flame' ? 'text-panel-soft' : 'text-ink-muted';
  const suffixClr = variant === 'flame' ? 'text-panel-soft' : 'text-brand-text';
  const iconBox   = 'bg-brand text-brand-fg';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className={`rounded-2xl border shadow-soft p-3.5 transition-shadow hover:shadow-[0_18px_50px_-18px_rgba(33,37,41,0.25)] ${cardClasses}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[10px] uppercase tracking-[0.16em] font-semibold ${labelClr} truncate`}>
          {label}
        </p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBox}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight leading-none">
        {value}
        {suffix ? <span className={`ml-1 text-sm font-semibold ${suffixClr}`}>{suffix}</span> : null}
      </p>
      {hint ? <p className={`mt-1.5 text-[10px] ${suffixClr} truncate`}>{hint}</p> : null}
    </motion.div>
  );
}

function Section({ title, Icon, items, live, muted }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="stat-icon"><Icon className="w-5 h-5" /></span>
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="badge-cream ml-auto">{items.length}</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {items.map((c, i) => <ContestCard key={c._id} c={c} live={live} muted={muted} delay={i * 0.04} />)}
      </div>
    </div>
  );
}

function ContestCard({ c, live, muted, delay }) {
  const dateStr = new Date(c.scheduledDate).toLocaleDateString(undefined, {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const windowStr = c.startsAt && c.endsAt
    ? `${new Date(c.startsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} – ${new Date(c.endsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST`
    : null;
  const isSubmitted = c.mySubmission?.status === 'submitted';
  const dark = live || muted;

  const cardClass = live
    ? 'bg-brand text-brand-fg border-brand shadow-[0_18px_40px_-18px_rgb(var(--brand)/0.5)]'
    : muted
      ? 'bg-panel text-panel-fg border-panel'
      : 'bg-surface border-line';

  const statusBadge = live
    ? 'bg-surface text-brand-text'
    : muted
      ? 'bg-surface text-ink'
      : 'bg-surface-sunken text-ink border border-line';

  const leaderboardPill = dark
    ? 'bg-panel-fg/10 border border-panel-fg/30 text-brand-fg hover:bg-panel-fg/20'
    : 'bg-surface-sunken border border-line text-ink hover:bg-surface-sunken';

  const secondaryText = dark ? 'text-brand-fg/80' : 'text-brand-text';
  const titleText     = dark ? 'text-brand-fg' : 'text-ink';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className={`rounded-2xl border shadow-soft p-5 transition-shadow ${cardClass}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className={`badge ${statusBadge}`}>
          {live ? 'Live today' : muted ? 'Past' : 'Upcoming'}
        </span>
        {isSubmitted && (
          <span className="badge bg-surface text-brand-text">
            <CheckCircle2 className="w-3 h-3" /> Submitted
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <h4 className={`font-semibold ${titleText} text-lg flex-1 min-w-0`}>
          {c.title}
        </h4>
        <Link
          to={`/contests/${c._id}/leaderboard`}
          onClick={(e) => e.stopPropagation()}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${leaderboardPill}`}
          title="View this contest's leaderboard"
        >
          <Trophy className="w-3 h-3" /> Leaderboard
        </Link>
      </div>
      {c.description ? (
        <p className={`text-sm mt-1 ${secondaryText} line-clamp-2`}>
          {c.description}
        </p>
      ) : null}
      <div className={`mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs ${secondaryText} font-semibold uppercase tracking-wider`}>
        <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {dateStr}</span>
        {windowStr ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock className="w-3.5 h-3.5" /> {windowStr}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {c.durationMinutes} min</span>
        )}
        <span className="inline-flex items-center gap-1.5">{c.scenariosCount} scenarios</span>
        {isSubmitted && (
          <span className={`inline-flex items-center gap-1.5 font-bold ${titleText}`}>
            <Trophy className="w-3.5 h-3.5" /> {c.mySubmission.averageScore}/100
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end">
        {live && !isSubmitted ? (
          <Link to={`/contests/${c._id}`} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold bg-surface text-brand-text hover:bg-surface-sunken transition">
            Take contest <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <Link
            to={`/contests/${c._id}`}
            className={
              dark
                ? 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold bg-transparent border border-white/30 text-brand-fg hover:bg-surface/10 transition'
                : 'btn-ghost text-sm'
            }
          >
            View details <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
