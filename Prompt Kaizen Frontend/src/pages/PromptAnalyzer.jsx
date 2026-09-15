import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, RefreshCw, Lightbulb, Wand2, Loader2, FileText, ListChecks,
  Eraser, Send, Shuffle, Mic, MicOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useVoiceInput } from '../utils/useVoiceInput.js';
import { lockClipboardProps } from '../utils/lockClipboard.js';

const CATEGORIES = [
  'Academic Writing','Email Writing','Resume and LinkedIn','Coding and Debugging',
  'Data Analysis','Business Communication','Interview Preparation','Research and Summarization',
  'Content Creation','Social Media Post','Image Generation Prompt','Other',
];

const TIPS = [
  'Set a role: "Act as a..."',
  'Mention the audience',
  'State the desired tone',
  'Specify the output format',
  'Add constraints (word limit, deadlines, examples)',
];

export default function PromptAnalyzer() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [category, setCategory] = useState('');
  const [scenario, setScenario] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  // True the moment the user invokes the mic for this draft — drives whether
  // the server consumes one of their daily dictation quota on submit.
  const [wasDictated, setWasDictated] = useState(false);

  // Dictation quota — pulled from the cached user object. Server is the
  // source of truth and we update the user after each analyze response.
  const dictation = user?.dictation || { limit: 3, usedToday: 0, remainingToday: 3 };
  const dictationExhausted = (dictation.remainingToday ?? 3) <= 0;

  // Voice dictation — appends final transcript chunks into the prompt textarea.
  const voice = useVoiceInput({
    onResult: (chunk) => {
      setUserPrompt((prev) => {
        const sep = prev && !/\s$/.test(prev) ? ' ' : '';
        return prev + sep + chunk;
      });
    },
  });

  const handleDictateClick = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    if (dictationExhausted) {
      toast.error(`Your daily limit of ${dictation.limit} dictations has been exhausted. Try again tomorrow.`);
      return;
    }
    setWasDictated(true);
    voice.start();
  };

  // Auto-fetch a scenario on category change. AbortController prevents an
  // older response (e.g. user picked A → B → A quickly) from clobbering the
  // currently-selected category's scenario when it lands late.
  useEffect(() => {
    if (!category) { setScenario(''); return; }
    const controller = new AbortController();
    fetchScenario(controller.signal);
    return () => controller.abort();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchScenario = async (signal) => {
    if (!category) return;
    try {
      setScenarioLoading(true);
      const { data } = await api.get('/prompts/scenario', {
        params: { category, exclude: scenario || undefined },
        signal,
      });
      setScenario(data.scenario);
    } catch (err) {
      // Aborted requests are expected when the user changes category quickly;
      // axios surfaces them as ERR_CANCELED — swallow them, only toast real
      // failures.
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      toast.error(err?.response?.data?.message || 'Failed to load a scenario.');
    } finally {
      setScenarioLoading(false);
    }
  };

  const validate = () => {
    if (!category) return 'Please select a prompt category.';
    if (!scenario) return 'Waiting for a scenario — please select a category first.';
    if (!userPrompt || userPrompt.trim().length < 5) return 'Your prompt is too short (min 5 characters).';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) return toast.error(v);
    try {
      setSubmitting(true);
      const { data } = await api.post('/prompts/analyze', {
        category, scenario, userPrompt,
        usedDictation: wasDictated,
      });
      if (data?.dictation) updateUser({ dictation: data.dictation });
      // Reset the dictation flag so a subsequent typed-only prompt doesn't
      // accidentally re-consume a daily dictation slot if the user navigates
      // back to this page without remounting the component.
      setWasDictated(false);
      toast.success('Prompt analyzed!');
      navigate(`/result/${data.evaluation._id}`);
    } catch (err) {
      // Server may reject with 429 if the dictation quota was just exhausted
      // (e.g. raced with another submission). Reflect that in the cached user
      // so the mic gates immediately.
      const body = err?.response?.data;
      if (body?.dictation) updateUser({ dictation: body.dictation });
      toast.error(body?.message || 'Analysis failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const words = userPrompt.trim().split(/\s+/).filter(Boolean).length;
  const ready = scenario && category;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl bg-panel text-panel-fg p-6 sm:p-8"
      >
        <div className="absolute inset-0 bg-mesh opacity-30" />
        <div className="relative max-w-3xl">
          <span className="chip bg-surface-sunken/10 text-panel-soft border-line/30">
            <Sparkles className="w-3.5 h-3.5" /> Prompt Analyzer
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-panel-fg text-balance">
            Pick a category. We give you a scenario. You write the perfect prompt.
          </h1>
          <p className="mt-2 text-panel-soft/80">
            Your prompt should set the role, audience, tone, format, and any constraints — we'll score
            how completely you covered them.
          </p>
        </div>
      </motion.div>

      <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-5">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6 space-y-5">
            <div>
              <label className="label" htmlFor="analyzer-category">Prompt Category <Required /></label>
              <select id="analyzer-category" value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <ScenarioPanel
              scenario={scenario}
              loading={scenarioLoading}
              hasCategory={!!category}
              onShuffle={() => fetchScenario()}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0" htmlFor="analyzer-prompt">Your Prompt <Required /></label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
                    {words} {words === 1 ? 'word' : 'words'}
                  </span>
                  {voice.supported && (
                    <>
                      <span
                        className={`text-[11px] uppercase tracking-wider font-semibold ${
                          dictationExhausted ? 'text-brand-text' : 'text-brand-text'
                        }`}
                        title="You can dictate up to 3 times per day (resets at IST midnight)."
                      >
                        {dictation.remainingToday ?? 3} / {dictation.limit ?? 3} dictations left today
                      </span>
                      <button
                        type="button"
                        onClick={handleDictateClick}
                        // HTML disabled is only used when there is no scenario
                        // yet (nothing to dictate against). When the quota is
                        // exhausted the button stays clickable so the click
                        // handler can show the "limit exhausted" toast — it
                        // just looks disabled visually.
                        disabled={!scenario}
                        aria-disabled={dictationExhausted && !voice.listening}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all ${
                          voice.listening
                            ? 'bg-panel text-panel-fg animate-pulse-ring'
                            : dictationExhausted
                              ? 'bg-surface-sunken border border-line text-brand-text cursor-not-allowed'
                              : 'bg-surface border border-line text-ink-soft hover:border-line-strong hover:bg-surface'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={
                          voice.listening
                            ? 'Stop dictation'
                            : dictationExhausted
                              ? `Daily limit of ${dictation.limit ?? 3} dictations reached`
                              : 'Dictate your prompt'
                        }
                      >
                        {voice.listening
                          ? <><MicOff className="w-3.5 h-3.5" /> Listening…</>
                          : <><Mic className="w-3.5 h-3.5" /> Dictate</>}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                id="analyzer-prompt"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                {...lockClipboardProps()}
                className={`input min-h-[200px] font-mono text-[13px] leading-relaxed ${
                  voice.listening ? 'ring-4 ring-line/40 border-panel' : ''
                }`}
                placeholder={
                  'Write the best possible prompt for the scenario above.\n\n' +
                  'Tip: include a role ("Act as..."), the task, the target audience, the tone,\n' +
                  'the desired output format, and any constraints (word limit, examples, deadline...).'
                }
                disabled={!scenario}
              />
              {voice.error && (
                <p className="mt-1 text-[11px] text-ink-soft">{voice.error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setUserPrompt(''); setWasDictated(false); }}
                disabled={submitting}
              >
                <Eraser className="w-4 h-4" /> Reset Prompt
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="btn-primary"
                disabled={submitting || !ready}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin-slow" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Analyze Prompt
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Right: tips rail */}
        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="stat-icon"><Lightbulb className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">Prompt checklist</h3>
            </div>
            <p className="text-xs text-brand-text mb-3">
              The strongest prompts cover all five of these in plain English.
            </p>
            <ul className="space-y-2">
              {TIPS.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-soft">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-[10px] font-bold">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="stat-icon"><ListChecks className="w-5 h-5" /></span>
              <h3 className="font-semibold text-ink">What we score</h3>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                ['Clarity', 10], ['Context', 15], ['Role', 10], ['Task', 15],
                ['Inputs', 15], ['Format', 10], ['Constraints', 10],
                ['Tone', 5], ['Relevance', 5], ['Grammar', 5],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
                  <span className="text-ink-soft font-medium">{k}</span>
                  <span className="font-bold text-ink">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 bg-panel text-panel-fg border-panel">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-5 h-5 text-panel-soft" />
              <h3 className="font-semibold">Improved prompt included</h3>
            </div>
            <p className="text-sm text-panel-soft/80 leading-relaxed">
              After analysis you'll get a ready-to-use improved version of your prompt, plus
              suggestions for what to add next time.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Required() {
  return <span className="text-ink-faint ml-0.5">*</span>;
}

function ScenarioPanel({ scenario, loading, hasCategory, onShuffle }) {
  return (
    <div className="relative rounded-2xl border border-line bg-surface/80 p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="stat-icon"><FileText className="w-5 h-5" /></span>
          <div>
            <p className="font-semibold text-ink text-sm">Scenario</p>
            <p className="text-[11px] uppercase tracking-wider text-brand-text">Provided by the system</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onShuffle}
          disabled={!hasCategory || loading}
          className="btn-ghost text-xs"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin-slow" />
            : <Shuffle className="w-4 h-4" />}
          Shuffle
        </button>
      </div>

      <div className="min-h-[60px]">
        <AnimatePresence mode="wait">
          {!hasCategory ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-sm text-brand-text"
            >
              Select a category to get a scenario.
            </motion.p>
          ) : loading && !scenario ? (
            <motion.p
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-sm text-brand-text flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin-slow" /> Fetching a scenario...
            </motion.p>
          ) : (
            <motion.p
              key={scenario}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap"
            >
              {scenario}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
