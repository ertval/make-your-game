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

import { createHudAdapter } from './adapters/dom/hud-adapter.js';
import { createScreensAdapter } from './adapters/dom/screens-adapter.js';
import { createAudioAdapter } from './adapters/io/audio-adapter.js';
import { createInputAdapter } from './adapters/io/input-adapter.js';
import { getHighScore, saveHighScore } from './adapters/io/storage-adapter.js';
import { percentileFromSorted, toSortedNumericArray } from './debug/frame-stats.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME, TOTAL_LEVELS } from './ecs/resources/constants.js';
import { createMapResource } from './ecs/resources/map-resource.js';
import { createBootstrap } from './game/bootstrap.js';
import { createSyncMapLoader } from './game/level-loader.js';
import { isDevelopment } from './shared/env.js';

const DEFAULT_FRAME_SAMPLE_SIZE = 600;
// Discard the first ~30 frames (~500ms at 60 FPS) from the percentile sample.
// During boot the browser does one-time work that never repeats: first paint,
// JIT compilation of hot loops, asset decode, GPU warmup. Those frames are
// reliably 20-30ms long and dominate the slow tail of the p95 distribution,
// so without a warmup window p95 reflects boot-state, not steady-state — and
// the F-17/F-18 audits effectively ask "did boot happen instantly?" instead
// of "is the game holding 60 FPS?". Skipping warmup frames lets the
// percentiles measure what AGENTS.md actually means by sustained 60 FPS.
const DEFAULT_FRAME_PROBE_WARMUP_FRAMES = 30;
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

function createFrameProbe(
  sampleSize = DEFAULT_FRAME_SAMPLE_SIZE,
  warmupFrames = DEFAULT_FRAME_PROBE_WARMUP_FRAMES,
) {
  const deltas = new Float64Array(sampleSize);
  let count = 0;
  let cursor = 0;
  let lastTimestamp = 0;
  let latestDelta = 0;
  // Frames remaining in the warmup window. Each valid frame delta consumes one
  // warmup slot before deltas start accumulating into the sample buffer.
  let warmupRemaining = Math.max(0, Math.floor(warmupFrames));

  function recordFrame(nowMs) {
    if (!Number.isFinite(nowMs)) {
      return;
    }

    if (lastTimestamp > 0) {
      latestDelta = nowMs - lastTimestamp;
      if (warmupRemaining > 0) {
        warmupRemaining -= 1;
      } else {
        deltas[cursor] = latestDelta;
        cursor = (cursor + 1) % sampleSize;
        if (count < sampleSize) {
          count += 1;
        }
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
/**
 * Upper bound on a single level map JSON in bytes. A reasonable bomberman map
 * (15×11 grid + metadata) fits well under 50KB even with verbose formatting;
 * 500KB is a generous cap that still rejects pathological or hostile payloads
 * before parsing (SEC-11).
 */
const MAX_MAP_SIZE_BYTES = 500 * 1024;

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

        // SEC-11: reject oversized map payloads before invoking JSON.parse,
        // since parsing untrusted JSON is O(size) in both time and memory.
        const contentLengthHeader = response.headers?.get?.('Content-Length');
        if (contentLengthHeader) {
          const contentLength = Number.parseInt(contentLengthHeader, 10);
          if (Number.isFinite(contentLength) && contentLength > MAX_MAP_SIZE_BYTES) {
            throw new Error(
              `Map asset for level ${levelNumber} exceeds the ${MAX_MAP_SIZE_BYTES}-byte limit ` +
                `(reported ${contentLength} bytes).`,
            );
          }
        }

        const rawMap = await response.json();
        return createMapResource(rawMap);
      })(),
    );
  }

  return Promise.all(preloadTasks);
}

/**
 * Build the audio adapter clip manifest from the shipped audio-manifest.json.
 *
 * The manifest file is the C-08/C-10 asset list (`{ assets: [{ id, path,
 * category }] }`); the adapter's loadClips expects it grouped by category as
 * `{ sfx: { id: url }, music: {...}, ui: {...} }`. Ambience is folded into the
 * music store because the adapter only owns sfx/music/ui buffer maps.
 *
 * @param {{ fetchImpl?: Function, logger?: Console }} [options]
 * @returns {Promise<{ sfx: object, music: object, ui: object }>} Grouped clip manifest.
 */
async function loadAudioClipManifest({ fetchImpl, logger = console } = {}) {
  const grouped = { sfx: {}, music: {}, ui: {} };
  if (typeof fetchImpl !== 'function') {
    return grouped;
  }

  try {
    const response = await fetchImpl('/assets/manifests/audio-manifest.json');
    if (!response || response.ok !== true) {
      return grouped;
    }

    const manifest = await response.json();
    const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    for (const asset of assets) {
      if (!asset || typeof asset.id !== 'string' || typeof asset.path !== 'string') {
        continue;
      }
      const bucket =
        asset.category === 'music' || asset.category === 'ambience'
          ? grouped.music
          : asset.category === 'ui'
            ? grouped.ui
            : grouped.sfx;
      bucket[asset.id] = asset.path.startsWith('/') ? asset.path : `/${asset.path}`;
    }
  } catch (error) {
    logger.warn('Audio manifest load failed; continuing without preloaded clips.', error);
  }

  return grouped;
}

export function renderCriticalError(overlayRoot, error) {
  if (!overlayRoot) {
    return;
  }

  const nextMessage = `Critical error: ${toMessage(error)}`;
  const errorElement = overlayRoot.querySelector?.('#overlay-error') || overlayRoot;

  errorElement.setAttribute?.('aria-live', 'assertive');
  errorElement.setAttribute?.('role', 'alert');
  errorElement.classList?.remove('is-screen-hidden');

  const previous = String(errorElement.textContent || '').trim();
  // Keep one plain-text line per error so multiple faults remain readable without unsafe HTML sinks.
  errorElement.textContent =
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
  frameProbeWarmupFrames = DEFAULT_FRAME_PROBE_WARMUP_FRAMES,
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
  const frameProbe = createFrameProbe(DEFAULT_FRAME_SAMPLE_SIZE, frameProbeWarmupFrames);

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
      return bootstrap.gameFlow.restartLevel();
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

    // Release the AudioContext through the same explicit-slot path on stop.
    if (typeof bootstrap.setAudioAdapter === 'function') {
      bootstrap.setAudioAdapter(null);
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
  const boardContainerElement = targetDocument.getElementById('game-board');

  if (!appRoot) {
    throw new Error('Missing #app root.');
  }

  // DEAD-01: render-dom-system (run during runRenderCommit) is the canonical
  // DOM commit path. The legacy createDomRenderer remains available for non-ECS
  // tooling (map preview, debug views) but is intentionally NOT registered with
  // the bootstrap step loop — registering it would cause double DOM writes per
  // frame and bypass the sprite pool.

  const hudSection = targetDocument.getElementById('hud');
  const hudAdapter = hudSection ? createHudAdapter(hudSection) : null;

  const hudElements = {
    timer: targetDocument.querySelector('[data-hud="timer"]'),
    score: targetDocument.querySelector('[data-hud="score"]'),
    lives: targetDocument.querySelector('[data-hud="lives"]'),
  };

  if (isDevelopment()) {
    for (const [name, el] of Object.entries(hudElements)) {
      if (!el) logger.warn(`HUD element "[data-hud="${name}"]" not found.`);
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
      boardContainerElement,
      // Thread the resolved now-source through so onRestart resyncs stay on
      // the same clock as the rAF loop (deterministic for tests).
      nowProvider: getNow,
      hudElements,
    });
    // Register through the explicit bootstrap API so the adapter contract is
    // validated at injection time and teardown on stop is symmetric.
    bootstrap.setInputAdapter(inputAdapter);

    // UI confirm feedback. Menu/overlay button confirmations are not part of
    // the deterministic simulation, so they play straight through the audio
    // adapter resource (resolved lazily so it works once the adapter is wired
    // below) rather than the gameplay event queue. Resolved via the bootstrap
    // accessor, not a module import, so the adapter resource contract holds.
    const playUiConfirm = () => {
      bootstrap.getAudioAdapter()?.playSfx('ui-confirm');
    };

    // Create and register the screens adapter with game-flow callbacks.
    const screensAdapter =
      overlayRoot && typeof overlayRoot.querySelector === 'function'
        ? createScreensAdapter(overlayRoot, {
            gameplayElement: boardContainerElement,
            onAction(action) {
              // The screens adapter calls onAction for every confirmed action
              // (start, play-again, level-next, AND pause-continue /
              // pause-restart) before delegating to onResume/onRestart, so the
              // confirm cue lives here only — playing it again in onResume /
              // onRestart would double-trigger it.
              playUiConfirm();
              switch (action) {
                case 'start-primary':
                case 'gameover-play-again':
                case 'victory-play-again':
                  bootstrap.gameFlow.startGame({ levelIndex: 0 });
                  break;
                case 'level-next':
                  bootstrap.gameFlow.startGame();
                  break;
                default:
                  break;
              }
              overlayRoot.querySelectorAll('.screen-overlay.is-screen-visible').forEach((el) => {
                el.classList.remove('is-screen-visible');
                el.classList.add('is-screen-hidden');
              });
            },
            onResume() {
              bootstrap.gameFlow.resumeGame();
            },
            onRestart() {
              bootstrap.gameFlow.restartLevel();
            },
          })
        : null;

    bootstrap.setHudAdapter(hudAdapter);
    bootstrap.setScreensAdapter(screensAdapter);
    bootstrap.setStorageProvider({
      saveHighScore,
      getHighScore,
    });

    // Construct the Web Audio boundary at the app edge and register it as the
    // 'audio' world resource so the render-phase cue system can drive it. Init
    // failures are non-fatal: the slot stays null and the game loop runs silent.
    try {
      const audioFetch =
        targetWindow?.fetch?.bind(targetWindow) || globalThis.fetch?.bind(globalThis);
      const audioAdapter = createAudioAdapter({
        windowTarget: targetWindow,
        documentTarget: targetDocument,
        // Lets the adapter resume immediately when the player already pressed
        // Enter / clicked to start during the async bootstrap, instead of
        // requiring a second click for audio.
        navigatorTarget: targetWindow?.navigator ?? null,
      });
      // Conservative default mix (hearing safety + clipping headroom). The
      // adapter defaults every category to full gain (1.0), so overlapping SFX
      // plus music would stack toward 0 dBFS and clip/blast. Master < 1 leaves
      // headroom for simultaneous cues; music sits under the SFX so gameplay
      // feedback stays audible without being painful. Honored once the gain
      // nodes are created even though set before the AudioContext exists.
      audioAdapter.setVolume('master', 0.8);
      audioAdapter.setVolume('music', 0.4);
      audioAdapter.setVolume('sfx', 0.7);
      audioAdapter.setVolume('ui', 0.6);
      bootstrap.setAudioAdapter(audioAdapter);
      // Fire-and-forget decode so startup is never blocked on audio (C-09 intent).
      loadAudioClipManifest({ fetchImpl: audioFetch, logger }).then((clipManifest) => {
        audioAdapter.loadClips(clipManifest).catch((error) => {
          logger.warn('Audio clip preload failed.', error);
        });
      });
    } catch (error) {
      logger.warn('Audio initialization failed; continuing without sound.', error);
    }

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
