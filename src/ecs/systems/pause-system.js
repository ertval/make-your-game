/*
 * C-04 pause state transition system.
 *
 * This module implements pure ECS logic for pause-related FSM transitions.
 * It consumes a dedicated pause-intent resource, synchronizes the clock
 * resource with pause/resume transitions through World resource access, and
 * always clears the one-step intent payload after processing so pause actions
 * are edge-triggered and deterministic.
 *
 * Public API:
 * - createPauseSystem(options)
 *
 * Implementation notes:
 * - Clock synchronization is handled via World resources only; the system does
 *   not import clock helpers so ECS boundaries stay explicit.
 * - Clock and game-status updates preserve resource object identity so
 *   bootstrap/runtime closures observing those resources stay synchronized.
 * - Level restart is owned by game-flow's restartLevel() path, not this system,
 *   so the pause intent only carries a single `{ toggle }` action.
 */

import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_PAUSE_INTENT_RESOURCE_KEY = 'pauseIntent';
const DEFAULT_CLOCK_RESOURCE_KEY = 'clock';

function createDefaultPauseIntent() {
  return {
    toggle: false,
  };
}

function ensurePauseIntent(pauseIntent) {
  if (!pauseIntent || typeof pauseIntent !== 'object') {
    return createDefaultPauseIntent();
  }

  return {
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

  clock.isPaused = paused;
}

export function createPauseSystem(options = {}) {
  const clockResourceKey = options.clockResourceKey || DEFAULT_CLOCK_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const pauseIntentResourceKey =
    options.pauseIntentResourceKey || DEFAULT_PAUSE_INTENT_RESOURCE_KEY;

  return {
    name: 'pause-system',
    phase: 'meta',
    resourceCapabilities: {
      read: [clockResourceKey, gameStatusResourceKey, pauseIntentResourceKey],
      write: [clockResourceKey, gameStatusResourceKey, pauseIntentResourceKey],
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
        if (pauseIntent.toggle) {
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

      // Keep simulation frozen for any non-playing state (menu, paused, game over, victory).
      syncClockPauseState(world, clockResourceKey, gameStatus.currentState !== GAME_STATE.PLAYING);

      world.setResource(pauseIntentResourceKey, createDefaultPauseIntent());
    },
  };
}
