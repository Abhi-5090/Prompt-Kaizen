import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Page navigation for a server-paginated table.
 *
 * Renders a windowed range rather than every page number — at 1200 records and
 * 25 per page that would be 49 buttons — with first/last always reachable.
 */
function pageWindow(current, total, span = 2) {
  const pages = new Set([1, total]);
  for (let p = current - span; p <= current + span; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  // Insert gap markers where the sequence jumps.
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push({ gap: true, key: `gap-${prev}` });
    out.push({ page: p, key: p });
    prev = p;
  }
  return out;
}

export default function Pagination({ pagination, onPage, loading }) {
  const { page = 1, totalPages = 1, total = 0, hasNext, hasPrev } = pagination || {};
  if (!total) return null;

  const btn = 'inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
      aria-label="Pagination"
    >
      <p className="text-xs text-brand-text" aria-live="polite">
        Page <span className="font-semibold text-ink">{page}</span> of{' '}
        <span className="font-semibold text-ink">{totalPages}</span>
        <span className="mx-1.5">·</span>
        <span className="font-semibold text-ink">{total.toLocaleString()}</span> total
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={!hasPrev || loading}
            className={`${btn} border border-line text-ink hover:border-brand`}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pageWindow(page, totalPages).map((item) =>
            item.gap ? (
              <span key={item.key} className="px-1 text-ink-faint select-none" aria-hidden="true">…</span>
            ) : (
              <button
                key={item.key}
                type="button"
                onClick={() => onPage(item.page)}
                disabled={loading}
                aria-current={item.page === page ? 'page' : undefined}
                className={`${btn} ${
                  item.page === page
                    ? 'bg-brand text-brand-fg'
                    : 'border border-line text-ink hover:border-brand'
                }`}
              >
                {item.page}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={!hasNext || loading}
            className={`${btn} border border-line text-ink hover:border-brand`}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </nav>
  );
}
