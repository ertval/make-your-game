/*
 * Game flow finite-state driver.
 *
 * This module coordinates high-level runtime state transitions and synchronizes
 * pause semantics with the simulation clock. The simulation is frozen whenever
 * the current status is not PLAYING.
 *
 * Public API:
 * - createGameFlow({ gameStatus, clock, levelLoader, world, onRestart })
 * - startGame(options)
 * - pauseGame()
 * - resumeGame()
 * - restartLevel(options)
 * - setState(nextState)
 * - getSnapshot()
 */

import { setPauseState } from '../ecs/resources/clock.js';
import { canTransition, GAME_STATE, transitionTo } from '../ecs/resources/game-status.js';

function shouldFreezeSimulation(state) {
  return state !== GAME_STATE.PLAYING;
}

function applyPauseFromState(clock, gameStatus) {
  setPauseState(clock, shouldFreezeSimulation(gameStatus.currentState));
}

function safeTransition(gameStatus, nextState) {
  if (!canTransition(gameStatus, nextState)) {
    return false;
  }

  transitionTo(gameStatus, nextState);
  return true;
}

export function createGameFlow({ gameStatus, clock, levelLoader, world, onRestart } = {}) {
  if (!gameStatus) {
    throw new Error('createGameFlow requires a gameStatus resource.');
  }

  if (!clock) {
    throw new Error('createGameFlow requires a clock resource.');
  }

  applyPauseFromState(clock, gameStatus);

  function destroyAllEntitiesDeferred() {
    if (!world) {
      return;
    }

    if (typeof world.deferDestroyAllEntities === 'function') {
      world.deferDestroyAllEntities();
      if (typeof world.flushDeferredMutations === 'function') {
        world.flushDeferredMutations();
      }
      return;
    }

    // Legacy fallback keeps restart deterministic without reaching into world internals.
    if (typeof world.getActiveEntityHandles === 'function') {
      const handles = world.getActiveEntityHandles();
      for (const handle of handles) {
        if (typeof world.deferDestroyEntity === 'function') {
          world.deferDestroyEntity(handle);
        }
      }

      if (typeof world.flushDeferredMutations === 'function') {
        world.flushDeferredMutations();
      }
    }
  }

  function startGame(options = {}) {
    const levelIndex = Number.isFinite(options.levelIndex) ? options.levelIndex : 0;
    const state = gameStatus.currentState;

    if (state === GAME_STATE.PLAYING) {
      applyPauseFromState(clock, gameStatus);
      return false;
    }

    if (state === GAME_STATE.PAUSED) {
      const resumed = safeTransition(gameStatus, GAME_STATE.PLAYING);
      applyPauseFromState(clock, gameStatus);
      return resumed;
    }

    if (state === GAME_STATE.GAME_OVER || state === GAME_STATE.VICTORY) {
      if (!safeTransition(gameStatus, GAME_STATE.MENU)) {
        return false;
      }
    }

    if (gameStatus.currentState === GAME_STATE.MENU) {
      let loadedLevel = true;
      if (levelLoader && typeof levelLoader.loadLevel === 'function') {
        loadedLevel = levelLoader.loadLevel(levelIndex, {
          reason: 'start-game',
        });
      }

      if (!loadedLevel) {
        applyPauseFromState(clock, gameStatus);
        return false;
      }

      if (!safeTransition(gameStatus, GAME_STATE.PLAYING)) {
        applyPauseFromState(clock, gameStatus);
        return false;
      }

      applyPauseFromState(clock, gameStatus);
      return true;
    }

    if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
      let nextLevel = true;
      if (levelLoader && typeof levelLoader.advanceLevel === 'function') {
        nextLevel = levelLoader.advanceLevel('level-complete');
      }

      if (nextLevel === null) {
        const movedToVictory = safeTransition(gameStatus, GAME_STATE.VICTORY);
        applyPauseFromState(clock, gameStatus);
        return movedToVictory;
      }

      if (!nextLevel) {
        applyPauseFromState(clock, gameStatus);
        return false;
      }

      const movedToPlaying = safeTransition(gameStatus, GAME_STATE.PLAYING);
      applyPauseFromState(clock, gameStatus);
      return movedToPlaying;
    }

    applyPauseFromState(clock, gameStatus);
    return gameStatus.currentState === GAME_STATE.PLAYING;
  }

  function pauseGame() {
    const paused = safeTransition(gameStatus, GAME_STATE.PAUSED);
    applyPauseFromState(clock, gameStatus);
    return paused;
  }

  function resumeGame() {
    const resumed = safeTransition(gameStatus, GAME_STATE.PLAYING);
    applyPauseFromState(clock, gameStatus);
    return resumed;
  }

  function restartLevel(options = {}) {
    const state = gameStatus.currentState;

    // Restart can be requested directly from PLAYING without forcing a pause cycle.
    if (state === GAME_STATE.PLAYING) {
      // no-op: keep PLAYING and continue with restart teardown.
    } else if (state === GAME_STATE.PAUSED) {
      if (!safeTransition(gameStatus, GAME_STATE.PLAYING)) {
        return false;
      }
    } else {
      applyPauseFromState(clock, gameStatus);
      return false;
    }

    // Schedule a full teardown through world deferral APIs to preserve ECS mutation discipline.
    destroyAllEntitiesDeferred();

    if (levelLoader && typeof levelLoader.restartCurrentLevel === 'function') {
      levelLoader.restartCurrentLevel({
        ...options,
        reason: 'restart-level',
      });
    }

    // Notify the caller to reset the simulation clock and component stores.
    if (typeof onRestart === 'function') {
      onRestart();
    }

    applyPauseFromState(clock, gameStatus);
    return true;
  }

  function setState(nextState) {
    const transitioned = safeTransition(gameStatus, nextState);
    applyPauseFromState(clock, gameStatus);
    return transitioned;
  }

  function getSnapshot() {
    return {
      isPaused: clock.isPaused,
      state: gameStatus.currentState,
    };
  }

  return {
    getSnapshot,
    pauseGame,
    restartLevel,
    resumeGame,
    setState,
    startGame,
  };
}
