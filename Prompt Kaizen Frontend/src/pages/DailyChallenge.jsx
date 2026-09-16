import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, Sparkles, Loader2, CheckCircle2, ArrowLeft, Send, Trophy, Clock,
  Flame, History as HistoryIcon, Eye, ChevronRight, Wand2, TrendingDown, BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import { ratingBadgeClass } from '../utils/scoreUtils.js';
import { useMidnightCountdown } from '../utils/useMidnightCountdown.js';
import { lockClipboardProps } from '../utils/lockClipboard.js';
import DailyChallengeCalendar from '../components/DailyChallengeCalendar.jsx';

export default function DailyChallenge() {
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [attempts, setAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);

  const [userPrompt, setUserPrompt] = useState('');

  const fetchChallenge = () => {
    setLoading(true);
    api.get('/prompts/daily-challenge')
      .then((res) => setChallenge(res.data))
      .catch((e) => toast.error(errorMessage(e, 'Failed to load daily challenge.')))
      .finally(() => setLoading(false));
  };

  const fetchAttempts = () => {
    setAttemptsLoading(true);
    api.get('/prompts/daily-challenge/history')
      .then((res) => setAttempts(res.data.items || []))
      .catch(() => {})
      .finally(() => setAttemptsLoading(false));
  };

  useEffect(() => {
    fetchChallenge();
    fetchAttempts();
  }, []);

  const countdown = useMidnightCountdown(() => {
    fetchChallenge();
    fetchAttempts();
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!userPrompt.trim() || userPrompt.trim().length < 5)
      return toast.error('Your prompt is too short (min 5 characters).');
    try {
      setSubmitting(true);
      const { data } = await api.post('/prompts/analyze', {
        category: challenge.category,
        scenario: challenge.scenario,
        userPrompt,
        isDailyChallenge: true,
      });
      toast.success('Challenge submitted!');
      navigate(`/result/${data.evaluation._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Submission failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-brand-text gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading today's challenge…
      </div>
    );
  }
  if (!challenge) return null;

  const completed = challenge.completedToday;
  const words = userPrompt.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Daily Challenge</h1>
          <p className="text-brand-text text-sm">One scenario. One shot per day. Build a streak.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken border border-line text-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              Resets in {countdown.hh}:{countdown.mm}:{countdown.ss}
            </span>
          </span>
        </div>
      </motion.div>

      {/* Scenario hero + summary stats (left) + Calendar (right) */}
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <ScenarioHero challenge={challenge} completedToday={!!challenge.completedToday} />
          <ChallengeStatCards attempts={attempts} />
        </div>
        <div className="lg:col-span-4">
          <DailyChallengeCalendar attempts={attempts} />
        </div>
      </div>

      {/* Submission form OR completed state */}
      {completed ? (
        <CompletedCard challenge={challenge} />
      ) : (
        <SubmitForm
          submitting={submitting}
          userPrompt={userPrompt}
          onPromptChange={setUserPrompt}
          onSubmit={onSubmit}
          words={words}
        />
      )}

      {/* Past challenges */}
      <AttemptsList attempts={attempts} loading={attemptsLoading} />
    </div>
  );
}

/* -------------------------------- Scenario hero -------------------------------- */

function ScenarioHero({ challenge, completedToday }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="flex-1 relative overflow-hidden rounded-2xl bg-panel text-panel-fg shadow-soft border border-panel"
    >
      <div className="absolute inset-0 bg-mesh opacity-25" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="relative p-6 sm:p-7 h-full flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-surface-sunken text-ink flex items-center justify-center">
              <Calendar className="w-4 h-4" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.22em] text-panel-soft/80 font-semibold">
                Today's Challenge
              </p>
              <p className="text-xs font-semibold text-panel-fg">{challenge.date}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip bg-surface-sunken/10 text-panel-soft border-line/30 text-[10px]">
              <Sparkles className="w-3 h-3" /> {challenge.category}
            </span>
            {completedToday ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken text-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                <CheckCircle2 className="w-2.5 h-2.5" /> Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken/10 border border-line/30 text-panel-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                <Flame className="w-2.5 h-2.5" /> Pending
              </span>
            )}
          </div>
        </div>

        <p className="text-[18px] leading-relaxed text-panel-fg/95">
          {challenge.scenario}
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------- Challenge stat cards -------------------------------- */

function ChallengeStatCards({ attempts }) {
  const has = attempts.length > 0;
  const scores = attempts.map((a) => a.overallScore || 0);
  const highest = has ? Math.max(...scores) : 0;
  const lowest  = has ? Math.min(...scores) : 0;
  const average = has
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  // The attempt objects that produced the highest/lowest scores — used to
  // surface the rating label alongside the number.
  const highestAttempt = has
    ? attempts.reduce((best, a) =>
        (a.overallScore || 0) > (best.overallScore || 0) ? a : best
      )
    : null;
  const lowestAttempt = has
    ? attempts.reduce((worst, a) =>
        (a.overallScore ?? Infinity) < (worst.overallScore ?? Infinity) ? a : worst
      )
    : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <MiniStatTile
        label="Highest"
        value={highest}
        suffix="/100"
        rating={highestAttempt?.rating}
        Icon={Trophy}
        variant="cream"
        delay={0.05}
      />
      <MiniStatTile
        label="Lowest"
        value={lowest}
        suffix="/100"
        rating={lowestAttempt?.rating}
        Icon={TrendingDown}
        variant="light"
        delay={0.1}
      />
      <MiniStatTile
        label="Average"
        value={average}
        suffix="/100"
        hint={has ? `Across ${attempts.length} ${attempts.length === 1 ? 'try' : 'tries'}` : 'No data yet'}
        Icon={BarChart3}
        variant="light"
        delay={0.15}
      />
    </div>
  );
}

function MiniStatTile({ label, value, suffix, rating, hint, Icon, variant = 'light', delay = 0 }) {
  // Same rule as ScoreCard / StatTile: dark value, orange suffix + orange icon.
  const cardClasses = variant === 'cream'
    ? 'bg-surface-sunken border-line text-ink'
    : 'bg-surface border-line text-ink';
  const labelClr  = 'text-ink-muted';
  const suffixClr = 'text-brand-text';
  const iconBox   = 'bg-brand text-brand-fg';
  const ratingClr = 'text-ink-soft';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className={`rounded-xl border shadow-soft p-3.5 transition-shadow hover:shadow-[0_18px_50px_-18px_rgba(33,37,41,0.25)] ${cardClasses}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] uppercase tracking-[0.16em] font-semibold ${labelClr} truncate`}>
          {label}
        </p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBox}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight leading-none">
        {value}
        {suffix ? <span className={`ml-1 text-xs font-semibold ${suffixClr}`}>{suffix}</span> : null}
      </p>
      {rating ? (
        <span className={`mt-1.5 inline-block text-[10px] font-semibold ${ratingClr} truncate w-full`}>
          {rating}
        </span>
      ) : hint ? (
        <p className={`mt-1.5 text-[10px] ${suffixClr} truncate`}>{hint}</p>
      ) : null}
    </motion.div>
  );
}

/* -------------------------------- Submission form -------------------------------- */

const PROMPT_TIPS = [
  'Set a role with "Act as..."',
  'Mention the target audience',
  'State the desired tone',
  'Add constraints (length, format, examples)',
];

function SubmitForm({
  submitting, userPrompt, onPromptChange, onSubmit, words,
}) {
  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
      onSubmit={onSubmit}
      className="grid lg:grid-cols-12 gap-5"
    >
      <div className="lg:col-span-8 card p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label !mb-0" htmlFor="challenge-prompt">Your Prompt <span className="text-ink-faint ml-0.5">*</span></label>
            <span className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
              {words} {words === 1 ? 'word' : 'words'}
            </span>
          </div>
          <textarea
            id="challenge-prompt"
            value={userPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            {...lockClipboardProps()}
            className="input min-h-[220px] font-mono text-[13px] leading-relaxed"
            placeholder={
              'Write the best possible prompt for today\'s scenario.\n\n' +
              'Include role, audience, tone, output format, and any constraints.'
            }
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link to="/dashboard" className="btn-ghost">Cancel</Link>
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Submitting...</>
            ) : (
              <><Send className="w-4 h-4" /> Submit Challenge</>
            )}
          </motion.button>
        </div>
      </div>

      {/* Tips rail */}
      <div className="lg:col-span-4 space-y-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="stat-icon"><Wand2 className="w-5 h-5" /></span>
            <h3 className="font-semibold text-ink">Strong-prompt checklist</h3>
          </div>
          <ul className="space-y-2">
            {PROMPT_TIPS.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-ink-soft">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-[10px] font-bold">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5 bg-panel text-panel-fg border-panel">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-panel-soft" />
            <h3 className="font-semibold">Why streaks matter</h3>
          </div>
          <p className="text-sm text-panel-soft/80 leading-relaxed">
            Every consecutive day you submit, your streak grows. Miss a day and it resets — but
            your <em>best</em> stays forever on the leaderboard of you-vs-you.
          </p>
        </div>
      </div>
    </motion.form>
  );
}

/* -------------------------------- Completed card -------------------------------- */

function CompletedCard({ challenge }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
      className="card p-6 flex flex-wrap items-center gap-5"
    >
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center shadow-soft">
          <CheckCircle2 className="w-8 h-8" strokeWidth={2.2} />
        </div>
        <div className="absolute -inset-1 rounded-2xl animate-pulse-ring pointer-events-none" />
      </div>
      <div className="flex-1 min-w-[240px]">
        <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">Today, locked in</p>
        <p className="mt-1 text-xl font-bold tracking-tight text-ink">
          You've already completed today's challenge.
        </p>
        {challenge.mySubmission ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-brand-text flex-wrap">
            <span>Your score:</span>
            <span className="text-2xl font-bold text-ink tabular-nums">
              {challenge.mySubmission.overallScore}
              <span className="text-sm font-medium text-brand-text">/100</span>
            </span>
            <span className={`badge ${ratingBadgeClass(challenge.mySubmission.rating)}`}>
              {challenge.mySubmission.rating || 'Unrated'}
            </span>
          </div>
        ) : null}
      </div>
      {challenge.mySubmission ? (
        <Link to={`/prompts/${challenge.mySubmission._id}`} className="btn-primary text-sm">
          View Result <ChevronRight className="w-4 h-4" />
        </Link>
      ) : null}
    </motion.div>
  );
}

/* -------------------------------- Past attempts list -------------------------------- */

function AttemptsList({ attempts, loading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="card p-0 overflow-hidden"
    >
      <div className="p-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="stat-icon"><HistoryIcon className="w-5 h-5" /></span>
          <div>
            <h3 className="font-semibold text-ink">Your past challenges</h3>
            <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
              Every challenge you've completed
            </p>
          </div>
        </div>
        <span className="badge-cream">{attempts.length} total</span>
      </div>

      {loading ? (
        <div className="p-5 pt-2 space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-surface/60" />
          ))}
        </div>
      ) : attempts.length === 0 ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
            <Flame className="w-7 h-7" strokeWidth={2} />
          </div>
          <p className="mt-3 font-semibold text-ink">No challenges yet</p>
          <p className="text-sm text-brand-text mt-1 max-w-sm mx-auto">
            Submit today's challenge to light up the calendar and start your streak.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-text border-b border-line bg-surface/40">
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Date</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Category</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Scenario</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Score</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Rating</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <motion.tr
                  key={a._id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                  className="border-b border-line/60 hover:bg-surface/40 transition"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap text-ink-soft font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-ink" strokeWidth={2.4} />
                      {new Date(a.challengeDate || a.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-ink">{a.category}</td>
                  <td className="py-2.5 px-4 max-w-xs truncate text-ink-soft" title={a.scenario}>{a.scenario}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="font-bold text-ink tabular-nums">{a.overallScore}</span>
                    <span className="text-brand-text text-xs">/100</span>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className={`badge ${ratingBadgeClass(a.rating)} whitespace-nowrap`}>{a.rating || 'Unrated'}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <Link to={`/prompts/${a._id}`} className="btn-ghost text-xs">
                      <Eye className="w-3.5 h-3.5" /> View
                    </Link>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

