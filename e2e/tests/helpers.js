import { expect } from '@playwright/test';

export const API = 'http://127.0.0.1:5100/api';

/** Creates a verified user straight through the API and returns credentials. */
export async function createUser(request, suffix = Date.now()) {
  const email = `e2e-${suffix}@example.com`;
  // The display name must not appear inside the password: the password policy
  // rejects that, and naming the user "E2E <suffix>" alongside a password
  // beginning "E2e" silently failed registration for every test that then
  // tried to log in. (The policy is working as intended — the test data was
  // the problem.)
  const password = 'Quokka7!Harbour';
  const res = await request.post(`${API}/auth/register`, {
    data: { name: `Test Person ${suffix}`, email, password, confirmPassword: password },
  });
  if (![200, 201].includes(res.status())) {
    throw new Error(`createUser: registration failed ${res.status()} ${await res.text()}`);
  }
  // Mail is unconfigured in this environment, so the OTP is printed to the
  // server log rather than sent. Verifying through the admin endpoint is more
  // reliable than scraping stdout.
  const admin = await adminToken(request);
  const list = await request.get(`${API}/admin/users?search=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  const found = (await list.json()).users?.[0];
  if (found) {
    await request.post(`${API}/admin/users/${found._id}/verify-email`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
  }
  return { email, password };
}

export async function adminToken(request) {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: 'e2eadmin@example.com', password: 'E2eAdminPass!9' },
  });
  return (await res.json()).token;
}

/** Signs in through the real UI so the session matches a user's. */
export async function loginViaUi(page, email, password) {
  await page.goto('/login');
  const emailField = page.getByLabel(/email/i).first();
  await emailField.waitFor({ state: 'visible', timeout: 10000 });
  await emailField.fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
}

/**
 * Sets the theme the way the toggle does, then waits for it to apply.
 *
 * Navigates first: localStorage is origin-scoped, and writing to it on
 * about:blank throws SecurityError.
 */
export async function setTheme(page, theme, path = '/') {
  if (!page.url().startsWith('http')) await page.goto(path);
  await page.evaluate((t) => localStorage.setItem('pk_theme', t), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'system' ? /light|dark/ : theme);
}

/** Resolved background/text colours of the page body. */
export async function pageColours(page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { bg: s.backgroundColor, fg: s.color };
  });
}

/** Relative luminance, for asserting a surface is actually dark/light. */
export function luminance(rgbString) {
  const m = rgbString.match(/\d+/g);
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Fails the test on any console error or failed request during the run. */
export function watchForErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // React's dev-mode act() and HMR noise are not product defects.
    if (/Download the React DevTools|\[vite\]/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('/@vite/') || u.includes('hot-update')) return;
    errors.push(`requestfailed: ${u} — ${r.failure()?.errorText}`);
  });
  return errors;
}
