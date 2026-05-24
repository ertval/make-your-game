/**
 * D-06: Board Sync System
 *
 * Purpose: Keeps the static board DOM in sync with map state changes that
 * occur during simulation (pellet collection, destructible wall removal).
 *
 * Public API:
 * - createBoardSyncSystem(boardAdapter, options) — factory; returns a render-phase system.
 *
 * Implementation notes:
 * - Reads collisionIntents each render frame and calls boardAdapter.updateCell
 *   for any pellet-collected or power-pellet-collected intents.
 * - Runs in the render phase so DOM updates are batched with sprite writes.
 * - boardAdapter.updateCell is the only path for mutating cell CSS classes
 *   after initial board generation.
 *
 * Constraints:
 * - Must be registered after render-collect-system in the render phase.
 * - Does not own the collisionIntents resource — read-only access only.
 */

const DEFAULT_COLLISION_INTENTS_RESOURCE_KEY = 'collisionIntents';

export function createBoardSyncSystem(boardAdapter, options = {}) {
  const collisionIntentsKey =
    options.collisionIntentsResourceKey || DEFAULT_COLLISION_INTENTS_RESOURCE_KEY;

  return {
    name: 'board-sync-system',
    phase: 'render',
    resourceCapabilities: {
      read: [collisionIntentsKey],
    },
    update(context) {
      const intents = context.world.getResource(collisionIntentsKey);
      if (!Array.isArray(intents)) return;

      for (const intent of intents) {
        if (intent.type === 'pellet-collected' || intent.type === 'power-pellet-collected') {
          boardAdapter.updateCell(intent.row, intent.col, 0);
        }
      }
    },
  };
}
