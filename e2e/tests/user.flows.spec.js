import { test, expect } from '@playwright/test';
import { API, createUser, loginViaUi, setTheme, watchForErrors } from './helpers.js';

let user;
test.beforeAll(async ({ request }) => { user = await createUser(request, 'flows'); });

test.describe('User app — core flows', () => {
  test('landing page renders its marketing sections', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /login/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /register/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('skip link is the first thing a keyboard user reaches', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Chrome's sequential-focus starting point is undefined until the page has
    // been interacted with, and headless Chrome does not default it to the top
    // of the document. Setting it explicitly is what makes this test about the
    // page's focus order rather than about the browser's starting heuristics.
    await page.evaluate(() => {
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
      document.body.removeAttribute('tabindex');
    });
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return { text: el?.textContent?.trim(), href: el?.getAttribute('href') };
    });
    expect(focused.text).toMatch(/skip to main content/i);
    expect(focused.href).toBe('#main-content');
    // It must actually become visible when focused, not stay clipped.
    const box = await page.locator('.skip-link').boundingBox();
    expect(box.width).toBeGreaterThan(20);
  });

  test('registration requires a strong password and rejects a weak one', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/name/i).first().fill('Weak Tester');
    await page.getByLabel(/email/i).first().fill(`weak-${Date.now()}@example.com`);
    const pw = page.getByLabel(/^password/i).first();
    await pw.fill('password123');
    const confirm = page.getByLabel(/confirm/i).first();
    if (await confirm.count()) await confirm.fill('password123');
    await page.getByRole('button', { name: /create|register|sign up/i }).first().click();
    await expect(page.getByText(/too common|at least|must not/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('login, dashboard, analyze, result and history all work end to end', async ({ page }) => {
    const errors = watchForErrors(page);
    await loginViaUi(page, user.email, user.password);

    // Dashboard
    await expect(page.getByRole('heading', { name: /dashboard|overview|welcome/i }).first()).toBeVisible();

    // Analyze: pick a category, get a scenario, submit a prompt.
    await page.getByRole('link', { name: 'Analyze', exact: true }).first().click();
    await page.waitForURL(/analyze/);
    await page.selectOption('select', 'Email Writing');
    const scenario = page.locator('textarea').first();
    await expect(page.getByText(/scenario/i).first()).toBeVisible();
    await page.waitForTimeout(1200); // let the scenario land
    await page.locator('textarea').first().fill(
      'Act as a professional communication specialist. Write a formal email to the Principal ' +
      'requesting approval to run a hands-on AI workshop for B.Tech students this Saturday. ' +
      'Use a respectful tone, keep it under 180 words, include a clear subject line and one call to action.'
    );
    await page.getByRole('button', { name: /analyze prompt/i }).click();

    // Result page
    await page.waitForURL(/\/result\//, { timeout: 20000 });
    await expect(page.getByText(/\/\s*100|score/i).first()).toBeVisible();

    // History lists it
    await page.getByRole('link', { name: 'History', exact: true }).first().click();
    await page.waitForURL(/history/);
    await expect(page.getByRole('table').or(page.getByText(/no .* yet/i)).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('clipboard paste is blocked on the prompt field', async ({ page }) => {
    await loginViaUi(page, user.email, user.password);
    await page.goto('/analyze');
    await page.selectOption('select', 'Email Writing');
    await page.waitForTimeout(1200);
    const ta = page.locator('textarea').first();
    await ta.click();
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      ta.dispatchEvent(e);
    });
    await expect(page.getByText(/copy and paste are disabled/i)).toBeVisible({ timeout: 5000 });
  });

  test('protected routes redirect an anonymous visitor to login', async ({ page }) => {
    for (const path of ['/dashboard', '/analyze', '/history', '/contests', '/challenge']) {
      await page.goto(path);
      await page.waitForURL(/login/, { timeout: 10000 });
      expect(page.url()).toContain('/login');
    }
  });

  test('forgot-password screen submits and confirms without leaking existence', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
    await page.getByLabel(/email/i).fill('definitely-not-a-user@example.com');
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 10000 });
    // The confirmation must be identical for a non-existent address.
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
  });

  test('reset-password page rejects an incomplete link', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText(/link is missing information/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /update password/i })).toBeDisabled();
  });

  test('daily challenge and contests pages render', async ({ page }) => {
    const errors = watchForErrors(page);
    await loginViaUi(page, user.email, user.password);
    for (const [link, urlPart] of [['Challenge', 'challenge'], ['Contests', 'contests']]) {
      await page.getByRole('link', { name: link, exact: true }).first().click();
      await page.waitForURL(new RegExp(urlPart));
      await expect(page.getByRole('heading').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('404 route shows a not-found message rather than a blank page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test('logout clears the session', async ({ page }) => {
    await loginViaUi(page, user.email, user.password);
    await page.getByRole('button', { name: /log ?out/i }).first().click();
    await page.waitForURL(/\/$|login/);
    const token = await page.evaluate(() => localStorage.getItem('pk_token'));
    expect(token).toBeNull();
  });

  test('every page renders in dark mode without console errors', async ({ page }) => {
    const errors = watchForErrors(page);
    await setTheme(page, 'dark');
    await loginViaUi(page, user.email, user.password);
    for (const path of ['/dashboard', '/analyze', '/history', '/challenge', '/contests']) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('main')).toBeVisible();
      // Body must actually be dark on every one of them.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const m = bg.match(/\d+/g).slice(0, 3).map(Number);
      expect(Math.max(...m), `${path} body is not dark: ${bg}`).toBeLessThan(60);
    }
    expect(errors).toEqual([]);
  });
});
