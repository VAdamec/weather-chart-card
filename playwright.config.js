import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1100, height: 850 },
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}),
  },
  webServer: { command: 'node tests/server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
