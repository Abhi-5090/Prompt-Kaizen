import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month grid, padded so the 1st falls under the correct weekday. Weeks start
 * Monday, matching how the rest of the product reads dates.
 */
function monthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;            // getUTCDay(): 0 = Sun
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Four steps rather than a continuous gradient.
 *
 * A continuous scale reads as noise — the eye cannot rank two cells that
 * differ by 3%. Discrete bands make "busy" and "quiet" legible at a glance,
 * which is the only question this view has to answer instantly. Scaled to the
 * busiest day in the month being viewed, so a quiet month still shows shape.
 */
function heatStep(count, peak) {
  if (!count) return 0;
  const ratio = count / Math.max(peak, 1);
  if (ratio > 0.66) return 3;
  if (ratio > 0.33) return 2;
  return 1;
}

const HEAT = [
  'bg-surface border-line',
  'bg-brand/15 border-brand/25',
  'bg-brand/45 border-brand/50',
  'bg-brand border-brand',
];
const HEAT_TEXT = ['text-ink-faint', 'text-ink', 'text-ink', 'text-brand-fg'];

export default function UsageCalendar({
  month, days, peak, selected, today, loading, onSelect, onShiftMonth,
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells = monthGrid(month);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC', month: 'long', year: 'numeric',
  });

  return (
    <section className="card p-5" aria-label="Usage calendar">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-ink leading-tight">{monthLabel}</h2>
          <p className="text-xs text-ink-muted">Requests per day · IST</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={() => onShiftMonth(-1)} aria-label="Previous month"
            className="btn-ghost p-2 active:scale-[0.97]"
          ><ChevronLeft className="w-4 h-4" /></button>
          <button
            type="button" onClick={() => onShiftMonth(1)} aria-label="Next month"
            className="btn-ghost p-2 active:scale-[0.97]"
          ><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted text-center pb-1">
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-[4.5rem] rounded-xl bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} aria-hidden="true" />;
            const d = byDate.get(date);
            const count = d?.prompts || 0;
            const users = d?.activeUsers || 0;
            const step = heatStep(count, peak);
            const isSelected = date === selected;
            const isToday = date === today;
            const isFuture = date > today;

            return (
              <button
                key={date}
                type="button"
                disabled={isFuture}
                onClick={() => onSelect(date)}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${date}: ${count} request${count === 1 ? '' : 's'}, ${users} active user${users === 1 ? '' : 's'}`}
                className={`group relative min-h-[4.5rem] rounded-xl border px-2 py-1.5 text-left
                  flex flex-col justify-between
                  transition-[transform,box-shadow,border-color] duration-150 ease-out
                  active:scale-[0.97]
                  ${HEAT[step]}
                  ${isSelected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}
                  ${isFuture ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-soft hover:-translate-y-0.5'}`}
              >
                <span className={`text-[11px] font-semibold tabular-nums leading-none
                  ${step >= 3 ? 'text-brand-fg/90' : isToday ? 'text-brand-text' : 'text-ink-muted'}`}>
                  {Number(date.slice(-2))}
                  {isToday && <span className="ml-1 text-[9px] uppercase tracking-wide">today</span>}
                </span>

                {count > 0 ? (
                  <span className="leading-none">
                    <span className={`block text-base font-bold tabular-nums ${HEAT_TEXT[step]}`}>
                      {count}
                    </span>
                    <span className={`block text-[10px] tabular-nums mt-0.5
                      ${step >= 3 ? 'text-brand-fg/75' : 'text-ink-muted'}`}>
                      {users} {users === 1 ? 'user' : 'users'}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between text-[10px] text-ink-muted">
        <span>Quiet</span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {HEAT.map((c, i) => (
            <span key={i} className={`w-5 h-4 rounded-md border ${c}`} />
          ))}
        </div>
        <span>Busy</span>
      </footer>
    </section>
  );
}
