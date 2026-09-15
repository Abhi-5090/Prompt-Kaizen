import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, Eye, Inbox, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import { ratingBadgeClass } from '../utils/scoreUtils.js';
import { usePaginatedList } from '../utils/usePaginatedList.js';
import Pagination from '../components/Pagination.jsx';

// Rating tiers ranked highest → lowest. Used as the primary key when sorting
// by Rating; overallScore is the tiebreaker within the same tier.

export default function Prompts() {
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState(null);   // 'score' | 'rating' | null
  const [sortDir, setSortDir] = useState(null); // 'asc' | 'desc' | null

  // Search, filtering, sorting and paging all happen server-side. Doing any of
  // them in the browser only ever applied to the rows already fetched, so on a
  // collection larger than one page the results were simply wrong.
  const {
    items: prompts, pagination, meta, loading, error,
    page, setPage, search: q, setSearch: setQ,
  } = usePaginatedList('/admin/prompts', {
    limit: 25,
    extraParams: {
      ...(category ? { category } : {}),
      ...(sortBy && sortDir ? { sort: sortBy, dir: sortDir } : {}),
    },
  });

  const categories = meta.categories || [];
  const filtered = prompts;

  // Three-click cycle on the same column: ascending → descending → cleared
  // (original DB order). Switching to a different column starts at ascending.
  const onSort = (key) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortBy(null);
      setSortDir(null);
    } else {
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><FileText className="w-3.5 h-3.5" /> Prompt evaluations</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Prompts</h1>
          <p className="text-brand-text text-sm">{prompts.length} total evaluations on the platform.</p>
        </div>
      </motion.div>

      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            aria-label="Search prompts by scenario, prompt text or user"
            placeholder="Search scenario, prompt, user..."
            className="input pl-9"
          />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <select
            aria-label="Filter by category"
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="input pl-9 min-w-[200px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span className="badge-ghost ml-auto">
          {pagination.total.toLocaleString()} {q || category ? 'match' : 'prompt'}{pagination.total === 1 ? '' : q || category ? 'es' : 's'}
        </span>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-sunken" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-ink">No prompts match your filters</p>
            <p className="text-sm text-brand-text mt-1">Try a different search or category.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-text border-b border-line bg-surface">
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Date</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">User</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Category</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Scenario</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">
                    <SortHeader label="Score" colKey="score" sortBy={sortBy} sortDir={sortDir} onClick={onSort} />
                  </th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">
                    <SortHeader label="Rating" colKey="rating" sortBy={sortBy} sortDir={sortDir} onClick={onSort} />
                  </th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <motion.tr
                    key={p._id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-line/60 hover:bg-surface/60 transition"
                  >
                    <td className="py-2.5 px-4 text-brand-text whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-[10px] font-bold uppercase">
                          {p.userId?.name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-ink">{p.userId?.name || '—'}</p>
                          <p className="text-xs text-brand-text">{p.userId?.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-ink">{p.category}</td>
                    <td className="py-2.5 px-4 max-w-xs truncate text-ink-soft" title={p.scenario}>{p.scenario}</td>
                    <td className="py-2.5 px-4 font-bold text-ink">{p.overallScore}</td>
                    <td className="py-2.5 px-4">
                      <span className={`badge ${ratingBadgeClass(p.rating)}`}>{p.rating || 'Unrated'}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link to={`/prompts/${p._id}`} className="btn-ghost text-xs">
                        <Eye className="w-3.5 h-3.5" /> View
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && !loading && (
          <p className="mt-4 text-sm text-brand-text" role="alert">{error}</p>
        )}

        <Pagination pagination={pagination} onPage={setPage} loading={loading} />
      </div>
    </div>
  );
}

function SortHeader({ label, colKey, sortBy, sortDir, onClick }) {
  const active = sortBy === colKey && !!sortDir;
  const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
  const stateLabel = active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'unsorted';
  return (
    <button
      type="button"
      onClick={() => onClick(colKey)}
      className={`inline-flex items-center gap-1 transition-colors ${
        active ? 'text-ink' : 'text-brand-text hover:text-ink-soft'
      }`}
      title={`Sort by ${label} — click cycles ascending → descending → off`}
      aria-label={`Sort by ${label}, currently ${stateLabel}`}
    >
      <span className="uppercase tracking-wider font-semibold">{label}</span>
      <Icon className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-50'}`} strokeWidth={2.4} />
    </button>
  );
}
