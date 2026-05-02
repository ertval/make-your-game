/**
 * Unit tests for the C-04 pause FSM transition system.
 *
 * These checks exercise createPauseSystem directly against World resources so
 * pause transitions stay deterministic and independent from DOM, adapters,
 * runtime clocks, or input wiring.
 */

import { describe, expect, it } from 'vitest';

import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createPauseSystem } from '../../../src/ecs/systems/pause-system.js';
import { World } from '../../../src/ecs/world/world.js';

const CLEARED_PAUSE_INTENT = {
  restart: false,
  toggle: false,
};

function createHarness(gameState, pauseIntent) {
  const world = new World();

  if (gameState) {
    world.setResource('gameStatus', createGameStatus(gameState));
  }

  if (pauseIntent) {
    world.setResource('pauseIntent', pauseIntent);
  }

  return {
    pauseSystem: createPauseSystem(),
    world,
  };
}

function updatePauseSystem(harness) {
  harness.pauseSystem.update({ world: harness.world });
}

function expectPauseIntentCleared(world) {
  expect(world.getResource('pauseIntent')).toEqual(CLEARED_PAUSE_INTENT);
}

describe('pause-system', () => {
  it('transitions PLAYING + toggle to PAUSED and clears intent', () => {
    const harness = createHarness(GAME_STATE.PLAYING, {
      restart: false,
      toggle: true,
    });

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PAUSED);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
    expectPauseIntentCleared(harness.world);
  });

  it('transitions PAUSED + toggle to PLAYING and clears intent', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: false,
      toggle: true,
    });

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBe(GAME_STATE.PAUSED);
    expectPauseIntentCleared(harness.world);
  });

  it('transitions PAUSED + restart to PLAYING and clears intent', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: true,
      toggle: false,
    });

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBe(GAME_STATE.PAUSED);
    expectPauseIntentCleared(harness.world);
  });

  it.each([
    GAME_STATE.MENU,
    GAME_STATE.LEVEL_COMPLETE,
    GAME_STATE.GAME_OVER,
    GAME_STATE.VICTORY,
  ])('ignores pause and restart intent in %s and only clears intent', (gameState) => {
    const harness = createHarness(gameState, {
      restart: true,
      toggle: true,
    });

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(gameState);
    expect(gameStatus.previousState).toBeNull();
    expectPauseIntentCleared(harness.world);
  });

  it('normalizes missing pauseIntent without crashing', () => {
    const harness = createHarness(GAME_STATE.PLAYING);

    expect(() => updatePauseSystem(harness)).not.toThrow();

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expectPauseIntentCleared(harness.world);
  });

  it('clears pauseIntent and returns when gameStatus is missing', () => {
    const harness = createHarness(null, {
      restart: true,
      toggle: true,
    });

    expect(() => updatePauseSystem(harness)).not.toThrow();

    expect(harness.world.getResource('gameStatus')).toBeUndefined();
    expectPauseIntentCleared(harness.world);
  });
});
