/**
 * Integration test for C-04 pause command handling through the real input adapter.
 *
 * This test verifies that keyboard pause input travels through the adapter,
 * input snapshot system, pause intent bridge, and pause transition system
 * using a real World fixed-step dispatch. It proves ECS/runtime command
 * wiring only; visible pause-menu UI behavior remains outside this test scope.
 */

import { describe, expect, it } from 'vitest';

import { createInputAdapter } from '../../../src/adapters/io/input-adapter.js';
import { createInputStateStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createInputSystem } from '../../../src/ecs/systems/input-system.js';
import { createPauseInputSystem } from '../../../src/ecs/systems/pause-input-system.js';
import { createPauseSystem } from '../../../src/ecs/systems/pause-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createEventTargetStub() {
  const listeners = new Map();

  return {
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    },
    dispatch(eventName, payload = {}) {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(payload);
      }
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
  };
}

function createDocumentStub() {
  const documentTarget = createEventTargetStub();
  documentTarget.hidden = false;
  return documentTarget;
}

function createHarness() {
  const world = new World();
  const windowTarget = createEventTargetStub();
  const documentTarget = createDocumentStub();
  const inputAdapter = createInputAdapter({
    documentTarget,
    eventTarget: windowTarget,
    windowTarget,
  });
  const inputState = createInputStateStore(4);

  world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);
  world.setResource('clock', createClock(0));
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('inputAdapter', inputAdapter);
  world.setResource('inputState', inputState);
  world.registerSystem(createInputSystem());
  world.registerSystem(createPauseInputSystem());
  world.registerSystem(createPauseSystem());

  return {
    inputAdapter,
    windowTarget,
    world,
  };
}

describe('pause command integration', () => {
  it('toggles PLAYING -> PAUSED -> PLAYING through adapter-driven keyboard input', () => {
    const harness = createHarness();
    const { world, windowTarget } = harness;

    windowTarget.dispatch('keydown', {
      code: 'Escape',
      preventDefault() {},
      repeat: false,
    });
    world.runFixedStep();

    expect(world.getResource('gameStatus').currentState).toBe(GAME_STATE.PAUSED);
    expect(world.getResource('clock').isPaused).toBe(true);

    windowTarget.dispatch('keyup', {
      code: 'Escape',
      preventDefault() {},
    });
    windowTarget.dispatch('keydown', {
      code: 'Escape',
      preventDefault() {},
      repeat: false,
    });
    world.runFixedStep();

    expect(world.getResource('gameStatus').currentState).toBe(GAME_STATE.PLAYING);
    expect(world.getResource('clock').isPaused).toBe(false);

    harness.inputAdapter.destroy();
  });
});
