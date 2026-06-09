/*
 * C-04 level progression system.
 *
 * This module implements pure ECS logic for deterministic level completion
 * detection. It detects when the active map has no pellets or power pellets
 * remaining, transitions active gameplay into LEVEL_COMPLETE, and then
 * publishes the next level-flow action once completion has been acknowledged.
 *
 * Public API:
 * - createLevelProgressSystem(options)
 *
 * Implementation notes:
 * - The system never mutates the map or any entities. It derives completion
 *   solely from the current map resource through the canonical pellet helpers.
 * - FSM writes are always guarded by canTransition() before transitionTo().
 * - Level advancement/loading is handled elsewhere (levelLoader.advanceLevel()).
 *   On non-final completion this system simply leaves the FSM in LEVEL_COMPLETE
 *   and performs no level-flow writes of its own.
 * - Scoring is intentionally out of scope here. Score integration is handled
 *   by a later ticket so this system stays focused on progression flow only.
 */

import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';
import { countPellets, countPowerPellets } from '../resources/map-resource.js';
import {
  emitGameplayEvent,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from './collision-gameplay-events.js';

const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_TOTAL_LEVELS = 3;

function hasClearedAllPellets(mapResource) {
  if (!mapResource) {
    return false;
  }

  return countPellets(mapResource) === 0 && countPowerPellets(mapResource) === 0;
}

function tryTransition(gameStatus, nextState) {
  if (gameStatus && canTransition(gameStatus, nextState)) {
    transitionTo(gameStatus, nextState);
    return true;
  }

  return false;
}

function isFinalLevelByCount(mapResource, totalLevels) {
  const levelNumber = Number(mapResource?.level);
  if (!Number.isFinite(levelNumber)) {
    return false;
  }

  return levelNumber >= totalLevels;
}

/**
 * Resolve the 1-based level number for the LevelCleared payload.
 *
 * The payload schema requires a positive integer, so a missing or non-finite
 * map level falls back to 1 rather than emitting an invalid event.
 *
 * @param {MapResource | null | undefined} mapResource - Active map resource.
 * @returns {number} Positive integer level number.
 */
function resolveLevelNumber(mapResource) {
  const levelNumber = Math.floor(Number(mapResource?.level));
  return Number.isInteger(levelNumber) && levelNumber > 0 ? levelNumber : 1;
}

export function createLevelProgressSystem(options = {}) {
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const totalLevels = Number.isFinite(options.totalLevels)
    ? Math.max(1, Math.floor(options.totalLevels))
    : DEFAULT_TOTAL_LEVELS;
  const isFinalLevel =
    typeof options.isFinalLevel === 'function'
      ? options.isFinalLevel
      : (mapResource) => isFinalLevelByCount(mapResource, totalLevels);

  return {
    name: 'level-progress-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, mapResourceKey],
      write: [eventQueueResourceKey, gameStatusResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const mapResource = world.getResource(mapResourceKey);

      if (!gameStatus) {
        return;
      }

      const eventQueue = world.getResource(eventQueueResourceKey);

      if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
        if (isFinalLevel(mapResource, world) === true) {
          // Victory is a pure lifecycle transition; emit only when the final
          // level actually advances LEVEL_COMPLETE → VICTORY.
          if (tryTransition(gameStatus, GAME_STATE.VICTORY)) {
            emitGameplayEvent(
              eventQueue,
              GAMEPLAY_EVENT_TYPE.VICTORY,
              { sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS },
              context.frame,
            );
          }
          return;
        }

        // Non-final completion: stay in LEVEL_COMPLETE and let
        // levelLoader.advanceLevel() drive the actual level transition.
        return;
      }

      if (gameStatus.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      if (!hasClearedAllPellets(mapResource)) {
        return;
      }

      // LevelCleared fires on the PLAYING → LEVEL_COMPLETE transition for every
      // level (including the final one, which then advances to Victory next
      // tick), so consumers observe the canonical "LevelCleared → Victory"
      // ordering on the last level.
      if (tryTransition(gameStatus, GAME_STATE.LEVEL_COMPLETE)) {
        emitGameplayEvent(
          eventQueue,
          GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED,
          {
            level: resolveLevelNumber(mapResource),
            sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
          },
          context.frame,
        );
      }
    },
  };
}
