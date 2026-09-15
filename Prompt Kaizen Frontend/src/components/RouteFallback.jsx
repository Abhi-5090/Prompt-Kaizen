import { Loader2 } from 'lucide-react';

/**
 * Shown while a lazily-loaded route chunk is fetched.
 *
 * Deliberately minimal and centred rather than a skeleton: chunk loads are
 * usually under 100ms on a warm cache, and a detailed skeleton that flashes
 * for one frame is more distracting than a quiet spinner.
 */
export default function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-live="polite">
      <span className="flex items-center gap-2.5 text-sm text-ink-muted">
        <Loader2 className="w-4 h-4 animate-spin-slow" aria-hidden="true" />
        Loading…
      </span>
    </div>
  );
}
