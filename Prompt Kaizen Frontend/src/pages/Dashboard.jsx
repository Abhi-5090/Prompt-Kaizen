import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Trophy, TrendingDown, TrendingUp, Layers, Flame, Snowflake,
  PlusCircle, ArrowUpRight, ChevronRight, Inbox, Activity,
} from 'lucide-react';
import api, { errorMessage } from '../api/axiosInstance.js';
import ScoreCard from '../components/ScoreCard.jsx';
import Heatmap from '../components/Heatmap.jsx';
import ChartCard from '../components/ChartCard.jsx';
import BadgesPanel from '../components/BadgesPanel.jsx';
import DailyChallengeCard from '../components/DailyChallengeCard.jsx';
import WeeklyRecapModal from '../components/WeeklyRecapModal.jsx';
import { ratingBadgeClass, PARAMETER_KEYS, normalizeToTen } from '../utils/scoreUtils.js';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Area, AreaChart,
} from 'recharts';
import { useChartTheme } from '../utils/useChartTheme.js';

export default function Dashboard() {
  // Chart colours come from the design tokens so they follow the theme;
  // Recharts takes colour props, not class names.
  const chart = useChartTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/dashboard/stats')
      .then((res) => mounted && setData(res.data))
      .catch((e) => setError(errorMessage(err, 'Failed to load dashboard.')))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  if (loading) return <LoadingDashboard />;
  if (error)   return <p className="text-ink">{error}</p>;
  if (!data)   return null;

  const trendData = (data.trend || []).map((t) => ({
    date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: t.score,
  }));

  const categoryData = Object.entries(data.categoryCount || {}).map(([name, value]) => ({ name, value }));

  const normalized = {};
  for (const p of PARAMETER_KEYS) {
    normalized[p.key] = normalizeToTen(data.parameterAverages?.[p.key] || 0, p.max);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Activity className="w-3.5 h-3.5" /> Live snapshot</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Your Dashboard</h1>
          <p className="text-brand-text text-sm">Track your prompting progress and parameter strengths.</p>
        </div>
        <Link to="/analyze" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> New Analysis
        </Link>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard title="Total Prompts"     value={data.total}                Icon={Layers}      delay={0.00} />
        <ScoreCard title="Average Score"     value={data.average}  suffix="/100" Icon={Sparkles}    delay={0.05} variant="flame" />
        <ScoreCard title="Best Score"        value={data.best}     suffix="/100" Icon={Trophy}      delay={0.10} variant="cream" />
        <ScoreCard title="Lowest Score"      value={data.lowest}   suffix="/100" Icon={TrendingDown} delay={0.15} />
        {/* 5th card fills the empty trailing cell of the 2-col grid below lg. */}
        <div className="col-span-2 lg:col-span-1">
          <StreakCard
            dailyStreak={data.dailyStreak ?? 0}
            bestDailyStreak={data.bestDailyStreak ?? 0}
            streakFreezes={data.streakFreezes ?? 0}
          />
        </div>
      </div>

      <DailyChallengeCard />

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Score progress"
          subtitle="Your overall scores over time"
          Icon={TrendingUp}
          action={<span className="badge-cream">/100</span>}
        >
          {trendData.length === 0 ? (
            <EmptyMsg msg="Analyze a prompt to see your trend here." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={chart.brand} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={chart.brand} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" stroke={chart.axis} fontSize={12} />
                <YAxis domain={[0, 100]} stroke={chart.axis} fontSize={12} />
                <Tooltip
                  {...chart.tooltip}
                  
                />
                <Area type="monotone" dataKey="score" stroke={chart.brand} strokeWidth={2.5} fill="url(#trendGrad)" />
                <Line type="monotone" dataKey="score" stroke={chart.brand} strokeWidth={2.5} dot={{ r: 3, fill: chart.brand }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Prompts by category"
          subtitle="How you spread your prompts"
          Icon={Layers}
        >
          {categoryData.length === 0 ? (
            <EmptyMsg msg="No categories yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="name" stroke={chart.axis} fontSize={10} angle={-15} textAnchor="end" height={60} interval={0} />
                <YAxis stroke={chart.axis} fontSize={12} allowDecimals={false} />
                <Tooltip
                  {...chart.tooltip}
                />
                <Bar dataKey="value" name="Prompts" fill={chart.brand} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <Heatmap normalized={normalized} title="Parameter Heatmap (avg of all prompts)" />

      <BadgesPanel />

      <WeeklyRecapModal />

      {/* Recent */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="stat-icon"><Inbox className="w-5 h-5" /></span>
            <h3 className="font-semibold text-ink">Recent evaluations</h3>
          </div>
          <Link to="/history" className="text-sm font-semibold text-ink inline-flex items-center gap-1 hover:gap-1.5 transition-all">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        {data.recent?.length === 0 ? (
          <EmptyState
            title="No prompts yet"
            description="Analyze your first prompt to start tracking your progress."
            cta={<Link to="/analyze" className="btn-cream mt-3"><Sparkles className="w-4 h-4" /> Start your first analysis</Link>}
          />
        ) : (
          <div className="overflow-x-auto -mx-1.5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-text border-b border-line">
                  <th className="py-2 px-3 text-[11px] uppercase tracking-wider font-semibold">Date</th>
                  <th className="py-2 px-3 text-[11px] uppercase tracking-wider font-semibold">Category</th>
                  <th className="py-2 px-3 text-[11px] uppercase tracking-wider font-semibold">Scenario</th>
                  <th className="py-2 px-3 text-[11px] uppercase tracking-wider font-semibold">Score</th>
                  <th className="py-2 px-3 text-[11px] uppercase tracking-wider font-semibold">Rating</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r._id} className="border-b border-line/60 hover:bg-surface/40 transition">
                    <td className="py-2.5 px-3 text-brand-text whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3 text-ink">{r.category}</td>
                    <td className="py-2.5 px-3 max-w-xs truncate text-ink-soft" title={r.scenario}>{r.scenario}</td>
                    <td className="py-2.5 px-3 font-bold text-ink">{r.overallScore}</td>
                    <td className="py-2.5 px-3"><span className={`badge ${ratingBadgeClass(r.rating)}`}>{r.rating || 'Unrated'}</span></td>
                    <td className="py-2.5 px-3 text-right">
                      <Link to={`/prompts/${r._id}`} className="btn-ghost text-xs">
                        View <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function EmptyMsg({ msg }) {
  return <div className="h-full flex items-center justify-center text-sm text-brand-text">{msg}</div>;
}

/**
 * Compact Daily Streak card — matches the other stat-card height. Folds the
 * "best" + freeze inventory into a single hint line, with a smaller caption
 * explaining how freezes are earned.
 */
function StreakCard({ dailyStreak, bestDailyStreak, streakFreezes }) {
  const bestLabel = `${bestDailyStreak} ${bestDailyStreak === 1 ? 'day' : 'days'}`;
  const freezeLabel = `${streakFreezes} ${streakFreezes === 1 ? 'freeze' : 'freezes'}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-line shadow-soft bg-surface p-5 transition-shadow hover:shadow-[0_18px_50px_-18px_rgba(33,37,41,0.25)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-brand-text">
            Daily Streak
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
            {dailyStreak}
            <span className="ml-1 text-sm font-semibold text-brand-text">
              {dailyStreak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p
            className="text-[11px] mt-1 text-brand-text inline-flex items-center gap-1"
            title={`${streakFreezes} streak freeze${streakFreezes === 1 ? '' : 's'} ready — auto-spends if you miss a day.`}
          >
            Best {bestLabel} <span className="opacity-50">·</span>
            <Snowflake className="w-3 h-3 -mt-0.5" /> {freezeLabel}
          </p>
          <p className="text-[10px] mt-0.5 text-ink-faint">
            Earn one at every 7-day milestone
          </p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-surface-sunken text-ink flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5" strokeWidth={2} />
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ title, description, cta }) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
        <Inbox className="w-6 h-6" />
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <p className="text-sm text-brand-text mt-1">{description}</p>
      <div>{cta}</div>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-sunken rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-28 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer ${
              i === 4 ? 'col-span-2 lg:col-span-1' : ''
            }`}
          />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-80 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
        <div className="h-80 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
      </div>
      <div className="h-44 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
    </div>
  );
}
