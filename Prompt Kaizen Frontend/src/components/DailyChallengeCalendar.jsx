import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function istDayKey(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return (
    ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0')
  );
}

function istNowComponents() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
  };
}

/**
 * Ultra-compact streak calendar. Completed IST days are filled with peach and
 * a small flame; today is outlined; everything else is a plain day number.
 * Designed to sit as a slim side rail.
 */
export default function DailyChallengeCalendar({ attempts = [] }) {
  const today = useMemo(istNowComponents, []);
  const [view, setView] = useState({ year: today.year, month: today.month });

  const attemptByDay = useMemo(() => {
    const map = new Map();
    for (const a of attempts) {
      const key = istDayKey(a.challengeDate || a.createdAt);
      if (key) map.set(key, a);
    }
    return map;
  }, [attempts]);

  const { year, month } = view;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key =
      year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const attempt = attemptByDay.get(key);
    const isToday = year === today.year && month === today.month && d === today.day;
    const isFuture =
      year > today.year ||
      (year === today.year && month > today.month) ||
      (year === today.year && month === today.month && d > today.day);
    cells.push({ day: d, key, attempt, isToday, isFuture });
  }

  const stepMonth = (delta) =>
    setView((v) => {
      const total = v.year * 12 + v.month + delta;
      return { year: Math.floor(total / 12), month: total % 12 };
    });

  const monthAttempts = Array.from(attemptByDay.keys()).filter((k) =>
    k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
  ).length;

  const canStepForward =
    view.year < today.year || (view.year === today.year && view.month < today.month);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="card p-3.5"
    >
      {/* Tight single-line header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-6 h-6 rounded-md bg-surface-sunken text-ink flex items-center justify-center shrink-0">
            <CalendarDays className="w-3.5 h-3.5" strokeWidth={2.2} />
          </span>
          <h3 className="font-semibold text-ink text-xs truncate">Streak</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-ink">
          <span className="text-ink">{monthAttempts}</span> / month · <span className="text-ink">{attempts.length}</span> total
        </span>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className="w-5 h-5 rounded-md text-ink hover:bg-surface transition flex items-center justify-center"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <p className="text-[11px] font-semibold text-ink tracking-tight">{monthLabel}</p>
        <button
          type="button"
          onClick={() => canStepForward && stepMonth(1)}
          disabled={!canStepForward}
          className="w-5 h-5 rounded-md text-ink hover:bg-surface transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="Next month"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-[9px] font-semibold text-ink mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center uppercase tracking-wider h-3 leading-3">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.empty) return <div key={c.key} className="h-7" />;
          const base =
            'h-7 rounded-md flex items-center justify-center text-[10px] font-semibold transition relative';
          let classes;
          let content = c.day;
          if (c.attempt) {
            classes = `${base} bg-brand text-brand-fg shadow-soft hover:scale-[1.08]`;
            content = (
              <span className="inline-flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5" strokeWidth={2.6} />
                <span className="text-[9px]">{c.day}</span>
              </span>
            );
          } else if (c.isToday) {
            classes = `${base} bg-surface border-[1.5px] border-panel text-ink`;
          } else if (c.isFuture) {
            classes = `${base} text-ink-faint`;
          } else {
            classes = `${base} text-ink bg-surface/40 hover:bg-surface`;
          }
          return (
            <div
              key={c.key}
              className={classes}
              title={
                c.attempt
                  ? `${c.key} · ${c.attempt.overallScore}/100 · ${c.attempt.rating}`
                  : c.isToday ? `${c.key} · Today` : c.key
              }
            >
              {content}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
