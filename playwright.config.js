import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false,
  use: { baseURL: 'http://localhost:4173', channel: 'chrome', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm start', url: 'http://localhost:4173', reuseExistingServer: true },
});
