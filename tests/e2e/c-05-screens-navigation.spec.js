/**
 * Test: screens-navigation.spec.js
 * Purpose: Verifies browser-level keyboard navigation for the Track C screens adapter.
 * Public API: N/A (Playwright spec).
 *
 * Implementation notes:
 * - Uses an in-page DOM harness because the runtime app shell does not yet mount
 *   the Track C screen overlays into index.html.
 * - Imports the real adapter module in the browser context and drives it through
 *   genuine keyboard events with Playwright.
 */

import { expect, test } from '@playwright/test';

async function mountScreensHarness(page) {
  await page.goto('/');

  await page.setContent(`
    <main id="game-root" tabindex="-1"></main>
    <main id="screens-root" tabindex="0">
      <section data-screen="start">
        <button data-option data-action="start-primary">Start Game</button>
        <button data-option data-action="start-secondary">High Scores</button>
      </section>
      <section data-screen="pause">
        <button data-option data-action="pause-continue">Continue</button>
        <button data-option data-action="pause-restart">Restart</button>
      </section>
      <section data-screen="level-complete">
        <button data-option data-action="level-next">Next Level</button>
      </section>
      <section data-screen="game-over">
        <button data-option data-action="gameover-play-again">Play Again</button>
      </section>
      <section data-screen="victory">
        <button data-option data-action="victory-play-again">Play Again</button>
      </section>
    </main>
  `);

  await page.evaluate(async () => {
    const { createScreensAdapter } = await import('/src/adapters/dom/screens-adapter.js');
    const rootElement = document.getElementById('screens-root');
    const gameplayElement = document.getElementById('game-root');

    window.__SCREENS_TEST_CLICKS__ = [];
    window.__SCREENS_TEST_ACTIONS__ = [];
    for (const option of rootElement.querySelectorAll('[data-option]')) {
      option.addEventListener('click', () => {
        window.__SCREENS_TEST_CLICKS__.push(option.getAttribute('data-action'));
      });
    }

    window.__SCREENS_TEST_ADAPTER__ = createScreensAdapter(rootElement, {
      gameplayElement,
      onAction(action) {
        window.__SCREENS_TEST_ACTIONS__.push(action);
      },
    });
    rootElement.focus();
  });
}

test('start screen navigation changes the active option and Enter triggers click', async ({
  page,
}) => {
  await mountScreensHarness(page);

  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.showStart();
    document.getElementById('screens-root').focus();
  });

  const startScreen = page.locator('[data-screen="start"]');
  const startOptions = startScreen.locator('[data-option]');

  await expect(startScreen).toBeVisible();
  await expect(startScreen).toHaveClass(/is-screen-visible/);
  await expect(startOptions.nth(0)).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('ArrowDown');

  await expect(startOptions.nth(0)).not.toHaveAttribute('data-active', 'true');
  await expect(startOptions.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(startOptions.nth(1)).toBeFocused();

  await page.keyboard.press('Enter');

  await expect
    .poll(async () => page.evaluate(() => window.__SCREENS_TEST_CLICKS__.slice()))
    .toEqual(['start-secondary']);
});

test('pause screen supports ArrowUp and ArrowDown selection changes and Enter activation', async ({
  page,
}) => {
  await mountScreensHarness(page);

  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.showPause();
    document.getElementById('screens-root').focus();
  });

  const pauseScreen = page.locator('[data-screen="pause"]');
  const pauseOptions = pauseScreen.locator('[data-option]');

  await expect(pauseScreen).toBeVisible();
  await expect(pauseScreen).toHaveClass(/is-screen-visible/);
  await expect(pauseOptions.nth(0)).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(pauseOptions.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(pauseOptions.nth(1)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(pauseOptions.nth(0)).toHaveAttribute('data-active', 'true');
  await expect(pauseOptions.nth(0)).toBeFocused();

  await page.keyboard.press('Enter');

  await expect
    .poll(async () => page.evaluate(() => window.__SCREENS_TEST_CLICKS__.slice()))
    .toEqual(['pause-continue']);

  await expect
    .poll(async () => page.evaluate(() => window.__SCREENS_TEST_ACTIONS__.slice()))
    .toEqual(['pause-continue']);
});

test('keyboard-only navigation works without mouse interaction', async ({ page }) => {
  await mountScreensHarness(page);

  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.showStart();
    document.getElementById('screens-root').focus();
  });

  const startOptions = page.locator('[data-screen="start"] [data-option]');

  await page.keyboard.press('ArrowUp');
  await expect(startOptions.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(startOptions.nth(1)).toBeFocused();

  await page.keyboard.press('Enter');

  await expect
    .poll(async () => page.evaluate(() => window.__SCREENS_TEST_CLICKS__.slice()))
    .toEqual(['start-secondary']);
});

test('pause restart is reachable by keyboard and focus returns to gameplay when hidden', async ({
  page,
}) => {
  await mountScreensHarness(page);

  await page.evaluate(() => {
    const gameplayElement = document.getElementById('game-root');
    gameplayElement.focus();
    window.__SCREENS_TEST_ADAPTER__.showPause();
  });

  const pauseOptions = page.locator('[data-screen="pause"] [data-option]');
  await expect(pauseOptions.nth(0)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(pauseOptions.nth(1)).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Enter');

  await expect
    .poll(async () => page.evaluate(() => window.__SCREENS_TEST_ACTIONS__.slice()))
    .toEqual(['pause-restart']);

  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.hideAll();
  });

  await expect(page.locator('#game-root')).toBeFocused();
});
