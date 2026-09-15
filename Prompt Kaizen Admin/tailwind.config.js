/** @type {import('tailwindcss').Config} */
// Colour comes entirely from the semantic tokens in src/styles/tokens.css via
// ./tailwind-colors.cjs. The former `flame`/`cream` numeric scales were removed
// in the theming work: they were overloaded (flame-400/500/600 were brand
// orange while flame-700/900 were greys) and `flame-900` served as BOTH primary
// text and the dark panel background — two roles that must diverge in a dark
// theme. Use `text-ink`, `bg-surface`, `border-line`, `bg-brand`, `bg-panel`.

import semanticColors from './tailwind-colors.cjs';

export default {
  // Dark theme is opt-in via data-theme="dark" on <html>, set before first
  // paint. `selector` strategy (not `media`) because the user's explicit
  // choice must be able to override their OS preference.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ...semanticColors,
      },
      fontFamily: {
        sans: [
          'Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        // Driven by --shadow-strength so elevation reads correctly in both
        // themes; a black drop shadow simply disappears on a dark canvas.
        soft: '0 10px 30px -12px rgb(var(--shadow-strength))',
        glow: '0 0 0 6px rgb(var(--brand) / 0.18)',
        ring: '0 0 0 1px rgb(var(--ink) / 0.06), 0 1px 2px rgb(var(--ink) / 0.04)',
      },
      borderRadius: {
        '2xl': '1.1rem',
        '3xl': '1.6rem',
      },
      backgroundImage: {
        'grid-flame': "radial-gradient(circle at 1px 1px, rgb(var(--ink) / 0.06) 1px, transparent 0)",
        'mesh': 'radial-gradient(at 20% 10%, rgb(var(--panel-fg) / 0.10) 0px, transparent 50%), radial-gradient(at 80% 0%, rgb(var(--panel-fg) / 0.06) 0px, transparent 50%), radial-gradient(at 0% 90%, rgb(var(--panel-fg) / 0.08) 0px, transparent 60%)',
      },
      keyframes: {
        'fade-in':       { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'fade-in-up':    { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'pop-in':        { '0%': { opacity: 0, transform: 'scale(0.96)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        'float':         { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'shimmer':       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'pulse-ring':    { '0%': { boxShadow: '0 0 0 0 rgb(var(--brand) / 0.6)' }, '100%': { boxShadow: '0 0 0 18px rgb(var(--brand) / 0)' } },
        'spin-slow':     { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in':    'fade-in 300ms ease-out both',
        'fade-in-up': 'fade-in-up 420ms ease-out both',
        'pop-in':     'pop-in 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28) both',
        'float':      'float 5s ease-in-out infinite',
        'shimmer':    'shimmer 2.2s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.66, 0, 0, 1) infinite',
        'spin-slow':  'spin-slow 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
