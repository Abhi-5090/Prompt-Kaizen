import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Target, ListChecks, Lightbulb, Wand2, BarChart3, History,
  ArrowRight, CheckCircle2, ShieldCheck, Zap, MoveRight, GaugeCircle, Quote,
} from 'lucide-react';
import Reveal from '../components/Reveal.jsx';

const features = [
  { Icon: Target,     title: 'Compatibility Score',  desc: 'Quantify how well your prompt matches the situation across 10 parameters.' },
  { Icon: ListChecks, title: 'Missing Parameters',   desc: 'Instantly know what is missing: role, context, tone, format, audience.' },
  { Icon: Lightbulb,  title: 'Smart Suggestions',    desc: 'Actionable feedback that turns vague prompts into crystal-clear ones.' },
  { Icon: Wand2,      title: 'Improved Prompt',      desc: 'A polished, ready-to-use rewrite is generated for you in seconds.' },
  { Icon: BarChart3,  title: 'Dashboard & Heatmaps', desc: 'Track your prompting progress with charts and parameter heatmaps.' },
  { Icon: History,    title: 'Prompt History',       desc: 'Review, compare, and improve from every past evaluation.' },
];

const steps = [
  { n: 1, Icon: GaugeCircle, title: 'Pick a category',   desc: 'Choose what you want to write — we hand you a real-world scenario.' },
  { n: 2, Icon: Sparkles,    title: 'Write your prompt', desc: 'Craft the best prompt you can for the scenario we provide.' },
  { n: 3, Icon: ShieldCheck, title: 'Get your report',   desc: 'See scores, missing parts, suggestions, and an improved version.' },
];

const scoring = [
  { label: 'Clarity', max: 10 }, { label: 'Context', max: 15 },
  { label: 'Role Assignment', max: 10 }, { label: 'Task Definition', max: 15 },
  { label: 'Input Parameters', max: 15 }, { label: 'Output Format', max: 10 },
  { label: 'Constraints', max: 10 }, { label: 'Tone', max: 5 },
  { label: 'Relevance', max: 5 }, { label: 'Grammar & Structure', max: 5 },
];

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      {/* ===================== HERO ===================== */}
      <section className="relative">
        <div className="absolute inset-0 bg-brand" />
        <div className="absolute inset-0 opacity-30 bg-mesh" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-28 sm:pt-28 sm:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <span className="inline-flex items-center gap-2 chip bg-surface/30 text-ink border-panel/30">
              <Zap className="w-3.5 h-3.5" /> Prompt Engineering, Quantified
            </span>
            <h1 className="mt-5 text-5xl sm:text-6xl font-bold tracking-tight text-ink text-balance">
              Write prompts that <span className="text-ink">actually work.</span>
            </h1>
            <p className="mt-5 text-lg text-ink max-w-2xl">
              Prompt Kaizen scores your prompt against a real-world scenario across 10 parameters,
              points out what's missing, and rewrites it for you — in seconds.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className="btn-cream">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-ghost bg-transparent border-panel/40 text-ink hover:bg-panel/10 hover:border-panel/60">
                I already have an account
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-ink text-sm">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ink" /> Free forever</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ink" /> No credit card</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ink" /> Privacy-first</span>
            </div>
          </motion.div>

          {/* Floating preview card */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
            className="hidden lg:block absolute right-6 top-24 w-[380px]"
          >
            <div className="card p-5 animate-float">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 chip">
                  <Sparkles className="w-3.5 h-3.5" /> Live demo
                </div>
                <span className="badge-cream">Score 87</span>
              </div>
              <p className="mt-3 text-[12px] uppercase tracking-wider text-brand-text font-semibold">Scenario</p>
              <p className="text-sm text-ink mt-1">
                Write a formal email to the Principal requesting permission for an AI workshop.
              </p>
              <p className="mt-4 text-[12px] uppercase tracking-wider text-brand-text font-semibold">Your prompt</p>
              <p className="text-sm text-ink mt-1 italic">"Write an email for AI workshop permission."</p>
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {[10, 6, 0, 12, 8, 7, 8, 3, 4, 5].map((v, i) => {
                  const cls = v >= 8 ? 'bg-surface-sunken' : v >= 5 ? 'bg-surface-sunken' : 'bg-panel';
                  return <div key={i} className={`h-6 rounded-md ${cls}`} title={String(v)} />;
                })}
              </div>
              <div className="mt-4 text-[11px] text-brand-text">
                Heatmap of 10 prompt parameters · tap any cell for details
              </div>
            </div>
          </motion.div>
        </div>

        {/* curved transition */}
        <svg viewBox="0 0 1440 80" className="block w-full text-panel-fg" preserveAspectRatio="none">
          <path d="M0,40 C320,80 720,0 1440,60 L1440,80 L0,80 Z" fill="currentColor" />
        </svg>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section id="features" className="bg-surface/60 grid-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <Reveal>
            <div className="text-center mb-12">
              <span className="chip"><Sparkles className="w-3.5 h-3.5" /> What you get</span>
              <h2 className="section-title mt-3">Everything you need to write better prompts</h2>
              <p className="text-brand-text mt-2 max-w-xl mx-auto">
                A complete feedback loop for every prompt you write — from scoring to a one-click rewrite.
              </p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.05}>
                <div className="card p-6 h-full hover:shadow-[0_18px_50px_-18px_rgba(241,93,35,0.55)] hover:-translate-y-0.5 transition-all duration-300">
                  <div className="w-11 h-11 rounded-xl bg-brand text-brand-fg flex items-center justify-center">
                    <f.Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">{f.title}</h3>
                  <p className="text-sm text-brand-text mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how" className="bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <Reveal>
            <div className="text-center mb-12">
              <span className="chip"><MoveRight className="w-3.5 h-3.5" /> How it works</span>
              <h2 className="section-title mt-3">Three quick steps</h2>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5 relative">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="relative card p-6 h-full">
                  <span className="absolute -top-3 left-6 badge-flame">Step {s.n}</span>
                  <div className="w-12 h-12 rounded-xl bg-surface-sunken text-ink flex items-center justify-center">
                    <s.Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">{s.title}</h3>
                  <p className="text-sm text-brand-text mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SCORING ===================== */}
      <section id="scoring" className="bg-panel text-panel-fg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <Reveal>
            <div className="text-center mb-12">
              <span className="chip bg-surface-sunken/10 text-panel-soft border-line/30">
                <GaugeCircle className="w-3.5 h-3.5" /> Scoring explained
              </span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-panel-fg">
                100-point evaluation across 10 parameters
              </h2>
              <p className="text-panel-soft/70 mt-2">Every prompt gets a transparent, deterministic score.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {scoring.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.04}>
                <div className="rounded-2xl border border-line/20 bg-panel/50 p-4 text-center hover:bg-panel hover:border-line/40 transition">
                  <p className="text-[11px] uppercase tracking-wider text-panel-soft/70">{s.label}</p>
                  <p className="text-3xl font-bold mt-1 text-panel-soft">{s.max}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <div className="mt-12 max-w-2xl mx-auto rounded-2xl border border-line/20 p-6 bg-panel/40">
              <Quote className="w-6 h-6 text-panel-soft" />
              <p className="mt-3 text-panel-fg/90 leading-relaxed">
                "I stopped guessing why my prompts failed. Prompt Kaizen showed me exactly which
                parameter I was missing — usually the audience or the format."
              </p>
              <p className="mt-3 text-sm text-panel-soft/60">— a developer who finally writes great prompts</p>
            </div>
          </Reveal>

          <Reveal delay={0.25}>
            <div className="mt-12 text-center">
              <Link to="/register" className="btn-cream">
                Try it now — it's free <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="bg-surface/60 border-t border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-wrap items-center justify-between gap-3 text-sm text-brand-text">
          <p>© {new Date().getFullYear()} Prompt Kaizen — Compatibility Analyzer</p>
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-panel-soft" /> Built with privacy in mind
          </p>
        </div>
      </footer>
    </div>
  );
}
