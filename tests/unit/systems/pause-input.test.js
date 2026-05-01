/**
 * Unit tests for the C-04 pause input intent bridge.
 *
 * These checks verify keyboard input snapshots become pauseIntent resource
 * updates without mutating game status directly. Input snapshots are set
 * directly so this Track C test stays inside pause-system ownership.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createPauseInputSystem } from '../../../src/ecs/systems/pause-input-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createHarness(gameState) {
  const world = new World();
  const player = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.INPUT_STATE);
  const inputState = createInputStateStore(4);
  // Restart input is a future-facing optional snapshot field consumed only when present.
  inputState.restart = new Uint8Array(4);

  world.setResource('gameStatus', createGameStatus(gameState));
  world.setResource('inputState', inputState);

  return {
    inputState,
    pauseInputSystem: createPauseInputSystem(),
    player,
    world,
  };
}

function updatePauseInput(harness) {
  harness.pauseInputSystem.update({ world: harness.world });
}

describe('pause-input-system', () => {
  it('sets pauseIntent.toggle when pause is pressed', () => {
    const harness = createHarness(GAME_STATE.PLAYING);

    harness.inputState.pause[harness.player.id] = 1;
    updatePauseInput(harness);

    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: true,
    });
    expect(harness.world.getResource('gameStatus').currentState).toBe(GAME_STATE.PLAYING);
  });

  it('sets restart only when the game is paused', () => {
    const playingHarness = createHarness(GAME_STATE.PLAYING);
    const pausedHarness = createHarness(GAME_STATE.PAUSED);

    playingHarness.inputState.restart[playingHarness.player.id] = 1;
    pausedHarness.inputState.restart[pausedHarness.player.id] = 1;
    updatePauseInput(playingHarness);
    updatePauseInput(pausedHarness);

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
    const harness = createHarness(GAME_STATE.PLAYING);

    harness.inputState.pause[harness.player.id] = 1;
    updatePauseInput(harness);
    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: true,
    });

    harness.world.setResource('pauseIntent', {
      restart: false,
      toggle: false,
    });
    harness.inputState.pause[harness.player.id] = 0;
    updatePauseInput(harness);

    expect(harness.world.getResource('pauseIntent')).toEqual({
      restart: false,
      toggle: false,
    });
  });
});
