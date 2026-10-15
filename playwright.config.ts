import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 15000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } }],
  webServer: { command: 'npx tsx tests/start-e2e.ts', url: 'http://127.0.0.1:4173/api/health', reuseExistingServer: false, timeout: 30000 }
});
