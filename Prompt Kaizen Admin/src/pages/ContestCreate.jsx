import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Trophy, Calendar, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';

const CATEGORIES = [
  'Academic Writing','Email Writing','Resume and LinkedIn','Coding and Debugging',
  'Data Analysis','Business Communication','Interview Preparation','Research and Summarization',
  'Content Creation','Social Media Post','Image Generation Prompt','Other',
];

function todayIstISO() {
  // YYYY-MM-DD of today in IST.
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return (
    ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0')
  );
}

const emptyScenario = () => ({ category: '', scenario: '' });

export default function ContestCreate() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayIstISO());
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scenarios, setScenarios] = useState([emptyScenario(), emptyScenario(), emptyScenario(), emptyScenario()]);
  const [submitting, setSubmitting] = useState(false);

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
    // Mirror the backend's minimum-length rule so the admin sees the error
    // before hitting the network. Server still enforces this.
    const shortIdx = scenarios.findIndex((s) => s.scenario.trim().length < 10);
    if (shortIdx >= 0)
      return toast.error(`Scenario ${shortIdx + 1}: text must be at least 10 characters.`);

    try {
      setSubmitting(true);
      const { data } = await api.post('/admin/contests', {
        title: title.trim(),
        description: description.trim(),
        scheduledDate, // YYYY-MM-DD — server interprets as IST
        startTime,     // HH:MM IST
        endTime,       // HH:MM IST
        durationMinutes,
        scenarios,
      });
      toast.success('Contest created.');
      navigate(`/contests/${data.contest._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create contest.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Link to="/contests" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to contests
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">New Contest</h1>
          <p className="text-brand-text text-sm">
            Set the basics now; you can upload the participant allowlist on the next screen.
          </p>
        </div>
      </motion.div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="cc-title">Title <span className="text-ink-faint">*</span></label>
            <input
              id="cc-title"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="input max-w-lg" placeholder="e.g. Weekly Prompt Test #1"
            />
          </div>
          <div>
            <label className="label" htmlFor="cc-description">Description</label>
            <textarea
              id="cc-description"
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[70px]"
              placeholder="Optional: what this test is about, time expectations, etc."
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="cc-date">
                <Calendar className="w-3.5 h-3.5" /> Date (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="cc-date"
                type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="cc-start">
                <Clock className="w-3.5 h-3.5" /> Start time (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="cc-start"
                type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="cc-end">
                <Clock className="w-3.5 h-3.5" /> End time (IST) <span className="text-ink-faint">*</span>
              </label>
              <input
                id="cc-end"
                type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label inline-flex items-center gap-1.5" htmlFor="cc-duration">
                <Clock className="w-3.5 h-3.5" /> Per-user limit (min)
              </label>
              <input
                id="cc-duration"
                type="number" min={5} max={480} value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="input"
              />
            </div>
          </div>
          <p className="text-[11px] text-brand-text">
            The contest can be taken any time between <span className="font-semibold text-ink-soft tabular-nums">{startTime || '--:--'}</span> and{' '}
            <span className="font-semibold text-ink-soft tabular-nums">{endTime || '--:--'}</span> IST on the chosen date.
          </p>
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
              disabled={scenarios.length >= 10}
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
                  disabled={scenarios.length <= 1}
                  className="text-xs text-brand-text hover:text-ink inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Remove scenario"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
              <div>
                <label className="label" htmlFor={`cc-cat-${i}`}>Category <span className="text-ink-faint">*</span></label>
                <select
                  id={`cc-cat-${i}`}
                  value={s.category}
                  onChange={(e) => updateScenario(i, { category: e.target.value })}
                  className="input"
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`cc-scen-${i}`}>Scenario text <span className="text-ink-faint">*</span></label>
                <textarea
                  id={`cc-scen-${i}`}
                  value={s.scenario}
                  onChange={(e) => updateScenario(i, { scenario: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Describe the real-world situation the user must write a prompt for."
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link to="/contests" className="btn-ghost">Cancel</Link>
          <motion.button
            whileTap={{ scale: 0.98 }} type="submit"
            className="btn-primary" disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Creating...</>
            ) : (
              <><Save className="w-4 h-4" /> Save & Continue</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
