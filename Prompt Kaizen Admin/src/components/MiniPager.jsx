import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Compact pager for a panel inside a page.
 *
 * Deliberately not the full `Pagination` component: that one owns the bottom
 * of a page and lists page numbers. Two panels side by side, each with its own
 * numbered pager, reads as clutter and makes it ambiguous which list a control
 * belongs to. This states the range in words and gives two arrows.
 */
export default function MiniPager({ pagination, onPage, loading, noun = 'item' }) {
  const { page = 1, limit = 10, total = 0, hasNext, hasPrev } = pagination || {};
  if (!total) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const single = total === 1;

  return (
    <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-line">
      <p className="text-xs text-ink-muted tabular-nums" aria-live="polite">
        {single ? (
          <>1 {noun}</>
        ) : (
          <>
            <span className="font-semibold text-ink">{from}–{to}</span> of{' '}
            <span className="font-semibold text-ink">{total.toLocaleString()}</span> {noun}s
          </>
        )}
      </p>

      {total > limit && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={!hasPrev || loading}
            aria-label={`Previous ${noun}s`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-line text-ink
                       transition-[transform,border-color] duration-150 ease-out
                       hover:border-brand active:scale-[0.97]
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line"
          ><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={!hasNext || loading}
            aria-label={`Next ${noun}s`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-line text-ink
                       transition-[transform,border-color] duration-150 ease-out
                       hover:border-brand active:scale-[0.97]
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line"
          ><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}
