import { describe, expect, it, vi } from 'vitest';
import * as gameStatusModule from '../../../src/ecs/resources/game-status.js';
import { createGameFlow } from '../../../src/game/game-flow.js';

describe('Game flow extended coverage', () => {
  it('throws on missing required resources', () => {
    expect(() => createGameFlow()).toThrow('requires a gameStatus');
    expect(() => createGameFlow({ gameStatus: {} })).toThrow('requires a clock');
  });

  it('handles safeTransition failures gracefully', () => {
    const { GAME_STATE } = gameStatusModule;
    const gameStatus = { currentState: GAME_STATE.PAUSED };
    const clock = { isPaused: false };
    const gameFlow = createGameFlow({ gameStatus, clock });

    // Test getSnapshot
    const snapshot = gameFlow.getSnapshot();
    expect(snapshot.state).toBe(GAME_STATE.PAUSED);

    // Spy on canTransition to force it to fail
    const spy = vi.spyOn(gameStatusModule, 'canTransition').mockReturnValue(false);

    // PAUSED -> PLAYING safeTransition fails
    expect(gameFlow.startGame()).toBe(false);
    expect(gameFlow.restartLevel()).toBe(false);

    // GAME_OVER -> MENU safeTransition fails
    gameStatus.currentState = GAME_STATE.GAME_OVER;
    expect(gameFlow.startGame()).toBe(false);

    // MENU -> PLAYING safeTransition fails
    gameStatus.currentState = GAME_STATE.MENU;
    expect(gameFlow.startGame()).toBe(false);

    // LEVEL_COMPLETE -> VICTORY safeTransition fails
    gameStatus.currentState = GAME_STATE.LEVEL_COMPLETE;
    const levelLoader = { advanceLevel: vi.fn(() => null) }; // returns null, triggers VICTORY branch
    const gameFlow2 = createGameFlow({ gameStatus, clock, levelLoader });
    expect(gameFlow2.startGame()).toBe(false);

    // LEVEL_COMPLETE -> PLAYING safeTransition fails
    levelLoader.advanceLevel.mockReturnValue(true);
    expect(gameFlow2.startGame()).toBe(false);

    // Fallback branch: unknown state
    gameStatus.currentState = 'UNKNOWN';
    expect(gameFlow2.startGame()).toBe(false);

    spy.mockRestore();
  });

  it('handles startGame failures based on levelLoader', () => {
    const { GAME_STATE } = gameStatusModule;
    const gameStatus = { currentState: GAME_STATE.MENU };
    const clock = { isPaused: false };

    // loadLevel returns false
    const levelLoader1 = { loadLevel: vi.fn(() => false) };
    const gameFlow1 = createGameFlow({ gameStatus, clock, levelLoader: levelLoader1 });
    expect(gameFlow1.startGame()).toBe(false);

    // LEVEL_COMPLETE branch, advanceLevel returns false
    gameStatus.currentState = GAME_STATE.LEVEL_COMPLETE;
    const levelLoader2 = { advanceLevel: vi.fn(() => false) };
    const gameFlow2 = createGameFlow({ gameStatus, clock, levelLoader: levelLoader2 });
    expect(gameFlow2.startGame()).toBe(false);

    // PLAYING branch
    gameStatus.currentState = GAME_STATE.PLAYING;
    expect(gameFlow2.startGame()).toBe(false);
  });

  it('handles world missing deferDestroyAllEntities but having legacy methods', () => {
    const clock = { isPaused: false };
    const gameStatus = { currentState: gameStatusModule.GAME_STATE.PLAYING };
    let flushCalled = false;
    const deferredHandles = [];
    const world = {
      getActiveEntityHandles: () => [{ id: 1 }, { id: 2 }],
      deferDestroyEntity: (h) => deferredHandles.push(h),
      flushDeferredMutations: () => {
        flushCalled = true;
      },
    };

    const gameFlow = createGameFlow({ clock, gameStatus, world });
    gameFlow.restartLevel();

    expect(deferredHandles).toHaveLength(2);
    expect(flushCalled).toBe(true);
  });

  it('covers pauseGame and resumeGame', () => {
    const clock = { isPaused: false };
    const { GAME_STATE } = gameStatusModule;
    const gameStatus = { currentState: GAME_STATE.PLAYING };
    const gameFlow = createGameFlow({ clock, gameStatus });

    expect(gameFlow.pauseGame()).toBe(true);
    expect(clock.isPaused).toBe(true);

    expect(gameFlow.resumeGame()).toBe(true);
    expect(clock.isPaused).toBe(false);
  });
});
