/**
 * D-05: Board CSS Adapter
 *
 * Syncs ECS map resource dimensions with CSS custom properties on the document
 * root. This ensures that the grid layout and board dimensions in CSS always
 * match the currently loaded level, maintaining render/layout correctness.
 *
 * Violated rule: ARCH-X02 (CSS board dimensions mismatch map dimensions).
 *
 * Public API:
 * - updateBoardCss(mapResource, targetElement?) — update --board-columns/rows.
 */

/**
 * Update the board dimension CSS variables based on a map resource.
 *
 * @param {MapResource} mapResource — The active map resource.
 * @param {HTMLElement} [targetElement] — Where to set variables (defaults to document.documentElement if available).
 */
export function updateBoardCss(mapResource, targetElement) {
  // Guard against missing map or element (ARCH-X02).
  // In Node/test environments, document may be undefined.
  const el = targetElement || (typeof document !== 'undefined' ? document.documentElement : null);

  if (!mapResource || !el) {
    return;
  }

  const { rows, cols } = mapResource;

  if (Number.isFinite(rows) && rows > 0) {
    el.style.setProperty('--board-rows', String(rows));
  }

  if (Number.isFinite(cols) && cols > 0) {
    el.style.setProperty('--board-columns', String(cols));
  }
}

//testing bugfix mode
