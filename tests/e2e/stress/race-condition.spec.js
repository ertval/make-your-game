/**
 * Stress tests for race conditions in pause/resume/restart transitions.
 *
 * Purpose: Repeatedly perform game state transitions to catch timing-sensitive
 * bugs that only appear in slow CI environments (like GitHub Actions).
 *
 * These tests are designed to fail if there are race conditions between
 * rAF callbacks and state changes.
 *
 * Public API: N/A (Playwright test module).
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, FIXED_DT_MS } from '../helpers/game-helpers.js';

const ITERATIONS = 20;

test.describe('pause/resume/restart race condition stress tests', () => {
  test.beforeEach(async ({ page }) => {
    await bootRuntime(page);
    // Start the game and ensure it's in PLAYING state
    await page.evaluate(() => {
      const runtime = window.__MS_GHOSTMAN_RUNTIME__;
      runtime.startGame({ levelIndex: 0 });
      if (runtime.getSnapshot().state !== 'PLAYING') {
        runtime.setState('PLAYING');
      }
    });
    await expect
      .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
      .toBe('PLAYING');
  });

  test('rapid pause/resume cycles should not advance simTime while paused', async ({ page }) => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Pause
      await page.evaluate(() => {
        window.__MS_GHOSTMAN_RUNTIME__.pause();
      });

      const pausedSnapshot = await page.evaluate(() =>
        window.__MS_GHOSTMAN_RUNTIME__.getSnapshot(),
      );
      expect(pausedSnapshot.state).toBe('PAUSED');

      // Wait a bit to let any pending rAF callbacks fire
      await page.waitForTimeout(50);

      // Verify simTime hasn't advanced while paused
      const afterWait = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());
      expect(afterWait.state).toBe('PAUSED');
      // simTime should not have advanced by more than one frame during pause
      // (any rAF callback that fires should not advance simTime when paused)
      expect(afterWait.simTimeMs).toBeLessThanOrEqual(pausedSnapshot.simTimeMs + FIXED_DT_MS);

      // Resume
      await page.evaluate(() => {
        window.__MS_GHOSTMAN_RUNTIME__.resume();
      });

      await expect
        .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
        .toBe('PLAYING');
    }
  });

  test('restart should reset simTimeMs to near zero', async ({ page }) => {
    // Let the game run for a bit
    await page.waitForTimeout(100);

    for (let i = 0; i < ITERATIONS; i++) {
      // Pause, restart, and immediately pause again to freeze clock
      const snapshot = await page.evaluate(() => {
        const runtime = window.__MS_GHOSTMAN_RUNTIME__;
        runtime.pause();
        runtime.restart();
        // Immediately pause to freeze clock before rAF ticks
        runtime.pause();
        return runtime.getSnapshot();
      });

      expect(snapshot.state).toBe('PAUSED');
      // After restart, simTimeMs should be near zero (accounting for at most one frame tick)
      expect(snapshot.simTimeMs).toBeLessThanOrEqual(FIXED_DT_MS);

      // Resume briefly to let game run
      await page.evaluate(() => {
        window.__MS_GHOSTMAN_RUNTIME__.resume();
      });
      await page.waitForTimeout(16); // Wait at least one frame
    }
  });

  test('pause state should be consistent after rapid toggles', async ({ page }) => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Rapid pause/resume in same evaluate call
      const result = await page.evaluate(() => {
        const runtime = window.__MS_GHOSTMAN_RUNTIME__;
        runtime.pause();
        const paused = runtime.getSnapshot().state;
        runtime.resume();
        const resumed = runtime.getSnapshot().state;
        return { paused, resumed };
      });

      expect(result.paused).toBe('PAUSED');
      expect(result.resumed).toBe('PLAYING');

      // Verify with poll
      await expect
        .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
        .toBe('PLAYING');
    }
  });

  test('restart while playing should transition to PLAYING with reset clock', async ({ page }) => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Restart without pausing first
      const snapshot = await page.evaluate(() => {
        const runtime = window.__MS_GHOSTMAN_RUNTIME__;
        runtime.restart();
        // Immediately pause to freeze clock
        runtime.pause();
        return runtime.getSnapshot();
      });

      expect(snapshot.state).toBe('PAUSED');
      expect(snapshot.simTimeMs).toBeLessThanOrEqual(FIXED_DT_MS);
    }
  });
});
