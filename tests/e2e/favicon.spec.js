/**
 * E2E: Favicon presence for Ms. Ghostman (#100).
 *
 * Verifies the enhancement requested in issue #100:
 *   - index.html declares the favicon <link> tags.
 *   - The favicon assets are actually served (200 + an image content-type) so
 *     the browser tab can render a custom icon rather than the default.
 *
 * The icons live in /public and are served at the site root by Vite in both
 * dev and the preview build the Playwright webServer runs against.
 */

import { expect, test } from '@playwright/test';

const ICON_ASSETS = [
  { href: '/favicon.svg', selector: 'link[rel="icon"][type="image/svg+xml"]' },
  { href: '/favicon.ico', selector: 'link[rel="icon"][href="/favicon.ico"]' },
  { href: '/favicon-32x32.png', selector: 'link[rel="icon"][sizes="32x32"]' },
  { href: '/favicon-16x16.png', selector: 'link[rel="icon"][sizes="16x16"]' },
  { href: '/apple-touch-icon.png', selector: 'link[rel="apple-touch-icon"]' },
];

test.describe('#100 favicon', () => {
  test('declares favicon link tags in the document head', async ({ page }) => {
    await page.goto('/');

    for (const { selector, href } of ICON_ASSETS) {
      const link = page.locator(selector);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', href);
    }
  });

  test('serves each favicon asset as an image (200 OK)', async ({ page }) => {
    for (const { href } of ICON_ASSETS) {
      const response = await page.request.get(href);
      expect(response.status(), `${href} should return 200`).toBe(200);
      expect(response.headers()['content-type'], `${href} should be served as an image`).toMatch(
        /image\//,
      );
    }
  });
});
