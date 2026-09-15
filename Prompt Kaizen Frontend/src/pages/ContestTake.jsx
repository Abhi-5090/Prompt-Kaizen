import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Trophy, Calendar, Clock, CheckCircle2, Loader2, Send,
  ChevronLeft, ChevronRight, Sparkles, GaugeCircle, TimerReset,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import { lockClipboardProps } from '../utils/lockClipboard.js';
import { useDialog } from '../components/Dialog.jsx';
import { ratingBadgeClass } from '../utils/scoreUtils.js';

// Auto-submit a few seconds before the wall-clock deadline so the request
// reaches the server while the contest window is still legally open.
const AUTO_SUBMIT_BUFFER_MS = 3000;

export default function ContestTake() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [timeUp, setTimeUp] = useState(false);
  const startedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    setLoading(true);
    api.get(`/contests/${id}`)
      .then(({ data }) => {
        setData(data);
        // Pre-load any prior in-progress answers.
        if (data.mySubmission?.answers?.length) {
          const map = {};
          for (const a of data.mySubmission.answers) {
            map[a.scenarioIndex] = a.userPrompt || '';
          }
          setAnswers(map);
        }
        if (data.mySubmission?.status === 'submitted') {
          // Load full result for display.
          api.get(`/contests/${id}/result`)
            .then(({ data }) => setResult(data))
            .catch(() => {});
        }
      })
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load contest.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Best-effort: start the submission record once the user lands on the
  // contest page so the server knows they've opened it.
  useEffect(() => {
    if (!data?.live || data?.mySubmission?.status === 'submitted' || startedRef.current) return;
    startedRef.current = true;
    api.post(`/contests/${id}/start`).catch(() => {});
  }, [data, id, dialog]);

  const submitNow = useCallback(async ({ silent } = {}) => {
    if (!data) return;
    // In-app dialog rather than window.confirm: native dialogs are blocked or
    // silently auto-dismissed in some embedded webviews, which on a timed
    // contest would look like the Submit button simply not working.
    if (!silent) {
      const ok = await dialog.confirm({
        title: 'Submit your contest?',
        message: 'Your answers will be scored and locked. This cannot be undone.',
        confirmLabel: 'Submit',
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      setSubmitting(true);
      const payload = {
        answers: (data.contest.scenarios || []).map((_, idx) => ({
          scenarioIndex: idx,
          userPrompt: answersRef.current[idx] || '',
        })),
      };
      const { data: res } = await api.post(`/contests/${id}/submit`, payload);
      setResult({ submission: res.submission, contest: data.contest });
      toast.success(silent ? 'Time up — answers auto-submitted.' : 'Contest submitted!');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }, [data, id]);

  const onSubmit = () => submitNow({ silent: false });

  // Best-effort auto-submit fired by the timer when the window is closing.
  // If the user never typed anything (e.g. tab was open in the background and
  // forgotten), don't auto-submit empty answers — that would record a 0 and
  // permanently mark the contest as "submitted", locking them out with a fake
  // bad score. Only fire auto-submit when at least one answer was started.
  //
  // `answersRef.current` is the per-scenario answer MAP — an object keyed by
  // scenarioIndex, NOT an array — so iterate via Object.values.
  const onTimeExpired = useCallback(() => {
    if (result || submitting) return;
    setTimeUp(true);
    const hasAnyAnswer = Object.values(answersRef.current || {}).some(
      (a) => typeof a === 'string' && a.trim().length > 0
    );
    if (!hasAnyAnswer) {
      toast.error('Time is up. No answers were entered, so nothing was submitted.');
      return;
    }
    submitNow({ silent: true });
  }, [result, submitting, submitNow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-brand-text gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading contest…
      </div>
    );
  }
  if (!data) return null;

  if (result) return <ContestResult result={result} />;

  const { contest, live, mySubmission } = data;
  const scenarios = contest.scenarios || [];
  const submitted = mySubmission?.status === 'submitted';

  // Display states. The window (endsAt) is a hard cap — once it closes,
  // even a mid-contest user is cut off. They see whatever they've
  // submitted as their result; the auto-submit at timeout records the
  // partial answers they had typed so far.
  if (!live && !submitted) {
    return (
      <NotLiveBanner contest={contest} />
    );
  }
  if (submitted && !result) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-brand-text gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading your result…
      </div>
    );
  }

  const currentScenario = scenarios[currentIdx];
  const answered = scenarios.filter((_, i) => (answers[i] || '').trim().length >= 5).length;

  // Wall-clock deadline for the timer — earliest of:
  //   - the contest window's hard end (endsAt), and
  //   - the user's personal cap (startedAt + durationMinutes).
  // The window is an absolute ceiling: a user who starts at 11:30 with a
  // 40-min duration in a 10:00–12:00 window gets 30 min (window cap), not
  // 40 min (which would run past 12:00). A user who starts at 10:00 gets
  // their full 40 min because the duration cap is sooner than the window.
  // Fallback to whichever is defined when one is missing.
  const deadline = (() => {
    const candidates = [];
    if (contest.endsAt) candidates.push(new Date(contest.endsAt).getTime());
    if (mySubmission?.startedAt && contest.durationMinutes) {
      candidates.push(
        new Date(mySubmission.startedAt).getTime() + contest.durationMinutes * 60_000
      );
    }
    return candidates.length ? Math.min(...candidates) : null;
  })();

  return (
    <div className="space-y-6">
      {deadline && !result && (
        <ContestTimer
          deadline={deadline}
          onExpire={onTimeExpired}
          paused={!!result || submitting}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Link to="/contests" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to contests
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{contest.title}</h1>
          <p className="text-brand-text text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(contest.scheduledDate).toLocaleDateString(undefined, {
                timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
            {contest.startsAt && contest.endsAt ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                {new Date(contest.startsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}
                {' – '}
                {new Date(contest.endsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {contest.durationMinutes} min
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> {scenarios.length} scenarios · 100 pts each
            </span>
          </p>
        </div>
      </motion.div>

      {timeUp && !result && (
        <div className="flex items-start gap-2 rounded-xl bg-panel border border-panel text-panel-fg px-3 py-2 text-sm">
          <TimerReset className="w-4 h-4 mt-0.5 text-panel-soft" />
          <span>Time's up — submitting your current answers…</span>
        </div>
      )}

      {/* Progress strip */}
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        {scenarios.map((_, i) => {
          const isCurrent = i === currentIdx;
          const isAnswered = (answers[i] || '').trim().length >= 5;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIdx(i)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold transition flex items-center justify-center ${
                isCurrent
                  ? 'bg-panel text-panel-fg shadow-soft'
                  : isAnswered
                    ? 'bg-surface-sunken text-ink'
                    : 'bg-surface border border-line text-ink-soft hover:bg-surface'
              }`}
              aria-label={`Scenario ${i + 1}`}
            >
              {i + 1}
            </button>
          );
        })}
        <span className="badge-cream ml-auto">{answered} / {scenarios.length} answered</span>
      </div>

      {/* Scenario hero */}
      <motion.div
        key={currentIdx}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="rounded-2xl bg-panel text-panel-fg p-6 shadow-soft relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-mesh opacity-25" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="chip bg-surface-sunken/10 text-panel-soft border-line/30">
              <Sparkles className="w-3.5 h-3.5" /> Scenario {currentIdx + 1} of {scenarios.length}
            </span>
            <span className="badge bg-surface text-ink">{currentScenario.category}</span>
          </div>
          <p className="text-[17px] leading-relaxed text-panel-fg/95 whitespace-pre-wrap">
            {currentScenario.scenario}
          </p>
        </div>
      </motion.div>

      {/* Answer textarea */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Your Prompt</label>
          <span className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
            {(answers[currentIdx] || '').trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          value={answers[currentIdx] || ''}
          onChange={(e) => setAnswers((m) => ({ ...m, [currentIdx]: e.target.value }))}
          {...lockClipboardProps()}
          className="input min-h-[200px] font-mono text-[13px] leading-relaxed"
          placeholder="Write the best possible prompt for this scenario. Include role, audience, tone, output format, and any constraints."
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="btn-ghost text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => Math.min(scenarios.length - 1, i + 1))}
              disabled={currentIdx >= scenarios.length - 1}
              className="btn-ghost text-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button" onClick={onSubmit}
            className="btn-primary"
            disabled={submitting || timeUp}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Submitting...</>
            ) : timeUp ? (
              <><TimerReset className="w-4 h-4" /> Time's up</>
            ) : (
              <><Send className="w-4 h-4" /> Submit Contest</>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/**
 * Floating countdown timer pinned to the top-right of the viewport while a
 * contest is in progress. Re-renders every second, calls `onExpire` once when
 * the wall-clock crosses the deadline (auto-submit hook in the parent fires
 * `AUTO_SUBMIT_BUFFER_MS` early to allow the request to reach the server
 * before the contest window legally closes).
 */
function ContestTimer({ deadline, onExpire, paused }) {
  const [ms, setMs] = useState(() => Math.max(0, deadline - Date.now()));
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!deadline) return;
    let intervalId;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setMs(remaining);
      if (!paused && remaining <= AUTO_SUBMIT_BUFFER_MS && !firedRef.current) {
        firedRef.current = true;
        try { onExpireRef.current?.(); } catch { /* noop */ }
      }
    };
    tick();
    const align = 1000 - (Date.now() % 1000);
    const t = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 1000);
    }, align);
    return () => {
      clearTimeout(t);
      if (intervalId) clearInterval(intervalId);
    };
  }, [deadline, paused]);

  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const display = hh > 0
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const expired = ms <= 0;
  // <60s = critical (pulse + flame-on-cream inverted); <5min = low (flame card)
  const critical = !expired && ms < 60_000;
  const low = !expired && !critical && ms < 5 * 60_000;

  const baseClasses = expired
    ? 'bg-panel text-panel-soft border-panel'
    : critical
      ? 'bg-panel text-panel-soft border-panel animate-pulse-ring'
      : low
        ? 'bg-panel text-panel-fg border-panel'
        : 'bg-surface/95 text-ink border-line';

  const iconClasses = expired || low || critical ? 'text-panel-soft' : 'text-ink-soft';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`fixed top-20 right-4 sm:right-6 z-30 rounded-2xl border shadow-soft px-3.5 py-2.5 backdrop-blur-md select-none ${baseClasses}`}
      role="timer"
      aria-live="polite"
      aria-label={`Time remaining: ${display}`}
    >
      <div className="flex items-center gap-2.5">
        <Clock className={`w-4 h-4 shrink-0 ${iconClasses}`} strokeWidth={2.4} />
        <div className="leading-none">
          <p className={`text-[9px] uppercase tracking-[0.2em] font-semibold ${expired || low || critical ? 'opacity-75' : 'text-brand-text'}`}>
            {expired ? "Time's up" : critical ? 'Almost out!' : 'Time left'}
          </p>
          <p className="text-xl font-bold tabular-nums mt-1">{display}</p>
        </div>
      </div>
    </motion.div>
  );
}

function NotLiveBanner({ contest }) {
  const now = Date.now();
  const startsAt = contest.startsAt ? new Date(contest.startsAt) : null;
  const endsAt   = contest.endsAt   ? new Date(contest.endsAt)   : null;
  const isFuture = startsAt
    ? startsAt.getTime() > now
    : new Date(contest.scheduledDate) > new Date();
  const message = isFuture
    ? (startsAt
        ? `Opens at ${startsAt.toLocaleString(undefined, { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' })} IST.`
        : 'This contest opens on its scheduled IST day.')
    : (endsAt
        ? `The window closed at ${endsAt.toLocaleString(undefined, { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' })} IST.`
        : 'This contest has closed.');
  return (
    <div className="space-y-6">
      <div>
        <Link to="/contests" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to contests
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{contest.title}</h1>
      </div>
      <div className="card p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
          <Calendar className="w-6 h-6" />
        </div>
        <p className="mt-3 font-semibold text-ink">
          {isFuture ? 'This contest hasn\'t opened yet.' : 'This contest window has closed.'}
        </p>
        <p className="text-sm text-brand-text mt-1">{message}</p>
      </div>
    </div>
  );
}

function ContestResult({ result }) {
  const { submission, contest } = result;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/contests" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to contests
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{contest.title}</h1>
          <p className="text-brand-text text-sm">Your contest result</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="card p-6 flex flex-wrap items-center gap-6"
      >
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-panel text-panel-soft flex items-center justify-center text-3xl font-bold shadow-soft">
            {submission.averageScore}
          </div>
          <div className="absolute -inset-1 rounded-full animate-pulse-ring pointer-events-none" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">Average score</p>
          <p className="mt-1 text-2xl font-bold text-ink">{submission.averageScore} / 100</p>
          <p className="text-sm text-brand-text mt-1">
            Across {submission.answers?.length || 0} scenarios · submitted{' '}
            {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : ''}
          </p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {(submission.answers || []).map((a, i) => {
          const scenario = contest.scenarios?.[a.scenarioIndex];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="card p-5"
            >
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="badge bg-panel text-panel-soft">Q{a.scenarioIndex + 1}</span>
                {scenario ? <span className="badge bg-surface-sunken text-ink border border-line">{scenario.category}</span> : null}
                <span className={`badge ${ratingBadgeClass(a.rating)}`}>{a.rating || 'Unrated'}</span>
                <span className="ml-auto font-bold text-ink tabular-nums">
                  {a.overallScore}<span className="text-brand-text text-sm">/100</span>
                </span>
              </div>
              {scenario ? (
                <p className="text-sm text-ink-soft mb-3">
                  <span className="text-[11px] uppercase tracking-wider text-brand-text font-semibold mr-2">Scenario</span>
                  {scenario.scenario}
                </p>
              ) : null}
              <div className="rounded-xl bg-surface/60 border border-line p-3 text-sm whitespace-pre-wrap font-mono text-[12px] text-ink">
                {a.userPrompt || '(no answer)'}
              </div>
              {a.suggestions?.length ? (
                <details className="mt-3 text-sm text-ink-soft">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-brand-text font-semibold">
                    Tips for next time
                  </summary>
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    {a.suggestions.map((s, k) => <li key={k}>{s}</li>)}
                  </ul>
                </details>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
