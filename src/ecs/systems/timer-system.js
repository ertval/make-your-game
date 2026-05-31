/*
 * C-02 level countdown system.
 *
 * This module implements a pure ECS logic system that maintains the active
 * level countdown entirely through world resources. It initializes the timer
 * from the canonical per-level durations, decrements by the fixed-step clock
 * delta while gameplay is active, and transitions the shared game status to
 * GAME_OVER when time expires.
 *
 * Public API:
 * - getLevelDurationSeconds(level)
 * - clampRemainingTime(seconds)
 * - createTimerSystem(options)
 *
 * Implementation notes:
 * - The timer state lives in a mutable `levelTimer` resource so the system has
 *   no hidden side effects outside the world resource graph.
 * - The active level is resolved from the injected level-loader resource using
 *   its zero-based current level index, then converted to the 1-based level
 *   numbering required by the gameplay rules.
 * - The system mutates the existing game-status resource in place instead of
 *   importing any UI or adapter code, preserving ECS DOM isolation.
 */

import { LEVEL_TIMERS } from '../resources/constants.js';
import { canTransition, GAME_STATE, transitionTo } from '../resources/game-status.js';
import {
  emitGameplayEvent,
  GAME_OVER_CAUSE,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from './collision-gameplay-events.js';

const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_GAME_STATUS_RESOURCE_KEY = 'gameStatus';
const DEFAULT_LEVEL_LOADER_RESOURCE_KEY = 'levelLoader';
const DEFAULT_TIMER_RESOURCE_KEY = 'levelTimer';
const MAX_DELTA_MS = 1000;

export function getLevelDurationSeconds(level) {
  const levelIndex = Math.floor(level) - 1;

  if (!Number.isFinite(levelIndex) || levelIndex < 0 || levelIndex >= LEVEL_TIMERS.length) {
    return LEVEL_TIMERS[0];
  }

  return LEVEL_TIMERS[levelIndex];
}

export function clampRemainingTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return seconds;
}

function resolveActiveLevel(levelLoader) {
  if (typeof levelLoader?.getCurrentLevelIndex !== 'function') {
    return 1;
  }

  const levelIndex = levelLoader.getCurrentLevelIndex();
  if (!Number.isFinite(levelIndex)) {
    return 1;
  }

  return Math.max(1, Math.floor(levelIndex) + 1);
}

function ensureTimerResource(timerState, activeLevel) {
  const levelDurationSeconds = getLevelDurationSeconds(activeLevel);

  if (!timerState || typeof timerState !== 'object') {
    return {
      activeLevel,
      durationSeconds: levelDurationSeconds,
      remainingSeconds: levelDurationSeconds,
    };
  }

  const needsInitialization =
    timerState.activeLevel !== activeLevel || !Number.isFinite(timerState.remainingSeconds);

  if (needsInitialization) {
    timerState.activeLevel = activeLevel;
    timerState.durationSeconds = levelDurationSeconds;
    timerState.remainingSeconds = levelDurationSeconds;
    return timerState;
  }

  if (!Number.isFinite(timerState.durationSeconds) || timerState.durationSeconds <= 0) {
    timerState.durationSeconds = levelDurationSeconds;
  }

  timerState.remainingSeconds = clampRemainingTime(timerState.remainingSeconds);
  return timerState;
}

function getDeltaSeconds(context) {
  const deltaMs = Number(context.dtMs ?? 0);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }

  return Math.min(deltaMs, MAX_DELTA_MS) / 1000;
}

function expireTimer(gameStatus, timerState, onGameOver) {
  timerState.remainingSeconds = 0;

  if (gameStatus && canTransition(gameStatus, GAME_STATE.GAME_OVER)) {
    transitionTo(gameStatus, GAME_STATE.GAME_OVER);
    // Emit only on the real transition so a blocked/repeat expiry never spams
    // GameOver into the event queue across subsequent frames.
    if (typeof onGameOver === 'function') {
      onGameOver();
    }
  }
}

function expireIfNeeded(gameStatus, timerState, onGameOver) {
  if (timerState.remainingSeconds <= 0) {
    if (gameStatus?.currentState !== GAME_STATE.GAME_OVER) {
      expireTimer(gameStatus, timerState, onGameOver);
    }
    return true;
  }

  return false;
}

export function createTimerSystem(options = {}) {
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;
  const gameStatusResourceKey = options.gameStatusResourceKey || DEFAULT_GAME_STATUS_RESOURCE_KEY;
  const levelLoaderResourceKey =
    options.levelLoaderResourceKey || DEFAULT_LEVEL_LOADER_RESOURCE_KEY;
  const timerResourceKey = options.timerResourceKey || DEFAULT_TIMER_RESOURCE_KEY;

  return {
    name: 'timer-system',
    phase: 'logic',
    resourceCapabilities: {
      read: [gameStatusResourceKey, levelLoaderResourceKey, timerResourceKey],
      write: [eventQueueResourceKey, gameStatusResourceKey, timerResourceKey],
    },
    update(context) {
      const gameStatus = context.world.getResource(gameStatusResourceKey);
      const levelLoader = context.world.getResource(levelLoaderResourceKey);
      const activeLevel = resolveActiveLevel(levelLoader);
      let timerState = context.world.getResource(timerResourceKey);

      timerState = ensureTimerResource(timerState, activeLevel);

      context.world.setResource(timerResourceKey, timerState);

      // The expiry helpers fire this callback exactly once, on the real
      // PLAYING → GAME_OVER transition, so timer GameOver stays deterministic.
      const eventQueue = context.world.getResource(eventQueueResourceKey);
      const onGameOver = () => {
        emitGameplayEvent(
          eventQueue,
          GAMEPLAY_EVENT_TYPE.GAME_OVER,
          {
            cause: GAME_OVER_CAUSE.TIME,
            sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
          },
          context.frame,
        );
      };

      if (expireIfNeeded(gameStatus, timerState, onGameOver)) {
        return;
      }

      if (gameStatus?.currentState !== GAME_STATE.PLAYING) {
        return;
      }

      timerState.remainingSeconds = clampRemainingTime(
        timerState.remainingSeconds - getDeltaSeconds(context),
      );

      expireIfNeeded(gameStatus, timerState, onGameOver);
    },
  };
}
