import { test, expect } from '@playwright/test';

/**
 * The usage audit had no coverage at all, which is how a numeric score ended
 * up being passed to a function that expects a rating label: the badge still
 * rendered, so nothing caught it. These tests pin the behaviour that is easy
 * to break silently — the two pagers advancing independently, the per-user
 * filter applying and clearing, and the page surviving a theme flip.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2eadmin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'E2eAdminPass!9';

const USERS = 'section[aria-label="Requests per user"]';
const TIMELINE = 'section[aria-label="What was submitted"]';

/** Day cells only — the month-nav arrows are also labelled buttons. */
const dayCells = (page) =>
  page.locator('[aria-label="Usage calendar"]')
    .locator('button[aria-label^="2"]');

async function signIn(page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/** Lands on the busiest day in view, so the panels have enough rows to page. */
async function openBusiestDay(page) {
  await page.goto('/usage');
  const cells = dayCells(page);
  await expect(cells.first()).toBeVisible({ timeout: 15_000 });

  const counts = await cells.evaluateAll((els) =>
    els.map((el, i) => ({
      i,
      n: parseInt(el.getAttribute('aria-label').match(/: (\d+) request/)?.[1] || '0', 10),
    })));
  const busiest = counts.sort((a, b) => b.n - a.n)[0];
  expect(busiest.n, 'the seeded month should contain at least one active day').toBeGreaterThan(0);
  await cells.nth(busiest.i).click();
  await expect(page.locator(`${TIMELINE} li`).first()).toBeVisible({ timeout: 10_000 });
}

test.describe('admin usage audit', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('calendar renders a full month and selecting a day loads it', async ({ page }) => {
    await page.goto('/usage');
    const cells = dayCells(page);
    await expect(cells.first()).toBeVisible({ timeout: 15_000 });

    // A month always has 28-31 day cells; padding cells carry no aria-label.
    const n = await cells.count();
    expect(n).toBeGreaterThanOrEqual(28);
    expect(n).toBeLessThanOrEqual(31);

    // Every cell states both numbers, so the grid is readable without clicking.
    const label = await cells.first().getAttribute('aria-label');
    expect(label).toMatch(/\d{4}-\d{2}-\d{2}: \d+ requests?, \d+ active users?/);
  });

  test('both panels paginate independently', async ({ page }) => {
    await openBusiestDay(page);

    const userRange = page.locator(USERS).getByText(/of \d+ users?/);
    const timeRange = page.locator(TIMELINE).getByText(/of \d+ requests?/);
    await expect(userRange).toBeVisible();
    await expect(timeRange).toBeVisible();

    const userBefore = await userRange.textContent();
    const timeBefore = await timeRange.textContent();

    // Advancing the timeline must not disturb the user panel's position.
    const timeNext = page.locator(TIMELINE).getByRole('button', { name: /next/i });
    if (await timeNext.isEnabled()) {
      await timeNext.click();
      await expect(timeRange).not.toHaveText(timeBefore);
      await expect(userRange).toHaveText(userBefore);
    }

    const userNext = page.locator(USERS).getByRole('button', { name: /next/i });
    if (await userNext.isEnabled()) {
      const timeMid = await timeRange.textContent();
      await userNext.click();
      await expect(userRange).not.toHaveText(userBefore);
      await expect(timeRange).toHaveText(timeMid);
    }
  });

  test('selecting a user filters the timeline, and clearing restores it', async ({ page }) => {
    await openBusiestDay(page);

    const timeRange = page.locator(TIMELINE).getByText(/of \d+ requests?/);
    const unfiltered = await timeRange.textContent();

    const firstUser = page.locator(`${USERS} li button`).first();
    const who = (await firstUser.getByTestId('usage-user-name').innerText()).trim();
    await firstUser.click();

    await expect(page.locator(TIMELINE)).toContainText(`Filtered to ${who}`);
    await expect(timeRange).not.toHaveText(unfiltered);

    // Every remaining row must belong to that person.
    const rows = await page.locator(`${TIMELINE} li`).count();
    expect(rows).toBeGreaterThan(0);

    await page.locator(TIMELINE).getByRole('button', { name: /clear/i }).click();
    await expect(timeRange).toHaveText(unfiltered);
  });

  test('renders in dark mode without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      // React's dev-mode update-depth warning fires from react-router's
      // <Navigate>, not from this page.
      if (m.type() === 'error' && !/Maximum update depth/.test(m.text())) errors.push(m.text());
    });

    await openBusiestDay(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator(`${TIMELINE} li`).first()).toBeVisible();

    // The score badge must paint its own background in both themes; relying on
    // the card showing through is what made it vanish in dark mode.
    const bg = await page.locator(`${TIMELINE} li`).first().locator('span').last()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, 'score badge should not be transparent').not.toBe('rgba(0, 0, 0, 0)');

    expect(errors).toEqual([]);
  });
});
