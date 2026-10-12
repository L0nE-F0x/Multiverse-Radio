import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests against the production build (dist/), served with the same headers
// (CSP, caching) as Netlify by tests/e2e/serve-dist.mjs. Build first: `npm run test:e2e` does.
const PORT = Number(process.env.E2E_PORT ?? 5415);
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node tests/e2e/serve-dist.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
});
