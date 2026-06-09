/**
 * Test: c-09-audio-loading-indicator.spec.js
 * Purpose: Browser-level verification of the C-09 audio-loading indicator —
 *   the real DOM adapter toggles a real indicator node, and the preload
 *   orchestrator shows it only for slow loads and hides it on completion.
 * Public API: N/A (Playwright spec).
 *
 * Implementation notes:
 * - Mounts a minimal in-page DOM harness with the [data-audio-loading] node and
 *   imports the real adapter + orchestrator modules in the browser context.
 * - Uses a controllable timer/preload promise (no real AudioContext / network)
 *   so the threshold behavior is deterministic.
 */

import { expect, test } from '@playwright/test';

test.describe('C-09 audio-loading indicator', () => {
  test('fast preload never reveals the indicator (no flicker)', async ({ page }) => {
    await page.goto('/');

    const visible = await page.evaluate(async () => {
      // Build the indicator node with safe DOM APIs (no innerHTML sink).
      const el = document.createElement('div');
      el.setAttribute('data-audio-loading', '');
      el.className = 'audio-loading is-screen-hidden';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('aria-busy', 'false');
      el.textContent = 'Loading audio…';
      document.body.replaceChildren(el);

      const { createAudioLoadingIndicator } = await import(
        '/src/adapters/dom/audio-loading-indicator.js'
      );
      const { preloadWithIndicator } = await import('/src/adapters/io/audio-integration.js');

      const indicator = createAudioLoadingIndicator(document.body);
      const audio = {
        preloadAudioAssets: async () => ({
          preloaded: ['sfx-x'],
          cached: [],
          skipped: [],
          failed: [],
        }),
      };

      // Real timers: a sub-threshold preload (resolves immediately) clears the
      // 200ms show-timer before it can fire.
      await preloadWithIndicator({ audio, indicator, cueIds: ['sfx-x'], thresholdMs: 200 });

      const node = document.querySelector('[data-audio-loading]');
      return {
        isVisible: indicator.isVisible(),
        hasVisibleClass: node.classList.contains('is-screen-visible'),
        ariaBusy: node.getAttribute('aria-busy'),
      };
    });

    expect(visible.isVisible).toBe(false);
    expect(visible.hasVisibleClass).toBe(false);
    expect(visible.ariaBusy).toBe('false');
  });

  test('slow preload reveals then hides the indicator on completion', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const el = document.createElement('div');
      el.setAttribute('data-audio-loading', '');
      el.className = 'audio-loading is-screen-hidden';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('aria-busy', 'false');
      el.textContent = 'Loading audio…';
      document.body.replaceChildren(el);

      const { createAudioLoadingIndicator } = await import(
        '/src/adapters/dom/audio-loading-indicator.js'
      );
      const { preloadWithIndicator } = await import('/src/adapters/io/audio-integration.js');

      const indicator = createAudioLoadingIndicator(document.body);
      const node = document.querySelector('[data-audio-loading]');

      // Gate the preload so we can observe the indicator mid-flight.
      let resolvePreload;
      const audio = {
        preloadAudioAssets: () =>
          new Promise((resolve) => {
            resolvePreload = resolve;
          }),
      };

      // 0ms threshold so the show-timer fires on the next tick while preload is
      // still pending.
      const pending = preloadWithIndicator({
        audio,
        indicator,
        cueIds: ['sfx-x'],
        thresholdMs: 0,
      });

      await new Promise((r) => setTimeout(r, 5));
      const shownMidFlight = node.classList.contains('is-screen-visible');
      const ariaBusyMidFlight = node.getAttribute('aria-busy');

      resolvePreload({ preloaded: ['sfx-x'], cached: [], skipped: [], failed: [] });
      await pending;

      return {
        shownMidFlight,
        ariaBusyMidFlight,
        hiddenAfter: node.classList.contains('is-screen-hidden'),
        ariaBusyAfter: node.getAttribute('aria-busy'),
      };
    });

    expect(result.shownMidFlight).toBe(true);
    expect(result.ariaBusyMidFlight).toBe('true');
    expect(result.hiddenAfter).toBe(true);
    expect(result.ariaBusyAfter).toBe('false');
  });
});
