import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:3101', channel: 'chrome' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 3101', url: 'http://127.0.0.1:3101', reuseExistingServer: false },
});
