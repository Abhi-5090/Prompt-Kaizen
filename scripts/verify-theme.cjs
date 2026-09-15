/**
 * Theme integrity check.
 *
 * Guards the failure mode this token system is most prone to: a colour that
 * stops responding to the theme WITHOUT breaking the build. Tailwind silently
 * drops a class it cannot resolve, and a hardcoded hex in JSX compiles
 * perfectly — so both regressions are invisible until a dark-mode user
 * reports them.
 *
 * Four checks:
 *   1. the dark block exists and overrides the light one (the earlier version
 *      of this script had a regex bug that silently matched nothing, which
 *      made every token *look* identical across themes — check 4 exists so
 *      that class of bug fails loudly instead of passing)
 *   2. every token-based class actually used in source resolves in the CSS
 *   3. those classes resolve to values that differ between themes, except an
 *      explicit allowlist of ones that are meant to be constant
 *   4. a self-test proving the checker detects a deliberately broken input
 *
 * Run after building both apps.
 */
const fs = require('fs');
const path = require('path');

const APPS = ['Prompt Kaizen Frontend', 'Prompt Kaizen Admin'];

// Tokens that are intentionally the same in both themes, with the reason.
const CONSTANT_BY_DESIGN = {
  brand:         'the brand fill is the brand colour in both themes',
  'brand-hover': 'hover state of the brand fill — same reasoning as --brand',
  'brand-vivid': 'decorative brand orange for large washes; carries no small text',
  'brand-fg':    'white on a brand fill, which clears 4.5:1 in both themes',
};

// Files allowed to contain hardcoded colours, with the reason.
const HARDCODE_ALLOWLIST = {
  'WrappedShareCard.jsx': 'renders a shareable PNG that must look identical regardless of the viewer\'s theme',
  'celebrate.js': 'confetti particle colours — brand constants, not themed surfaces',
  'tokens.css': 'the token definitions themselves',
  'ThemeContext.jsx': 'sets the browser chrome colour (meta theme-color) — this is where those two values are defined',
  'useChartTheme.js': 'defensive fallbacks used only if a token is missing from the document',
};

function readCss(appDir) {
  const assets = path.join(appDir, 'dist', 'assets');
  if (!fs.existsSync(assets)) {
    throw new Error(`${appDir} has no dist/ — build it first (npm run build).`);
  }
  const file = fs.readdirSync(assets).find((f) => f.endsWith('.css'));
  if (!file) throw new Error(`No CSS bundle in ${assets}`);
  return { css: fs.readFileSync(path.join(assets, file), 'utf8'), file };
}

/** Variables declared in a rule block. */
function varsIn(css, selectorPattern) {
  const m = css.match(new RegExp(selectorPattern + '\\s*\\{([^}]*)\\}'));
  if (!m) return null;
  return Object.fromEntries(
    [...m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)].map(([, k, v]) => [k, v.trim()])
  );
}

/**
 * Every `--token` a given class resolves through.
 *
 * Tailwind emits variants and opacity modifiers under mangled selectors —
 * `hover:border-brand` becomes `.hover\:border-brand:hover` and `ring-ink/40`
 * becomes `.ring-ink\/40`. Matching only the bare `.class` name reported both
 * as unresolved, so the selector is matched loosely: the class name followed
 * by any escape/variant suffix.
 */
function classTokens(css, cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // `.cls` optionally followed by an escaped opacity (\/40) and/or a pseudo.
  const re = new RegExp('\\.(?:[\\w\\\\:-]*\\\\:)?' + escaped + '(?:\\\\\\/\\d+)?(?![\\w-])[^{]*\\{([^}]*)\\}');
  const m = css.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/var\(--([\w-]+)/g)].map((x) => x[1]);
}

/** Token-based utility classes actually written in the app's source. */
function usedClasses(appDir) {
  const prefixes = ['bg', 'text', 'border', 'ring', 'divide', 'from', 'to', 'via', 'placeholder'];
  const roles = ['ink', 'surface', 'line', 'brand', 'panel', 'canvas', 'positive', 'warning', 'danger'];
  const re = new RegExp(
    `\\b(?:${prefixes.join('|')})-(?:${roles.join('|')})(?:-[a-z]+)?\\b`, 'g'
  );
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(jsx?|css)$/.test(entry.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const line of src.split('\n')) {
        // Classes inside @apply are inlined into the component rule by
        // Tailwind and never emitted as standalone classes, so looking for
        // them in the bundle always fails. They are still themed — via the
        // rule they were inlined into — so they are not a finding.
        if (line.includes('@apply')) continue;
        for (const m of line.matchAll(re)) found.add(m[0]);
      }
    }
  };
  walk(path.join(appDir, 'src'));
  return [...found].sort();
}

/** Hardcoded colours in source that bypass the token system. */
function hardcodedColours(appDir) {
  const hits = [];
  const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d+/g;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(jsx?|css)$/.test(entry.name)) continue;
      if (HARDCODE_ALLOWLIST[entry.name]) continue;
      const src = fs.readFileSync(p, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        // Line-level exemption. Preferred over allowlisting a whole file,
        // because it forces each exception to state its reason next to the
        // code and keeps the rest of that file checked.
        // Look back over a short window so the marker can sit at the top of a
        // multi-line explanatory comment rather than being crammed onto the
        // same line as the code.
        const window = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (/theme-exempt/.test(window)) return;
        // Comments are prose, not styling.
        let code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        // Second argument of read()/readToken() is a defensive fallback used
        // only if the token is missing from the document — not a styling
        // decision that bypasses the theme.
        code = code.replace(/read(?:Token)?\([^)]*\)/g, '');
        for (const m of code.matchAll(re)) {
          hits.push({ file: path.relative(appDir, p), line: i + 1, value: m[0], text: line.trim().slice(0, 80) });
        }
      });
    }
  };
  walk(path.join(appDir, 'src'));
  return hits;
}

function checkApp(appDir) {
  const { css, file } = readCss(appDir);
  const problems = [];

  console.log(`\n${'='.repeat(64)}\n${appDir}  (${file})\n${'='.repeat(64)}`);

  // --- 1. Both theme blocks present -------------------------------------
  const light = varsIn(css, ':root');
  const darkOverrides = varsIn(css, '\\[data-theme=dark\\]');

  if (!light || Object.keys(light).length === 0) {
    problems.push('No :root token block found in the CSS bundle.');
  }
  if (!darkOverrides || Object.keys(darkOverrides).length === 0) {
    problems.push('No [data-theme=dark] block found — dark mode would silently do nothing.');
  }
  console.log(`  light tokens: ${light ? Object.keys(light).length : 0}`);
  console.log(`  dark overrides: ${darkOverrides ? Object.keys(darkOverrides).length : 0}`);
  if (problems.length) return { problems };

  const dark = { ...light, ...darkOverrides };

  // --- 2 + 3. Every used class resolves, and flips ----------------------
  const classes = usedClasses(appDir);
  const unresolved = [];
  const constant = [];
  let flipping = 0;

  for (const cls of classes) {
    const tokens = classTokens(css, cls);
    if (!tokens || tokens.length === 0) {
      // A class used in source but absent from the bundle renders as nothing.
      unresolved.push(cls);
      continue;
    }
    const colourTokens = tokens.filter((t) => light[t] !== undefined);
    if (colourTokens.length === 0) { unresolved.push(cls); continue; }

    const differs = colourTokens.some((t) => light[t] !== dark[t]);
    if (differs) { flipping++; continue; }

    const excused = colourTokens.every((t) => CONSTANT_BY_DESIGN[t]);
    if (excused) constant.push(`${cls} (${CONSTANT_BY_DESIGN[colourTokens[0]]})`);
    else problems.push(`${cls} resolves to ${colourTokens.join(', ')} which is identical in both themes.`);
  }

  console.log(`  classes used in source: ${classes.length}`);
  console.log(`  flip between themes:    ${flipping}`);
  if (constant.length) {
    console.log(`  constant by design:     ${constant.length}`);
    constant.forEach((c) => console.log(`      ${c}`));
  }
  if (unresolved.length) {
    problems.push(`${unresolved.length} class(es) used in source do not resolve in the CSS: ${unresolved.join(', ')}`);
  }

  // --- Hardcoded colours ------------------------------------------------
  const hard = hardcodedColours(appDir);
  if (hard.length) {
    console.log(`\n  hardcoded colours bypassing tokens: ${hard.length}`);
    for (const h of hard.slice(0, 12)) {
      console.log(`      ${h.file}:${h.line}  ${h.value}   ${h.text}`);
    }
    if (hard.length > 12) console.log(`      … and ${hard.length - 12} more`);
    problems.push(`${hard.length} hardcoded colour(s) outside the allowlist — these will not follow the theme.`);
  } else {
    console.log('  hardcoded colours bypassing tokens: 0');
  }

  return { problems };
}

/**
 * Self-test: feed the checker CSS whose dark block is missing and confirm it
 * complains. Without this, a regex bug in varsIn() would make every token look
 * identical and the whole check would pass vacuously — which is exactly what
 * happened to an earlier version of this script.
 */
function selfTest() {
  const broken = ':root{--ink: 1 2 3;--surface: 4 5 6}.text-ink{color:rgb(var(--ink))}';
  const noDark = varsIn(broken, '\\[data-theme=dark\\]');
  const gotLight = varsIn(broken, ':root');
  const resolves = classTokens(broken, 'text-ink');

  const ok =
    noDark === null &&                       // missing dark block is detected
    gotLight && gotLight.ink === '1 2 3' &&  // light block parses
    resolves && resolves[0] === 'ink';       // class → token mapping works

  console.log(`\nself-test: ${ok ? 'PASS' : 'FAIL'} — checker detects a missing dark block`);
  return ok;
}

let failures = [];
if (!selfTest()) failures.push('The checker itself is broken — its self-test failed.');

for (const app of APPS) {
  try {
    const { problems } = checkApp(app);
    problems.forEach((p) => failures.push(`[${app}] ${p}`));
  } catch (err) {
    failures.push(`[${app}] ${err.message}`);
  }
}

console.log(`\n${'='.repeat(64)}`);
if (failures.length === 0) {
  console.log('PASS — every themed class resolves and responds to the theme.');
  process.exit(0);
}
console.log(`FAIL — ${failures.length} problem(s):\n`);
failures.forEach((f) => console.log(`  • ${f}`));
process.exit(1);
