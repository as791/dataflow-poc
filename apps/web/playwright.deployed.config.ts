import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load QA credentials from gitignored secrets/qa.env; shell env wins.
try {
  for (const line of readFileSync(join(__dirname, '../../secrets/qa.env'), 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) process.env[line.slice(0, eq)] ??= line.slice(eq + 1);
  }
} catch {
  // no secrets file — rely on shell env
}

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
