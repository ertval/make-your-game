/*
 * C-04 level flow system.
 *
 * This module resolves LEVEL_COMPLETE into either terminal victory or a
 * deferred next-level advance request. It communicates progression intent
 * through a dedicated world resource so level loading can react elsewhere
 * without coupling this FSM logic to loader implementation details.
 *
 * Public API:
 * - createDefaultLevelFlow()
 * - ensureLevelFlow(levelFlow)
 * - createLevelFlowSystem(options)
 *
 * Implementation notes:
 * - This system never detects pellet completion; it only resolves an existing
 *   LEVEL_COMPLETE state into the next deterministic high-level outcome.
 * - Next-level progression is edge-triggered by `pendingLevelAdvance` so the
 *   system does not repeatedly transition or re-arm the same level advance.
 * - Map loading is intentionally delegated to another system that consumes the
 *   `levelFlow` resource.
 */

import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_LEVEL_FLOW_RESOURCE_KEY = 'levelFlow';
const DEFAULT_MAX_LEVELS = 3;

export function createDefaultLevelFlow() {
  return {
    nextLevel: null,
    pendingLevelAdvance: false,
  };
}

export function ensureLevelFlow(levelFlow) {
  if (!levelFlow || typeof levelFlow !== 'object') {
    return createDefaultLevelFlow();
  }

  return {
    nextLevel: Number.isFinite(levelFlow.nextLevel) ? Math.floor(levelFlow.nextLevel) : null,
    pendingLevelAdvance: levelFlow.pendingLevelAdvance === true,
  };
}

function resolveCurrentLevel(mapResource) {
  const level = Number(mapResource?.level);
  if (!Number.isFinite(level) || level < 1) {
    return 1;
  }

  return Math.floor(level);
}

function tryTransition(gameStatus, nextState) {
  if (gameStatus && canTransition(gameStatus, nextState)) {
    transitionTo(gameStatus, nextState);
  }
}

export function createLevelFlowSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const levelFlowResourceKey = options.levelFlowResourceKey || DEFAULT_LEVEL_FLOW_RESOURCE_KEY;
  const maxLevels = Number.isFinite(options.maxLevels)
    ? Math.max(1, Math.floor(options.maxLevels))
    : DEFAULT_MAX_LEVELS;

  return {
    name: 'level-flow-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, mapResourceKey, levelFlowResourceKey],
      write: [gameStatusResourceKey, levelFlowResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);

      if (!gameStatus || gameStatus.currentState !== GAME_STATE.LEVEL_COMPLETE) {
        return;
      }

      const levelFlow = ensureLevelFlow(world.getResource(levelFlowResourceKey));

      if (levelFlow.pendingLevelAdvance) {
        return;
      }

      const currentLevel = resolveCurrentLevel(world.getResource(mapResourceKey));

      if (currentLevel >= maxLevels) {
        tryTransition(gameStatus, GAME_STATE.VICTORY);
        world.setResource(levelFlowResourceKey, createDefaultLevelFlow());
        return;
      }

      world.setResource(levelFlowResourceKey, {
        nextLevel: currentLevel + 1,
        pendingLevelAdvance: true,
      });
      tryTransition(gameStatus, GAME_STATE.PLAYING);
    },
  };
}
