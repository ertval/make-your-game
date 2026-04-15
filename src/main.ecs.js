/*
 * Ms. Ghostman — Where Pac-Man meets Bomberman.
 * Copyright (C) 2026 ertval
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * ECS app bootstrap entrypoint.
 *
 * This module wires the requestAnimationFrame loop to the ECS fixed-step
 * simulation runtime and exposes runtime/frame instrumentation hooks used by
 * Playwright performance checks.
 *
 * Public API:
 * - bootstrapApplication(options)
 * - createGameRuntime(options)
 * - installUnhandledRejectionHandler(options)
 * - renderCriticalError(overlayRoot, error)
 * - startBrowserApplication(options)
 */

import { percentileFromSorted, toSortedNumericArray } from './debug/frame-stats.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from './ecs/resources/constants.js';
import { createBootstrap } from './game/bootstrap.js';

const DEFAULT_FRAME_SAMPLE_SIZE = 600;
const FRAME_PROBE_KEY = '__MS_GHOSTMAN_FRAME_PROBE__';
const RUNTIME_HOOK_KEY = '__MS_GHOSTMAN_RUNTIME__';
const UNHANDLED_REJECTION_HOOK_KEY = Symbol.for('ms.ghostman.unhandledRejectionHook');
const DEFAULT_RUNTIME_FAULT_BUDGET = 3;
const DEFAULT_RUNTIME_FAULT_WINDOW_MS = 2_000;
const DEFAULT_RUNTIME_FAULT_COOLDOWN_MS = 1_500;

function toMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || 'Unknown error');
}

function createFrameProbe(sampleSize = DEFAULT_FRAME_SAMPLE_SIZE) {
  const deltas = new Float64Array(sampleSize);
  let count = 0;
  let cursor = 0;
  let lastTimestamp = 0;
  let latestDelta = 0;

  function recordFrame(nowMs) {
    if (!Number.isFinite(nowMs)) {
      return;
    }

    if (lastTimestamp > 0) {
      latestDelta = nowMs - lastTimestamp;
      deltas[cursor] = latestDelta;
      cursor = (cursor + 1) % sampleSize;
      if (count < sampleSize) {
        count += 1;
      }
    }

    lastTimestamp = nowMs;
  }

  function getStats() {
    const values = toSortedNumericArray(deltas, count);
    const p95FrameTime = percentileFromSorted(values, 95);
    const p99FrameTime = percentileFromSorted(values, 99);

    return {
      averageFrameTime:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      latestFrameTime: values.length > 0 ? latestDelta : 0,
      p95Fps: p95FrameTime > 0 ? 1000 / p95FrameTime : 0,
      p95FrameTime,
      p99FrameTime,
      sampleCount: values.length,
    };
  }

  return {
    getStats,
    recordFrame,
  };
}

function clearHeldInputState(bootstrap) {
  const adapter = bootstrap.getInputAdapter();
  if (!adapter) {
    return;
  }

  if (typeof adapter.clearHeldKeys === 'function') {
    adapter.clearHeldKeys();
    return;
  }

  if (adapter.heldKeys instanceof Set) {
    adapter.heldKeys.clear();
  }
}

export function renderCriticalError(overlayRoot, error) {
  if (!overlayRoot) {
    return;
  }

  const nextMessage = `Critical error: ${toMessage(error)}`;
  const previous = String(overlayRoot.textContent || '').trim();

  overlayRoot.setAttribute('aria-live', 'assertive');
  overlayRoot.setAttribute('role', 'alert');
  // Keep one plain-text line per error so multiple faults remain readable without unsafe HTML sinks.
  overlayRoot.textContent =
    previous.length > 0 && !previous.includes(nextMessage)
      ? `${previous}\n${nextMessage}`
      : nextMessage;
}

export function installUnhandledRejectionHandler({
  logger = console,
  overlayRoot,
  windowRef,
} = {}) {
  const targetWindow = windowRef || (typeof window !== 'undefined' ? window : null);
  if (!targetWindow || targetWindow[UNHANDLED_REJECTION_HOOK_KEY]) {
    return;
  }

  const handler = (event) => {
    logger.error('Unhandled promise rejection in game runtime.', event.reason);
    renderCriticalError(overlayRoot, event.reason);
  };

  targetWindow.addEventListener('unhandledrejection', handler);
  targetWindow[UNHANDLED_REJECTION_HOOK_KEY] = handler;
}

export function createGameRuntime({
  bootstrap,
  cancelFrame,
  documentRef,
  logger = console,
  nowProvider,
  requestFrame,
  runtimeFaultBudget = DEFAULT_RUNTIME_FAULT_BUDGET,
  runtimeFaultCooldownMs = DEFAULT_RUNTIME_FAULT_COOLDOWN_MS,
  runtimeFaultWindowMs = DEFAULT_RUNTIME_FAULT_WINDOW_MS,
  windowRef,
} = {}) {
  const targetWindow = windowRef || (typeof window !== 'undefined' ? window : null);
  const targetDocument = documentRef || (typeof document !== 'undefined' ? document : null);
  const scheduleFrame = requestFrame || targetWindow?.requestAnimationFrame?.bind(targetWindow);
  const cancelScheduledFrame =
    cancelFrame || targetWindow?.cancelAnimationFrame?.bind(targetWindow);
  const getNow = nowProvider || (() => targetWindow?.performance?.now?.() ?? Date.now());
  const frameProbe = createFrameProbe();

  if (!bootstrap) {
    throw new Error('createGameRuntime requires a bootstrap object.');
  }
  if (typeof scheduleFrame !== 'function') {
    throw new Error('createGameRuntime requires requestAnimationFrame support.');
  }

  const boundedRuntimeFaultBudget = Math.max(1, Math.floor(runtimeFaultBudget));
  const boundedRuntimeFaultWindowMs = Math.max(1, Math.floor(runtimeFaultWindowMs));
  const boundedRuntimeFaultCooldownMs = Math.max(1, Math.floor(runtimeFaultCooldownMs));

  let isRunning = false;
  let frameHandle = 0;
  let quarantinedUntilMs = -1;
  const runtimeFaultTimestamps = [];

  function normalizeNow(value, fallbackNowMs = bootstrap.clock.lastFrameTime) {
    if (Number.isFinite(value)) {
      return value;
    }

    const providerNow = getNow();
    if (Number.isFinite(providerNow)) {
      return providerNow;
    }

    if (Number.isFinite(fallbackNowMs)) {
      return fallbackNowMs;
    }

    return 0;
  }

  function pruneRuntimeFaultWindow(nowMs) {
    const oldestAllowed = nowMs - boundedRuntimeFaultWindowMs;
    while (runtimeFaultTimestamps.length > 0 && runtimeFaultTimestamps[0] < oldestAllowed) {
      runtimeFaultTimestamps.shift();
    }
  }

  const controls = {
    getSnapshot: () => ({
      frame: bootstrap.world.frame,
      isPaused: bootstrap.clock.isPaused,
      simTimeMs: bootstrap.clock.simTimeMs,
      state: bootstrap.gameStatus.currentState,
    }),
    getLevelIndex: () => bootstrap.levelLoader.getCurrentLevelIndex(),
    pause: () => bootstrap.gameFlow.pauseGame(),
    restart: () => bootstrap.gameFlow.restartLevel(),
    resume: () => {
      const resumed = bootstrap.gameFlow.resumeGame();
      if (resumed) {
        bootstrap.resyncTime(normalizeNow(getNow()));
      }
      return resumed;
    },
    setState: (nextState) => bootstrap.gameFlow.setState(nextState),
    startGame: (options = {}) => {
      const started = bootstrap.gameFlow.startGame(options);
      if (started) {
        bootstrap.resyncTime(normalizeNow(getNow()));
      }
      return started;
    },
  };

  function onAnimationFrame(frameNowMs) {
    if (!isRunning) {
      return;
    }

    const safeNowMs = normalizeNow(frameNowMs);

    try {
      frameProbe.recordFrame(safeNowMs);

      if (quarantinedUntilMs > safeNowMs) {
        return;
      }

      bootstrap.stepFrame(safeNowMs, {
        fixedDtMs: FIXED_DT_MS,
        maxStepsPerFrame: MAX_STEPS_PER_FRAME,
      });
    } catch (error) {
      // Catch unexpected errors outside the system-dispatch boundary
      // (e.g., tickClock, applyDeferredMutations) so the loop survives.
      logger.error('Game frame error.', error);
      runtimeFaultTimestamps.push(safeNowMs);
      pruneRuntimeFaultWindow(safeNowMs);

      if (runtimeFaultTimestamps.length >= boundedRuntimeFaultBudget) {
        quarantinedUntilMs = safeNowMs + boundedRuntimeFaultCooldownMs;
        runtimeFaultTimestamps.length = 0;
        logger.error(
          `Game runtime fault budget exceeded. Quarantining simulation updates for ${boundedRuntimeFaultCooldownMs}ms.`,
        );
      }
    } finally {
      // Always schedule the next frame, even if this one threw.
      frameHandle = scheduleFrame(onAnimationFrame);
    }
  }

  function onVisibilityChange() {
    if (!targetDocument) {
      return;
    }

    if (targetDocument.hidden) {
      clearHeldInputState(bootstrap);
      return;
    }

    bootstrap.resyncTime(normalizeNow(getNow()));
  }

  function onBlur() {
    clearHeldInputState(bootstrap);
    bootstrap.resyncTime(normalizeNow(getNow()));
  }

  function onFocus() {
    bootstrap.resyncTime(normalizeNow(getNow()));
  }

  function start() {
    if (isRunning) {
      return;
    }

    isRunning = true;
    if (targetWindow && typeof targetWindow.addEventListener === 'function') {
      targetWindow.addEventListener('blur', onBlur);
      targetWindow.addEventListener('focus', onFocus);
    }
    if (targetDocument && typeof targetDocument.addEventListener === 'function') {
      targetDocument.addEventListener('visibilitychange', onVisibilityChange);
    }

    frameHandle = scheduleFrame(onAnimationFrame);
  }

  function stop() {
    isRunning = false;

    if (typeof cancelScheduledFrame === 'function') {
      cancelScheduledFrame(frameHandle);
    }
    if (targetWindow && typeof targetWindow.removeEventListener === 'function') {
      targetWindow.removeEventListener('blur', onBlur);
      targetWindow.removeEventListener('focus', onFocus);
    }
    if (targetDocument && typeof targetDocument.removeEventListener === 'function') {
      targetDocument.removeEventListener('visibilitychange', onVisibilityChange);
    }
  }

  if (targetWindow) {
    targetWindow[FRAME_PROBE_KEY] = {
      getStats: frameProbe.getStats,
    };
    targetWindow[RUNTIME_HOOK_KEY] = controls;
  }

  return {
    controls,
    start,
    stop,
  };
}

export function bootstrapApplication({
  documentRef,
  logger = console,
  nowProvider,
  windowRef,
} = {}) {
  const targetDocument = documentRef || (typeof document !== 'undefined' ? document : null);
  const targetWindow = windowRef || (typeof window !== 'undefined' ? window : null);

  if (!targetDocument) {
    return null;
  }

  const appRoot = targetDocument.getElementById('app');
  const overlayRoot = targetDocument.getElementById('overlay-root');

  if (!appRoot) {
    throw new Error('Missing #app root.');
  }

  const getNow = nowProvider || (() => targetWindow?.performance?.now?.() ?? Date.now());

  try {
    const bootstrap = createBootstrap({
      now: getNow(),
    });

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: targetWindow,
    });

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: targetDocument,
      nowProvider: getNow,
      windowRef: targetWindow,
    });

    if (overlayRoot) {
      overlayRoot.textContent = 'Engine bootstrap ready.';
    }
    runtime.start();
    return runtime;
  } catch (error) {
    logger.error('World initialization failed.', error);
    renderCriticalError(overlayRoot, error);
    throw error;
  }
}

export function startBrowserApplication(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return bootstrapApplication({
    ...options,
    documentRef: options.documentRef || document,
    windowRef: options.windowRef || window,
  });
}
