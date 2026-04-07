import { expect, test } from '@playwright/test';

test('keeps rAF active while paused and freezes simulation progression', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() =>
    Boolean(window.__MS_GHOSTMAN_RUNTIME__ && window.__MS_GHOSTMAN_FRAME_PROBE__),
  );

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.startGame();
  });

  await page.waitForTimeout(200);

  const beforePause = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  await page.waitForTimeout(200);

  const pausedSnapshot = await page.evaluate(() => {
    return {
      runtime: window.__MS_GHOSTMAN_RUNTIME__.getSnapshot(),
      stats: window.__MS_GHOSTMAN_FRAME_PROBE__.getStats(),
    };
  });

  await page.waitForTimeout(200);

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
