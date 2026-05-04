/**
 * Unit tests for the C-04 pause FSM transition system.
 *
 * These checks exercise createPauseSystem directly against World resources so
 * pause transitions stay deterministic and independent from DOM, adapters,
 * runtime adapters, or input wiring while still verifying clock-resource
 * synchronization through the ECS resource API. The bootstrap runtime closes
 * over canonical resource objects, so these tests also protect object-identity
 * preservation for clock and game-status updates.
 */

import { describe, expect, it } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createPauseSystem } from '../../../src/ecs/systems/pause-system.js';
import { World } from '../../../src/ecs/world/world.js';

const CLEARED_PAUSE_INTENT = {
  restart: false,
  toggle: false,
};

function createHarness(gameState, pauseIntent, options = {}) {
  const world = new World();
  const hasClockOption = Object.hasOwn(options, 'clock');
  const clock = hasClockOption ? options.clock : createClock(0);

  if (gameState) {
    world.setResource('gameStatus', createGameStatus(gameState));
  }

  if (clock !== undefined) {
    world.setResource('clock', clock);
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
    const previousClock = harness.world.getResource('clock');

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    const nextClock = harness.world.getResource('clock');
    expect(gameStatus.currentState).toBe(GAME_STATE.PAUSED);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
    expect(nextClock.isPaused).toBe(true);
    expect(nextClock).toBe(previousClock);
    expectPauseIntentCleared(harness.world);
  });

  it('transitions PAUSED + toggle to PLAYING and clears intent', () => {
    const harness = createHarness(
      GAME_STATE.PAUSED,
      {
        restart: false,
        toggle: true,
      },
      {
        clock: {
          ...createClock(0),
          isPaused: true,
        },
      },
    );
    const previousClock = harness.world.getResource('clock');

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    const nextClock = harness.world.getResource('clock');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBe(GAME_STATE.PAUSED);
    expect(nextClock.isPaused).toBe(false);
    expect(nextClock).toBe(previousClock);
    expectPauseIntentCleared(harness.world);
  });

  it('transitions PAUSED + restart to PLAYING in place, sets pendingRestart, and clears intent', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: true,
      toggle: false,
    });
    const previousGameStatus = harness.world.getResource('gameStatus');

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBeNull();
    expect(gameStatus).toBe(previousGameStatus);
    expect(harness.world.getResource('levelFlow')).toEqual({
      pendingRestart: true,
    });
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
      toggle: false,
    });

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(gameState);
    expect(gameStatus.previousState).toBeNull();
    expect(harness.world.getResource('levelFlow')).toBeUndefined();
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

  it('does nothing when gameStatus is missing', () => {
    const world = new World();
    const system = createPauseSystem();

    system.update({ world });

    expect(world.getResource('levelFlow')).toBeUndefined();
    expect(world.getResource('pauseIntent')).toEqual(CLEARED_PAUSE_INTENT);
  });

  it('does nothing when no intent is provided', () => {
    const harness = createHarness(GAME_STATE.PLAYING, {});

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(gameStatus.previousState).toBeNull();
    expectPauseIntentCleared(harness.world);
  });

  it('does not throw when the clock resource is missing during PLAYING -> PAUSED', () => {
    const harness = createHarness(
      GAME_STATE.PLAYING,
      {
        restart: false,
        toggle: true,
      },
      { clock: undefined },
    );

    expect(() => updatePauseSystem(harness)).not.toThrow();

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PAUSED);
    expect(harness.world.getResource('clock')).toBeUndefined();
    expectPauseIntentCleared(harness.world);
  });

  it('clears pauseIntent after publishing restart intent', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: true,
      toggle: false,
    });

    updatePauseSystem(harness);

    expect(harness.world.getResource('levelFlow')).toEqual({
      pendingRestart: true,
    });
    expectPauseIntentCleared(harness.world);
  });

  it('merges pendingRestart into existing levelFlow object', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: true,
      toggle: false,
    });
    harness.world.setResource('levelFlow', { existing: true });

    updatePauseSystem(harness);

    expect(harness.world.getResource('levelFlow')).toEqual({
      existing: true,
      pendingRestart: true,
    });
    expectPauseIntentCleared(harness.world);
  });

  it('creates new levelFlow when existing one is invalid', () => {
    const harness = createHarness(GAME_STATE.PAUSED, {
      restart: true,
      toggle: false,
    });
    harness.world.setResource('levelFlow', null);

    updatePauseSystem(harness);

    expect(harness.world.getResource('levelFlow')).toEqual({
      pendingRestart: true,
    });
    expectPauseIntentCleared(harness.world);
  });

  it('does not publish restart intent when restart is requested outside PAUSED', () => {
    const harness = createHarness(GAME_STATE.PLAYING, {
      restart: true,
      toggle: false,
    });
    const previousGameStatus = harness.world.getResource('gameStatus');

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus).toBe(previousGameStatus);
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(harness.world.getResource('levelFlow')).toBeUndefined();
    expectPauseIntentCleared(harness.world);
  });

  it('still treats an explicit toggle action as resume when already PAUSED', () => {
    const harness = createHarness(
      GAME_STATE.PAUSED,
      {
        restart: false,
        toggle: true,
      },
      {
        clock: {
          ...createClock(0),
          isPaused: true,
        },
      },
    );

    updatePauseSystem(harness);

    const gameStatus = harness.world.getResource('gameStatus');
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(harness.world.getResource('clock').isPaused).toBe(false);
    expectPauseIntentCleared(harness.world);
  });
});
