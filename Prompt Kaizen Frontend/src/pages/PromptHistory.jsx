import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  History, PlusCircle, Search, Eye, Inbox, Sparkles, Filter, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import { ratingBadgeClass } from '../utils/scoreUtils.js';
import { usePaginatedList } from '../utils/usePaginatedList.js';
import Pagination from '../components/Pagination.jsx';

const CATEGORIES = [
  'Academic Writing','Email Writing','Resume and LinkedIn','Coding and Debugging',
  'Data Analysis','Business Communication','Interview Preparation','Research and Summarization',
  'Content Creation','Social Media Post','Image Generation Prompt','Other',
];

export default function PromptHistory() {
  const [category, setCategory] = useState('');

  // Server-side paging and search. The page previously pulled the caller's
  // most recent 500 evaluations and filtered them in the browser, so a heavy
  // user's older prompts were unreachable and unsearchable.
  const {
    items, pagination, loading, error,
    page, setPage, search: q, setSearch: setQ, removeLocal,
  } = usePaginatedList('/prompts/history', {
    limit: 20,
    extraParams: category ? { category } : {},
  });

  const filtered = items;

  // Category options come from the fixed analyzer list rather than from the
  // rows on screen — deriving them from one page would hide categories the
  // user has used but that do not appear on the current page.
  const categories = CATEGORIES;


  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><History className="w-3.5 h-3.5" /> Prompt history</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">All your evaluations</h1>
          <p className="text-brand-text text-sm">Search, filter, and review what you've written before.</p>
        </div>
        <Link to="/analyze" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> New Analysis
        </Link>
      </motion.div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            aria-label="Search your history by scenario or prompt"
            placeholder="Search scenario or prompt..."
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
        <span className="badge-ghost ml-auto">{pagination.total.toLocaleString()} {pagination.total === 1 ? 'item' : 'items'}</span>
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-surface/60" />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-ink">Nothing here yet</p>
            <p className="text-sm text-brand-text mt-1">
              {items.length === 0 ? 'Analyze your first prompt to get started.' : 'No prompts match your filters.'}
            </p>
            {items.length === 0 && (
              <Link to="/analyze" className="btn-cream mt-4 inline-flex">
                <Sparkles className="w-4 h-4" /> Start your first analysis
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-text border-b border-line bg-surface/40">
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Date</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Category</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Scenario</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Original Prompt</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Score</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Rating</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isChallenge = !!r.isDailyChallenge;
                  return (
                    <motion.tr
                      key={r._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                      className={`border-b border-line/60 transition ${
                        isChallenge
                          ? 'bg-surface-sunken/60 hover:bg-surface-sunken/70'
                          : 'hover:bg-surface/40'
                      }`}
                    >
                      <td
                        className={`py-2.5 px-4 whitespace-nowrap ${
                          isChallenge
                            ? 'text-ink font-semibold relative'
                            : 'text-brand-text'
                        }`}
                      >
                        {/* Left accent stripe — uses box-shadow so it doesn't shift the layout. */}
                        {isChallenge && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-0 bottom-0 w-1 bg-panel"
                          />
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          {isChallenge && <Calendar className="w-3.5 h-3.5 text-ink" />}
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-ink">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span>{r.category}</span>
                          {isChallenge && (
                            <span
                              className="badge bg-panel text-panel-soft"
                              title="Submitted via the Daily Challenge"
                            >
                              <Calendar className="w-3 h-3" /> Challenge
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 max-w-xs truncate text-ink-soft" title={r.scenario}>{r.scenario}</td>
                      <td className="py-2.5 px-4 max-w-xs truncate text-brand-text" title={r.userPrompt}>{r.userPrompt}</td>
                      <td className="py-2.5 px-4 font-bold text-ink">{r.overallScore}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={`badge ${ratingBadgeClass(r.rating)} whitespace-nowrap`}>
                          {r.rating || 'Unrated'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <Link to={`/prompts/${r._id}`} className="btn-ghost text-xs">
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </td>
                    </motion.tr>
                  );
                })}
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
