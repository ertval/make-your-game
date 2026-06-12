/**
 * E2E: Track D map-border integrity repro for issue #115 (BUG-02).
 *
 *   #115 — Map level-3 border had DESTRUCTIBLE cells at [5][0] and [5][14]
 *          (level-1 and level-2 also had a destructible cell at [5][14]). An
 *          explosion could blow such a perimeter cell open, leaving a visual
 *          hole on the board while movement stayed blocked (getCell clamps
 *          out-of-bounds to INDESTRUCTIBLE) — a visual/gameplay desync where
 *          "the player sees a hole but can't exit".
 *
 * Verification:
 *   Loads each level and asserts every rendered outer-border cell carries the
 *   `cell-wall` class (CELL_TYPE.INDESTRUCTIBLE) and never `cell-destructible`.
 *   This is the user-observable surface of the fix: an indestructible border
 *   that an explosion can never turn into a hole. Companion data/validation
 *   coverage lives in tests/unit/resources/map-resource.test.js
 *   ("has an all-indestructible outer border (BUG-02 / #115)" and
 *   "rejects map with a DESTRUCTIBLE cell on the outer border (BUG-02 / #115)").
 */

import { expect, test } from '@playwright/test';
import { bootRuntime } from './helpers/game-helpers.js';

/**
 * Collect, for the currently loaded map, every outer-border cell that the DOM
 * renders WITHOUT the `cell-wall` class or WITH the `cell-destructible` class.
 * Runs entirely in the browser against the live board + mapResource.
 *
 * @returns {Promise<{ offenders: Array, rows: number, cols: number } | null>}
 */
async function findBorderRenderOffenders(page) {
  return page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const mapResource = world.getResource('mapResource');
    if (!mapResource) return null;

    const { rows, cols } = mapResource;

    const cellAt = (row, col) =>
      Array.from(document.querySelectorAll('#game-board .cell')).find(
        (c) =>
          c.style.getPropertyValue('--cell-row').trim() === String(row) &&
          c.style.getPropertyValue('--cell-col').trim() === String(col),
      );

    const isBorder = (r, c) => r === 0 || r === rows - 1 || c === 0 || c === cols - 1;

    const offenders = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!isBorder(r, c)) continue;
        const el = cellAt(r, c);
        if (!el) {
          offenders.push({ row: r, col: c, reason: 'cell element not found' });
          continue;
        }
        if (el.classList.contains('cell-destructible')) {
          offenders.push({ row: r, col: c, reason: 'rendered cell-destructible on border' });
        } else if (!el.classList.contains('cell-wall')) {
          offenders.push({
            row: r,
            col: c,
            reason: `border cell is not cell-wall (classes: ${el.className})`,
          });
        }
      }
    }

    return { offenders, rows, cols };
  });
}

for (const levelIndex of [0, 1, 2]) {
  const levelNumber = levelIndex + 1;

  test(`#115 level-${levelNumber} renders an all-indestructible outer border (no destructible perimeter)`, async ({
    page,
  }) => {
    await bootRuntime(page);

    // The app boots straight into PLAYING on level 0, so startGame({levelIndex})
    // is a no-op while already playing. Drive the level loader directly so the
    // target level's map is committed to `mapResource`; the render-phase
    // board-sync system then rebuilds the board cells from that map.
    await page.evaluate((idx) => {
      const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
      const levelLoader = world.getResource('levelLoader');
      levelLoader.loadLevel(idx, { reason: 'e2e-border-check' });
    }, levelIndex);

    // Guard: confirm the requested level actually committed before asserting.
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__MS_GHOSTMAN_RUNTIME__
            .getWorld()
            .getResource('levelLoader')
            .getCurrentLevelIndex(),
        ),
      )
      .toBe(levelIndex);

    // Give board-sync a few render frames to converge the DOM to the new map.
    await page.waitForTimeout(100);

    const result = await findBorderRenderOffenders(page);
    expect(result, 'mapResource / board should be available').not.toBeNull();

    expect(
      result.offenders,
      `level-${levelNumber} has non-wall border cells: ${JSON.stringify(result.offenders)}`,
    ).toEqual([]);
  });
}
