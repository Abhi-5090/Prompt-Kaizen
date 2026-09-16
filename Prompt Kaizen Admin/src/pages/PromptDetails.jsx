import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, useMotionValue, animate, useTransform } from 'framer-motion';
import {
  Trophy, Wand2, Lightbulb, ThumbsUp, ThumbsDown, AlertTriangle,
  Copy, Check, ArrowLeft, FileText, GaugeCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import Heatmap from '../components/Heatmap.jsx';
import { ratingBadgeClass, PARAMETER_KEYS, progressBarClass } from '../utils/scoreUtils.js';

export default function PromptDetails() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/prompts/${id}`)
      .then((res) => setData(res.data.evaluation))
      .catch((e) => toast.error(errorMessage(err, 'Failed to load prompt.')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-brand-text">Loading prompt...</p>;
  if (!data)   return null;

  const copyImproved = async () => {
    await navigator.clipboard.writeText(data.improvedPrompt || '');
    setCopied(true);
    toast.success('Improved prompt copied');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Link
            to="/prompts"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to prompts
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">Prompt Details</h1>
          <p className="text-brand-text text-sm">
            Category: <span className="font-semibold text-ink-soft">{data.category}</span>
          </p>
        </div>
      </motion.div>

      {/* Overall score */}
      <OverallScore data={data} />

      {/* Per-parameter scores */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="card p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-10 h-10 rounded-xl bg-brand text-brand-fg flex items-center justify-center shadow-[0_8px_20px_-10px_rgba(241,93,35,0.55)]">
            <GaugeCircle className="w-5 h-5" />
          </span>
          <h3 className="font-semibold text-ink">Per-parameter scores</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PARAMETER_KEYS.map((p, idx) => {
            const v = data.scores?.[p.key] ?? 0;
            const ratio = v / p.max;
            const strong = ratio >= 0.75;
            return (
              <motion.div
                key={p.key}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * idx }}
                whileHover={{ y: -2 }}
                className={`relative rounded-xl border p-3.5 overflow-hidden transition-shadow ${
                  strong
                    ? 'border-brand/40 bg-gradient-to-br from-brand/8 to-white hover:shadow-[0_12px_30px_-14px_rgba(241,93,35,0.45)]'
                    : 'border-line bg-surface hover:shadow-soft'
                }`}
              >
                <span className={`absolute inset-x-0 top-0 h-0.5 ${strong ? 'bg-brand' : 'bg-brand/30'}`} />
                <p className="text-[10px] uppercase tracking-wider text-brand-text font-semibold">{p.label}</p>
                <p className="mt-1 font-bold text-ink text-lg tabular-nums">
                  {v}<span className="text-brand-text text-xs font-semibold"> / {p.max}</span>
                </p>
                <div className="h-2 mt-2 rounded-full bg-surface-sunken overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${ratio * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.05 * idx, ease: 'easeOut' }}
                    className={`h-full ${progressBarClass(ratio)}`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <Heatmap scores={data.scores} />

      <div className="grid md:grid-cols-3 gap-4">
        <ListCard title="Strengths"           items={data.strengths}        Icon={ThumbsUp}      emptyMsg="No notable strengths detected." tone="positive" />
        <ListCard title="Weaknesses"          items={data.weaknesses}       Icon={ThumbsDown}    emptyMsg="No notable weaknesses."          tone="dark" />
        <ListCard title="Missing Parameters"  items={data.missingParameters} Icon={AlertTriangle} emptyMsg="Nothing missing — great!"        tone="warn" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="relative rounded-2xl shadow-soft border border-brand/25 bg-gradient-to-br from-brand/8 via-white to-white p-5 overflow-hidden"
      >
        <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
        <div className="flex items-center gap-2 mb-3">
          <span className="w-10 h-10 rounded-xl bg-brand text-brand-fg flex items-center justify-center shadow-[0_8px_20px_-10px_rgba(241,93,35,0.55)]">
            <Lightbulb className="w-5 h-5" />
          </span>
          <h3 className="font-semibold text-ink">Suggestions</h3>
        </div>
        {data.suggestions?.length ? (
          <ul className="space-y-2 text-sm text-ink">
            {data.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-brand/20 bg-surface/70 px-3 py-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-text">No suggestions — looks polished!</p>
        )}
      </motion.div>

      {/* Improved prompt */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="rounded-2xl bg-panel text-panel-fg p-6 shadow-soft relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-mesh opacity-20" />
        <div className="relative flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-panel-soft" />
            <h3 className="font-semibold text-panel-fg">Improved Prompt</h3>
          </div>
          <button onClick={copyImproved} className="btn-cream text-xs">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
        </div>
        <div className="relative rounded-xl bg-panel/70 border border-line/20 p-4 text-sm leading-relaxed whitespace-pre-wrap text-panel-fg font-mono">
          {data.improvedPrompt}
        </div>
      </motion.div>

      <OriginalCard data={data} />
    </div>
  );
}

function OverallScore({ data }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (latest) => Math.round(latest));
  useEffect(() => {
    const controls = animate(mv, data.overallScore, { duration: 1.1, ease: 'easeOut' });
    return controls.stop;
  }, [data.overallScore, mv]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="card p-6 flex flex-wrap items-center gap-6"
    >
      <div className="relative">
        <div className="w-28 h-28 rounded-full bg-panel text-panel-soft flex items-center justify-center text-4xl font-bold shadow-soft">
          <motion.span>{rounded}</motion.span>
        </div>
        <div className="absolute -inset-1 rounded-full animate-pulse-ring pointer-events-none" />
      </div>
      <div className="flex-1 min-w-[220px]">
        <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">Overall Compatibility</p>
        <p className="mt-1 text-2xl font-bold text-ink">{data.overallScore} / 100</p>
        <span className={`mt-2 badge ${ratingBadgeClass(data.rating)}`}>
          <Trophy className="w-3.5 h-3.5" /> {data.rating}
        </span>
        <div className="mt-4 h-3 w-full rounded-full bg-surface-sunken overflow-hidden">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${data.overallScore}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-brand-vivid to-brand-hover shadow-[0_0_18px_rgba(241,93,35,0.5)]"
          />
        </div>
        <p className="text-[11px] text-brand-text mt-2">Higher is better. 90+ = Excellent.</p>
      </div>
      <div className="ml-auto text-right text-sm">
        <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">Submitted</p>
        <p className="text-ink font-medium">{new Date(data.createdAt).toLocaleString()}</p>
      </div>
    </motion.div>
  );
}

function ListCard({ title, items = [], Icon, emptyMsg, tone = 'positive' }) {
  const styles = {
    positive: {
      card:  'bg-gradient-to-br from-brand/5 to-white border-brand/20 hover:shadow-[0_18px_44px_-22px_rgba(241,93,35,0.5)]',
      icon:  'bg-brand text-brand-fg shadow-[0_8px_20px_-10px_rgba(241,93,35,0.55)]',
      badge: 'bg-brand text-brand-fg',
      item:  'border-brand/25 bg-brand/5 text-ink',
      bullet:'bg-brand',
    },
    dark: {
      card:  'bg-gradient-to-br from-panel to-panel border-panel text-panel-fg',
      icon:  'bg-brand text-brand-fg',
      badge: 'bg-surface-sunken text-ink',
      item:  'border-line/15 bg-panel/40 text-panel-fg',
      bullet:'bg-brand',
    },
    warn: {
      card:  'bg-surface border-brand/40 hover:shadow-[0_18px_44px_-22px_rgba(241,93,35,0.45)]',
      icon:  'bg-brand text-brand-fg shadow-[0_8px_20px_-10px_rgba(241,93,35,0.55)]',
      badge: 'bg-panel text-brand-fg',
      item:  'border-brand/30 bg-surface-sunken text-ink',
      bullet:'bg-brand',
    },
  }[tone];

  const titleColor = tone === 'dark' ? 'text-panel-fg' : 'text-ink';
  const emptyColor = tone === 'dark' ? 'text-panel-soft/70' : 'text-brand-text';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
      className={`relative rounded-2xl shadow-soft border p-5 transition-shadow ${styles.card}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </span>
        <h3 className={`font-semibold ${titleColor}`}>{title}</h3>
        {items.length > 0 ? (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${styles.badge}`}>
            {items.length}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className={`text-sm ${emptyColor}`}>{emptyMsg}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s, i) => (
            <li key={i} className={`text-sm rounded-lg border px-3 py-2 flex items-start gap-2 ${styles.item}`}>
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${styles.bullet}`} />
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function OriginalCard({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="card p-5 space-y-4 text-sm"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-10 h-10 rounded-xl bg-brand text-brand-fg flex items-center justify-center shadow-[0_8px_20px_-10px_rgba(241,93,35,0.55)]">
          <FileText className="w-5 h-5" />
        </span>
        <h3 className="font-semibold text-ink">Original Submission</h3>
      </div>
      <Row label="Scenario" value={data.scenario} />
      <Row label="Your Prompt" value={data.userPrompt} mono />
    </motion.div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">{label}</p>
      <p className={`mt-0.5 whitespace-pre-wrap text-ink ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</p>
    </div>
  );
}
