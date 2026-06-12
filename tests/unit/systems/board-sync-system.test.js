/**
 * D-06: Board Sync System Tests
 *
 * Verifies the board-sync-system reads `mapResource.grid` and dispatches
 * `boardAdapter.updateCell` calls for any cell whose type differs from the
 * locally-cached snapshot of the last-committed DOM state.
 *
 * Coverage targets:
 *   - First frame: snapshot starts at 0xFF, every cell flushed once.
 *   - Steady state: no calls when nothing changed.
 *   - Map mutation: updateCell fires for changed cells on the next frame.
 *   - Level transition: snapshot resizes to new dimensions, all cells reflushed.
 *   - Resource-fallback edges: missing/invalid map → no-op.
 *   - Custom resource key respected.
 */

import { describe, expect, it, vi } from 'vitest';
import { createBoardSyncSystem } from '../../../src/ecs/systems/board-sync-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createMockAdapter() {
  return { updateCell: vi.fn() };
}

/**
 * Build a minimal mapResource-shaped object for tests.
 * @param {number[][]} grid2D — Row-major 2D grid of cell type ids.
 */
function makeMap(grid2D) {
  const rows = grid2D.length;
  const cols = grid2D[0]?.length ?? 0;
  const grid = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      grid[r * cols + c] = grid2D[r][c];
    }
  }
  return { rows, cols, grid };
}

function setupHarness(mapResource, options = {}) {
  const world = new World();
  const adapter = createMockAdapter();
  const system = createBoardSyncSystem(adapter, options);
  if (mapResource !== undefined) {
    world.setResource(options.mapResourceKey || 'mapResource', mapResource);
  }
  return { world, adapter, system };
}

describe('board-sync-system', () => {
  describe('phase and resource config', () => {
    const adapter = createMockAdapter();
    const system = createBoardSyncSystem(adapter);

    it('runs in the render phase', () => {
      expect(system.phase).toBe('render');
    });

    it('declares read access to mapResource', () => {
      expect(system.resourceCapabilities.read).toContain('mapResource');
    });

    it('exposes a stable name', () => {
      expect(system.name).toBe('board-sync-system');
    });
  });

  describe('first-frame no-op', () => {
    it('does not call updateCell on the very first frame', () => {
      // The DOM was already populated by `boardAdapter.generateBoard()` from
      // the same map grid, so the first frame is a snapshot-init only — no
      // DOM writes. Re-flushing every cell here would crash adapters whose
      // cell elements only stub `classList.add` (real-world generation flow)
      // without `classList.remove` (only needed for runtime swaps).
      const map = makeMap([
        [0, 3, 1],
        [3, 0, 2],
      ]);
      const { world, adapter, system } = setupHarness(map);

      system.update({ world });

      expect(adapter.updateCell).not.toHaveBeenCalled();
    });
  });

  describe('steady-state no-op behavior', () => {
    it('does not call updateCell on a second frame when nothing changed', () => {
      const map = makeMap([
        [0, 3],
        [3, 0],
      ]);
      const { world, adapter, system } = setupHarness(map);

      system.update({ world });
      adapter.updateCell.mockClear();
      system.update({ world });

      expect(adapter.updateCell).not.toHaveBeenCalled();
    });
  });

  describe('mutation-driven updates', () => {
    it('updates only the cells whose map type changed since the last frame', () => {
      const map = makeMap([
        [3, 3, 3],
        [3, 3, 3],
      ]);
      const { world, adapter, system } = setupHarness(map);

      // Prime the snapshot.
      system.update({ world });
      adapter.updateCell.mockClear();

      // Pellet collected at (0, 1) → EMPTY (0).
      map.grid[0 * map.cols + 1] = 0;
      // Destructible wall destroyed at (1, 2) → EMPTY (0). (Issue #85 path.)
      map.grid[1 * map.cols + 2] = 0;

      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledTimes(2);
      expect(adapter.updateCell).toHaveBeenCalledWith(0, 1, 0);
      expect(adapter.updateCell).toHaveBeenCalledWith(1, 2, 0);
    });

    it('self-heals a missed intent (issue #104) on the next frame', () => {
      // Bug #104 scenario: a pellet is collected at sim layer but the
      // collisionIntent never reached board-sync (race). The map IS authoritative,
      // so the diff catches it on the next render frame regardless.
      const map = makeMap([
        [3, 3],
        [3, 3],
      ]);
      const { world, adapter, system } = setupHarness(map);
      system.update({ world });
      adapter.updateCell.mockClear();

      // Frame N: simulation set the cell to EMPTY but no intent reached
      // board-sync. Frame N+1: the diff catches it.
      map.grid[0] = 0;
      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledTimes(1);
      expect(adapter.updateCell).toHaveBeenCalledWith(0, 0, 0);
    });
  });

  describe('level-transition resize', () => {
    it('resyncs to a new map without spurious updateCell calls', () => {
      const small = makeMap([
        [0, 3],
        [3, 0],
      ]);
      const { world, adapter, system } = setupHarness(small);
      system.update({ world });
      adapter.updateCell.mockClear();

      // Swap in a larger map (level transition). The new board's DOM is
      // regenerated by the renderer adapter via generateBoard, so the
      // snapshot just needs to re-sync to the new dimensions silently.
      const big = makeMap([
        [0, 0, 0],
        [3, 3, 3],
        [0, 0, 0],
      ]);
      world.setResource('mapResource', big);

      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();

      // After the resize is acknowledged, mutations on the new map are picked up.
      big.grid[4] = 0; // center cell changes 3 → 0
      system.update({ world });
      expect(adapter.updateCell).toHaveBeenCalledTimes(1);
      expect(adapter.updateCell).toHaveBeenCalledWith(1, 1, 0);
    });
  });

  describe('safe handling of missing or invalid resources', () => {
    it('does nothing when mapResource is absent', () => {
      const { world, adapter, system } = setupHarness(undefined);
      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();
    });

    it('does nothing when mapResource lacks a grid', () => {
      const { world, adapter, system } = setupHarness({ rows: 1, cols: 1 });
      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();
    });

    it('does nothing when map dimensions are zero', () => {
      const { world, adapter, system } = setupHarness({
        rows: 0,
        cols: 0,
        grid: new Uint8Array(0),
      });
      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();
    });
  });

  describe('configurable resource key', () => {
    it('honors a custom mapResourceKey', () => {
      const map = makeMap([[3]]);
      const { world, adapter, system } = setupHarness(map, { mapResourceKey: 'customMap' });

      // First frame: snapshot init from grid (no-op DOM-wise).
      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();

      // Mutate the cell and confirm the custom key was wired correctly.
      map.grid[0] = 0;
      system.update({ world });
      expect(adapter.updateCell).toHaveBeenCalledTimes(1);
      expect(adapter.updateCell).toHaveBeenCalledWith(0, 0, 0);
    });
  });
});
