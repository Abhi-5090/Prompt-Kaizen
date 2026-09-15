/**
 * Token contrast audit.
 *
 * Checks every text token against every surface it can realistically sit on —
 * not just the lightest one. An earlier pass validated only against
 * `--surface` and so missed that `--ink-muted` fell to 4.45:1 on
 * `--surface-sunken`, which is where labels and chips actually live.
 */
const fs = require('fs');

const css = fs.readFileSync('.design/tokens.css', 'utf8');
const block = (sel) => {
  const m = css.match(new RegExp(sel + '\\s*\\{([\\s\\S]*?)\\n\\}'));
  return m ? Object.fromEntries([...m[1].matchAll(/--([\w-]+)\s*:\s*([\d ]+);/g)].map(([, k, v]) => [k, v.trim()])) : {};
};
const light = block(':root');
const dark = { ...light, ...block("\\[data-theme='dark'\\]") };

const lum = (rgb) => {
  const c = rgb.split(/\s+/).map((x) => {
    const v = Number(x) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Text tokens and the minimum they must clear. ink-faint is placeholder and
// disabled text — incidental, so 3:1.
const TEXT = { ink: 4.5, 'ink-soft': 4.5, 'ink-muted': 4.5, 'ink-faint': 3.0, 'brand-text': 4.5 };
const SURFACES = ['canvas', 'surface', 'surface-raised', 'surface-sunken'];

let failures = 0;
for (const [themeName, tokens] of [['light', light], ['dark', dark]]) {
  console.log(`\n${themeName} theme`);
  console.log('  ' + 'text token'.padEnd(13) + SURFACES.map((s) => s.padStart(16)).join(''));
  for (const [t, need] of Object.entries(TEXT)) {
    const cells = SURFACES.map((s) => {
      const r = ratio(tokens[t], tokens[s]);
      const ok = r >= need;
      if (!ok) failures++;
      return `${r.toFixed(2)}${ok ? ' ' : '!'}`.padStart(16);
    });
    console.log('  ' + t.padEnd(13) + cells.join(''));
  }
  // Foreground on the brand fill, which is what buttons are.
  const bf = ratio(tokens['brand-fg'], tokens.brand);
  const ok = bf >= 4.5;
  if (!ok) failures++;
  console.log(`  ${'brand-fg/brand'.padEnd(13)}${(bf.toFixed(2) + (ok ? ' ' : '!')).padStart(16)}  (buttons carry 14px text → needs 4.5)`);
  // Panel text.
  const pf = ratio(tokens['panel-fg'], tokens.panel);
  if (pf < 4.5) failures++;
  console.log(`  ${'panel-fg/panel'.padEnd(13)}${(pf.toFixed(2) + (pf >= 4.5 ? ' ' : '!')).padStart(16)}`);
}

console.log(`\n${failures === 0 ? 'PASS — every text token clears AA on every surface it can sit on.' : `FAIL — ${failures} combination(s) below threshold (marked !).`}`);
process.exit(failures === 0 ? 0 : 1);
