/**
 * Race-condition-safe helpers for e2e tests.
 *
 * These helpers ensure that game state changes and snapshot reads are atomic,
 * preventing flaky tests in slow CI environments (like GitHub Actions) where
 * the rAF loop can fire between actions and assertions.
 *
 * Key principle: When pausing or restarting, always perform the action and
 * then immediately freeze the clock in the SAME page.evaluate() call.
 */

import { expect } from '@playwright/test';

/**
 * Boot the game runtime and wait for it to be ready.
 * Waits for both __MS_GHOSTMAN_RUNTIME__ and __MS_GHOSTMAN_FRAME_PROBE__.
 * @param {import('@playwright/test').Page} page
 */
export async function bootRuntime(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      window.__MS_GHOSTMAN_RUNTIME__ !== undefined &&
      window.__MS_GHOSTMAN_FRAME_PROBE__ !== undefined,
    { timeout: 5000 },
  );
}

/**
 * Start a game and transition to PLAYING state.
 * Waits for the state to be PLAYING before returning.
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {number} [options.levelIndex]
 */
export async function startGameAndWait(page, options = {}) {
  await page.evaluate((opts) => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame(opts);
  }, options);

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');
}

/**
 * Pause the game and verify the state transition.
 * Uses expect.poll() to handle timing variations.
 * @param {import('@playwright/test').Page} page
 */
export async function pauseGameAndWait(page) {
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PAUSED');
}

/**
 * Resume the game and verify the state transition.
 * Uses expect.poll() to handle timing variations.
 * @param {import('@playwright/test').Page} page
 */
export async function resumeGameAndWait(page) {
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.resume();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');
}

/**
 * Restart the game and immediately pause to freeze the clock.
 * This prevents the rAF loop from advancing simTimeMs before the next assertion.
 *
 * Returns the snapshot after restart+pause.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>} The game snapshot after restart
 */
export async function restartAndFreeze(page) {
  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.restart();
    // Immediately pause to freeze clock before rAF ticks
    runtime.pause();
  });

  return page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());
}

/**
 * Restart the game and wait for PLAYING state.
 * Use this when you want the game to continue running after restart.
 * @param {import('@playwright/test').Page} page
 */
export async function restartAndWait(page) {
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.restart();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');
}

/**
 * Get a stable snapshot by pausing first, then reading.
 * This ensures the rAF loop won't modify state during the read.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>}
 */
export async function getStableSnapshot(page) {
  return page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    const snapshot = runtime.getSnapshot();
    return snapshot;
  });
}

/**
 * Verify that simTimeMs is near zero (accounting for at most one frame tick).
 * After a restart with clock reset, simTimeMs should be <= FIXED_DT_MS.
 * @param {number} simTimeMs
 * @param {number} [maxExpected] - Maximum expected value (default: 16.67)
 */
export function expectSimTimeNearZero(simTimeMs, maxExpected = 16.67) {
  expect(simTimeMs).toBeLessThanOrEqual(maxExpected);
}

/**
 * Maximum fixed timestep duration in ms (1/60th of a second).
 * Use this constant in tests to avoid magic numbers.
 */
export const FIXED_DT_MS = 16.666666666666668;
