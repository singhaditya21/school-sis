import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// Dynamically populate .env.test.worker with the test database name before Playwright starts the webServer
const envPath = path.resolve(__dirname, '.env');
const envTestPath = path.resolve(__dirname, '.env.test.worker');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL="([^"]+)"/) || envContent.match(/DATABASE_URL=([^\s]+)/);
  if (match) {
    const originalUrl = match[1].trim();
    const urlObj = new URL(originalUrl);
    urlObj.pathname = '/school_sis_test_worker';
    const testDbUrl = urlObj.toString();
    fs.writeFileSync(envTestPath, `DATABASE_URL="${testDbUrl}"\n`);
    process.env.DATABASE_URL = testDbUrl;
    
    // Ensure the database exists before the WebServer is spawned
    try {
      execSync('npx tsx scripts/create-test-db.ts', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        cwd: __dirname,
        stdio: 'inherit'
      });
    } catch (err) {
      console.error('Failed to run create-test-db.ts:', err);
    }
  }
}

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
