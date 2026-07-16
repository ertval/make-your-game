/**
 * Test: sec-01-csp-frame-busting.spec.js
 * Purpose: Verifies SEC-01 clickjacking protection by asserting that the application
 *   breaks out of an iframe when embedded.
 */

import { expect, test } from '@playwright/test';

test.describe('SEC-01 Content-Security-Policy & Clickjacking', () => {
  test('breaks out of iframe when embedded', async ({ page }) => {
    // Intercept and strip Content-Security-Policy headers so the test can simulate
    // static hosting targets (like GitHub Pages) where frame-ancestors is not honored.
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() === 'document') {
        try {
          const response = await route.fetch();
          const headers = { ...response.headers() };
          delete headers['content-security-policy'];
          delete headers['x-frame-options'];
          await route.fulfill({
            response,
            headers,
          });
        } catch (error) {
          // Ignore errors caused by navigation tearing down pending requests mid-fetch
          if (
            !error.message.includes('disposed') &&
            !error.message.includes('Route is already handled')
          ) {
            throw error;
          }
        }
      } else {
        await route.continue();
      }
    });

    // Navigate directly to the framing test page
    await page.goto('/framing-test.html');

    // Wait for the top-level page to be redirected to the game homepage
    await page.waitForURL(
      (url) => url.pathname === '/' || url.pathname.endsWith('/make-your-game/'),
    );

    // Assert that the page is no longer framed
    const isFramed = await page.evaluate(() => window.self !== window.top);
    expect(isFramed).toBe(false);
  });
});
