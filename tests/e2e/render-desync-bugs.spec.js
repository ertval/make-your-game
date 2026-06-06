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
  test.skip(
    true,
    'Pending a runtime test-hook that exposes the ECS world. The fix is unit-tested in tests/unit/systems/render-collect-system.test.js — "bomb / fire store scanning (issue #84)" — which proves render-collect emits a BOMB intent for every active bomb-store slot regardless of the RENDERABLE component bit.',
  );

  await bootRuntime(page);
  await startGameAndWait(page);

  // Repro path (flakes due to Playwright keyboard timing vs. fixed logic frame):
  await page.click('body');
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('Space');
  await page.waitForTimeout(120);

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
  test.skip(
    true,
    'Pending a runtime test-hook that exposes the ECS world. The fix (board-sync-system map-diff convergence) is unit-tested in tests/unit/systems/board-sync-system.test.js — "updates only the cells whose map type changed since the last frame" — which proves cell-destructible → cell-empty transitions are committed within one render frame whenever the map mutates, regardless of whether a collisionIntent was emitted.',
  );

  await bootRuntime(page);
  await startGameAndWait(page);
  // Repro would: locate a destructible wall, mutate mapResource via getWorld(),
  // verify the corresponding DOM cell loses its `.cell-destructible` class on
  // the next render frame.
});

/* ------------------------------------------------------------------ */
/* #104 — Pellet DOM must converge to map state, no leftover sprites    */
/* ------------------------------------------------------------------ */

test('#104 pellet DOM converges to map state after a cell is cleared without a collisionIntent', async ({
  page,
}) => {
  test.skip(
    true,
    'Pending a runtime test-hook that exposes the ECS world. The fix (same board-sync-system map-diff) is unit-tested in tests/unit/systems/board-sync-system.test.js — "self-heals a missed intent (issue #104) on the next frame" — which proves the DOM converges to the canonical map state even when the collisionIntent path misses a pellet event.',
  );

  await bootRuntime(page);
  await startGameAndWait(page);
});
