/*
 * C-04 level progression system.
 *
 * This module implements pure ECS logic for deterministic level completion
 * detection. It detects when the active map has no pellets or power pellets
 * remaining and transitions active gameplay into LEVEL_COMPLETE.
 *
 * Public API:
 * - createLevelProgressSystem(options)
 *
 * Implementation notes:
 * - The system never mutates the map or any entities. It derives completion
 *   solely from the current map resource through the canonical pellet helpers.
 * - FSM writes are always guarded by canTransition() before transitionTo().
 * - Level advancement/loading is handled elsewhere. This system intentionally
 *   does not auto-resolve LEVEL_COMPLETE into PLAYING or VICTORY because doing
 *   so before another resource changes could create an FSM oscillation loop.
 */

import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';
import { countPellets, countPowerPellets } from '../resources/map-resource.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';

function hasClearedAllPellets(mapResource) {
  if (!mapResource) {
    return false;
  }

  return countPellets(mapResource) === 0 && countPowerPellets(mapResource) === 0;
}

function tryTransition(gameStatus, nextState) {
  if (gameStatus && canTransition(gameStatus, nextState)) {
    transitionTo(gameStatus, nextState);
  }
}

export function createLevelProgressSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;

  return {
    name: 'level-progress-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, mapResourceKey],
      write: [gameStatusResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const mapResource = world.getResource(mapResourceKey);

      if (!gameStatus) {
        return;
      }

      if (gameStatus.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      if (!hasClearedAllPellets(mapResource)) {
        return;
      }

      tryTransition(gameStatus, GAME_STATE.LEVEL_COMPLETE);
    },
  };
}
