/**
 * E2E: Presentation layout — board scaling, centering, and HUD readability.
 *
 * Guards the UI scaling pass (audit findings 6/7/8 follow-up):
 *  - The board fills most of the viewport (≈60–80% of height) on desktop.
 *  - The board stays centered on both axes and keeps crisp pixel-art rendering.
 *  - The HUD is a readable horizontal top bar above the board, with all labels.
 *
 * These are visual/layout invariants only; gameplay coordinates and ECS logic
 * are unaffected (the board uses a CSS transform, never resized in JS).
 */

import { expect, test } from '@playwright/test';

import { bootRuntime } from './helpers/game-helpers.js';

const BOARD_SELECTOR = '#game-board > .game-board, #game-board > .board-grid';

const EXPECTED_LABELS = {
  timer: 'Timer:',
  score: 'Score:',
  lives: 'Lives:',
  bombs: 'Bombs:',
  fire: 'Fire:',
  level: 'Level:',
};

async function readLayout(page) {
  return page.evaluate((boardSelector) => {
    const hud = document.querySelector('#hud');
    const hudCs = getComputedStyle(hud);
    const board = document.querySelector('#game-board');
    const inner = document.querySelector(boardSelector);
    const cb = board.getBoundingClientRect();
    const ib = inner.getBoundingClientRect();
    const innerCs = getComputedStyle(inner);

    const labels = [...hud.querySelectorAll('.hud__metric')].map((m) => ({
      key: m.getAttribute('data-hud'),
      label: m.querySelector('.hud__label')?.textContent?.trim() ?? null,
      value: m.querySelector('[data-hud-value]')?.textContent?.trim() ?? null,
      top: Math.round(m.getBoundingClientRect().top),
    }));

    return {
      labels,
      hudDisplay: hudCs.display,
      hudFontPx: Number.parseFloat(hudCs.fontSize),
      hudFontWeight: Number.parseInt(hudCs.fontWeight, 10),
      imageRendering: innerCs.imageRendering,
      boardVisHeight: ib.height,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      centerDx: Math.round(ib.x + ib.width / 2 - (cb.x + cb.width / 2)),
      centerDy: Math.round(ib.y + ib.height / 2 - (cb.y + cb.height / 2)),
      hudBottom: hud.getBoundingClientRect().bottom,
      boardTop: ib.top,
      fitsWidth: ib.width <= window.innerWidth + 1,
      fitsHeight: ib.height <= cb.height + 1,
    };
  }, BOARD_SELECTOR);
}

test('board fills most of the viewport, centered, with crisp scaling (desktop)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootRuntime(page);
  await page.waitForSelector(BOARD_SELECTOR, { timeout: 8000 });

  const layout = await readLayout(page);
  const heightPct = layout.boardVisHeight / layout.viewportHeight;

  // Board is the primary focus: ≈60–80% of viewport height (small upper slack).
  expect(heightPct).toBeGreaterThanOrEqual(0.6);
  expect(heightPct).toBeLessThanOrEqual(0.85);

  // Centered on both axes within its stage.
  expect(Math.abs(layout.centerDx)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.centerDy)).toBeLessThanOrEqual(1);

  // Crisp pixel-art scaling (no blur) and contained within the stage.
  expect(layout.imageRendering).toBe('pixelated');
  expect(layout.fitsWidth).toBe(true);
  expect(layout.fitsHeight).toBe(true);
});

test('HUD is a readable horizontal top bar above the board with all labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootRuntime(page);
  await page.waitForSelector(BOARD_SELECTOR, { timeout: 8000 });

  const layout = await readLayout(page);

  // Horizontal bar: flex container, all metrics on a single row (±2px line-box jitter).
  expect(layout.hudDisplay).toBe('flex');
  const tops = layout.labels.map((l) => l.top);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);

  // Readable typography: desktop font in the 18–26px band, strong weight.
  expect(layout.hudFontPx).toBeGreaterThanOrEqual(18);
  expect(layout.hudFontPx).toBeLessThanOrEqual(26);
  expect(layout.hudFontWeight).toBeGreaterThanOrEqual(700);

  // All labels preserved alongside live values.
  for (const entry of layout.labels) {
    expect(entry.label, `label for ${entry.key}`).toBe(EXPECTED_LABELS[entry.key]);
    expect(entry.value, `value for ${entry.key}`).toBeTruthy();
  }

  // HUD sits above the board with no overlap.
  expect(layout.hudBottom).toBeLessThanOrEqual(layout.boardTop);
});

test('board scales down to fit small viewports while staying centered', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await bootRuntime(page);
  await page.waitForSelector(BOARD_SELECTOR, { timeout: 8000 });

  const layout = await readLayout(page);

  // No overflow, still centered, HUD still above the board.
  expect(layout.fitsWidth).toBe(true);
  expect(layout.fitsHeight).toBe(true);
  expect(Math.abs(layout.centerDx)).toBeLessThanOrEqual(1);
  expect(layout.hudBottom).toBeLessThanOrEqual(layout.boardTop);
});
