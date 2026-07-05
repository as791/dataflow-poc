import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/deployed',
  timeout: 120_000,
  workers: 1,
  retries: 1,
  globalTeardown: './tests/deployed/global-teardown.ts',
  use: {
    baseURL: process.env.DEPLOYED_BASE_URL ?? 'https://34.14.212.157.nip.io',
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
  },
});
