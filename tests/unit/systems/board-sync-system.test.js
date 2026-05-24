/**
 * D-06: Board Sync System Tests
 *
 * Verifies the board-sync-system reads collisionIntents and dispatches
 * boardAdapter.updateCell calls only for pellet/power-pellet collected events.
 */

import { describe, expect, it, vi } from 'vitest';
import { createBoardSyncSystem } from '../../../src/ecs/systems/board-sync-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createMockAdapter() {
  return { updateCell: vi.fn() };
}

function setupHarness(intents, options = {}) {
  const world = new World();
  const adapter = createMockAdapter();
  const system = createBoardSyncSystem(adapter, options);
  world.setResource(options.collisionIntentsResourceKey || 'collisionIntents', intents);
  return { world, adapter, system };
}

describe('board-sync-system', () => {
  describe('phase and resource config', () => {
    const adapter = createMockAdapter();
    const system = createBoardSyncSystem(adapter);

    it('runs in the render phase', () => {
      expect(system.phase).toBe('render');
    });

    it('declares read access to collisionIntents', () => {
      expect(system.resourceCapabilities.read).toContain('collisionIntents');
    });

    it('exposes a stable name', () => {
      expect(system.name).toBe('board-sync-system');
    });
  });

  describe('intent dispatch', () => {
    it('calls updateCell with cell type 0 for pellet-collected intents', () => {
      const intents = [{ type: 'pellet-collected', row: 3, col: 5 }];
      const { world, adapter, system } = setupHarness(intents);

      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledTimes(1);
      expect(adapter.updateCell).toHaveBeenCalledWith(3, 5, 0);
    });

    it('calls updateCell with cell type 0 for power-pellet-collected intents', () => {
      const intents = [{ type: 'power-pellet-collected', row: 7, col: 2 }];
      const { world, adapter, system } = setupHarness(intents);

      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledWith(7, 2, 0);
    });

    it('ignores unrelated intent types', () => {
      const intents = [
        { type: 'ghost-collision', row: 1, col: 1 },
        { type: 'wall-destroyed', row: 2, col: 2 },
        { type: 'bomb-placed', row: 3, col: 3 },
      ];
      const { world, adapter, system } = setupHarness(intents);

      system.update({ world });

      expect(adapter.updateCell).not.toHaveBeenCalled();
    });

    it('processes all matching intents in a single frame', () => {
      const intents = [
        { type: 'pellet-collected', row: 0, col: 0 },
        { type: 'wall-destroyed', row: 1, col: 1 },
        { type: 'power-pellet-collected', row: 2, col: 2 },
        { type: 'pellet-collected', row: 3, col: 3 },
      ];
      const { world, adapter, system } = setupHarness(intents);

      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledTimes(3);
      expect(adapter.updateCell).toHaveBeenNthCalledWith(1, 0, 0, 0);
      expect(adapter.updateCell).toHaveBeenNthCalledWith(2, 2, 2, 0);
      expect(adapter.updateCell).toHaveBeenNthCalledWith(3, 3, 3, 0);
    });
  });

  describe('safe handling of missing or invalid resources', () => {
    it('does nothing when collisionIntents resource is absent', () => {
      const world = new World();
      const adapter = createMockAdapter();
      const system = createBoardSyncSystem(adapter);

      system.update({ world });

      expect(adapter.updateCell).not.toHaveBeenCalled();
    });

    it('does nothing when collisionIntents is not an array', () => {
      const world = new World();
      const adapter = createMockAdapter();
      const system = createBoardSyncSystem(adapter);
      world.setResource('collisionIntents', { not: 'an array' });

      system.update({ world });

      expect(adapter.updateCell).not.toHaveBeenCalled();
    });

    it('does nothing when intent list is empty', () => {
      const { world, adapter, system } = setupHarness([]);
      system.update({ world });
      expect(adapter.updateCell).not.toHaveBeenCalled();
    });
  });

  describe('configurable resource key', () => {
    it('honors a custom collisionIntentsResourceKey', () => {
      const intents = [{ type: 'pellet-collected', row: 1, col: 1 }];
      const { world, adapter, system } = setupHarness(intents, {
        collisionIntentsResourceKey: 'customIntents',
      });

      system.update({ world });

      expect(adapter.updateCell).toHaveBeenCalledWith(1, 1, 0);
    });
  });
});
