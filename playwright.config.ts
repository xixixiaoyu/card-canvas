import { defineConfig } from '@playwright/test'

// Bundled Chromium is dramatically more stable when several workers run at
// once. System Chrome remains available for a real-browser spot check:
// PLAYWRIGHT_CHROME=1 pnpm test:e2e
const useSystemChrome = process.env.PLAYWRIGHT_CHROME === '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    channel: useSystemChrome ? 'chrome' : undefined,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
