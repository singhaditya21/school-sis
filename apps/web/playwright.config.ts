import { defineConfig, devices } from '@playwright/test';
import { ensurePlaywrightTestEnvironment } from './e2e/test-environment';

const configuredGlobalTimeout = Number(process.env.PLAYWRIGHT_GLOBAL_TIMEOUT_MS);
const requestedPlaywrightPort = process.env.PLAYWRIGHT_PORT || '3000';
const playwrightPort = /^\d+$/.test(requestedPlaywrightPort) ? requestedPlaywrightPort : '3000';
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${playwrightPort}`;
const startServerCommand = [
  'if [ -f .next/standalone/apps/web/server.js ]; then',
  'mkdir -p .next/standalone/apps/web/.next;',
  'cp -R .next/static .next/standalone/apps/web/.next/static 2>/dev/null || true;',
  'cp -R public .next/standalone/apps/web/public 2>/dev/null || true;',
  `PORT=${playwrightPort} HOSTNAME=127.0.0.1 node --env-file=.env.test .next/standalone/apps/web/server.js;`,
  'else',
  `node --env-file=.env.test ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${playwrightPort};`,
  'fi',
].join(' ');

ensurePlaywrightTestEnvironment({
  envFileName: '.env.test',
  defaultDatabaseName: 'school_sis_test',
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 2,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['list'], ['html']] : 'html',
  globalTimeout: configuredGlobalTimeout > 0 ? configuredGlobalTimeout : undefined,
  timeout: 90 * 1000,
  expect: {
    timeout: 30 * 1000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: playwrightBaseUrl,
    actionTimeout: 30 * 1000,
    navigationTimeout: 45 * 1000,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `sh -c ${JSON.stringify(startServerCommand)}`,
    url: playwrightBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
