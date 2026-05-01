/**
 * Unit tests for the C-04 pause input intent bridge.
 *
 * These checks verify keyboard input snapshots become pauseIntent resource
 * updates without mutating game status directly. Edge behavior is covered by
 * running input-system first, which drains one-shot pressed intents.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createInputSystem } from '../../../src/ecs/systems/input-system.js';
import { createPauseInputSystem } from '../../../src/ecs/systems/pause-input-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createAdapterStub({ pressedKeys = [] } = {}) {
  const adapter = {
    heldKeys: new Set(),
    pressedKeys: new Set(pressedKeys),
  };

  adapter.getHeldKeys = () => adapter.heldKeys;
  adapter.drainPressedKeys = () => {
    const drainedKeys = new Set(adapter.pressedKeys);
    adapter.pressedKeys.clear();
    return drainedKeys;
  };

  return adapter;
}

function createHarness(gameState, pressedKeys = []) {
  const world = new World();
  const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);

  world.setResource('gameStatus', createGameStatus(gameState));
  world.setResource('inputState', createInputStateStore(4));
  world.setResource('inputAdapter', createAdapterStub({ pressedKeys }));

  return {
    inputSystem: createInputSystem(),
    pauseInputSystem: createPauseInputSystem(),
    player,
    world,
  };
}

function runInputPipeline(harness) {
  harness.inputSystem.update({ world: harness.world });
  harness.pauseInputSystem.update({ world: harness.world });
}

describe('pause-input-system', () => {
  it('sets pauseIntent.toggle when pause is pressed', () => {
    const harness = createHarness(GAME_STATE.PLAYING, ['pause']);

    runInputPipeline(harness);

    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: true,
    });
    expect(harness.world.getResource('gameStatus').currentState).toBe(GAME_STATE.PLAYING);
  });

  it('sets restart only when the game is paused', () => {
    const playingHarness = createHarness(GAME_STATE.PLAYING, ['restart']);
    const pausedHarness = createHarness(GAME_STATE.PAUSED, ['restart']);

    runInputPipeline(playingHarness);
    runInputPipeline(pausedHarness);

    expect(playingHarness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: false,
    });
    expect(pausedHarness.world.getResource('pauseIntent')).toEqual({
      restart: true,
      toggle: false,
    });
  });

  it('uses drained input edges so held keys trigger only once', () => {
    const harness = createHarness(GAME_STATE.PLAYING, ['pause']);

    runInputPipeline(harness);
    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: true,
    });

    harness.world.setResource('pauseIntent', {
      restart: false,
      toggle: false,
    });
    runInputPipeline(harness);

    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: false,
    });
  });
});
