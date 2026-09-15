/**
 * Resolves the built CSS by hand and reports what each themed class actually
 * renders as in both themes.
 *
 * Checks the compiled artefact rather than the source, so it catches a token
 * that was defined but never wired into Tailwind, or a class that silently
 * resolves to nothing.
 */
const fs = require('fs');
const path = require('path');

function check(appDir) {
  const assets = path.join(appDir, 'dist', 'assets');
  const cssFile = fs.readdirSync(assets).find((f) => f.endsWith('.css'));
  const css = fs.readFileSync(path.join(assets, cssFile), 'utf8');

  const vars = (selector) => {
    // `selector` arrives already regex-escaped; escaping again produced a
    // pattern that could never match the dark block, which made every token
    // look identical across themes.
    const m = css.match(new RegExp(selector + '\\{([^}]*)\\}'));
    if (!m) return {};
    return Object.fromEntries(
      [...m[1].matchAll(/--([\w-]+):\s*([^;]+)/g)].map(([, k, v]) => [k, v.trim()])
    );
  };

  const light = vars(':root');
  const dark = { ...light, ...vars('\\[data-theme=dark\\]') };

  // Pull the var name a utility class resolves to.
  const classVar = (cls) => {
    const m = css.match(new RegExp('\\.' + cls.replace(/[.\\/]/g, '\\$&') + '\\{[^}]*var\\(--([\\w-]+)\\)'));
    return m ? m[1] : null;
  };

  const CLASSES = [
    ['text-ink', 'body text'],
    ['text-ink-muted', 'meta text'],
    ['text-brand-text', 'brand text'],
    ['bg-surface', 'card background'],
    // bg-canvas is intentionally absent: it reaches the page through `@apply`
    // on `body`, which Tailwind inlines rather than emitting as a class.
    ['border-line', 'hairline border'],
    ['bg-panel', 'inverted panel'],
    ['bg-brand', 'primary button'],
    ['bg-surface-sunken', 'sunken fill'],
  ];

  console.log(`\n=== ${path.basename(appDir)} (${cssFile}) ===`);
  console.log('class'.padEnd(20), 'role'.padEnd(18), 'light'.padEnd(16), 'dark');
  let unresolved = 0, identical = 0;
  for (const [cls, role] of CLASSES) {
    const v = classVar(cls);
    if (!v) { console.log(cls.padEnd(20), role.padEnd(18), 'NOT FOUND'); unresolved++; continue; }
    const l = light[v], d = dark[v];
    const same = l === d;
    if (same) identical++;
    console.log(
      cls.padEnd(20), role.padEnd(18),
      `rgb(${l})`.padEnd(16),
      `rgb(${d})` + (same ? '  <-- same in both' : '')
    );
  }
  return { unresolved, identical, total: CLASSES.length };
}

let bad = 0;
for (const app of ['Prompt Kaizen Frontend', 'Prompt Kaizen Admin']) {
  const r = check(app);
  // bg-brand is intentionally identical across themes (the brand fill does not
  // change); everything else must differ.
  if (r.unresolved > 0) { console.log(`  ${r.unresolved} classes did not resolve`); bad += r.unresolved; }
  if (r.identical > 1) { console.log(`  ${r.identical} classes identical (only bg-brand should be)`); bad++; }
}
console.log(bad === 0 ? '\nOK — every themed class resolves and flips.' : `\n${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
