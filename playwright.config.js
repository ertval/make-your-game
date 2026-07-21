/*
 * Playwright configuration.
 * Purpose: Defines browser test settings and dev server wiring.
 * Public API: N/A (config module).
 * Implementation Notes:
 * - Supports skipping audit specs via env for the project gate.
 * - Chromium runs with vsync/frame-rate-limit disabled so the semi-automatable
 *   perf audits (AUDIT-F-17/F-18) measure the simulation's real frame budget
 *   rather than the headless compositor's ~30 Hz vsync cap. Without these flags
 *   headless Chromium reports ~30 FPS / ~33 ms frames regardless of how cheap
 *   the frame actually is, which fails the 60 FPS / 16.7 ms thresholds for an
 *   environmental reason unrelated to game performance.
 * - In CI we allow one retry to absorb a transient dev-server connection race
 *   (the webServer occasionally is not yet accepting connections on first goto).
 */

import { defineConfig } from '@playwright/test';

// Allows the project gate to skip audit specs and avoid duplicate runs.
const ignoreAuditTests = process.env.PLAYWRIGHT_IGNORE_AUDIT === 'true';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  testMatch: '**/*.spec.js',
  // Disable parallel execution within specs to prevent CPU contention during timing-sensitive tests.
  fullyParallel: false,
  // Retry once in CI only: covers the transient webServer connection race
  // without masking a deterministic failure (a real break fails both attempts).
  retries: isCI ? 1 : 0,
  // Hard cap on parallel workers. Each worker launches its own browser.
  // In CI, limit workers to 1 to eliminate CPU contention on VM runners (#276).
  // Capping at 2 locally bounds how many cores any run can touch.
  workers: isCI ? 1 : 2,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  // We configure Chromium, Firefox, and WebKit to meet target requirements (#274).
  // The frame-rate limiter is disabled ONLY for the audit perf specs (F-17/F-18)
  // that must measure the real frame budget instead of the headless compositor's
  // ~30 Hz vsync cap. Every other spec keeps vsync ON, so its browser idles
  // instead of pinning a core at 100% — the difference between a whole suite
  // cooking a fanless CPU and one perf spec briefly loading it. Dropping the
  // audit project when PLAYWRIGHT_IGNORE_AUDIT is set preserves the gate's skip.
  projects: [
    {
      name: 'chromium-e2e',
      use: { browserName: 'chromium' },
      testIgnore: ['**/audit/**', '**/production-csp.spec.js'],
    },
    {
      name: 'firefox-e2e',
      use: { browserName: 'firefox' },
      testIgnore: ['**/audit/**', '**/production-csp.spec.js'],
    },
    {
      name: 'production-preview',
      use: {
        browserName: 'chromium',
        baseURL: 'http://127.0.0.1:4174',
      },
      testMatch: '**/production-csp.spec.js',
    },
    ...(ignoreAuditTests
      ? []
      : [
          {
            name: 'audit',
            testMatch: '**/audit/**/*.spec.js',
            use: {
              browserName: 'chromium',
              launchOptions: {
                args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
              },
            },
          },
        ]),
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: !isCI,
    },
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174',
      port: 4174,
      reuseExistingServer: !isCI,
      env: {
        VITE_PREVIEW: 'true',
      },
    },
  ],
});
