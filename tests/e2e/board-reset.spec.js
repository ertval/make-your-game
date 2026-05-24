/**
 * E2E: Board canonical map reset on restart.
 *
 * Deferred from D-03/D-06. Proves that restarting the level regenerates the
 * board from the original map data, restoring pellet cells that were cleared
 * during gameplay via board-sync-system's updateCell path.
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, restartAndFreeze } from './helpers/game-helpers.js';

test('restores all pellet cells to original count after restart', async ({ page }) => {
  await bootRuntime(page);

  // Wait for the board to be populated (auto-startGame fires on page load).
  await expect(page.locator('#game-board .cell-pellet').first()).toBeVisible();

  const initialCount = await page.locator('#game-board .cell-pellet').count();
  expect(initialCount).toBeGreaterThan(0);

  // Simulate board-sync-system's updateCell(row, col, 0) — remove cell-pellet,
  // add cell-empty — for the first 5 pellet cells found in the DOM.
  await page.evaluate(() => {
    const pellets = Array.from(document.querySelectorAll('#game-board .cell-pellet')).slice(0, 5);
    for (const el of pellets) {
      el.classList.remove('cell-pellet');
      el.classList.add('cell-empty');
    }
  });

  const afterCollect = await page.locator('#game-board .cell-pellet').count();
  expect(afterCollect).toBe(initialCount - 5);

  // Restart — triggers levelLoader.loadLevel → onLevelLoaded → generateBoard,
  // which rebuilds the board from the original map resource.
  await restartAndFreeze(page);

  // generateBoard is synchronous in onLevelLoaded, so no extra wait needed.
  const afterRestart = await page.locator('#game-board .cell-pellet').count();
  expect(afterRestart).toBe(initialCount);
});

test('restores player spawn position in the DOM after restart', async ({ page }) => {
  await bootRuntime(page);

  await expect(page.locator('#game-board .cell-pellet').first()).toBeVisible();

  // Capture the player element's initial grid position via CSS custom properties.
  const initialPos = await page.evaluate(() => {
    const player = document.querySelector('.sprite--player');
    if (!player) return null;
    return {
      row: player.style.getPropertyValue('--row'),
      col: player.style.getPropertyValue('--col'),
    };
  });

  // Artificially move the player sprite in the DOM (simulates a frame of movement).
  await page.evaluate(() => {
    const player = document.querySelector('.sprite--player');
    if (player) {
      player.style.setProperty('--row', '1');
      player.style.setProperty('--col', '1');
    }
  });

  await restartAndFreeze(page);

  const afterRestart = await page.evaluate(() => {
    const player = document.querySelector('.sprite--player');
    if (!player) return null;
    return {
      row: player.style.getPropertyValue('--row'),
      col: player.style.getPropertyValue('--col'),
    };
  });

  // After restart the ECS position store is reset to spawn coords; the next
  // render-collect tick writes the correct --row/--col back onto the element.
  // We only assert the player element is still present and accessible.
  expect(afterRestart).not.toBeNull();
  // Verify spawn position is restored (should match original or be reset to spawn).
  if (initialPos) {
    expect(afterRestart.row).toBe(initialPos.row);
    expect(afterRestart.col).toBe(initialPos.col);
  }
});
