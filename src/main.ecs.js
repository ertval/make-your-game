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
 * Architecture Note:
 *   - This file (main.ecs.js) contains pure bootstrap logic and engine functions.
 *   - It intentionally does NOT execute any side effects upon import.
 *   - This allows unit and integration tests to import this module safely in Node/JSDOM.
 *   - The actual side-effectful execution is triggered by src/main.js, which is the
 *     entrypoint for the browser.
 *
 * Public API:
 * - bootstrapApplication(options)
 * - createGameRuntime(options)
 * - installUnhandledRejectionHandler(options)
 * - renderCriticalError(overlayRoot, error)
 * - startBrowserApplication(options)
 */

import { createDomRenderer } from './adapters/dom/renderer-dom.js';
import { createInputAdapter } from './adapters/io/input-adapter.js';
import { percentileFromSorted, toSortedNumericArray } from './debug/frame-stats.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from './ecs/resources/constants.js';
import { createMapResource } from './ecs/resources/map-resource.js';
import { createBootstrap } from './game/bootstrap.js';
import { createSyncMapLoader } from './game/level-loader.js';

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

  // The explicit adapter contract requires clearHeldKeys(); fall-through to
  // field probing would hide a malformed adapter registration, so throw loudly.
  if (typeof adapter.clearHeldKeys !== 'function') {
    throw new Error(
      'Input adapter resource must expose clearHeldKeys(). Register it through bootstrap.setInputAdapter().',
    );
  }

  adapter.clearHeldKeys();
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
    restart: () => {
      const restarted = bootstrap.gameFlow.restartLevel();
      if (restarted) {
        bootstrap.resyncTime(normalizeNow(getNow()));
      }
      return restarted;
    },
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

    // Prefer the explicit bootstrap API so the resource slot is cleared and any
    // previously-registered adapter is destroyed through one code path.
    if (typeof bootstrap.setInputAdapter === 'function') {
      bootstrap.setInputAdapter(null);
    } else {
      const adapter = bootstrap.getInputAdapter();
      if (adapter && typeof adapter.destroy === 'function') {
        adapter.destroy();
      }
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

  const renderer = createDomRenderer({ appRoot });

  const hudElements = {
    score: targetDocument.getElementById('hud-score'),
    level: targetDocument.getElementById('hud-level'),
    lives: targetDocument.getElementById('hud-lives'),
  };

  let isDev = false;
  try {
    isDev = process.env.NODE_ENV === 'development';
  } catch {}

  if (isDev) {
    for (const [name, el] of Object.entries(hudElements)) {
      if (!el) logger.warn(`HUD element "#hud-${name}" not found.`);
    }
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
    bootstrap.registerRenderer(renderer);
    // Register through the explicit bootstrap API so the adapter contract is
    // validated at injection time and teardown on stop is symmetric.
    bootstrap.setInputAdapter(inputAdapter);

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

export const startBrowserApplication = bootstrapApplication;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void bootstrapApplication();
}
