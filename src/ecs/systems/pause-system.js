/*
 * C-04 pause state transition system.
 *
 * This module implements pure ECS logic for pause-related FSM transitions.
 * It consumes a dedicated pause-intent resource, synchronizes the clock
 * resource with pause/resume transitions through World resource access,
 * publishes restart intent through a dedicated level-flow resource, and always
 * clears the one-step intent payload after processing so pause actions are
 * edge-triggered and deterministic.
 *
 * Public API:
 * - createPauseSystem(options)
 *
 * Implementation notes:
 * - Clock synchronization is handled via World resources only; the system does
 *   not import clock helpers so ECS boundaries stay explicit.
 * - Clock updates replace the resource with a cloned record instead of
 *   mutating the existing object in place.
 * - Restart handling replaces the game-status resource with a fresh PLAYING
 *   record and publishes `levelFlow.pendingRestart = true` so orchestration can
 *   perform the real reload outside this system.
 * - The pause intent resource is always normalized to a plain object with a
 *   single explicit `action` command so transitions remain readable.
 */

import {
  canTransition,
  createGameStatus,
  GAME_STATE,
  transitionTo,
} from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_PAUSE_INTENT_RESOURCE_KEY = 'pauseIntent';
const DEFAULT_CLOCK_RESOURCE_KEY = 'clock';
const DEFAULT_LEVEL_FLOW_RESOURCE_KEY = 'levelFlow';

function createDefaultPauseIntent() {
  return {
    restart: false,
    toggle: false,
  };
}

function ensurePauseIntent(pauseIntent) {
  if (!pauseIntent || typeof pauseIntent !== 'object') {
    return createDefaultPauseIntent();
  }

  return {
    restart: pauseIntent.restart === true,
    toggle: pauseIntent.toggle === true,
  };
}

function tryTransition(gameStatus, nextState) {
  if (gameStatus && canTransition(gameStatus, nextState)) {
    transitionTo(gameStatus, nextState);
    return true;
  }

  return false;
}

function syncClockPauseState(world, clockResourceKey, paused) {
  const clock = world.getResource(clockResourceKey);
  if (!clock || typeof clock !== 'object') {
    return;
  }

  world.setResource(clockResourceKey, {
    ...clock,
    isPaused: paused,
  });
}

function publishPendingRestart(world, levelFlowResourceKey) {
  const levelFlow = world.getResource(levelFlowResourceKey);
  const nextLevelFlow =
    levelFlow && typeof levelFlow === 'object'
      ? {
          ...levelFlow,
          pendingRestart: true,
        }
      : { pendingRestart: true };

  world.setResource(levelFlowResourceKey, nextLevelFlow);
}

export function createPauseSystem(options = {}) {
  const clockResourceKey = options.clockResourceKey || DEFAULT_CLOCK_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const levelFlowResourceKey = options.levelFlowResourceKey || DEFAULT_LEVEL_FLOW_RESOURCE_KEY;
  const pauseIntentResourceKey =
    options.pauseIntentResourceKey || DEFAULT_PAUSE_INTENT_RESOURCE_KEY;

  return {
    name: 'pause-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [clockResourceKey, gameStatusResourceKey, levelFlowResourceKey, pauseIntentResourceKey],
      write: [
        clockResourceKey,
        gameStatusResourceKey,
        levelFlowResourceKey,
        pauseIntentResourceKey,
      ],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const rawPauseIntent = world.getResource(pauseIntentResourceKey);
      const pauseIntent = ensurePauseIntent(rawPauseIntent);

      if (!gameStatus) {
        world.setResource(pauseIntentResourceKey, createDefaultPauseIntent());
        return;
      }

      if (gameStatus.currentState === GAME_STATE.PAUSED) {
        if (pauseIntent.restart) {
          world.setResource(gameStatusResourceKey, createGameStatus(GAME_STATE.PLAYING));
          syncClockPauseState(world, clockResourceKey, false);
          publishPendingRestart(world, levelFlowResourceKey);
        } else if (pauseIntent.toggle) {
          const transitioned = tryTransition(gameStatus, GAME_STATE.PLAYING);
          if (transitioned) {
            syncClockPauseState(world, clockResourceKey, false);
          }
        }
      } else if (gameStatus.currentState === GAME_STATE.PLAYING && pauseIntent.toggle) {
        const transitioned = tryTransition(gameStatus, GAME_STATE.PAUSED);
        if (transitioned) {
          syncClockPauseState(world, clockResourceKey, true);
        }
      }

      world.setResource(pauseIntentResourceKey, createDefaultPauseIntent());
    },
  };
}
