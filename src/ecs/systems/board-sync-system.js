/**
 * D-06: Board Sync System
 *
 * Purpose: Keeps the static board DOM in sync with map state changes that
 * occur during simulation (pellet collection, destructible wall removal,
 * any future runtime cell mutation).
 *
 * Public API:
 * - createBoardSyncSystem(boardAdapter, options) — factory; returns a render-phase system.
 *
 * Implementation notes:
 * - Reads the canonical `mapResource.grid` each render frame and diffs
 *   against a locally-cached snapshot of the last DOM cell types. Any cell
 *   that changed is committed via boardAdapter.updateCell(row, col, type).
 * - This is intent-independent: a producer that mutates the map via
 *   `setCell()` (e.g. explosion-system destroying a destructible wall — see
 *   issue #85) is picked up the next render frame even when no
 *   collisionIntent is emitted. It also self-heals if a collisionIntent is
 *   missed due to a logic/render-phase race (see issue #104).
 * - Snapshot is lazily allocated on the first frame after map dimensions
 *   stabilize and re-allocated when dimensions change (level transitions).
 * - Runs in the render phase so DOM writes batch with sprite writes.
 *
 * Constraints:
 * - Must be registered after render-collect-system in the render phase.
 * - Does not mutate map state — read-only access to `mapResource.grid`.
 */

const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';

export function createBoardSyncSystem(boardAdapter, options = {}) {
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;

  /** @type {Uint8Array | null} Cached snapshot of last-committed cell types. */
  let snapshot = null;
  let snapshotRows = 0;
  let snapshotCols = 0;

  /**
   * Initialize the snapshot from the current map grid. The DOM was already
   * populated by `boardAdapter.generateBoard()` from the same grid, so no
   * `updateCell` call is needed on the very first frame — we just record the
   * starting state and let subsequent frames pick up real mutations.
   *
   * @param {Uint8Array} grid - Current map grid (flat, row-major).
   * @param {number} rows
   * @param {number} cols
   */
  function syncSnapshotFromGrid(grid, rows, cols) {
    snapshot = new Uint8Array(grid);
    snapshotRows = rows;
    snapshotCols = cols;
  }

  return {
    name: 'board-sync-system',
    phase: 'render',
    resourceCapabilities: {
      read: [mapResourceKey],
    },
    update(context) {
      const mapResource = context.world.getResource(mapResourceKey);
      if (!mapResource?.grid) return;

      const { rows, cols, grid } = mapResource;
      if (rows <= 0 || cols <= 0) return;

      // Snapshot lifecycle: lazy-init on first frame; resize on level switch.
      // Initial value mirrors the map so the very first render frame is a
      // no-op (generateBoard already wrote the same state to the DOM).
      if (snapshot === null || rows !== snapshotRows || cols !== snapshotCols) {
        syncSnapshotFromGrid(grid, rows, cols);
        return;
      }

      // Diff snapshot against the canonical map grid and commit DOM updates
      // for any changed cell. The snapshot is updated in-place so subsequent
      // frames only commit fresh changes.
      const total = rows * cols;
      for (let i = 0; i < total; i += 1) {
        const current = grid[i];
        if (snapshot[i] === current) continue;
        const row = (i / cols) | 0;
        const col = i - row * cols;
        boardAdapter.updateCell(row, col, current);
        snapshot[i] = current;
      }
    },
  };
}
