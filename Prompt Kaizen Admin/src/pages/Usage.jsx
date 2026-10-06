import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, ChevronLeft, ChevronRight, Loader2, Users as UsersIcon,
  Inbox, CalendarDays, Trophy, Sparkles, Clock,
} from 'lucide-react';
import api, { errorMessage } from '../api/axiosInstance.js';
import { ratingBadgeClass } from '../utils/scoreUtils.js';

const IST = 'Asia/Kolkata';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Today in IST as YYYY-MM-DD, regardless of where the browser is. */
function istToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * The grid for a month, padded so the 1st lands under the right weekday.
 * Weeks start Monday, which is how the rest of the product reads dates.
 */
function monthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay(): 0=Sun. Shift so Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit' });

const fmtLongDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

export default function Usage() {
  const [month, setMonth] = useState(() => istToday().slice(0, 7));
  const [selected, setSelected] = useState(() => istToday());
  const [calendar, setCalendar] = useState(null);
  const [day, setDay] = useState(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [error, setError] = useState('');

  const loadCalendar = useCallback(async () => {
    setLoadingCal(true); setError('');
    try {
      const { data } = await api.get('/admin/usage/calendar', { params: { month } });
      setCalendar(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the usage calendar.'));
    } finally { setLoadingCal(false); }
  }, [month]);

  const loadDay = useCallback(async () => {
    setLoadingDay(true);
    try {
      const { data } = await api.get('/admin/usage/day', { params: { date: selected } });
      setDay(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load that day.'));
    } finally { setLoadingDay(false); }
  }, [selected]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  useEffect(() => { loadDay(); }, [loadDay]);

  // date -> metrics, so a cell lookup is O(1) while rendering the grid.
  const byDate = useMemo(() => {
    const m = new Map();
    (calendar?.days || []).forEach((d) => m.set(d.date, d));
    return m;
  }, [calendar]);

  // Busiest day in view sets the top of the scale, so the heat is relative to
  // the month being looked at rather than an arbitrary fixed ceiling.
  const peak = useMemo(
    () => Math.max(1, ...(calendar?.days || []).map((d) => d.prompts)),
    [calendar]
  );

  const heatClass = (count) => {
    if (!count) return 'bg-surface-sunken text-ink-faint';
    const ratio = count / peak;
    if (ratio > 0.66) return 'bg-brand text-brand-fg font-semibold';
    if (ratio > 0.33) return 'bg-brand/60 text-brand-fg font-semibold';
    return 'bg-brand/25 text-ink';
  };

  const cells = useMemo(() => monthGrid(month), [month]);
  const today = istToday();

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Activity className="w-3.5 h-3.5" /> Usage audit</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Activity by day</h1>
          <p className="text-ink-muted text-sm">
            Every request, bucketed by IST calendar day. Pick a date to see who did what.
          </p>
        </div>
      </motion.div>

      {error && <p className="card p-4 text-sm text-ink-soft" role="alert">{error}</p>}

      {/* Month summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Prompts this month', value: calendar?.totals.prompts ?? 0, Icon: Sparkles },
          { label: 'Active days', value: calendar?.totals.activeDays ?? 0, Icon: CalendarDays },
          { label: 'Contest submissions', value: calendar?.totals.contestSubmissions ?? 0, Icon: Trophy },
          {
            label: 'Busiest day',
            value: calendar?.totals.busiestDay
              ? `${calendar.totals.busiestDay.prompts}`
              : '—',
            hint: calendar?.totals.busiestDay?.date,
            Icon: Activity,
          },
        ].map(({ label, value, hint, Icon }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-2.5">
              <span className="stat-icon"><Icon className="w-5 h-5" /></span>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
                <p className="text-xs text-ink-muted truncate">{hint ? `${label} · ${hint}` : label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        {/* Calendar */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button" className="btn-ghost p-2"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
            ><ChevronLeft className="w-4 h-4" /></button>
            <p className="font-semibold text-ink" aria-live="polite">
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
                timeZone: 'UTC', month: 'long', year: 'numeric',
              })}
            </p>
            <button
              type="button" className="btn-ghost p-2"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
            ><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-[10px] uppercase tracking-wider text-ink-muted text-center py-1">
                {d}
              </div>
            ))}
          </div>

          {loadingCal ? (
            <div className="h-56 flex items-center justify-center text-ink-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Usage calendar">
              {cells.map((date, i) => {
                if (!date) return <div key={`pad-${i}`} aria-hidden="true" />;
                const metrics = byDate.get(date);
                const count = metrics?.prompts || 0;
                const isSelected = date === selected;
                const isToday = date === today;
                const isFuture = date > today;
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={isFuture}
                    onClick={() => setSelected(date)}
                    aria-pressed={isSelected}
                    aria-label={`${fmtLongDate(date)} — ${count} request${count === 1 ? '' : 's'}`}
                    title={`${count} request${count === 1 ? '' : 's'}${metrics ? ` · ${metrics.activeUsers} user(s)` : ''}`}
                    className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center transition-all
                      ${heatClass(count)}
                      ${isSelected ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}
                      ${isToday && !isSelected ? 'ring-1 ring-brand' : ''}
                      ${isFuture ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'}`}
                  >
                    <span className="tabular-nums">{Number(date.slice(-2))}</span>
                    {count > 0 && <span className="text-[9px] opacity-80 tabular-nums">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-[10px] text-ink-muted">
            <span>Less</span>
            <div className="flex items-center gap-1">
              {['bg-surface-sunken', 'bg-brand/25', 'bg-brand/60', 'bg-brand'].map((c) => (
                <span key={c} className={`w-4 h-4 rounded ${c} border border-line`} />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>

        {/* Selected day */}
        <div className="lg:col-span-3 space-y-5">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-bold text-ink">{fmtLongDate(selected)}</h2>
                <p className="text-xs text-ink-muted">All times IST</p>
              </div>
              {loadingDay && <Loader2 className="w-4 h-4 animate-spin-slow text-ink-muted" />}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Requests', day?.summary.totalRequests ?? 0],
                ['Active users', day?.summary.activeUsers ?? 0],
                ['Daily challenges', day?.summary.dailyChallenges ?? 0],
                ['Contest submits', day?.summary.contestSubmissions ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-surface-sunken border border-line p-3">
                  <p className="text-xl font-bold text-ink tabular-nums">{value}</p>
                  <p className="text-[11px] text-ink-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Per-user breakdown */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="stat-icon"><UsersIcon className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">Requests per user</h3>
            </div>
            {!day?.perUser?.length ? (
              <p className="text-sm text-ink-muted py-6 text-center">No activity on this day.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-ink-muted border-b border-line">
                      <th className="py-2 pr-3 font-semibold">User</th>
                      <th className="py-2 px-3 font-semibold text-right">Requests</th>
                      <th className="py-2 px-3 font-semibold text-right">Avg</th>
                      <th className="py-2 px-3 font-semibold text-right">Best</th>
                      <th className="py-2 pl-3 font-semibold">Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.perUser.map((u) => (
                      <tr key={u.userId || u.email} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-ink">{u.name}</p>
                          <p className="text-xs text-ink-muted">{u.email}</p>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-ink">{u.requests}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-ink-soft">{u.avgScore}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-ink-soft">{u.bestScore}</td>
                        <td className="py-2.5 pl-3 text-xs text-ink-muted tabular-nums whitespace-nowrap">
                          {fmtTime(u.firstAt)} – {fmtTime(u.lastAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="stat-icon"><Clock className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">What was submitted</h3>
              {day?.timeline?.length > 0 && (
                <span className="badge-ghost ml-auto">{day.timeline.length} shown</span>
              )}
            </div>
            {!day?.timeline?.length ? (
              <div className="py-8 text-center">
                <Inbox className="w-8 h-8 mx-auto text-ink-faint" />
                <p className="mt-2 text-sm text-ink-muted">Nothing was submitted on this day.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {day.timeline.map((t) => (
                  <li key={t._id} className="py-3 flex items-start gap-3">
                    <span className="text-xs text-ink-muted tabular-nums w-14 shrink-0 pt-0.5">
                      {fmtTime(t.at)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{t.name}</span>
                        <span className="chip">{t.category}</span>
                        {t.isDailyChallenge && <span className="badge-flame">Daily challenge</span>}
                        <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                          {t.scoredBy === 'llm' ? 'AI-scored' : 'rule-scored'}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">{t.scenario}</p>
                    </div>
                    <span className={`${ratingBadgeClass(t.score)} shrink-0`}>{t.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
