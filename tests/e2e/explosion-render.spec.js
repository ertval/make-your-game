/**
 * E2E: fire/explosion still renders after pruning dead CSS (#257 / DEAD-09).
 *
 * The `.sprite--explosion--*` classes were defined but never applied — the live
 * effect uses `.sprite--fire--0N` (backed by the explosion-0N.webp frames). This
 * activates a pooled fire entity and asserts it renders with a real background
 * image, proving the removal of the dead explosion CSS did not regress the
 * on-screen fire/explosion effect.
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, startGameAndWait } from './helpers/game-helpers.js';

test('fire/explosion effect renders via sprite--fire after dead CSS cleanup', async ({ page }) => {
  await bootRuntime(page);
  await startGameAndWait(page, { levelIndex: 0 });

  // Directly activate a pooled fire entity (collider type FIRE = 4).
  await page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const fireStore = world.getResource('fire');
    const colliderStore = world.getResource('collider');
    const firePool = world.getResource('fireEntityPool');
    const id = firePool[0].id;
    fireStore.burnTimerMs[id] = 500;
    fireStore.row[id] = 1;
    fireStore.col[id] = 1;
    colliderStore.type[id] = 4; // COLLIDER_TYPE.FIRE
  });

  await page.waitForTimeout(100);

  const fire = await page.evaluate(() => {
    const el = document.querySelector('#game-board .sprite--fire');
    if (!el) return { present: false, backgroundImage: 'none' };
    return { present: true, backgroundImage: getComputedStyle(el).backgroundImage };
  });

  expect(fire.present).toBe(true);
  // A real image proves the fire sprite classes still resolve to a background.
  expect(fire.backgroundImage).not.toBe('none');
  expect(fire.backgroundImage).toContain('.webp');
});
