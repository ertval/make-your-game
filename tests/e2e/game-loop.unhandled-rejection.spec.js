/**
 * Test: game-loop.unhandled-rejection.spec.js
 * Purpose: Verifies that unhandled promise rejections surface a critical error overlay to the user.
 * Public API: N/A (test module).
 * Implementation Notes: Triggers an in-page unhandled rejection and asserts overlay text through safe DOM reads.
 */

import { expect, test } from '@playwright/test';

test('shows critical overlay on unhandled rejection', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => Boolean(window.__MS_GHOSTMAN_RUNTIME__));

  await page.evaluate(() => {
    Promise.reject(new Error('e2e-rejection-path'));
  });

  await expect(page.locator('#overlay-root')).toContainText('Critical error: e2e-rejection-path');
});
