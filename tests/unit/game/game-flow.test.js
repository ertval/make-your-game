/**
 * Unit tests for A-03 game flow transitions.
 *
 * Purpose: Verifies state-driven orchestration behaviors such as level advancement,
 * start-load wiring, and restart semantics while keeping dependencies stubbed.
 * Public API: N/A (test module).
 * Implementation notes: Uses minimal resource factories and mocked level-loader
 * methods to assert side effects and transition outcomes deterministically.
 */

import { describe, expect, it, vi } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createGameFlow } from '../../../src/game/game-flow.js';

describe('game-flow', () => {
  it('advances and loads next level when starting from LEVEL_COMPLETE', () => {
    const gameStatus = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    const clock = createClock(0);
    const levelLoader = {
      advanceLevel: vi.fn(),
    };

    const gameFlow = createGameFlow({
      clock,
      gameStatus,
      levelLoader,
    });

    expect(gameFlow.startGame()).toBe(true);
    expect(levelLoader.advanceLevel).toHaveBeenCalledTimes(1);
    expect(levelLoader.advanceLevel).toHaveBeenCalledWith({
      reason: 'level-complete',
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
    expect(clock.isPaused).toBe(false);
  });

  it('loads selected level index when starting from MENU', () => {
    const gameStatus = createGameStatus(GAME_STATE.MENU);
    const clock = createClock(0);
    const levelLoader = {
      loadLevel: vi.fn(),
    };

    const gameFlow = createGameFlow({
      clock,
      gameStatus,
      levelLoader,
    });

    expect(gameFlow.startGame({ levelIndex: 2 })).toBe(true);
    expect(levelLoader.loadLevel).toHaveBeenCalledTimes(1);
    expect(levelLoader.loadLevel).toHaveBeenCalledWith(2, {
      reason: 'start-game',
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('restarts current level when restart is requested from PAUSED', () => {
    const gameStatus = createGameStatus(GAME_STATE.PAUSED);
    const clock = createClock(0);
    const levelLoader = {
      restartCurrentLevel: vi.fn(),
    };

    const gameFlow = createGameFlow({
      clock,
      gameStatus,
      levelLoader,
    });

    expect(gameFlow.restartLevel({ source: 'pause-menu' })).toBe(true);
    expect(levelLoader.restartCurrentLevel).toHaveBeenCalledTimes(1);
    expect(levelLoader.restartCurrentLevel).toHaveBeenCalledWith({
      reason: 'restart-level',
      source: 'pause-menu',
    });
    expect(gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('rejects restart when not in PLAYING or PAUSED', () => {
    const gameStatus = createGameStatus(GAME_STATE.MENU);
    const clock = createClock(0);
    const levelLoader = {
      restartCurrentLevel: vi.fn(),
    };

    const gameFlow = createGameFlow({
      clock,
      gameStatus,
      levelLoader,
    });

    expect(gameFlow.restartLevel()).toBe(false);
    expect(levelLoader.restartCurrentLevel).not.toHaveBeenCalled();
    expect(gameStatus.currentState).toBe(GAME_STATE.MENU);
  });
});
