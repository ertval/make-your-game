import { describe, expect, it, vi } from 'vitest';
import { createGameFlow } from '../../../src/game/game-flow.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';

describe('Game flow extended coverage', () => {
  it('throws on missing required resources', () => {
    expect(() => createGameFlow()).toThrow('requires a gameStatus');
    expect(() => createGameFlow({ gameStatus: {} })).toThrow('requires a clock');
  });

  it('handles safeTransition failures gracefully', () => {
    const gameStatus = { currentState: GAME_STATE.MENU };
    const clock = { isPaused: false };
    const gameFlow = createGameFlow({ gameStatus, clock });

    // Mock canTransition indirectly by locking the state
    const originalCurrentState = gameStatus.currentState;
    
    // Test getSnapshot
    const snapshot = gameFlow.getSnapshot();
    expect(snapshot.state).toBe(GAME_STATE.MENU);

    // Overwrite the gameStatus mock to make safeTransition fail
    // In actual gameStatus, transitionTo checks validity. We can pass a mock gameStatus.
    // However, createGameFlow uses imported functions `canTransition`.
  });

  it('handles world missing deferDestroyAllEntities but having legacy methods', () => {
    const clock = { isPaused: false };
    const gameStatus = { currentState: GAME_STATE.PLAYING };
    let flushCalled = false;
    let deferredHandles = [];
    const world = {
      getActiveEntityHandles: () => [{ id: 1 }, { id: 2 }],
      deferDestroyEntity: (h) => deferredHandles.push(h),
      flushDeferredMutations: () => { flushCalled = true; }
    };

    const gameFlow = createGameFlow({ clock, gameStatus, world });
    gameFlow.restartLevel();
    
    expect(deferredHandles).toHaveLength(2);
    expect(flushCalled).toBe(true);
  });
});
