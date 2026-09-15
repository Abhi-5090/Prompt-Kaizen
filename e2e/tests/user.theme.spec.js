import { test, expect } from '@playwright/test';
import { setTheme, pageColours, luminance, contrast, watchForErrors } from './helpers.js';

test.describe('User app — theming', () => {
  test('landing page renders in light theme with a light canvas', async ({ page }) => {
    const errors = watchForErrors(page);
    await setTheme(page, 'light');
    const { bg, fg } = await pageColours(page);
    expect(luminance(bg)).toBeGreaterThan(0.6);   // genuinely light
    expect(luminance(fg)).toBeLessThan(0.2);      // genuinely dark text
    expect(contrast(bg, fg)).toBeGreaterThan(4.5);
    expect(errors).toEqual([]);
  });

  test('landing page renders in dark theme with a dark canvas', async ({ page }) => {
    const errors = watchForErrors(page);
    await setTheme(page, 'dark');
    const { bg, fg } = await pageColours(page);
    expect(luminance(bg)).toBeLessThan(0.05);     // genuinely dark
    expect(luminance(fg)).toBeGreaterThan(0.6);   // genuinely light text
    expect(contrast(bg, fg)).toBeGreaterThan(4.5);
    expect(errors).toEqual([]);
  });

  test('no flash of the wrong theme before first paint', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('pk_theme', 'dark'));
    // Capture data-theme at the earliest possible moment on the next load.
    await page.goto('/', { waitUntil: 'commit' });
    const early = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(early).toBe('dark');
  });

  test('theme toggle cycles light -> dark -> system and persists', async ({ page }) => {
    await setTheme(page, 'light');
    const group = page.getByRole('radiogroup', { name: /colour theme/i });
    await expect(group).toBeVisible();

    await group.getByRole('radio', { name: /dark/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('pk_theme'))).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await group.getByRole('radio', { name: /light/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await group.getByRole('radio', { name: /system/i }).click();
    expect(await page.evaluate(() => localStorage.getItem('pk_theme'))).toBe('system');
  });

  test('system theme follows the OS preference', async ({ browser }) => {
    for (const scheme of ['dark', 'light']) {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const p = await ctx.newPage();
      await p.goto('/');
      await p.evaluate(() => localStorage.setItem('pk_theme', 'system'));
      await p.reload();
      await expect(p.locator('html')).toHaveAttribute('data-theme', scheme);
      await ctx.close();
    }
  });

  test('cards, buttons and inputs all change with the theme', async ({ page }) => {
    const sample = async () => page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, fg: s.color, border: s.borderTopColor };
      };
      return { card: pick('.card'), button: pick('.btn-primary'), body: pick('body') };
    });

    await setTheme(page, 'light');
    await page.goto('/login');
    const light = await sample();
    await setTheme(page, 'dark');
    await page.goto('/login');
    const dark = await sample();

    expect(light.card).not.toBeNull();
    expect(light.card.bg).not.toBe(dark.card.bg);
    expect(light.body.bg).not.toBe(dark.body.bg);
    // The brand button keeps its fill by design.
    expect(light.button.bg).toBe(dark.button.bg);
    // Card surface must actually invert, not just shift slightly.
    expect(luminance(light.card.bg)).toBeGreaterThan(0.6);
    expect(luminance(dark.card.bg)).toBeLessThan(0.05);
  });

  test('text on every card meets AA contrast in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.goto('/login');
      const worst = await page.evaluate(() => {
        const lum = (str) => {
          const m = str.match(/\d+/g); if (!m) return null;
          const [r, g, b] = m.slice(0, 3).map((v) => {
            const c = Number(v) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const bgOf = (el) => {
          let n = el;
          while (n && n !== document.documentElement) {
            const c = getComputedStyle(n).backgroundColor;
            if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return c;
            n = n.parentElement;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        let min = 21, culprit = null;
        for (const el of document.querySelectorAll('p, span, h1, h2, h3, label, a, li')) {
          const text = (el.textContent || '').trim();
          if (!text || el.children.length > 0) continue;
          const st = getComputedStyle(el);
          if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.5) continue;
          // Screen-reader-only text is not rendered visually, so it has no
          // contrast requirement. Tailwind's `sr-only` clips it to a 1px box
          // rather than hiding it, so the checks above do not catch it.
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) continue;
          const size = parseFloat(st.fontSize);
          const bold = Number(st.fontWeight) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const l1 = lum(st.color), l2 = lum(bgOf(el));
          if (l1 === null || l2 === null) continue;
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const need = large ? 3 : 4.5;
          if (ratio < need && ratio < min) { min = ratio; culprit = { text: text.slice(0, 50), ratio: +ratio.toFixed(2), need, size }; }
        }
        return culprit;
      });
      expect(worst, `AA contrast failure in ${theme} theme: ${JSON.stringify(worst)}`).toBeNull();
    }
  });
});
