/*
 * Module: frame-busting.js
 * Purpose: Protect the application from clickjacking attacks on static hosting environments
 *   (like GitHub Pages) that do not honor the CSP `frame-ancestors 'none'` directive.
 * Public API: Side-effect import only (run on module load).
 * Implementation Notes:
 *   - Runs as early as possible in index.html before rendering to prevent UI framing.
 *   - Compares self against top window; if different, breaks out by setting top.location.
 */

if (typeof window !== 'undefined' && window.self !== window.top) {
  // If we are embedded in a frame, force redirect the top window to our location to bust out.
  window.top.location = window.self.location.href;
}
