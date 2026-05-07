/*
 * Playwright configuration.
 * Purpose: Defines browser test settings and dev server wiring.
 * Public API: N/A (config module).
 * Implementation Notes: Supports skipping audit specs via env for the project gate.
 */

import { defineConfig } from '@playwright/test';

// Allows the project gate to skip audit specs and avoid duplicate runs.
const ignoreAuditTests = process.env.PLAYWRIGHT_IGNORE_AUDIT === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  testMatch: '**/*.spec.js',
  testIgnore: ignoreAuditTests ? ['**/audit/**'] : undefined,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
});
