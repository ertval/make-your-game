/*
 * Script: breakout.js
 * Purpose: Clickjacking protection frame-busting breakout.
 * Implementation notes:
 *   - Runs at the very start of page parsing to redirect top window if framed.
 *   - Keeps zero dependencies to prevent module execution failures.
 */

if (typeof window !== 'undefined' && window.self !== window.top) {
  window.top.location.href = window.self.location.href;
}
