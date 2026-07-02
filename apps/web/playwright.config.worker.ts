import { defineConfig, devices } from '@playwright/test';
import { ensurePlaywrightTestEnvironment } from './e2e/test-environment';

ensurePlaywrightTestEnvironment({
  envFileName: '.env.test.worker',
  defaultDatabaseName: 'school_sis_test_worker',
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: require.resolve('./e2e/global-setup-worker'),
  globalTeardown: require.resolve('./e2e/global-teardown-worker'),
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
  reporter: 'html',
  timeout: 90 * 1000,
  expect: {
    timeout: 30 * 1000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3001',
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
    command: 'node --env-file=.env.test.worker ./node_modules/next/dist/bin/next start -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
