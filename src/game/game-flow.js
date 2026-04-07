/*
 * Game flow finite-state driver.
 *
 * This module coordinates high-level runtime state transitions and synchronizes
 * pause semantics with the simulation clock. The simulation is frozen whenever
 * the current status is not PLAYING.
 *
 * Public API:
 * - createGameFlow({ gameStatus, clock, levelLoader })
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

export function createGameFlow({ gameStatus, clock, levelLoader } = {}) {
  if (!gameStatus) {
    throw new Error('createGameFlow requires a gameStatus resource.');
  }

  if (!clock) {
    throw new Error('createGameFlow requires a clock resource.');
  }

  applyPauseFromState(clock, gameStatus);

  function startGame(options = {}) {
    const levelIndex = Number.isFinite(options.levelIndex) ? options.levelIndex : 0;
    const state = gameStatus.currentState;

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
      if (!safeTransition(gameStatus, GAME_STATE.PLAYING)) {
        return false;
      }

      if (levelLoader && typeof levelLoader.loadLevel === 'function') {
        levelLoader.loadLevel(levelIndex, {
          reason: 'start-game',
        });
      }

      applyPauseFromState(clock, gameStatus);
      return true;
    }

    if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
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
    if (gameStatus.currentState === GAME_STATE.PAUSED) {
      if (!safeTransition(gameStatus, GAME_STATE.PLAYING)) {
        return false;
      }
    }

    if (gameStatus.currentState !== GAME_STATE.PLAYING) {
      applyPauseFromState(clock, gameStatus);
      return false;
    }

    if (levelLoader && typeof levelLoader.restartCurrentLevel === 'function') {
      levelLoader.restartCurrentLevel({
        ...options,
        reason: 'restart-level',
      });
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
