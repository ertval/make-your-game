/*
 * C-04 pause input intent bridge.
 *
 * This module converts edge-triggered input snapshots into the shared
 * pauseIntent resource consumed by pause-system. It does not mutate game
 * status directly; it only publishes deterministic intent data through the
 * world resource API.
 *
 * Public API:
 * - createPauseInputSystem(options)
 *
 * Implementation notes:
 * - The input-system already drains one-shot keyboard edges into inputState,
 *   so this system can treat inputState.pause as a per-step edge.
 * - Pause commands are published as explicit action values so downstream
 *   transition logic can remain readable and state-specific.
 * - Restart intent remains an optional future integration path produced by
 *   another resource writer; this system does not synthesize restart commands.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { GAME_STATE } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_PAUSE_INTENT_RESOURCE_KEY = 'pauseIntent';
const DEFAULT_REQUIRED_MASK = COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE;

function createDefaultPauseIntent() {
  return {
    restart: false,
    toggle: false,
  };
}

function normalizePauseIntent(pauseIntent) {
  if (!pauseIntent || typeof pauseIntent !== 'object') {
    return createDefaultPauseIntent();
  }

  return {
    restart: pauseIntent.restart === true,
    toggle: pauseIntent.toggle === true,
  };
}

function isPauseInputAllowed(gameStatus) {
  return (
    gameStatus?.currentState === GAME_STATE.PLAYING ||
    gameStatus?.currentState === GAME_STATE.PAUSED
  );
}

function collectPauseInput(inputState, entityIds) {
  for (const entityId of entityIds) {
    if (inputState?.pause?.[entityId] === 1) {
      return true;
    }
  }

  return false;
}

export function createPauseInputSystem(options = {}) {
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const pauseIntentResourceKey =
    options.pauseIntentResourceKey || DEFAULT_PAUSE_INTENT_RESOURCE_KEY;
  const requiredMask = options.requiredMask ?? DEFAULT_REQUIRED_MASK;

  return {
    name: 'pause-input-system',
    phase: 'input',
    resourceCapabilities: {
      read: [gameStatusResourceKey, inputStateResourceKey, pauseIntentResourceKey],
      write: [pauseIntentResourceKey],
    },
    update(context) {
      const world = context.world;
      const gameStatus = world.getResource(gameStatusResourceKey);
      const currentIntent = normalizePauseIntent(world.getResource(pauseIntentResourceKey));

      if (!isPauseInputAllowed(gameStatus)) {
        world.setResource(pauseIntentResourceKey, currentIntent);
        return;
      }

      const inputState = world.getResource(inputStateResourceKey);
      if (!inputState) {
        world.setResource(pauseIntentResourceKey, currentIntent);
        return;
      }

      const pausePressed = collectPauseInput(inputState, world.query(requiredMask));
      if (!pausePressed) {
        world.setResource(pauseIntentResourceKey, currentIntent);
        return;
      }

      world.setResource(pauseIntentResourceKey, {
        restart: currentIntent.restart,
        toggle: true,
      });
    },
  };
}
