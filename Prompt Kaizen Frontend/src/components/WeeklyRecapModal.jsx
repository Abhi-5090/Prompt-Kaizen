import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Trophy, Flame, TrendingUp, TrendingDown, Layers, ChevronRight, Calendar } from 'lucide-react';
import api from '../api/axiosInstance.js';

const STORAGE_KEY = 'pk_weekly_recap_week';

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Auto-shown once per ISO week on Mondays (UTC). Dismissal is sticky for the
 * remainder of that week. Users can still re-open from any "View this week"
 * trigger if/when we add one.
 */
export default function WeeklyRecapModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1;
    if (!isMonday) return;
    const seenKey = localStorage.getItem(STORAGE_KEY);
    const thisWeek = isoWeekKey(now);
    if (seenKey === thisWeek) return;

    api.get('/dashboard/weekly-recap').then((res) => {
      if ((res.data?.total || 0) === 0) {
        // Nothing happened in the last week — don't surface an empty modal.
        localStorage.setItem(STORAGE_KEY, thisWeek);
        return;
      }
      setData(res.data);
      setOpen(true);
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, isoWeekKey(new Date()));
  };

  // AnimatePresence has to render unconditionally so it can detect the
  // child's removal and play the exit transition. Putting the `open && data`
  // guard inside (instead of `return null` outside) lets the modal fade out
  // when dismissed instead of popping out instantly.
  return (
    <AnimatePresence>
      {open && data && (
      <motion.div
        key="weekly-recap"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
      >
        <div
          className="absolute inset-0 bg-panel/70 backdrop-blur-sm"
          onClick={dismiss}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="relative w-full max-w-lg rounded-3xl bg-panel text-panel-fg shadow-soft overflow-hidden"
        >
          <div className="absolute inset-0 bg-mesh opacity-30" />
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <button
            onClick={dismiss}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-panel/80 text-panel-soft flex items-center justify-center hover:bg-panel transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative p-7">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-panel-soft" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-panel-soft/80 font-semibold">
                Your Week, Wrapped
              </span>
            </div>
            <h2 className="mt-2 text-3xl font-bold text-panel-fg text-balance">
              {data.total} {data.total === 1 ? 'prompt' : 'prompts'} · {data.activeDays} active {data.activeDays === 1 ? 'day' : 'days'}
            </h2>
            <p className="text-panel-soft/75 mt-1.5 text-sm">Here's your last 7 days at a glance.</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <RecapStat Icon={Trophy}    label="Best score"  value={`${data.best}`}   sub="/ 100" />
              <RecapStat Icon={TrendingUp} label="Average"    value={`${data.average}`} sub="/ 100" />
              <RecapStat
                Icon={data.improvement >= 0 ? TrendingUp : TrendingDown}
                label="Trend"
                value={`${data.improvement >= 0 ? '+' : ''}${data.improvement}`}
                sub="pts"
              />
              <RecapStat Icon={Flame}    label="Streak"     value={`${data.currentStreak}`} sub={data.currentStreak === 1 ? 'day' : 'days'} />
            </div>

            {data.topCategory && (
              <div className="mt-4 flex items-center gap-2 text-sm text-panel-fg">
                <Layers className="w-4 h-4 text-panel-soft" />
                <span>
                  Most explored: <span className="font-semibold">{data.topCategory}</span>
                </span>
              </div>
            )}

            {data.topPrompt && (
              <Link
                to={`/prompts/${data.topPrompt._id}`}
                onClick={dismiss}
                className="mt-5 block rounded-xl bg-panel/70 border border-line/20 p-4 hover:bg-panel transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-panel-soft/80 font-semibold">
                      Star prompt of the week
                    </p>
                    <p className="mt-1 text-sm text-panel-fg truncate">{data.topPrompt.scenario}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="font-bold text-panel-fg text-lg">{data.topPrompt.overallScore}</span>
                    <ChevronRight className="w-4 h-4 text-panel-soft" />
                  </div>
                </div>
              </Link>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={dismiss} className="btn bg-transparent border border-line/30 text-panel-fg hover:bg-surface-sunken/10">
                Maybe later
              </button>
              <Link to="/analyze" onClick={dismiss} className="btn-cream">
                <Calendar className="w-4 h-4" /> Start the new week
              </Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

function RecapStat({ Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-panel/60 border border-line/20 p-3.5">
      <div className="flex items-center gap-2 text-panel-soft/80">
        <Icon className="w-4 h-4" />
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-panel-fg">
        {value} <span className="text-sm font-medium text-panel-soft/60">{sub}</span>
      </p>
    </div>
  );
}
