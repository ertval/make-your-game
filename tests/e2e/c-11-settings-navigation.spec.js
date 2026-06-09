/**
 * Test: c-11-settings-navigation.spec.js
 * Purpose: Browser-level coverage for the C-11B Settings overlay + persistent
 *   audio quick-toggle — open from Start, open from Pause, Back navigation,
 *   keyboard-only operation, and accessibility attributes (aria-pressed /
 *   aria-valuenow).
 * Public API: N/A (Playwright spec).
 *
 * Implementation notes:
 * - Uses an in-page DOM harness that imports the real adapter modules in the
 *   browser context (same approach as c-05-screens-navigation.spec.js), so the
 *   test drives genuine keyboard/click events without booting the full audio
 *   runtime.
 */

import { expect, test } from '@playwright/test';

async function mountSettingsHarness(page) {
  await page.goto('/');

  await page.setContent(`
    <main id="game-root" tabindex="-1"></main>
    <div id="quick-toggle-root">
      <button data-audio-toggle="musicEnabled" data-icon-on="🎵" data-icon-off="🔇" aria-pressed="true" aria-label="Toggle music">
        <span data-audio-toggle-icon>🎵</span><span>Music</span>
      </button>
      <button data-audio-toggle="sfxEnabled" data-icon-on="🔊" data-icon-off="🔇" aria-pressed="true" aria-label="Toggle sound effects">
        <span data-audio-toggle-icon>🔊</span><span>SFX</span>
      </button>
    </div>
    <main id="screens-root" tabindex="0">
      <section data-screen="start">
        <button data-option data-action="start-primary">Start Game</button>
        <button data-option data-action="open-settings" data-settings-origin="start">Settings</button>
        <button data-option data-action="start-secondary">High Scores</button>
      </section>
      <section data-screen="pause">
        <button data-option data-action="pause-continue">Continue</button>
        <button data-option data-action="open-settings" data-settings-origin="pause">Settings</button>
        <button data-option data-action="pause-restart">Restart</button>
      </section>
      <section data-screen="settings">
        <button data-option data-action="settings-toggle-music" data-setting="musicEnabled" aria-pressed="true">
          <span data-setting-icon>🔊</span><span>Music</span>
        </button>
        <input type="range" data-option data-action="settings-volume-music" data-setting="musicVolume"
               min="0" max="100" step="1" value="100" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" />
        <button data-option data-action="settings-toggle-sfx" data-setting="sfxEnabled" aria-pressed="true">
          <span data-setting-icon>🔊</span><span>SFX</span>
        </button>
        <input type="range" data-option data-action="settings-volume-sfx" data-setting="sfxVolume"
               min="0" max="100" step="1" value="100" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" />
        <button data-option data-action="settings-back">Back</button>
      </section>
    </main>
  `);

  await page.evaluate(async () => {
    const { createScreensAdapter } = await import('/src/adapters/dom/screens-adapter.js');
    const { createAudioQuickToggle } = await import('/src/adapters/dom/screens-audio-toggle.js');
    const rootElement = document.getElementById('screens-root');
    const gameplayElement = document.getElementById('game-root');

    window.__SETTINGS_CHANGES__ = [];
    window.__QUICK_TOGGLES__ = [];

    window.__SCREENS_TEST_ADAPTER__ = createScreensAdapter(rootElement, {
      gameplayElement,
      onSettingChange(key, value) {
        window.__SETTINGS_CHANGES__.push({ key, value });
      },
    });
    window.__QUICK_TOGGLE_ADAPTER__ = createAudioQuickToggle(
      document.getElementById('quick-toggle-root'),
      {
        onToggle(key, value) {
          window.__QUICK_TOGGLES__.push({ key, value });
        },
      },
    );
    rootElement.focus();
  });
}

test('opens Settings from the Start menu via keyboard', async ({ page }) => {
  await mountSettingsHarness(page);
  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.showStart();
    document.getElementById('screens-root').focus();
  });

  // Start option index 1 is "Settings".
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-screen="start"] [data-option]').nth(1)).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-screen="settings"]')).toHaveClass(/is-screen-visible/);
  await expect(page.locator('[data-screen="start"]')).toHaveClass(/is-screen-hidden/);
  // Only one overlay visible.
  await expect(page.locator('[data-screen].is-screen-visible')).toHaveCount(1);
});

test('opens Settings from the Pause menu and Back returns to Pause', async ({ page }) => {
  await mountSettingsHarness(page);
  await page.evaluate(() => {
    window.__SCREENS_TEST_ADAPTER__.showPause();
    document.getElementById('screens-root').focus();
  });

  await page.keyboard.press('ArrowDown'); // -> Settings option
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="settings"]')).toHaveClass(/is-screen-visible/);

  // Back is the last option; ArrowUp from the first wraps to it.
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-screen="settings"] [data-option]').last()).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-screen="pause"]')).toHaveClass(/is-screen-visible/);
  await expect(page.locator('[data-screen="settings"]')).toHaveClass(/is-screen-hidden/);
});

test('Settings toggle exposes aria-pressed and flips on Enter', async ({ page }) => {
  await mountSettingsHarness(page);
  await page.evaluate(() => window.__SCREENS_TEST_ADAPTER__.showSettings('start'));

  const musicToggle = page.locator('[data-screen="settings"] [data-setting="musicEnabled"]');
  await expect(musicToggle).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => document.getElementById('screens-root').focus());
  await page.keyboard.press('Enter'); // first option is the music toggle

  await expect(musicToggle).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() => page.evaluate(() => window.__SETTINGS_CHANGES__.slice(-1)[0]))
    .toEqual({ key: 'musicEnabled', value: false });
});

test('Settings slider exposes aria-valuenow and responds to Left/Right', async ({ page }) => {
  await mountSettingsHarness(page);
  await page.evaluate(() => window.__SCREENS_TEST_ADAPTER__.showSettings('start'));
  await page.evaluate(() => document.getElementById('screens-root').focus());

  const slider = page.locator('[data-screen="settings"] [data-setting="musicVolume"]');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');

  await page.keyboard.press('ArrowDown'); // move to the music volume slider
  await page.keyboard.press('ArrowLeft');

  await expect(slider).toHaveAttribute('aria-valuenow', '99');
  await expect
    .poll(() => page.evaluate(() => window.__SETTINGS_CHANGES__.slice(-1)[0]))
    .toEqual({ key: 'musicVolume', value: 0.99 });
});

test('persistent quick-toggle shows a label and flips aria-pressed + emoji on click', async ({
  page,
}) => {
  await mountSettingsHarness(page);

  const musicButton = page.locator('#quick-toggle-root [data-audio-toggle="musicEnabled"]');
  const sfxButton = page.locator('#quick-toggle-root [data-audio-toggle="sfxEnabled"]');
  // The toggles carry a visible text label.
  await expect(musicButton).toContainText('Music');
  await expect(sfxButton).toContainText('SFX');
  await expect(musicButton).toHaveAttribute('aria-pressed', 'true');

  await musicButton.click();

  await expect(musicButton).toHaveAttribute('aria-pressed', 'false');
  await expect(musicButton.locator('[data-audio-toggle-icon]')).toHaveText('🔇');
  await expect
    .poll(() => page.evaluate(() => window.__QUICK_TOGGLES__.slice(-1)[0]))
    .toEqual({ key: 'musicEnabled', value: false });
});
