/*
 * C-04 deferred level loader system.
 *
 * This module consumes the level-flow resource produced by level-flow-system
 * and delegates actual map loading to the existing level-loader resource.
 * It keeps progression deterministic by processing at most one pending level
 * advance per trigger and by clearing or preserving the trigger explicitly
 * based on the loader outcome.
 *
 * Public API:
 * - createDefaultLevelFlow()
 * - resolveNextLevel(levelFlow)
 * - createLevelLoaderSystem(options)
 *
 * Implementation notes:
 * - This system never performs FSM transitions; it only loads map data and
 *   resets the level-flow resource after a successful or invalid request.
 * - World resources are treated as values: writes always replace resources
 *   rather than mutating the existing levelFlow or mapResource objects.
 * - Failed map loads intentionally leave the pending trigger intact so the
 *   runtime can recover or retry without losing intent.
 */

import { createDefaultLevelFlow, ensureLevelFlow } from './level-flow-system.js';

export { createDefaultLevelFlow } from './level-flow-system.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_LEVEL_FLOW_RESOURCE_KEY = 'levelFlow';
const DEFAULT_LEVEL_LOADER_RESOURCE_KEY = 'levelLoader';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';

export function resolveNextLevel(levelFlow) {
  const nextLevel = Number(levelFlow?.nextLevel);

  if (!Number.isFinite(nextLevel)) {
    return null;
  }

  const normalizedLevel = Math.floor(nextLevel);
  if (normalizedLevel < 1) {
    return null;
  }

  return normalizedLevel;
}

export function createLevelLoaderSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const levelFlowResourceKey = options.levelFlowResourceKey || DEFAULT_LEVEL_FLOW_RESOURCE_KEY;
  const levelLoaderResourceKey =
    options.levelLoaderResourceKey || DEFAULT_LEVEL_LOADER_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;

  return {
    name: 'level-loader-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, levelFlowResourceKey, levelLoaderResourceKey, mapResourceKey],
      write: [levelFlowResourceKey, mapResourceKey],
    },
    update(context) {
      const world = context.world;
      const currentFlow = ensureLevelFlow(world.getResource(levelFlowResourceKey));

      if (currentFlow.pendingLevelAdvance !== true) {
        return;
      }

      const nextLevel = resolveNextLevel(currentFlow);
      if (nextLevel === null) {
        world.setResource(levelFlowResourceKey, createDefaultLevelFlow());
        return;
      }

      const levelLoader = world.getResource(levelLoaderResourceKey);
      if (typeof levelLoader?.loadLevel !== 'function') {
        return;
      }

      const loadedMap = levelLoader.loadLevel(nextLevel - 1, {
        reason: 'level-flow-advance',
      });

      if (!loadedMap) {
        return;
      }

      world.setResource(mapResourceKey, loadedMap);
      world.setResource(levelFlowResourceKey, createDefaultLevelFlow());
    },
  };
}
