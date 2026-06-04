/**
 * D-06: Board DOM Adapter (Board Generation)
 *
 * Generates a static DOM board from a map resource using safe DOM APIs.
 * Enforces zero innerHTML and uses createElement/createElementNS exclusively.
 *
 * Architecture Notes:
 * - This adapter generates the initial board structure once per level load.
 * - Uses textContent and explicit attribute APIs for all dynamic content.
 * - CSP compliance: no eval, no new Function, no document.write.
 * - Optionally accepts a spritePool (D-09) via options. When provided,
 *   generateBoard pre-warms the pool against the container element so sprites
 *   are pre-allocated before the first render frame. clearBoard resets the
 *   pool so active elements are reclaimed on level transitions.
 *
 * Public API:
 * - createBoardAdapter(options) — factory for board adapter.
 * - adapter.generateBoard(mapResource, containerElement) — generate DOM board.
 * - adapter.clearBoard() — remove board DOM.
 */

/**
 * Cell type to CSS class mapping.
 */
const CELL_TYPE_CLASSES = {
  0: 'cell-empty',
  1: 'cell-wall',
  2: 'cell-destructible',
  3: 'cell-pellet',
  4: 'cell-power-pellet',
  5: 'cell-ghost-house',
  6: 'cell-empty',
};

/**
 * Board element class names.
 */
const BOARD_CLASSES = ['game-board', 'board-grid'];

/**
 * Fallback layout tokens for board-fit scaling, used when the matching CSS
 * custom properties cannot be read (e.g. in jsdom tests). Kept in sync with
 * styles/variables.css (--space-md, --hud-row-height, --board-max-scale).
 */
const FIT_DEFAULTS = {
  spaceMd: 16,
  hudRowHeight: 72,
  maxScale: 4,
  tileSize: 32,
};

/**
 * Read a numeric pixel/number value from a CSS custom property on :root,
 * falling back to a default when unavailable or non-finite.
 *
 * @param {Window} win
 * @param {string} name — Custom property name, e.g. '--space-md'.
 * @param {number} fallback
 * @returns {number}
 */
function readCssNumber(win, name, fallback) {
  const docEl = win?.document?.documentElement;
  if (!docEl || typeof win.getComputedStyle !== 'function') {
    return fallback;
  }
  const raw = win.getComputedStyle(docEl).getPropertyValue(name);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Create a new board adapter instance.
 *
 * @param {object} options
 * @param {string} [options.cellTag='div'] — Element tag for cells.
 * @param {Document} [options.document=globalThis.document] — Document reference for testing.
 * @returns {BoardAdapter}
 */
export function createBoardAdapter({
  cellTag = 'div',
  document: doc = globalThis.document,
  spritePool = null,
} = {}) {
  const docRef = doc;
  let boardElement = null;
  let cellElements = [];
  let boardCols = 0;
  let resizeHandler = null;

  /**
   * Compute and apply the board-fit scale (--fit-scale) on the board element.
   *
   * Deriving this in JS rather than CSS calc() is deliberate: CSS would require
   * dividing a length by a length (viewport ÷ board size), which Firefox (Gecko)
   * rejects per spec while Chrome (Blink) accepts it — causing the board to render
   * at its small intrinsic size in Firefox only. A JS-computed plain number scales
   * identically across engines. Visual-only: gameplay coordinates use the fixed
   * --tile-size grid and are never touched here.
   */
  function fitBoardToViewport() {
    if (!boardElement) return;

    const win = docRef.defaultView ?? globalThis;
    if (!win || typeof win.getComputedStyle !== 'function') return;

    // Derive the board's true pixel size from its actual grid geometry
    // (rows × cols × --tile-size). The CSS width/height come from the root
    // --board-width/--board-height which are fixed at the 21×17 default and do
    // NOT track per-level board dimensions, so reading computed width/height
    // here would over/under-scale levels with a different size.
    const tileSize = readCssNumber(win, '--tile-size', FIT_DEFAULTS.tileSize);
    const cols = boardCols;
    const rows = cols > 0 ? cellElements.length / cols : 0;
    const boardW = cols * tileSize;
    const boardH = rows * tileSize;
    if (!Number.isFinite(boardW) || !Number.isFinite(boardH) || boardW <= 0 || boardH <= 0) {
      return;
    }

    const spaceMd = readCssNumber(win, '--space-md', FIT_DEFAULTS.spaceMd);
    const hudRowHeight = readCssNumber(win, '--hud-row-height', FIT_DEFAULTS.hudRowHeight);
    const maxScale = readCssNumber(win, '--board-max-scale', FIT_DEFAULTS.maxScale);

    // Mirror the original CSS margins: 4*--space-md horizontally,
    // --hud-row-height + 8*--space-md vertically.
    const availW = win.innerWidth - 4 * spaceMd;
    const availH = win.innerHeight - hudRowHeight - 8 * spaceMd;

    const scale = Math.max(0, Math.min(availW / boardW, availH / boardH, maxScale));
    boardElement.style.setProperty('--fit-scale', String(scale));
  }

  /**
   * Generate the static board DOM from a map resource.
   *
   * @param {MapResource} mapResource — The active map resource.
   * @param {HTMLElement} containerElement — Where to append the board.
   */
  function generateBoard(mapResource, containerElement) {
    if (!mapResource || !containerElement) {
      throw new Error('generateBoard requires mapResource and containerElement.');
    }

    clearBoard();

    // Clear any existing board children before generating new one
    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }

    const { rows, cols, grid } = mapResource;

    if (!Number.isFinite(rows) || !Number.isFinite(cols)) {
      throw new Error('mapResource must have valid rows and cols.');
    }

    boardElement = docRef.createElement('div');
    boardElement.classList.add(...BOARD_CLASSES);
    boardElement.style.setProperty('--board-rows', String(rows));
    boardElement.style.setProperty('--board-columns', String(cols));
    cellElements = new Array(rows * cols);
    boardCols = cols;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cellIndex = r * cols + c;
        const cellType = grid[cellIndex];
        const cellElement = docRef.createElement(cellTag);

        cellElement.classList.add('cell');
        cellElement.style.setProperty('--cell-row', String(r));
        cellElement.style.setProperty('--cell-col', String(c));

        const cellClass = CELL_TYPE_CLASSES[cellType] || 'cell';
        cellElement.classList.add(cellClass);

        cellElement.setAttribute('data-row', String(r));
        cellElement.setAttribute('data-col', String(c));
        cellElement.setAttribute('data-type', String(cellType));

        cellElements[cellIndex] = cellElement;
        boardElement.appendChild(cellElement);
      }
    }

    containerElement.appendChild(boardElement);

    // Size the board to the viewport now that it is in the document (computed
    // width/height are available), and keep it fitted across window resizes.
    fitBoardToViewport();

    const win = docRef.defaultView ?? globalThis;
    if (resizeHandler === null && win && typeof win.addEventListener === 'function') {
      resizeHandler = () => fitBoardToViewport();
      win.addEventListener('resize', resizeHandler);
    }

    // Pre-warm the sprite pool against the board element so sprites are direct
    // children of the grid container and position correctly within the CSS grid.
    if (spritePool) {
      spritePool.warmUp(boardElement);
    }
  }

  /**
   * Remove the board DOM from the document.
   */
  function clearBoard() {
    if (boardElement !== null) {
      // Reclaim active sprite elements before tearing down the board so the
      // pool is fully idle and ready to be re-warmed on the next generateBoard.
      if (spritePool) {
        spritePool.reset();
      }

      if (boardElement.parentNode) {
        boardElement.parentNode.removeChild(boardElement);
      }

      const win = docRef.defaultView ?? globalThis;
      if (resizeHandler !== null && win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', resizeHandler);
      }
      resizeHandler = null;

      boardElement = null;
      cellElements = [];
      boardCols = 0;
    }
  }

  /**
   * Update a single cell's CSS class to reflect a new cell type.
   * Called by board-sync-system when the map changes (e.g. pellet collected).
   *
   * @param {number} row
   * @param {number} col
   * @param {number} cellType
   */
  function updateCell(row, col, cellType) {
    const el = cellElements[row * boardCols + col];
    if (!el) return;
    for (const cls of Object.values(CELL_TYPE_CLASSES)) {
      el.classList.remove(cls);
    }
    el.classList.add(CELL_TYPE_CLASSES[cellType] || 'cell-empty');
  }

  /**
   * Get the current board element.
   *
   * @returns {HTMLElement|null}
   */
  function getBoard() {
    return boardElement;
  }

  return {
    generateBoard,
    clearBoard,
    getBoard,
    updateCell,
  };
}
