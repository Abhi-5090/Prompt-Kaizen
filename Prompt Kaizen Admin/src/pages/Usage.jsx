import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Loader2, Users as UsersIcon, Inbox, CalendarDays,
  Trophy, Sparkles, Clock, X, Flame,
} from 'lucide-react';
import api, { errorMessage } from '../api/axiosInstance.js';
import { scoreBadgeClass } from '../utils/scoreUtils.js';
import UsageCalendar from '../components/UsageCalendar.jsx';
import MiniPager from '../components/MiniPager.jsx';

const IST = 'Asia/Kolkata';

/** Today in IST as YYYY-MM-DD, wherever the browser happens to be. */
const istToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());

const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true });

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  });

/** Initials for the avatar chip. */
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function StatTile({ label, value, hint, Icon, accent }) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
          ${accent ? 'bg-brand text-brand-fg' : 'bg-surface-sunken text-ink'}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-ink tabular-nums leading-none">{value}</p>
          <p className="text-xs text-ink-muted mt-1 truncate">{label}</p>
          {hint && <p className="text-[11px] text-ink-faint mt-0.5 truncate">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Usage() {
  const today = istToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const [calendar, setCalendar] = useState(null);
  const [loadingCal, setLoadingCal] = useState(true);

  const [day, setDay] = useState(null);
  const [userPage, setUserPage] = useState(1);
  const [loadingDay, setLoadingDay] = useState(true);

  const [timeline, setTimeline] = useState(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  // Clicking a person filters the timeline to just their requests. Kept out of
  // the day fetch so selecting someone does not reload the whole panel.
  const [focusUser, setFocusUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingCal(true);
    api.get('/admin/usage/calendar', { params: { month } })
      .then(({ data }) => { if (!cancelled) setCalendar(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load the calendar.')); })
      .finally(() => { if (!cancelled) setLoadingCal(false); });
    return () => { cancelled = true; };
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDay(true);
    api.get('/admin/usage/day', { params: { date: selected, page: userPage, limit: 8 } })
      .then(({ data }) => { if (!cancelled) setDay(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load that day.')); })
      .finally(() => { if (!cancelled) setLoadingDay(false); });
    return () => { cancelled = true; };
  }, [selected, userPage]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTimeline(true);
    api.get('/admin/usage/timeline', {
      params: { date: selected, page: timelinePage, limit: 8, ...(focusUser ? { userId: focusUser.userId } : {}) },
    })
      .then(({ data }) => { if (!cancelled) setTimeline(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load the timeline.')); })
      .finally(() => { if (!cancelled) setLoadingTimeline(false); });
    return () => { cancelled = true; };
  }, [selected, timelinePage, focusUser]);

  // Changing the day or the filter invalidates both page positions; staying on
  // page 3 of a shorter list shows an empty panel.
  const selectDay = useCallback((date) => {
    setSelected(date);
    setUserPage(1);
    setTimelinePage(1);
    setFocusUser(null);
  }, []);

  const totals = calendar?.totals;
  const summary = day?.summary;

  const monthLabel = useMemo(
    () => new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long' }),
    [month]
  );

  return (
    <div className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Activity className="w-3.5 h-3.5" /> Usage audit</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Activity by day</h1>
          <p className="text-ink-muted text-sm">
            Every request, bucketed by IST calendar day. Pick a date to see who did what.
          </p>
        </div>
      </motion.header>

      {error && <p className="card p-4 text-sm text-ink-soft" role="alert">{error}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label={`Prompts in ${monthLabel}`} value={totals?.prompts ?? 0} Icon={Sparkles} accent />
        <StatTile label="Days with activity" value={totals?.activeDays ?? 0} Icon={CalendarDays} />
        <StatTile label="Daily challenges" value={totals?.challenges ?? 0} Icon={Flame} />
        <StatTile
          label="Busiest day"
          value={totals?.busiestDay?.prompts ?? '—'}
          hint={totals?.busiestDay ? fmtDate(totals.busiestDay.date) : 'No activity yet'}
          Icon={Trophy}
        />
      </div>

      <UsageCalendar
        month={month}
        days={calendar?.days || []}
        peak={totals?.peak || 1}
        selected={selected}
        today={today}
        loading={loadingCal}
        onSelect={selectDay}
        onShiftMonth={(d) => setMonth((m) => shiftMonth(m, d))}
      />

      {/* Selected day */}
      <section className="card p-5" aria-label={`Activity on ${fmtDate(selected)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink text-lg leading-tight">{fmtDate(selected)}</h2>
            <p className="text-xs text-ink-muted">
              {selected === today ? 'Today · ' : ''}All times IST
            </p>
          </div>
          {loadingDay && <Loader2 className="w-4 h-4 animate-spin-slow text-ink-muted" aria-label="Loading" />}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            ['Requests', summary?.totalRequests ?? 0],
            ['Active users', summary?.activeUsers ?? 0],
            ['Daily challenges', summary?.dailyChallenges ?? 0],
            ['Contest submits', summary?.contestSubmissions ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-sunken border border-line px-3 py-2.5">
              <p className="text-xl font-bold text-ink tabular-nums leading-none">{value}</p>
              <p className="text-[11px] text-ink-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {summary?.topUser && summary.activeUsers > 1 && (
          <p className="mt-3 text-xs text-ink-muted">
            Most active: <span className="font-semibold text-ink">{summary.topUser.name}</span>
            {' '}with {summary.topUser.requests} request{summary.topUser.requests === 1 ? '' : 's'}.
          </p>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Requests per user */}
        <section className="card p-5" aria-label="Requests per user">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="stat-icon"><UsersIcon className="w-4 h-4" /></span>
            <div>
              <h3 className="font-semibold text-ink leading-tight">Requests per user</h3>
              <p className="text-[11px] text-ink-muted">Select someone to filter the timeline</p>
            </div>
          </div>

          {!day?.perUser?.length ? (
            <div className="py-10 text-center">
              <Inbox className="w-7 h-7 mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink-muted">Nobody was active on this day.</p>
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {day.perUser.map((u, i) => {
                  const isFocused = focusUser?.userId === u.userId;
                  return (
                    <motion.li
                      key={u.userId || u.email}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFocusUser(isFocused ? null : u);
                          setTimelinePage(1);
                        }}
                        aria-pressed={isFocused}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3
                          transition-[transform,border-color,background-color] duration-150 ease-out
                          active:scale-[0.99]
                          ${isFocused
                            ? 'border-brand bg-brand/10'
                            : 'border-line hover:border-line-strong hover:bg-surface-sunken'}`}
                      >
                        <span className="w-8 h-8 rounded-full bg-surface-sunken border border-line
                                         flex items-center justify-center text-[11px] font-bold text-ink shrink-0">
                          {initials(u.name)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span data-testid="usage-user-name" className="block text-sm font-medium text-ink truncate">{u.name}</span>
                          <span className="block text-[11px] text-ink-muted truncate">{u.email}</span>
                        </span>

                        <span className="text-right shrink-0">
                          <span className="block text-base font-bold text-ink tabular-nums leading-none">
                            {u.requests}
                          </span>
                          <span className="block text-[10px] text-ink-muted tabular-nums mt-0.5">
                            avg {u.avgScore}
                          </span>
                        </span>

                        <span
                          className="hidden md:block text-[10px] text-ink-faint tabular-nums whitespace-nowrap shrink-0"
                          title={`Active from ${fmtTime(u.firstAt)} to ${fmtTime(u.lastAt)}`}
                        >
                          {fmtTime(u.firstAt)} – {fmtTime(u.lastAt)}
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>

              <MiniPager
                pagination={day.pagination}
                onPage={setUserPage}
                loading={loadingDay}
                noun="user"
              />
            </>
          )}
        </section>

        {/* What was submitted */}
        <section className="card p-5" aria-label="What was submitted">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="stat-icon"><Clock className="w-4 h-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-ink leading-tight">What was submitted</h3>
              <p className="text-[11px] text-ink-muted truncate">
                {focusUser ? `Filtered to ${focusUser.name}` : 'Newest first'}
              </p>
            </div>
            {focusUser && (
              <button
                type="button"
                onClick={() => { setFocusUser(null); setTimelinePage(1); }}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1
                           text-[11px] font-medium text-ink
                           transition-[transform,border-color] duration-150 ease-out
                           hover:border-brand active:scale-[0.97]"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {!timeline?.items?.length ? (
            <div className="py-10 text-center">
              <Inbox className="w-7 h-7 mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink-muted">
                {focusUser ? `${focusUser.name} submitted nothing on this day.` : 'Nothing was submitted on this day.'}
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {timeline.items.map((t, i) => (
                  <motion.li
                    key={t._id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-xl border border-line px-3 py-2.5
                               transition-[border-color,background-color] duration-150 ease-out
                               hover:border-line-strong hover:bg-surface-sunken"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-[11px] font-medium text-ink-muted tabular-nums w-16 shrink-0 pt-0.5">
                        {fmtTime(t.at)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!focusUser && (
                            <span className="text-sm font-medium text-ink">{t.name}</span>
                          )}
                          <span className="chip !py-0.5 !text-[10px]">{t.category}</span>
                          {t.isDailyChallenge && (
                            <span className="badge-flame !text-[10px] !py-0.5">
                              <Flame className="w-2.5 h-2.5" /> Challenge
                            </span>
                          )}
                          {t.scoredBy === 'llm' && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-line
                                         bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
                              title="Scored by the AI analyzer"
                            >
                              <Sparkles className="w-2.5 h-2.5" aria-hidden="true" /> AI
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-muted mt-1 line-clamp-2 leading-relaxed">
                          {t.scenario}
                        </p>
                      </div>

                      <span className={`${scoreBadgeClass(t.score)} shrink-0`}>
                        {t.score}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ul>

              <MiniPager
                pagination={timeline.pagination}
                onPage={setTimelinePage}
                loading={loadingTimeline}
                noun="request"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
