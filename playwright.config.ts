import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  // Location of E2E tests.
  testDir: './e2e/playwright',

  // Test timeouts.
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  // CI settings.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Test report.
  reporter: [['html', { open: 'never' }]],

  // Shared browser settings.
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Initial browser coverage.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start Vite before running tests.
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  // Directory for generated test results.
  outputDir: 'test-results',
});
