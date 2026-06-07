/**
 * E2E: Track D render-desync bug repros for issues #84, #85, #103, #104.
 *
 *   #84  — Bomb sprite not rendered on Space (bomb entity has no RENDERABLE_KIND)
 *   #85  — Destroyed destructible walls remain visible (no map-diff in board-sync)
 *   #103 — `.cell-empty` background `#111122` creates a dark trail behind the player
 *   #104 — Pellets occasionally remain visible after collection (same map-diff gap)
 *
 * Verification matrix:
 *   #103 — verified end-to-end here (computed-style assertion on `.cell-empty`).
 *   #84  — the fix path (render-collect-system scans bomb store, emits BOMB
 *          intents) is verified by `tests/unit/systems/render-collect-system.test.js`
 *          ("bomb / fire store scanning (issue #84)"). A reliable Playwright
 *          repro requires the runtime to expose a `getWorld()` hook so the test
 *          can inject bomb-store state without depending on the live input
 *          adapter, which is outside Track D scope. Until that hook exists the
 *          input-driven repro flakes (Space keystroke timing vs. the fixed
 *          logic frame), so it is left skipped with a self-describing reason.
 *   #85  — fix path (board-sync-system map-diff) is verified by
 *          `tests/unit/systems/board-sync-system.test.js`. Same reason for skip.
 *   #104 — fix path (board-sync-system map-diff covers missed pellet intents)
 *          is verified by the same board-sync test file
 *          ("self-heals a missed intent (issue #104) on the next frame").
 *          Same reason for skip.
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, startGameAndWait } from './helpers/game-helpers.js';

/* ------------------------------------------------------------------ */
/* #103 — Pure-CSS check: empty cell should blend with the board floor */
/* ------------------------------------------------------------------ */

test('#103 .cell-empty background blends with the board floor (no dark trail)', async ({
  page,
}) => {
  await bootRuntime(page);
  await expect(page.locator('#game-board .cell-pellet').first()).toBeVisible();

  const colors = await page.evaluate(() => {
    const emptyCell = document.querySelector('#game-board .cell-empty');
    const board = document.querySelector('#game-board');
    if (!emptyCell || !board) return null;
    return {
      emptyBg: window.getComputedStyle(emptyCell).backgroundColor,
      boardBg: window.getComputedStyle(board).backgroundColor,
    };
  });

  expect(colors).not.toBeNull();

  // Bug: pre-fix `.cell-empty` is `rgb(17, 17, 34)` (#111122) which is highly
  // contrasted against the brown board floor `rgb(43, 29, 20)` (#2b1d14).
  // Fix: `.cell-empty` background is transparent so the board floor shows
  // through (computes to `rgba(0, 0, 0, 0)`).
  const PRE_FIX_DARK_NAVY = 'rgb(17, 17, 34)';
  expect(
    colors.emptyBg,
    `cell-empty bg should not be the pre-fix dark navy #111122 — saw ${colors.emptyBg}`,
  ).not.toBe(PRE_FIX_DARK_NAVY);
});

/* ------------------------------------------------------------------ */
/* #84 — Bomb sprite must be visible when player presses Space          */
/* ------------------------------------------------------------------ */

test('#84 pressing Space renders a visible bomb sprite on the board', async ({ page }) => {
  await bootRuntime(page);
  await startGameAndWait(page);

  // Set the bomb entity pool state directly using the ECS getWorld() hook to verify rendering
  await page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();

    const bombPool = world.getResource('bombEntityPool');
    const bombStore = world.getResource('bomb');
    const positionStore = world.getResource('position');
    const colliderStore = world.getResource('collider');

    if (!Array.isArray(bombPool) || bombPool.length === 0) {
      throw new Error('Bomb entity pool is empty or not initialized.');
    }

    const bombEntity = bombPool[0];
    const id = bombEntity.id;

    bombStore.fuseMs[id] = 3000; // 3 seconds fuse to prevent immediate detonation
    bombStore.row[id] = 1;
    bombStore.col[id] = 1;
    bombStore.radius[id] = 2;
    bombStore.ownerId[id] = 0;

    positionStore.row[id] = 1;
    positionStore.col[id] = 1;
    positionStore.prevRow[id] = 1;
    positionStore.prevCol[id] = 1;
    positionStore.targetRow[id] = 1;
    positionStore.targetCol[id] = 1;

    // Set collider type to BOMB to activate it (3 corresponds to COLLIDER_TYPE.BOMB)
    colliderStore.type[id] = 3;
  });

  // Wait 100ms for a few frames to tick
  await page.waitForTimeout(100);

  // Verify that the bomb sprite is rendered and visible in the DOM
  await page.waitForFunction(() => {
    const elements = Array.from(document.querySelectorAll('.sprite--bomb'));
    const visibleEl = elements.find((el) => !el.style.transform.includes('-9999px'));
    return !!visibleEl;
  });

  const onBoardBombs = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.sprite--bomb')).filter(
        (el) => !el.style.transform.includes('-9999px'),
      ).length,
  );
  expect(onBoardBombs).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ */
/* #85 — Destructible wall DOM must update when map cell changes        */
/* ------------------------------------------------------------------ */

test('#85 destructible wall cell loses its sprite when the map cell becomes empty', async ({
  page,
}) => {
  await bootRuntime(page);
  await startGameAndWait(page);

  // Locate a destructible wall cell in the DOM
  const destructibleCell = page.locator('#game-board .cell-destructible').first();
  await expect(destructibleCell).toBeVisible();

  const coords = await destructibleCell.evaluate((el) => {
    return {
      row: parseInt(el.getAttribute('data-row'), 10),
      col: parseInt(el.getAttribute('data-col'), 10),
    };
  });

  // Mutate mapResource via getWorld()
  await page.evaluate(({ row, col }) => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();

    const mapResource = world.getResource('mapResource');
    const idx = row * mapResource.cols + col;

    mapResource.grid[idx] = 0; // CELL_TYPE.EMPTY
    if (mapResource.grid2D?.[row]) {
      mapResource.grid2D[row][col] = 0;
    }
  }, coords);

  // Use a coordinate-based locator rather than dynamic cell class selector
  const targetCell = page.locator(
    `#game-board [data-row="${coords.row}"][data-col="${coords.col}"]`,
  );

  // Expect cell to lose its class and get cell-empty on the next render frame
  await expect(targetCell).not.toHaveClass(/cell-destructible/);
  await expect(targetCell).toHaveClass(/cell-empty/);
});

/* ------------------------------------------------------------------ */
/* #104 — Pellet DOM must converge to map state, no leftover sprites    */
/* ------------------------------------------------------------------ */

test('#104 pellet DOM converges to map state after a cell is cleared without a collisionIntent', async ({
  page,
}) => {
  await bootRuntime(page);
  await startGameAndWait(page);

  // Locate a pellet cell in the DOM
  const pelletCell = page.locator('#game-board .cell-pellet').first();
  await expect(pelletCell).toBeVisible();

  const coords = await pelletCell.evaluate((el) => {
    return {
      row: parseInt(el.getAttribute('data-row'), 10),
      col: parseInt(el.getAttribute('data-col'), 10),
    };
  });

  // Mutate mapResource via getWorld()
  await page.evaluate(({ row, col }) => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();

    const mapResource = world.getResource('mapResource');
    const idx = row * mapResource.cols + col;

    mapResource.grid[idx] = 0; // CELL_TYPE.EMPTY
    if (mapResource.grid2D?.[row]) {
      mapResource.grid2D[row][col] = 0;
    }
  }, coords);

  // Use a coordinate-based locator rather than dynamic cell class selector
  const targetCell = page.locator(
    `#game-board [data-row="${coords.row}"][data-col="${coords.col}"]`,
  );

  // Expect cell to lose its class and get cell-empty on the next render frame
  await expect(targetCell).not.toHaveClass(/cell-pellet/);
  await expect(targetCell).toHaveClass(/cell-empty/);
});
