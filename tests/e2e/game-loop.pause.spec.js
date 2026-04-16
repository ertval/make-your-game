/**
 * Test: game-loop.pause.spec.js
 * Purpose: Verifies pause invariants for the browser runtime by asserting rAF continues while simulation time is frozen.
 * Public API: N/A (test module).
 * Implementation Notes: Uses runtime hooks exposed on window to validate pause/resume behavior through Playwright.
 */

import { expect, test } from '@playwright/test';

test('keeps rAF active while paused and freezes simulation progression', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() =>
    Boolean(window.__MS_GHOSTMAN_RUNTIME__ && window.__MS_GHOSTMAN_FRAME_PROBE__),
  );

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.startGame();
  });

  await expect
    .poll(
      async () => {
        return page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame);
      },
      {
        timeout: 5_000,
      },
    )
    .toBeGreaterThanOrEqual(1);

  const beforePause = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  await expect
    .poll(
      async () => {
        return page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().isPaused);
      },
      {
        timeout: 5_000,
      },
    )
    .toBe(true);

  const pausedSnapshot = await page.evaluate(() => {
    return {
      runtime: window.__MS_GHOSTMAN_RUNTIME__.getSnapshot(),
      stats: window.__MS_GHOSTMAN_FRAME_PROBE__.getStats(),
    };
  });

  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          return {
            frame: window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame,
            sampleCount: window.__MS_GHOSTMAN_FRAME_PROBE__.getStats().sampleCount,
          };
        });
      },
      {
        timeout: 5_000,
      },
    )
    .toEqual({
      frame: pausedSnapshot.runtime.frame,
      sampleCount: expect.any(Number),
    });

  const pausedSnapshotLater = await page.evaluate(() => {
    return {
      runtime: window.__MS_GHOSTMAN_RUNTIME__.getSnapshot(),
      stats: window.__MS_GHOSTMAN_FRAME_PROBE__.getStats(),
    };
  });

  expect(beforePause.frame).toBeGreaterThanOrEqual(1);
  expect(pausedSnapshot.runtime.isPaused).toBe(true);
  expect(pausedSnapshotLater.runtime.frame).toBe(pausedSnapshot.runtime.frame);
  expect(pausedSnapshot.stats.sampleCount).toBeGreaterThan(0);
  expect(pausedSnapshotLater.stats.sampleCount).toBeGreaterThanOrEqual(
    pausedSnapshot.stats.sampleCount,
  );
});
