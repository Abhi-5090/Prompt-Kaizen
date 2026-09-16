import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Sparkles, Trophy, ArrowRight, CheckCircle2, Loader2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import { ratingBadgeClass } from '../utils/scoreUtils.js';
import { useMidnightCountdown } from '../utils/useMidnightCountdown.js';

export default function DailyChallengeCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchChallenge = useCallback(() => {
    api.get('/prompts/daily-challenge')
      .then((res) => { setData(res.data); setFailed(false); })
      .catch((e) => {
        setFailed(true);
        toast.error(errorMessage(err, 'Failed to load daily challenge.'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  // When the clock rolls past UTC midnight, silently refetch so the user sees
  // the new day's challenge without needing to reload.
  const countdown = useMidnightCountdown(fetchChallenge);

  if (loading) {
    return (
      <div className="card p-5 flex items-center gap-3 text-brand-text text-sm">
        <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading today's challenge…
      </div>
    );
  }
  if (failed || !data) return null;

  const completed = !!data.completedToday;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl bg-panel text-panel-fg shadow-soft border border-panel"
    >
      <div className="absolute inset-0 bg-mesh opacity-25" />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="relative p-6 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-xl bg-surface-sunken text-ink flex items-center justify-center">
            <Calendar className="w-6 h-6" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.2em] text-panel-soft/80 font-semibold">
              Today's Challenge
            </p>
            <p className="font-semibold text-panel-fg">{data.category}</p>
          </div>
        </div>

        <div className="flex-1 min-w-[260px]">
          <p className="text-[15px] leading-relaxed text-panel-fg/95">{data.scenario}</p>
          {completed && data.mySubmission ? (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="badge bg-surface-sunken text-ink">
                <CheckCircle2 className="w-3.5 h-3.5" /> Completed
              </span>
              <span className="font-bold text-panel-fg">{data.mySubmission.overallScore} / 100</span>
              <span className={`badge ${ratingBadgeClass(data.mySubmission.rating)}`}>
                {data.mySubmission.rating || 'Unrated'}
              </span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs uppercase tracking-wider font-semibold text-panel-soft/70">
              <span>One scenario · One prompt</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken/10 border border-line/30 text-panel-soft px-2.5 py-1"
                aria-label={`Resets in ${countdown.hh} hours ${countdown.mm} minutes ${countdown.ss} seconds`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="tabular-nums text-[12px] tracking-[0.12em]">
                  Resets in {countdown.hh}:{countdown.mm}:{countdown.ss}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs text-panel-soft/80">
            <Trophy className="w-3.5 h-3.5" />
            <span>Completed: <span className="font-bold text-panel-fg">{data.totalCompleted}</span></span>
          </div>
          {completed && data.mySubmission ? (
            <Link to={`/prompts/${data.mySubmission._id}`} className="btn-cream text-sm">
              View Result <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link to="/challenge" className="btn-cream text-sm">
              <Sparkles className="w-4 h-4" /> Take the Challenge
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}
