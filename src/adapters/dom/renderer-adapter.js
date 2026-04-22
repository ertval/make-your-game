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
  2: 'cell-pellet',
  3: 'cell-power-pellet',
  4: 'cell-door',
  5: 'cell-ghost-house',
};

/**
 * Board element class names.
 */
const BOARD_CLASSES = ['game-board', 'board-grid'];

/**
 * Create a new board adapter instance.
 *
 * @param {object} options
 * @param {string} [options.cellTag='div'] — Element tag for cells.
 * @param {Document} [options.document=globalThis.document] — Document reference for testing.
 * @returns {BoardAdapter}
 */
export function createBoardAdapter({ cellTag = 'div', document: doc = globalThis.document } = {}) {
  const docRef = doc;
  let boardElement = null;

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

    const { rows, cols, grid } = mapResource;

    if (!Number.isFinite(rows) || !Number.isFinite(cols)) {
      throw new Error('mapResource must have valid rows and cols.');
    }

    clearBoard();

    boardElement = docRef.createElement('div');
    boardElement.classList.add(...BOARD_CLASSES);
    boardElement.style.setProperty('--board-rows', String(rows));
    boardElement.style.setProperty('--board-columns', String(cols));

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cellIndex = r * cols + c;
        const cellType = grid[cellIndex];
        const cellElement = docRef.createElement(cellTag);

        cellElement.classList.add('cell', 'cell-position');
        cellElement.style.setProperty('--cell-row', String(r));
        cellElement.style.setProperty('--cell-col', String(c));

        const cellClass = CELL_TYPE_CLASSES[cellType] || 'cell-empty';
        cellElement.classList.add(cellClass);

        cellElement.setAttribute('data-row', String(r));
        cellElement.setAttribute('data-col', String(c));
        cellElement.setAttribute('data-type', String(cellType));

        boardElement.appendChild(cellElement);
      }
    }

    containerElement.appendChild(boardElement);
  }

  /**
   * Remove the board DOM from the document.
   */
  function clearBoard() {
    if (boardElement?.parentNode) {
      boardElement.parentNode.removeChild(boardElement);
      boardElement = null;
    }
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
  };
}
