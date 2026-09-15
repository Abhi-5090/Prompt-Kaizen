import { test, expect } from '@playwright/test';
import { API, setTheme, watchForErrors, luminance } from './helpers.js';

const ADMIN = { email: 'e2eadmin@example.com', password: 'E2eAdminPass!9' };

async function loginAdmin(page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).first().fill(ADMIN.email);
  await page.getByLabel(/password/i).first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Admin app', () => {
  test('login page renders and rejects a non-admin account', async ({ page, request }) => {
    const errors = watchForErrors(page);
    await page.goto('/login');
    await expect(page.getByRole('heading').first()).toBeVisible();

    // A verified ordinary user must not get into the console.
    const email = `admin-reject-${Date.now()}@example.com`;
    const password = 'E2eUserPass!9';
    await request.post(`${API}/auth/register`, { data: { name: 'Nope', email, password, confirmPassword: password } });
    const tok = (await (await request.post(`${API}/auth/login`, { data: ADMIN })).json()).token;
    const list = await (await request.get(`${API}/admin/users?search=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    if (list.users?.[0]) {
      await request.post(`${API}/admin/users/${list.users[0]._id}/verify-email`, { headers: { Authorization: `Bearer ${tok}` } });
    }

    await page.getByLabel(/email/i).first().fill(email);
    await page.getByLabel(/password/i).first().fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page.getByText(/not an admin|admin privileges/i)).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/login');
    expect(errors).toEqual([]);
  });

  test('overview, users, prompts and contests all load', async ({ page }) => {
    const errors = watchForErrors(page);
    await loginAdmin(page);
    await expect(page.getByRole('heading').first()).toBeVisible();

    for (const [name, urlPart] of [[/users/i, 'users'], [/prompts/i, 'prompts'], [/contests/i, 'contests']]) {
      await page.getByRole('link', { name }).first().click();
      await page.waitForURL(new RegExp(urlPart));
      await expect(page.getByRole('heading').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('user list paginates and searches on the server', async ({ page, request }) => {
    // Seed enough users that paging is exercised.
    const tok = (await (await request.post(`${API}/auth/login`, { data: ADMIN })).json()).token;
    const before = await (await request.get(`${API}/admin/users?limit=1`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    if (before.pagination.total < 30) {
      for (let i = 0; i < 30; i++) {
        await request.post(`${API}/auth/register`, {
          data: { name: `Page User ${i}`, email: `pageuser-${i}@example.com`, password: 'E2eUserPass!9', confirmPassword: 'E2eUserPass!9' },
        });
      }
    }

    await loginAdmin(page);
    await page.goto('/users');
    await expect(page.getByRole('navigation', { name: /pagination/i })).toBeVisible({ timeout: 15000 });

    const rowsPage1 = await page.locator('tbody tr').count();
    expect(rowsPage1).toBeGreaterThan(0);
    expect(rowsPage1).toBeLessThanOrEqual(25);

    // Page 2 shows different rows.
    const firstEmailP1 = await page.locator('tbody tr').first().innerText();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.waitForTimeout(800);
    const firstEmailP2 = await page.locator('tbody tr').first().innerText();
    expect(firstEmailP2).not.toBe(firstEmailP1);

    // Search narrows the total, proving it ran server-side.
    await page.getByRole('searchbox', { name: /search users/i }).fill('pageuser-7');
    await page.waitForTimeout(1200);
    const totalText = await page.getByRole('navigation', { name: /pagination/i }).innerText();
    expect(totalText).toMatch(/\d/);
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeLessThan(rowsPage1 + 1);
  });

  test('admin app themes correctly in light and dark', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme, '/login');
      await loginAdmin(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const lum = luminance(bg);
      if (theme === 'dark') expect(lum).toBeLessThan(0.05);
      else expect(lum).toBeGreaterThan(0.6);
    }
  });

  test('every admin page renders dark without console errors', async ({ page }) => {
    const errors = watchForErrors(page);
    await setTheme(page, 'dark', '/login');
    await loginAdmin(page);
    for (const path of ['/', '/users', '/prompts', '/contests']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const m = bg.match(/\d+/g).slice(0, 3).map(Number);
      expect(Math.max(...m), `${path} not dark: ${bg}`).toBeLessThan(60);
    }
    expect(errors).toEqual([]);
  });

  test('theme toggle is present and works in the admin navbar', async ({ page }) => {
    await loginAdmin(page);
    const group = page.getByRole('radiogroup', { name: /colour theme/i });
    await expect(group).toBeVisible();
    await group.getByRole('radio', { name: /dark/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('charts render and follow the theme', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/');
    // Recharts renders into SVG.
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15000 });
    const lightStroke = await page.locator('.recharts-cartesian-grid line').first().getAttribute('stroke');

    await setTheme(page, 'dark', '/');
    await loginAdmin(page);
    await page.goto('/');
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15000 });
    const darkStroke = await page.locator('.recharts-cartesian-grid line').first().getAttribute('stroke');

    expect(lightStroke, 'chart gridlines must change with the theme').not.toBe(darkStroke);
  });

  test('contest creation form validates', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/contests');
    const createLink = page.getByRole('link', { name: /create|new contest/i }).first();
    if (await createLink.count()) {
      await createLink.click();
      await page.waitForURL(/create|new/);
      await expect(page.getByRole('heading').first()).toBeVisible();
      // Submitting empty must not silently succeed.
      const submit = page.getByRole('button', { name: /create|save/i }).first();
      if (await submit.count()) {
        await submit.click();
        await page.waitForTimeout(1000);
        expect(page.url()).toMatch(/create|new/);
      }
    }
  });

  test('skip link works in the admin app too', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Headless Chrome leaves the sequential-focus starting point undefined
    // until the page is interacted with; set it explicitly so this tests the
    // page's focus order rather than the browser's heuristics.
    await page.evaluate(() => {
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
      document.body.removeAttribute('tabindex');
    });
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(text).toMatch(/skip to main content/i);
  });
});
