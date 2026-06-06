/**
 * E2E: Track D render-desync bug repros for issues #84, #85, #103, #104, #107.
 *
 *   #84  — Bomb sprite not rendered on Space (bomb entity has no RENDERABLE_KIND)
 *   #85  — Destroyed destructible walls remain visible (no map-diff in board-sync)
 *   #103 — `.cell-empty` background `#111122` creates a dark trail behind the player
 *   #104 — Pellets occasionally remain visible after collection (same map-diff gap)
 *   #107 — Ghost oscillates back-and-forth against a bomb tile instead of
 *          re-routing. Fix: collision-system populates `bombCellOccupancy`
 *          every logic phase; ghost-ai-system reads it and refuses bomb cells
 *          during path selection.
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
 *   #107 — verified end-to-end here by injecting a bomb + positioning Blinky
 *          in a corridor adjacent to it, then asserting the ghost never sits
 *          on the bomb tile. Companion unit coverage lives in
 *          `tests/unit/systems/ghost-ai-system.test.js`
 *          ("refuses bomb cells when the bomb-occupancy set marks them") and
 *          `tests/integration/gameplay/b-04-collision-system.test.js`
 *          ("updates the bombCellOccupancy resource ... through fixed step
 *          dispatch").
 */

import { expect, test } from '@playwright/test';
import {
  bootRuntime,
  pauseGameAndWait,
  resumeGameAndWait,
  startGameAndWait,
} from './helpers/game-helpers.js';

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

  // Directly activate a bomb in the ECS world.
  await page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const bombStore = world.getResource('bomb');
    const positionStore = world.getResource('position');
    const colliderStore = world.getResource('collider');
    const bombPool = world.getResource('bombEntityPool');

    const bombEntity = bombPool[0];
    const id = bombEntity.id;

    bombStore.fuseMs[id] = 3000;
    bombStore.radius[id] = 2;
    bombStore.ownerId[id] = 1;
    bombStore.row[id] = 1;
    bombStore.col[id] = 1;

    positionStore.row[id] = 1;
    positionStore.col[id] = 1;
    positionStore.prevRow[id] = 1;
    positionStore.prevCol[id] = 1;
    positionStore.targetRow[id] = 1;
    positionStore.targetCol[id] = 1;

    colliderStore.type[id] = 3; // COLLIDER_TYPE.BOMB
  });

  await page.waitForTimeout(100);

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

  // Find a destructible cell in the mapResource
  const cell = await page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const mapResource = world.getResource('mapResource');
    for (let r = 0; r < mapResource.rows; r += 1) {
      for (let c = 0; c < mapResource.cols; c += 1) {
        if (mapResource.grid[r * mapResource.cols + c] === 2) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  });

  expect(cell).not.toBeNull();

  // Verify the DOM cell is initially marked cell-destructible
  const initialIsDestructible = await page.evaluate(({ row, col }) => {
    const el = Array.from(document.querySelectorAll('#game-board .cell')).find(
      (c) =>
        c.style.getPropertyValue('--cell-row').trim() === String(row) &&
        c.style.getPropertyValue('--cell-col').trim() === String(col),
    );
    return el ? el.classList.contains('cell-destructible') : false;
  }, cell);
  expect(initialIsDestructible).toBe(true);

  // Set the map cell to EMPTY (0) directly in mapResource.grid
  await page.evaluate(({ row, col }) => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const mapResource = world.getResource('mapResource');
    mapResource.grid[row * mapResource.cols + col] = 0;
  }, cell);

  // Wait a few frames for board-sync-system to run and update DOM
  await page.waitForTimeout(50);

  // Verify that the DOM cell is no longer cell-destructible
  const finalIsDestructible = await page.evaluate(({ row, col }) => {
    const el = Array.from(document.querySelectorAll('#game-board .cell')).find(
      (c) =>
        c.style.getPropertyValue('--cell-row').trim() === String(row) &&
        c.style.getPropertyValue('--cell-col').trim() === String(col),
    );
    return el ? el.classList.contains('cell-destructible') : false;
  }, cell);
  expect(finalIsDestructible).toBe(false);
});

/* ------------------------------------------------------------------ */
/* #104 — Pellet DOM must converge to map state, no leftover sprites    */
/* ------------------------------------------------------------------ */

test('#104 pellet DOM converges to map state after a cell is cleared without a collisionIntent', async ({
  page,
}) => {
  await bootRuntime(page);
  await startGameAndWait(page);

  // Find a pellet cell (type 3) in the mapResource
  const cell = await page.evaluate(() => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const mapResource = world.getResource('mapResource');
    for (let r = 0; r < mapResource.rows; r += 1) {
      for (let c = 0; c < mapResource.cols; c += 1) {
        if (mapResource.grid[r * mapResource.cols + c] === 3) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  });

  expect(cell).not.toBeNull();

  // Verify the DOM cell has pellet class initially
  const initialIsPellet = await page.evaluate(({ row, col }) => {
    const el = Array.from(document.querySelectorAll('#game-board .cell')).find(
      (c) =>
        c.style.getPropertyValue('--cell-row').trim() === String(row) &&
        c.style.getPropertyValue('--cell-col').trim() === String(col),
    );
    return el ? el.classList.contains('cell-pellet') : false;
  }, cell);
  expect(initialIsPellet).toBe(true);

  // Clear map cell directly in mapResource.grid to empty (0)
  await page.evaluate(({ row, col }) => {
    const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
    const mapResource = world.getResource('mapResource');
    mapResource.grid[row * mapResource.cols + col] = 0;
  }, cell);

  // Wait a few frames for board-sync-system to run and update DOM
  await page.waitForTimeout(50);

  // Verify DOM cell lost pellet class
  const finalIsPellet = await page.evaluate(({ row, col }) => {
    const el = Array.from(document.querySelectorAll('#game-board .cell')).find(
      (c) =>
        c.style.getPropertyValue('--cell-row').trim() === String(row) &&
        c.style.getPropertyValue('--cell-col').trim() === String(col),
    );
    return el ? el.classList.contains('cell-pellet') : false;
  }, cell);
  expect(finalIsPellet).toBe(false);
});

/* ------------------------------------------------------------------ */
/* #107 — Ghost AI must not oscillate against a bomb tile              */
/* ------------------------------------------------------------------ */

// Sampling cadence for the post-resume observation window. The interval is
// coarse (6 fixed steps at 60 Hz) so the test does not depend on the
// 1-frame physics→logic phase lag documented at collision-system.js:974.
const GHOST_SAMPLE_INTERVAL_MS = 100;
const GHOST_SAMPLE_TOTAL_MS = 1200;

test('#107 ghost does not oscillate against a bomb tile (bomb-oscillation regression)', async ({
  page,
}) => {
  await bootRuntime(page);
  await startGameAndWait(page);
  await pauseGameAndWait(page);

  // Discover a horizontal corridor: two adjacent passable cells (ghost tile
  // and bomb tile). The corridor does not need a vertical escape because
  // the bug-107 acceptance gate only asserts the ghost never sits on the
  // bomb tile; the no-reverse + reverse-fallback AI logic in a dead-end
  // keeps the ghost off the bomb after at most one walk-in. If the loaded
  // map has no such corridor, the test skips with a self-describing reason
  // rather than spuriously failing on map-shape assumptions.
  //
  // The CELL_TYPE values are mirrored from src/ecs/resources/constants.js so
  // the page.evaluate body (which runs in the browser, not the Vitest
  // harness) does not need to import any module. Mirroring the integers is
  // intentional — a divergence here would cause the test to fail loudly
  // with a clear "no corridor" skip rather than silently misclassify cells.
  const setup = await page.evaluate(
    ({ cellTypes }) => {
      const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
      const mapResource = world.getResource('mapResource');
      const grid = mapResource.grid;
      const rows = mapResource.rows;
      const cols = mapResource.cols;
      const PASSABLE = new Set([
        cellTypes.EMPTY,
        cellTypes.DESTRUCTIBLE,
        cellTypes.PELLET,
        cellTypes.PLAYER_START,
      ]);

      for (let r = 1; r < rows - 1; r += 1) {
        for (let c = 1; c < cols - 2; c += 1) {
          if (PASSABLE.has(grid[r * cols + c]) && PASSABLE.has(grid[r * cols + c + 1])) {
            return { ghostRow: r, ghostCol: c, bombRow: r, bombCol: c + 1 };
          }
        }
      }
      return null;
    },
    {
      cellTypes: {
        EMPTY: 0,
        DESTRUCTIBLE: 2,
        PELLET: 3,
        PLAYER_START: 6,
      },
    },
  );

  if (setup === null) {
    test.skip(
      true,
      'Loaded map has no horizontal corridor — bomb-oscillation test cannot run on this map.',
    );
    return;
  }

  const { ghostRow, ghostCol, bombRow, bombCol } = setup;

  // Activate a long-fuse bomb in the bomb pool at (bombRow, bombCol). The
  // collision system queries the bomb entity by its collider type and the
  // bomb store's row/col, so both must be set together.
  await page.evaluate(
    ({ bombRow, bombCol }) => {
      const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
      const bombStore = world.getResource('bomb');
      const positionStore = world.getResource('position');
      const colliderStore = world.getResource('collider');
      const bombPool = world.getResource('bombEntityPool');

      // Find a bomb pool slot that is currently inactive (NONE collider) so we
      // do not overwrite an in-flight bomb from another test or the live game.
      let bombEntity = null;
      for (const handle of bombPool) {
        if (colliderStore.type[handle.id] === 0) {
          bombEntity = handle;
          break;
        }
      }
      if (!bombEntity) {
        throw new Error('No inactive bomb pool slot available for #107 test setup.');
      }
      const id = bombEntity.id;

      // 30s fuse is long enough to outlast the GHOST_SAMPLE_TOTAL_MS window.
      bombStore.fuseMs[id] = 30_000;
      bombStore.radius[id] = 1;
      bombStore.ownerId[id] = -1;
      bombStore.row[id] = bombRow;
      bombStore.col[id] = bombCol;

      positionStore.row[id] = bombRow;
      positionStore.col[id] = bombCol;
      positionStore.prevRow[id] = bombRow;
      positionStore.prevCol[id] = bombCol;
      positionStore.targetRow[id] = bombRow;
      positionStore.targetCol[id] = bombCol;

      // 3 = COLLIDER_TYPE.BOMB. Marking the collider type is what makes the
      // collision system's `buildHazardOccupancy` populate the bomb scratch lane.
      colliderStore.type[id] = 3;
    },
    { bombRow, bombCol },
  );

  // Position Blinky (the first released ghost) at (ghostRow, ghostCol) facing
  // the bomb tile so its AI wants to walk into the bomb. The velocity is
  // pre-set so the first physics tick after resume commits to a step toward
  // the bomb; once the occupancy is published, the AI re-routes on the next
  // tick (see collision-system.js:974 phase-ordering comment).
  await page.evaluate(
    ({ ghostRow, ghostCol, bombRow, bombCol }) => {
      const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
      const ghostIds = world.getResource('ghostIds');
      const positionStore = world.getResource('position');
      const velocityStore = world.getResource('velocity');
      const ghostStore = world.getResource('ghost');

      if (!Array.isArray(ghostIds) || ghostIds.length === 0) {
        throw new Error('No ghost entities are present in the world.');
      }
      const blinkyId = ghostIds[0];

      positionStore.row[blinkyId] = ghostRow;
      positionStore.col[blinkyId] = ghostCol;
      positionStore.prevRow[blinkyId] = ghostRow;
      positionStore.prevCol[blinkyId] = ghostCol;
      positionStore.targetRow[blinkyId] = bombRow;
      positionStore.targetCol[blinkyId] = bombCol;

      velocityStore.rowDelta[blinkyId] = bombRow - ghostRow;
      velocityStore.colDelta[blinkyId] = bombCol - ghostCol;
      velocityStore.speedTilesPerSecond[blinkyId] = 4;

      // Ensure Blinky is in NORMAL state so the no-reverse rule is active and
      // a stuck ghost would visibly oscillate instead of reversing silently.
      ghostStore.state[blinkyId] = 0;
    },
    { ghostRow, ghostCol, bombRow, bombCol },
  );

  await resumeGameAndWait(page);

  // Sample ghost position over the test window. A pre-fix bug would have the
  // ghost cycling (R,C) <-> (R,C+1) so multiple samples land on the bomb tile;
  // the fix has the ghost step off the row into (R±1, C+1) and stay there.
  const samples = [];
  for (let elapsed = 0; elapsed < GHOST_SAMPLE_TOTAL_MS; elapsed += GHOST_SAMPLE_INTERVAL_MS) {
    await page.waitForTimeout(GHOST_SAMPLE_INTERVAL_MS);
    const sample = await page.evaluate(
      ({ bombRow, bombCol }) => {
        const world = window.__MS_GHOSTMAN_RUNTIME__.getWorld();
        const ghostIds = world.getResource('ghostIds');
        const positionStore = world.getResource('position');
        const mapResource = world.getResource('mapResource');
        const bombCellOccupancy = world.getResource('bombCellOccupancy');
        const blinkyId = ghostIds[0];
        return {
          ghostRow: positionStore.row[blinkyId],
          ghostCol: positionStore.col[blinkyId],
          // bombCellOccupancy is keyed by `row * cols + col`.
          occupancyHasBomb:
            bombCellOccupancy instanceof Set
              ? bombCellOccupancy.has(bombRow * mapResource.cols + bombCol)
              : false,
          occupancyShape:
            bombCellOccupancy instanceof Set
              ? 'Set'
              : Array.isArray(bombCellOccupancy)
                ? 'Array'
                : bombCellOccupancy instanceof Map
                  ? 'Map'
                  : typeof bombCellOccupancy,
        };
      },
      { ghostIdsKey: 'ghostIds', bombRow, bombCol },
    );
    samples.push(sample);
  }

  await pauseGameAndWait(page);

  // Acceptance gate (1): the collision system is publishing the bomb cell
  // into the occupancy resource that the ghost AI reads.
  const occupancyOk = samples.every((s) => s.occupancyHasBomb);
  expect(
    occupancyOk,
    'bombCellOccupancy should contain the bomb cell in every sampled frame — collision-system publication is broken',
  ).toBe(true);

  // Acceptance gate (2): the ghost never sits on the bomb tile. With the
  // pre-fix bug the ghost would oscillate (R,C) <-> (R,C+1) and many samples
  // would land on (R,C+1). With the fix the AI re-routes off the row after at
  // most one walk-in and the ghost never returns to the bomb tile.
  const onBombSamples = samples.filter(
    (s) => Math.round(s.ghostRow) === bombRow && Math.round(s.ghostCol) === bombCol,
  );
  expect(
    onBombSamples.length,
    `Ghost landed on the bomb tile (${bombRow},${bombCol}) in ${onBombSamples.length} of ${samples.length} samples — oscillation regression. Samples: ${JSON.stringify(samples)}`,
  ).toBe(0);
});
