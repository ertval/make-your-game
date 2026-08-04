/**
 * E2E: Production CSP and Clickjacking Protections (#273).
 *
 * Verifies that the preview/production build has the correct CSP meta tags,
 * security headers, and frame busting logic.
 */

import { expect, test } from '@playwright/test';

test.describe('Production CSP and Clickjacking Protections', () => {
  const isCI = !!process.env.CI;
  const basePath = isCI ? '/make-your-game' : '';

  test('injects production CSP meta tag', async ({ page }) => {
    await page.goto(`${basePath}/`);
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);
    const content = await cspMeta.getAttribute('content');
    expect(content).toContain("require-trusted-types-for 'script'");
  });

  test('serves X-Frame-Options and Referrer-Policy headers', async ({ page }) => {
    const response = await page.goto(`${basePath}/`);
    const headers = response.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  test('frame busting script redirects top page when embedded in an iframe', async ({ page }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('BROWSER ERROR:', err.message));
    // Intercept requests and strip X-Frame-Options and Content-Security-Policy headers only for the HTML document inside the iframe to simulate a static host
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isIframeDoc =
        request.resourceType() === 'document' &&
        url.pathname === `${basePath}/` &&
        !url.searchParams.has('outer');

      if (!isIframeDoc) {
        await route.continue().catch(() => {});
        return;
      }

      try {
        const response = await route.fetch();
        const headers = { ...response.headers() };
        delete headers['x-frame-options'];
        delete headers['content-security-policy'];
        await route.fulfill({
          response,
          headers,
        });
      } catch (err) {
        console.error('route.fetch failed inside iframe route:', err);
        // Ignore failures caused by the frame-busting redirect tearing down the page/context
        await route.abort().catch(() => {});
      }
    });

    // We navigate to a page with a query parameter, then inject an iframe loading the game.
    // The frame busting script should detect self !== top and set top.location = self.location.
    await page.goto(`${basePath}/?outer=true`);

    await page.evaluate((bp) => {
      const iframe = document.createElement('iframe');
      iframe.src = `${bp}/`;
      document.body.appendChild(iframe);
    }, basePath);

    // Wait until the top-level URL matches the redirected URL (without outer=true) using polling assertion
    await expect(page).not.toHaveURL(/outer=true/, { timeout: 10000 });
    await page.unroute('**/*').catch(() => {});
    expect(page.url()).not.toContain('outer=true');
  });
});
