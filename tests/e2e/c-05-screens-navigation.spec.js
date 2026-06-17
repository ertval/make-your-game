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
        <button data-option data-action="open-high-scores" data-high-scores-origin="start">High Scores</button>
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
    .toEqual(['open-high-scores']);
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
    .toEqual(['open-high-scores']);
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

// Real-app-shell coverage for the C-05 High Scores overlay (top-N leaderboard).
// Unlike the harness tests above, these drive the live index.html overlays.
test('High Scores overlay renders the persisted top-N leaderboard from the start menu', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__MS_GHOSTMAN_RUNTIME__ !== undefined, { timeout: 5000 });

  // Seed a leaderboard, then reload so the storage adapter reads it fresh.
  await page.evaluate(() => {
    localStorage.setItem(
      'ms-ghostman.highScore',
      JSON.stringify({ score: 4200, scores: [4200, 1500, 300] }),
    );
  });
  await page.reload();
  await page.waitForFunction(() => window.__MS_GHOSTMAN_RUNTIME__ !== undefined, { timeout: 5000 });

  await page.locator('[data-action="open-high-scores"]').first().click();

  const overlay = page.locator('[data-screen="high-scores"]');
  await expect(overlay).toHaveClass(/is-screen-visible/);
  await expect(overlay.locator('[data-high-scores] li')).toHaveText([
    '1. 04200',
    '2. 01500',
    '3. 00300',
  ]);
  // Only one overlay visible at a time.
  await expect(page.locator('[data-screen].is-screen-visible')).toHaveCount(1);

  // Back returns to the start menu.
  await page.locator('[data-action="high-scores-back"]').click();
  await expect(page.locator('[data-screen="start"]')).toHaveClass(/is-screen-visible/);
  await expect(overlay).toHaveClass(/is-screen-hidden/);
});

test('High Scores overlay is reachable from the pause menu and Back returns to pause', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__MS_GHOSTMAN_RUNTIME__ !== undefined, { timeout: 5000 });

  // Start the game, then pause so the pause overlay (with its High Scores button)
  // is visible.
  await page.locator('[data-action="start-primary"]').click();
  await page.waitForFunction(
    () => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state === 'PLAYING',
    { timeout: 4000 },
  );
  await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.pause());
  await expect(page.locator('[data-screen="pause"]')).toHaveClass(/is-screen-visible/);

  // Open High Scores from pause.
  await page.locator('[data-screen="pause"] [data-action="open-high-scores"]').click();
  await expect(page.locator('[data-screen="high-scores"]')).toHaveClass(/is-screen-visible/);

  // Back returns to the pause menu (not the start menu).
  await page.locator('[data-action="high-scores-back"]').click();
  await expect(page.locator('[data-screen="pause"]')).toHaveClass(/is-screen-visible/);
  await expect(page.locator('[data-screen="high-scores"]')).toHaveClass(/is-screen-hidden/);
});
