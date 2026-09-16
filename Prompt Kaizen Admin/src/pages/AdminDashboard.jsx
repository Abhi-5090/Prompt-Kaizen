import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users as UsersIcon, FileText, Sparkles, Layers, Activity,
  ChevronRight, Inbox, ShieldCheck, ArrowUpRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import ScoreCard from '../components/ScoreCard.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { ratingBadgeClass, roleBadgeClass } from '../utils/scoreUtils.js';
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useChartTheme } from '../utils/useChartTheme.js';

export default function AdminDashboard() {
  // Chart colours come from the design tokens so they follow the theme;
  // Recharts takes colour props, not class names.
  const chart = useChartTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/admin/stats')
      .then((res) => mounted && setData(res.data))
      .catch((e) => toast.error(errorMessage(err, 'Failed to load admin stats.')))
      .finally(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  if (loading) return <LoadingDashboard />;
  if (!data)   return null;

  const categoryData = Object.entries(data.categoryCount || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Activity className="w-3.5 h-3.5" /> Platform overview</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Admin Overview</h1>
          <p className="text-brand-text text-sm">Platform-wide stats across all users and prompts.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreCard title="Total Users"        value={data.totalUsers}                Icon={UsersIcon} delay={0.00} />
        <ScoreCard title="Total Prompts"      value={data.totalPrompts}              Icon={FileText}  delay={0.05} variant="clay" />
        <ScoreCard title="Avg Platform Score" value={data.averagePlatformScore} suffix="/100" Icon={Sparkles} delay={0.10} variant="cream" />
        <ScoreCard title="Categories Used"    value={Object.keys(data.categoryCount || {}).length} Icon={Layers} delay={0.15} />
      </div>

      <ChartCard title="Prompts by category" subtitle="Across the whole platform" Icon={Layers}>
        {categoryData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-brand-text">No data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={chart.brand} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={chart.brand} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="name" stroke={chart.axis} fontSize={10} angle={-15} textAnchor="end" height={60} interval={0} />
              <YAxis stroke={chart.axis} fontSize={12} allowDecimals={false} />
              <Tooltip
                {...chart.tooltip}
                cursor={{ fill: 'rgb(var(--ink) / 0.06)' }}
              />
              <Bar dataKey="value" name="Prompts" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Stacked at tablet (768–1023px) so each table gets the full width
          and stays well-aligned with the cards above; side-by-side only at lg+. */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent users — same structural format as the Contests page:
            card p-0 overflow-hidden, padded title bar with bottom border,
            then either an empty state or a proper table inside overflow-x-auto. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="card p-0 overflow-hidden"
        >
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-line">
            <div className="flex items-center gap-2.5">
              <span className="stat-icon"><UsersIcon className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">Recent users</h3>
            </div>
            <Link to="/users" className="text-sm font-semibold text-ink inline-flex items-center gap-1 hover:gap-1.5 transition-all">
              All users <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {data.recentUsers?.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm text-brand-text">No users yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-brand-text border-b border-line bg-surface">
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Name</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Email</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Role</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recentUsers || []).map((u, i) => (
                    <motion.tr
                      key={u._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="border-b border-line/60 hover:bg-surface/60 transition"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-xs font-bold uppercase shrink-0">
                            {u.name?.[0] || 'U'}
                          </div>
                          <span className="font-medium text-ink whitespace-nowrap">{u.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-brand-text whitespace-nowrap">{u.email}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={`badge ${roleBadgeClass(u.role)}`}>
                          {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : null}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-brand-text whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Recent evaluations — same structural format as the Contests page. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="card p-0 overflow-hidden"
        >
          <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-line">
            <div className="flex items-center gap-2.5">
              <span className="stat-icon"><FileText className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">Recent evaluations</h3>
            </div>
            <Link to="/prompts" className="text-sm font-semibold text-ink inline-flex items-center gap-1 hover:gap-1.5 transition-all">
              All prompts <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {data.recentPrompts?.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm text-brand-text">No prompts yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-brand-text border-b border-line bg-surface">
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Date</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Category</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Scenario</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">User</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Score</th>
                    <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">Rating</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recentPrompts || []).map((p, i) => (
                    <motion.tr
                      key={p._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="border-b border-line/60 hover:bg-surface/60 transition"
                    >
                      <td className="py-2.5 px-4 text-brand-text whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4 text-ink whitespace-nowrap">{p.category}</td>
                      <td className="py-2.5 px-4 max-w-xs truncate text-ink-soft" title={p.scenario}>{p.scenario}</td>
                      <td className="py-2.5 px-4 text-ink-soft whitespace-nowrap">{p.userId?.name || 'Unknown'}</td>
                      <td className="py-2.5 px-4 font-bold text-ink whitespace-nowrap">{p.overallScore}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap"><span className={`badge ${ratingBadgeClass(p.rating)}`}>{p.rating || 'Unrated'}</span></td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <Link to={`/prompts/${p._id}`} className="btn-ghost text-xs">
                          View <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-sunken rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
        <div className="h-64 rounded-2xl bg-surface border border-line shimmer-bg animate-shimmer" />
      </div>
    </div>
  );
}
