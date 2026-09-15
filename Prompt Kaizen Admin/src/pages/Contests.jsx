import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Trophy, PlusCircle, Calendar, ChevronRight, Inbox,
  Clock, Users as UsersIcon, Layers, Lock, BarChart3, Trash2, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import ScoreCard from '../components/ScoreCard.jsx';
import { useDialog } from '../components/Dialog.jsx';

const STATUS_BADGE = {
  draft:     'bg-surface text-ink-soft border border-line',
  published: 'bg-surface-sunken text-ink',
  closed:    'bg-panel text-panel-soft',
};

export default function Contests() {
  const dialog = useDialog();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/admin/contests')
      .then((res) => setContests(res.data.contests || []))
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load contests.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onDelete = async (c) => {
    const ok = await dialog.confirm({
      title: `Delete "${c.title}"?`,
      message:
        'All scenarios, allowlist entries, and any submitted answers for this contest will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete contest',
      destructive: true,
    });
    if (!ok) return;
    try {
      setDeletingId(c._id);
      await api.delete(`/admin/contests/${c._id}`);
      toast.success('Contest deleted.');
      // Remove from the list without a full reload — keeps the page snappy
      // and avoids a flash of the loading skeleton.
      setContests((arr) => arr.filter((x) => x._id !== c._id));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete contest.');
    } finally {
      setDeletingId(null);
    }
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const total = contests.length;
    const scheduled = contests.filter((c) =>
      c.status === 'published' && (!c.endsAt || new Date(c.endsAt).getTime() > now)
    ).length;
    const closed = contests.filter((c) =>
      c.status === 'closed' || (c.endsAt && new Date(c.endsAt).getTime() <= now)
    ).length;
    const attendees = contests.reduce((sum, c) => sum + (c.submittedCount || 0), 0);
    // Weighted platform average: Σ(avgScore × submittedCount) / Σ(submittedCount).
    const scoreSum = contests.reduce(
      (sum, c) => sum + (c.avgScore || 0) * (c.submittedCount || 0),
      0
    );
    const avgScore = attendees > 0 ? Math.round((scoreSum / attendees) * 10) / 10 : 0;
    return { total, scheduled, closed, attendees, avgScore };
  }, [contests]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><Trophy className="w-3.5 h-3.5" /> Weekly tests</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Contests</h1>
          <p className="text-brand-text text-sm">
            Schedule a contest, define scenarios, and upload the allowlist of participants.
          </p>
        </div>
        <Link to="/contests/new" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> New Contest
        </Link>
      </motion.div>

      {contests.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <ScoreCard title="Assigned Contests" value={stats.total}      Icon={Layers}       delay={0.00} />
          <ScoreCard title="Scheduled"         value={stats.scheduled}  Icon={Calendar}     delay={0.05} variant="flame" />
          <ScoreCard title="Closed"            value={stats.closed}     Icon={Lock}         delay={0.10} />
          <ScoreCard title="Total Attendees"   value={stats.attendees}  Icon={UsersIcon}    delay={0.15} variant="cream" />
          {/* 5th card spans the trailing empty cell of the 2-col grid between sm and lg. */}
          <div className="sm:col-span-2 lg:col-span-1">
            <ScoreCard title="Average Score"   value={stats.avgScore}   suffix="/100" Icon={BarChart3} delay={0.20} />
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-surface-sunken" />
            ))}
          </div>
        ) : contests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-ink">No contests yet</p>
            <p className="text-sm text-brand-text mt-1">
              Click <span className="font-semibold">New Contest</span> to schedule the first one.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-text border-b border-line bg-surface">
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Title</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Scheduled (IST)</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Scenarios</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Allowlist</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Submitted</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Status</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {contests.map((c, i) => (
                  <motion.tr
                    key={c._id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-line/60 hover:bg-surface/60 transition"
                  >
                    <td className="py-2.5 px-4 font-semibold text-ink">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3.5 h-3.5 text-ink-soft" />
                        {c.title}
                      </div>
                      {c.description ? (
                        <p className="text-xs text-brand-text mt-0.5 max-w-md truncate">{c.description}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-4 text-ink whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-ink-soft" />
                        {new Date(c.scheduledDate).toLocaleDateString(undefined, { timeZone: 'Asia/Kolkata' })}
                      </span>
                      {c.startsAt && c.endsAt ? (
                        <p className="text-[10px] text-brand-text mt-0.5 inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {new Date(c.startsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}
                          {' – '}
                          {new Date(c.endsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} IST
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-4 text-ink-soft font-semibold">{c.scenariosCount}</td>
                    <td className="py-2.5 px-4 text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <UsersIcon className="w-3.5 h-3.5" /> {c.allowedCount}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-ink-soft">
                      {c.submittedCount}<span className="text-ink-faint"> / {c.allowedCount}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`badge ${STATUS_BADGE[c.status] || ''}`}>{c.status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Link to={`/contests/${c._id}`} className="btn-ghost text-xs">
                          Manage <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => onDelete(c)}
                          disabled={deletingId === c._id}
                          className="btn-danger"
                          aria-label={`Delete contest ${c.title}`}
                          title="Delete this contest"
                        >
                          {deletingId === c._id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin-slow" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                          Delete
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
