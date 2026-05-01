/*
 * C-04 pause state transition system.
 *
 * This module implements pure ECS logic for pause-related FSM transitions.
 * It consumes a dedicated pause-intent resource, mutates only the shared
 * game-status resource, and always clears the one-step intent payload after
 * processing so pause actions are edge-triggered and deterministic.
 *
 * Public API:
 * - createPauseSystem(options)
 *
 * Implementation notes:
 * - This system does not pause the simulation clock directly. The existing
 *   game-flow/clock integration already freezes simulation whenever the
 *   top-level game status is not PLAYING.
 * - Restart handling here is intentionally limited to the required FSM change:
 *   PAUSED -> PLAYING. Actual restart teardown/reload is handled elsewhere.
 * - The pause intent resource is always normalized to a plain object with
 *   `toggle` and `restart` booleans so other systems can rely on its shape.
 */

import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_PAUSE_INTENT_RESOURCE_KEY = 'pauseIntent';

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
  }
}

export function createPauseSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const pauseIntentResourceKey =
    options.pauseIntentResourceKey || DEFAULT_PAUSE_INTENT_RESOURCE_KEY;

  return {
    name: 'pause-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, pauseIntentResourceKey],
      write: [gameStatusResourceKey, pauseIntentResourceKey],
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
        if (pauseIntent.toggle || pauseIntent.restart) {
          tryTransition(gameStatus, GAME_STATE.PLAYING);
        }
      } else if (gameStatus.currentState === GAME_STATE.PLAYING && pauseIntent.toggle) {
        tryTransition(gameStatus, GAME_STATE.PAUSED);
      }

      world.setResource(pauseIntentResourceKey, createDefaultPauseIntent());
    },
  };
}
