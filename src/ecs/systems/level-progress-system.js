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
 * - Level advancement/loading is handled elsewhere. This system only publishes
 *   `levelFlow.pendingLevelAdvance = true` for non-final completion, leaving
 *   actual loading to the loader system.
 * - Scoring is intentionally out of scope here. Score integration is handled
 *   by a later ticket so this system stays focused on progression flow only.
 */

import { enqueue } from '../resources/event-queue.js';
import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';
import { countPellets, countPowerPellets } from '../resources/map-resource.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
// D-01 event-queue key. The audio cue runner (C-07) maps the 'LevelCleared'
// event type onto the sfx-level-complete cue. 'LevelCleared' is an audio-only
// event outside the validated GAMEPLAY_EVENT_TYPE surface, so it is enqueued
// directly rather than through emitGameplayEvent.
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_LEVEL_FLOW_RESOURCE_KEY = 'levelFlow';
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

function publishPendingLevelAdvance(world, levelFlowResourceKey) {
  const levelFlow = world.getResource(levelFlowResourceKey);
  const nextLevelFlow =
    levelFlow && typeof levelFlow === 'object'
      ? {
          ...levelFlow,
          pendingLevelAdvance: true,
        }
      : { pendingLevelAdvance: true };

  world.setResource(levelFlowResourceKey, nextLevelFlow);
}

export function createLevelProgressSystem(options = {}) {
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const levelFlowResourceKey = options.levelFlowResourceKey || DEFAULT_LEVEL_FLOW_RESOURCE_KEY;
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
      read: [eventQueueResourceKey, gameStatusResourceKey, levelFlowResourceKey, mapResourceKey],
      write: [eventQueueResourceKey, gameStatusResourceKey, levelFlowResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const mapResource = world.getResource(mapResourceKey);

      if (!gameStatus) {
        return;
      }

      if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
        if (isFinalLevel(mapResource, world) === true) {
          tryTransition(gameStatus, GAME_STATE.VICTORY);
          return;
        }

        publishPendingLevelAdvance(world, levelFlowResourceKey);
        return;
      }

      if (gameStatus.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      if (!hasClearedAllPellets(mapResource)) {
        return;
      }

      if (tryTransition(gameStatus, GAME_STATE.LEVEL_COMPLETE)) {
        // One-shot: emit only on the actual PLAYING → LEVEL_COMPLETE edge so the
        // level-complete jingle fires exactly once per cleared level.
        enqueue(
          world.getResource(eventQueueResourceKey),
          'LevelCleared',
          { sourceSystem: 'level-progress-system', level: Number(mapResource?.level) || null },
          context.frame,
        );
      }
    },
  };
}
