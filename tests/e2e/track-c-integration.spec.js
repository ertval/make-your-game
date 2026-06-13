/**
 * Test: track-c-integration.spec.js
 * Purpose: Verifies Track C integration with the real app shell.
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, startGameAndWait } from './helpers/game-helpers.js';

test('pause menu buttons are functional in the real app shell', async ({ page }) => {
  await bootRuntime(page);
  await startGameAndWait(page, { levelIndex: 0 });

  // Trigger pause
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  const pauseScreen = page.locator('[data-screen="pause"]');
  await expect(pauseScreen).toBeVisible();
  await expect(pauseScreen).toHaveClass(/is-screen-visible/);

  // Click "Continue" button
  const continueButton = pauseScreen.locator('button[data-action="pause-continue"]');
  await expect(continueButton).toBeVisible();
  await continueButton.click();

  await expect(pauseScreen).toBeHidden();
  await expect(page.locator('#game-board')).toBeFocused();

  // Trigger pause again
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });
  await expect(pauseScreen).toBeVisible();

  // Click "Restart" button
  const restartButton = pauseScreen.locator('button[data-action="pause-restart"]');
  await expect(restartButton).toBeVisible();
  await restartButton.click();

  // Restart transitions to PLAYING but might show the level start or similar
  // In our current implementation, restart transitions to PLAYING and reloads the map.
  await expect(pauseScreen).toBeHidden();
});

test('high score is displayed on game over screen', async ({ page }) => {
  await bootRuntime(page);

  // Set a high score in localStorage
  await page.evaluate(() => {
    localStorage.setItem('ms-ghostman.highScore', JSON.stringify({ score: 12345 }));
  });

  // Reload to ensure storage is read
  await page.reload();
  await page.waitForFunction(() => window.__MS_GHOSTMAN_RUNTIME__ !== undefined);

  // The runtime boots into MENU; GAME_OVER is only reachable from PLAYING, so
  // start the game before triggering game over.
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.startGame({ levelIndex: 0 });
    window.__MS_GHOSTMAN_RUNTIME__.setState('GAME_OVER');
  });

  const gameOverScreen = page.locator('[data-screen="game-over"]');
  await expect(gameOverScreen).toBeVisible();

  const highScoreEl = gameOverScreen.locator('[data-high-score]');
  await expect(highScoreEl).toHaveText(/High Score: 12345/);
});
