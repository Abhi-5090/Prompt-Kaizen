import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Trophy, Calendar, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';

const CATEGORIES = [
  'Academic Writing','Email Writing','Resume and LinkedIn','Coding and Debugging',
  'Data Analysis','Business Communication','Interview Preparation','Research and Summarization',
  'Content Creation','Social Media Post','Image Generation Prompt','Other',
];

const emptyScenario = () => ({ category: '', scenario: '' });

// `scheduledDate` comes back as the UTC instant of IST midnight; reformat
// to YYYY-MM-DD using the IST calendar day so the date input shows the day
// the admin originally picked, regardless of the operator's browser TZ.
function istDateString(d) {
  if (!d) return '';
  const t = new Date(d).getTime();
  const ist = new Date(t + 330 * 60 * 1000);
  return (
    ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0')
  );
}
// `startsAt` / `endsAt` are UTC instants — show their IST wall-clock HH:MM.
function istTimeString(d) {
  if (!d) return '';
  const t = new Date(d).getTime();
  const ist = new Date(t + 330 * 60 * 1000);
  return (
    String(ist.getUTCHours()).padStart(2, '0') + ':' +
    String(ist.getUTCMinutes()).padStart(2, '0')
  );
}

export default function ContestEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [contestStatus, setContestStatus] = useState('draft');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scenarios, setScenarios] = useState([emptyScenario()]);

  useEffect(() => {
    let cancelled = false;
    api.get(`/admin/contests/${id}`)
      .then((res) => {
        if (cancelled) return;
        const c = res.data.contest;
        if (!c) { setNotFound(true); return; }
        setContestStatus(c.status || 'draft');
        setTitle(c.title || '');
        setDescription(c.description || '');
        setScheduledDate(istDateString(c.scheduledDate));
        setStartTime(istTimeString(c.startsAt));
        setEndTime(istTimeString(c.endsAt));
        setDurationMinutes(c.durationMinutes || 60);
        setScenarios(
          (c.scenarios || []).length
            ? c.scenarios.map((s) => ({ category: s.category || '', scenario: s.scenario || '' }))
            : [emptyScenario()]
        );
      })
      .catch((e) => {
        if (e?.response?.status === 404) setNotFound(true);
        else toast.error(e?.response?.data?.message || 'Failed to load contest.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const updateScenario = (i, patch) =>
    setScenarios((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addScenario = () => setScenarios((arr) => (arr.length < 10 ? [...arr, emptyScenario()] : arr));
  const removeScenario = (i) =>
    setScenarios((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Please give the contest a title.');
    if (!scheduledDate) return toast.error('Please pick a scheduled date.');
    if (!startTime || !endTime) return toast.error('Please set both a start and end time.');
    if (endTime <= startTime) return toast.error('End time must be after start time.');
    if (scenarios.some((s) => !s.category || !s.scenario.trim()))
      return toast.error('Every scenario needs a category and scenario text.');
    const shortIdx = scenarios.findIndex((s) => s.scenario.trim().length < 10);
    if (shortIdx >= 0)
      return toast.error(`Scenario ${shortIdx + 1}: text must be at least 10 characters.`);

    try {
      setSubmitting(true);
      await api.put(`/admin/contests/${id}`, {
        title: title.trim(),
        description: description.trim(),
        scheduledDate,
        startTime,
        endTime,
        durationMinutes,
        scenarios,
      });
      toast.success('Contest updated.');
      navigate(`/contests/${id}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update contest.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-brand-text gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin-slow" /> Loading contest…
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="card p-10 text-center">
        <p className="font-semibold text-ink">Contest not found.</p>
        <Link to="/contests" className="btn-ghost mt-3 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to contests
        </Link>
      </div>
    );
  }

  const isClosed = contestStatus === 'closed';

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Link to={`/contests/${id}`} className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to contest
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Edit Contest</h1>
          <p className="text-brand-text text-sm">
            Update the contest title, window, or scenarios. The participant allowlist is managed from the contest detail page.
          </p>
        </div>
      </motion.div>

      {isClosed && (
        <div className="card p-4 border-l-4 border-l-flame-500 text-sm text-ink">
          This contest is <span className="font-semibold">closed</span>. Closed contests cannot be edited — the server will reject any save.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="ce-title">Title <span className="text-ink-faint">*</span></label>
            <input
              id="ce-title"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="input max-w-lg" placeholder="e.g. Weekly Prompt Test #1"
              disabled={isClosed}
            />
          </div>
          <div>
            <label className="label" htmlFor="ce-description">Description</label>
            <textarea
              id="ce-description"
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[70px]"
              placeholder="Optional: what this test is about, time expectations, etc."
              disabled={isClosed}
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="ce-date">
                <Calendar className="w-3.5 h-3.5" /> Date (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="ce-date"
                type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                className="input" disabled={isClosed}
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="ce-start">
                <Clock className="w-3.5 h-3.5" /> Start time (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="ce-start"
                type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="input" disabled={isClosed}
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="ce-end">
                <Clock className="w-3.5 h-3.5" /> End time (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="ce-end"
                type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="input" disabled={isClosed}
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="ce-duration">
                <Clock className="w-3.5 h-3.5" /> Per-user limit (min)
              </label>
              <input
                id="ce-duration"
                type="number" min={5} max={480} value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="input" disabled={isClosed}
              />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="stat-icon"><Trophy className="w-5 h-5" /></span>
              <div>
                <h3 className="font-semibold text-ink">Scenarios</h3>
                <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
                  Each is scored out of 100. Final score is the average.
                </p>
              </div>
            </div>
            <button
              type="button" onClick={addScenario}
              disabled={scenarios.length >= 10 || isClosed}
              className="btn-ghost text-sm"
            >
              <Plus className="w-4 h-4" /> Add scenario
            </button>
          </div>

          {scenarios.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="rounded-xl border border-line p-4 space-y-3 bg-surface/40"
            >
              <div className="flex items-center justify-between">
                <span className="badge bg-panel text-panel-soft">Scenario {i + 1}</span>
                <button
                  type="button" onClick={() => removeScenario(i)}
                  disabled={scenarios.length <= 1 || isClosed}
                  className="text-xs text-brand-text hover:text-ink inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Remove scenario"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
              <div>
                <label className="label" htmlFor={`ce-cat-${i}`}>Category <span className="text-ink-faint">*</span></label>
                <select
                  id={`ce-cat-${i}`}
                  value={s.category}
                  onChange={(e) => updateScenario(i, { category: e.target.value })}
                  className="input" disabled={isClosed}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`ce-scen-${i}`}>Scenario text <span className="text-ink-faint">*</span></label>
                <textarea
                  id={`ce-scen-${i}`}
                  value={s.scenario}
                  onChange={(e) => updateScenario(i, { scenario: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Describe the real-world situation the user must write a prompt for."
                  disabled={isClosed}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link to={`/contests/${id}`} className="btn-ghost">Cancel</Link>
          <motion.button
            whileTap={{ scale: 0.98 }} type="submit"
            className="btn-primary" disabled={submitting || isClosed}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save changes</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
