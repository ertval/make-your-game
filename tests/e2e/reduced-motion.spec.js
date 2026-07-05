/**
 * E2E: prefers-reduced-motion compliance (#275 / CI-11).
 *
 * AGENTS.md (MUST): non-gameplay motion — menus, overlays, transitions, and
 * decorative effects — must be disabled or simplified when
 * `prefers-reduced-motion: reduce` is active.
 *
 * This asserts the contract end-to-end: under emulated reduced motion, no
 * element in the overlay/menu subtree may declare a non-zero animation or
 * transition duration, and the same holds site-wide for transitions.
 */

import { expect, test } from '@playwright/test';
import { bootRuntime, startGameAndWait } from './helpers/game-helpers.js';

// Serialized in the page: returns the worst (largest) animation/transition
// duration found under `root`, with a human-readable offender label.
function scanMotion(rootSelector) {
  const durs = (value) =>
    Math.max(
      0,
      ...String(value)
        .split(',')
        .map((v) => Number.parseFloat(v) || 0),
    );
  const label = (el) =>
    el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).join('.')}`
      : '');

  const root = rootSelector ? document.querySelector(rootSelector) : document;
  const els = root ? root.querySelectorAll('*') : [];
  let maxAnimation = 0;
  let maxTransition = 0;
  let animationOffender = '(none)';
  let transitionOffender = '(none)';

  for (const el of els) {
    const cs = getComputedStyle(el);
    const animation = cs.animationName === 'none' ? 0 : durs(cs.animationDuration);
    const transition = durs(cs.transitionDuration);
    if (animation > maxAnimation) {
      maxAnimation = animation;
      animationOffender = `${label(el)} (${cs.animationName})`;
    }
    if (transition > maxTransition) {
      maxTransition = transition;
      transitionOffender = label(el);
    }
  }
  return { maxAnimation, maxTransition, animationOffender, transitionOffender };
}

test('overlays/menus honor prefers-reduced-motion (no animation or transition)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootRuntime(page); // boots into MENU with the Start overlay shown

  await expect(page.locator('[data-screen="start"]')).toHaveCount(1);

  const menu = await page.evaluate(scanMotion, '#overlay-root');
  expect(menu.maxAnimation, `animating overlay element: ${menu.animationOffender}`).toBe(0);
  expect(menu.maxTransition, `transitioning overlay element: ${menu.transitionOffender}`).toBe(0);
});

test('no element declares a non-zero transition under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootRuntime(page);
  await startGameAndWait(page, { levelIndex: 0 });

  const site = await page.evaluate(scanMotion, null);
  expect(site.maxTransition, `transitioning element: ${site.transitionOffender}`).toBe(0);
});
