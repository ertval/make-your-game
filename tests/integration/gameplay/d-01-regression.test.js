/**
 * Regression test for D-01: Simulation restart logic.
 *
 * This test verifies that restarting the game correctly resets the simulation clock
 * and state, ensuring deterministic behavior after a restart cycle.
 */

import { describe, expect, it } from 'vitest';
import { advanceSimTime, createClock, resetClock } from '../../../src/ecs/resources/clock.js';
import {
  createGameStatus,
  GAME_STATE,
  transitionTo,
} from '../../../src/ecs/resources/game-status.js';
import { createGameFlow } from '../../../src/game/game-flow.js';

describe('D-01 Restart Regression', () => {
  it('correctly resets simulation time after restart', () => {
    const clock = createClock(1000);
    const gameStatus = createGameStatus();

    // Simulate some game progression
    transitionTo(gameStatus, GAME_STATE.PLAYING);
    advanceSimTime(clock, 16.67);
    advanceSimTime(clock, 16.67);

    expect(clock.simTimeMs).toBeGreaterThan(0);
    const timeBeforeRestart = clock.simTimeMs;

    // Create game flow with restart handler
    const gameFlow = createGameFlow({
      clock,
      gameStatus,
      onRestart: () => {
        resetClock(clock, clock.realTimeMs);
      },
    });

    // Execute restart
    gameFlow.restartLevel();

    expect(clock.simTimeMs).toBe(0);
    expect(clock.simTimeMs).toBeLessThan(timeBeforeRestart);
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });
});
