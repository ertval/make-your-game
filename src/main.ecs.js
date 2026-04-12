/*
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
 */

import { createInputAdapter } from './adapters/io/input-adapter.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from './ecs/resources/constants.js';
import { createMapResource } from './ecs/resources/map-resource.js';
import { createBootstrap } from './game/bootstrap.js';
import { createSyncMapLoader } from './game/level-loader.js';

const DEFAULT_FRAME_SAMPLE_SIZE = 600;
const FRAME_PROBE_KEY = '__MS_GHOSTMAN_FRAME_PROBE__';
const RUNTIME_HOOK_KEY = '__MS_GHOSTMAN_RUNTIME__';
const UNHANDLED_REJECTION_HOOK_KEY = '__MS_GHOSTMAN_UNHANDLED_REJECTION_HOOK__';

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

  function recordFrame(nowMs) {
    if (!Number.isFinite(nowMs)) {
      return;
    }

    if (lastTimestamp > 0) {
      deltas[cursor] = nowMs - lastTimestamp;
      cursor = (cursor + 1) % sampleSize;
      if (count < sampleSize) {
        count += 1;
      }
    }

    lastTimestamp = nowMs;
  }

  function toSortedArray() {
    const values = [];

    for (let index = 0; index < count; index += 1) {
      values.push(deltas[index]);
    }

    values.sort((left, right) => left - right);
    return values;
  }

  function percentile(sortedValues, percentileValue) {
    if (sortedValues.length === 0) {
      return 0;
    }

    const rawIndex = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
    const index = Math.max(0, Math.min(rawIndex, sortedValues.length - 1));
    return sortedValues[index];
  }

  function getStats() {
    const values = toSortedArray();
    const p95FrameTime = percentile(values, 95);
    const p99FrameTime = percentile(values, 99);

    return {
      averageFrameTime:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      latestFrameTime: values.length > 0 ? values[values.length - 1] : 0,
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

/**
 * Preload the shipped map JSON files and convert them into canonical map resources.
 *
 * @param {{ fetchImpl?: Function }} [options] - Optional fetch override for tests.
 * @returns {Promise<Array<MapResource>>} Parsed map resources in level order.
 */
async function loadDefaultMaps({ fetchImpl } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('bootstrapApplication requires fetch support to preload maps.');
  }

  const preloadTasks = [];

  for (let levelNumber = 1; levelNumber <= TOTAL_LEVELS; levelNumber += 1) {
    preloadTasks.push(
      (async () => {
        const response = await fetchImpl(`/assets/maps/level-${levelNumber}.json`);
        if (!response || response.ok !== true) {
          const status = Number.isFinite(response?.status) ? response.status : 'unknown';
          throw new Error(`Failed to load map asset for level ${levelNumber} (status: ${status}).`);
        }

        const rawMap = await response.json();
        return createMapResource(rawMap);
      })(),
    );
  }

  return Promise.all(preloadTasks);
}

export function renderCriticalError(overlayRoot, error) {
  if (!overlayRoot) {
    return;
  }

  overlayRoot.setAttribute('aria-live', 'assertive');
  overlayRoot.setAttribute('role', 'alert');
  overlayRoot.textContent = `Critical error: ${toMessage(error)}`;
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
  nowProvider,
  requestFrame,
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

  let isRunning = false;
  let frameHandle = 0;

  const controls = {
    getSnapshot: () => ({
      frame: bootstrap.world.frame,
      isPaused: bootstrap.clock.isPaused,
      simTimeMs: bootstrap.clock.simTimeMs,
      state: bootstrap.gameStatus.currentState,
    }),
    pause: () => bootstrap.gameFlow.pauseGame(),
    restart: () => bootstrap.gameFlow.restartLevel(),
    resume: () => {
      const resumed = bootstrap.gameFlow.resumeGame();
      if (resumed) {
        bootstrap.resyncTime(getNow());
      }
      return resumed;
    },
    startGame: () => {
      const started = bootstrap.gameFlow.startGame();
      if (started) {
        bootstrap.resyncTime(getNow());
      }
      return started;
    },
  };

  function onAnimationFrame(frameNowMs) {
    if (!isRunning) {
      return;
    }

    try {
      frameProbe.recordFrame(frameNowMs);
      bootstrap.stepFrame(frameNowMs, {
        fixedDtMs: FIXED_DT_MS,
        maxStepsPerFrame: MAX_STEPS_PER_FRAME,
      });
    } catch (error) {
      // Catch unexpected errors outside the system-dispatch boundary
      // (e.g., tickClock, applyDeferredMutations) so the loop survives.
      console.error('Game frame error.', error);
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

    bootstrap.resyncTime(getNow());
  }

  function onBlur() {
    clearHeldInputState(bootstrap);
    bootstrap.resyncTime(getNow());
  }

  function onFocus() {
    bootstrap.resyncTime(getNow());
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

/**
 * Bootstrap the browser-facing ECS runtime.
 *
 * @param {{
 *   documentRef?: Document | null,
 *   logger?: Console,
 *   loadMapForLevel?: Function,
 *   nowProvider?: Function,
 *   windowRef?: Window | null,
 * }} [options] - Optional DOM, timing, and map-loading overrides for tests.
 * @returns {Promise<{ controls: object, start: Function, stop: Function } | null>} Running runtime or null without a document.
 */
export async function bootstrapApplication({
  documentRef,
  logger = console,
  loadMapForLevel,
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
  let inputAdapter = null;

  try {
    // Browser input is captured at the app boundary and injected as a resource
    // so simulation systems stay DOM-free.
    inputAdapter = createInputAdapter({
      documentTarget: targetDocument,
      eventTarget: targetWindow,
      windowTarget: targetWindow,
    });

    const resolvedLoadMapForLevel =
      loadMapForLevel ||
      createSyncMapLoader(
        await loadDefaultMaps({
          fetchImpl: targetWindow?.fetch?.bind(targetWindow) || globalThis.fetch?.bind(globalThis),
        }),
      );
    const bootstrap = createBootstrap({
      loadMapForLevel: resolvedLoadMapForLevel,
      now: getNow(),
    });
    bootstrap.world.setResource('inputAdapter', inputAdapter);

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
    if (inputAdapter && typeof inputAdapter.destroy === 'function') {
      inputAdapter.destroy();
    }
    logger.error('World initialization failed.', error);
    renderCriticalError(overlayRoot, error);
    throw error;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void bootstrapApplication();
}
