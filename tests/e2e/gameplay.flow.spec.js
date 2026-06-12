/**
 * Test: gameplay.flow.spec.js
 * Purpose: Broad runtime flow coverage for pause/resume/restart, HUD shell, and deterministic level progression.
 * Public API: N/A (test module).
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, FIXED_DT_MS } from './helpers/game-helpers.js';

test('renders HUD timer/score/lives shell contract', async ({ page }) => {
  await bootRuntime(page);

  await expect(page.locator('[data-hud="timer"]')).toBeVisible();
  await expect(page.locator('[data-hud="score"]')).toBeVisible();
  await expect(page.locator('[data-hud="lives"]')).toBeVisible();
});

test('supports pause, continue, and restart flow transitions', async ({ page }) => {
  await bootRuntime(page);

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

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PAUSED');

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.resume();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.pause();
    runtime.restart();
    // Pause immediately after restart to freeze the clock before rAF ticks.
    runtime.pause();
  });

  const afterRestart = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());
  expect(afterRestart.state).toBe('PAUSED');
  // simTimeMs should be near zero after restart reset + at most one frame tick.
  expect(afterRestart.simTimeMs).toBeLessThanOrEqual(FIXED_DT_MS);
});

test('advances through levels and reaches VICTORY on final completion', async ({ page }) => {
  await bootRuntime(page);

  const finalSnapshot = await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;

    runtime.startGame({ levelIndex: 0 });
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }

    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();
    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();
    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();

    return {
      levelIndex: runtime.getLevelIndex(),
      state: runtime.getSnapshot().state,
    };
  });

  expect(finalSnapshot.levelIndex).toBe(2);
  expect(finalSnapshot.state).toBe('VICTORY');
});
