import { defineConfig, devices } from '@playwright/test'

// Own both loopback services. Never attach browser tests to a developer or production server.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/e2e/test-api.ts',
      url: 'http://127.0.0.1:18080/__health',
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: 'npm run dev -- --mode test --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:18080', VITE_API_BASE_URL: '' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
