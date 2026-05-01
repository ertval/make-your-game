/*
 * C-04 pause input intent bridge.
 *
 * This module converts edge-triggered input snapshots into the shared
 * pauseIntent resource consumed by pause-system. It does not mutate game
 * status directly; it only publishes deterministic intent data through the
 * world resource API.
 *
 * Public API:
 * - createDefaultPauseIntent()
 * - createPauseInputSystem(options)
 *
 * Implementation notes:
 * - The input-system already drains one-shot keyboard edges into inputState,
 *   so this system can treat inputState.pause/restart as per-step edges.
 * - Restart intent is accepted only while the FSM is already PAUSED.
 * - Existing pauseIntent values are preserved and OR-ed with newly observed
 *   input so multiple intent producers can coexist.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { GAME_STATE } from '../resources/game-status.js';

const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_PAUSE_INTENT_RESOURCE_KEY = 'pauseIntent';
const DEFAULT_REQUIRED_MASK = COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE;

export function createDefaultPauseIntent() {
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
  let toggle = false;
  let restart = false;

  for (const entityId of entityIds) {
    toggle ||= inputState?.pause?.[entityId] === 1;
    restart ||= inputState?.restart?.[entityId] === 1;

    if (toggle && restart) {
      break;
    }
  }

  return { restart, toggle };
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

      const input = collectPauseInput(inputState, world.query(requiredMask));
      const restart = input.restart && gameStatus.currentState === GAME_STATE.PAUSED;

      world.setResource(pauseIntentResourceKey, {
        restart: currentIntent.restart || restart,
        toggle: currentIntent.toggle || input.toggle,
      });
    },
  };
}
