import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,       // shared database — keep ordering deterministic
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    // Drives the locally installed Google Chrome: the Playwright CDN download
    // is blocked in this environment.
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'user',  testMatch: /user\..*\.spec\.js/,  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:5173' } },
    { name: 'admin', testMatch: /admin\..*\.spec\.js/, use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:5174' } },
  ],
});
