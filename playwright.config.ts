import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:45173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:45173',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      API_PORT: '43001',
      WEB_PORT: '45173',
      DATABASE_PATH: './data/browser-test-' + randomUUID() + '.db',
    },
  },
});
