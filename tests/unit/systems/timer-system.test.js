/**
 * Unit tests for the C-02 level countdown system.
 *
 * These checks verify deterministic per-level initialization, fixed-step
 * countdown behavior, pause-state freezing through game status, and time-up
 * transition to GAME_OVER without any DOM-facing dependencies.
 */

import { describe, expect, it } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import {
  clampRemainingTime,
  createTimerSystem,
  getLevelDurationSeconds,
} from '../../../src/ecs/systems/timer-system.js';
import { World } from '../../../src/ecs/world/world.js';

function updateTimer(timerSystem, world, dtMs = 0) {
  timerSystem.update({ world, dtMs });
}

function createLevelLoaderStub(levelIndex = 0) {
  return {
    getCurrentLevelIndex() {
      return levelIndex;
    },
  };
}

describe('timer-system', () => {
  it('returns the canonical per-level countdown durations', () => {
    expect(getLevelDurationSeconds(1)).toBe(120);
    expect(getLevelDurationSeconds(2)).toBe(180);
    expect(getLevelDurationSeconds(3)).toBe(240);
  });

  it('clamps non-finite and negative remaining time to zero', () => {
    expect(clampRemainingTime(NaN)).toBe(0);
    expect(clampRemainingTime(-1)).toBe(0);
    expect(clampRemainingTime(12.5)).toBe(12.5);
  });

  it('initializes the timer resource from the active level when missing', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(1));

    updateTimer(timerSystem, world);

    expect(world.getResource('levelTimer')).toEqual({
      activeLevel: 2,
      durationSeconds: 180,
      remainingSeconds: 180,
    });
  });

  it('decrements remaining time by the clock delta while playing', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 10,
    });

    updateTimer(timerSystem, world, 250);

    expect(world.getResource('levelTimer').remainingSeconds).toBeCloseTo(9.75, 6);
  });

  it('does not decrement the timer while the game is not playing', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PAUSED));
    world.setResource('levelLoader', createLevelLoaderStub(2));
    world.setResource('levelTimer', {
      activeLevel: 3,
      durationSeconds: 240,
      remainingSeconds: 15,
    });

    updateTimer(timerSystem, world, 500);

    expect(world.getResource('levelTimer').remainingSeconds).toBe(15);
  });

  it('reinitializes the timer when the active level changes', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(2));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 4,
    });

    updateTimer(timerSystem, world, 1000);

    expect(world.getResource('levelTimer')).toEqual({
      activeLevel: 3,
      durationSeconds: 240,
      remainingSeconds: 239,
    });
  });

  it('clamps at zero and transitions the game to GAME_OVER when time expires', () => {
    const world = new World();
    const timerSystem = createTimerSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 1,
    });

    updateTimer(timerSystem, world, 1500);

    expect(world.getResource('levelTimer').remainingSeconds).toBe(0);
    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
    expect(gameStatus.previousState).toBe(GAME_STATE.PLAYING);
  });

  it('transitions immediately if timer is already zero before update', () => {
    const world = new World();
    const timerSystem = createTimerSystem();
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', gameStatus);
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 0,
    });

    updateTimer(timerSystem, world);

    expect(gameStatus.currentState).toBe(GAME_STATE.GAME_OVER);
  });

  it('caps delta time to avoid large jumps (lag spike)', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 10,
    });

    updateTimer(timerSystem, world, 5000);

    expect(world.getResource('levelTimer').remainingSeconds).toBe(9);
  });

  it('ignores negative dtMs values', () => {
    const world = new World();
    const timerSystem = createTimerSystem();

    world.setResource('clock', createClock(0));
    world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
    world.setResource('levelLoader', createLevelLoaderStub(0));
    world.setResource('levelTimer', {
      activeLevel: 1,
      durationSeconds: 120,
      remainingSeconds: 10,
    });

    updateTimer(timerSystem, world, -250);

    expect(world.getResource('levelTimer').remainingSeconds).toBe(10);
  });
});
