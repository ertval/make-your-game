import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue } from '../../src/ecs/resources/event-queue.js';
import { GAME_STATE } from '../../src/ecs/resources/game-status.js';
import { createBootstrap } from '../../src/game/bootstrap.js';
import {
  bootstrapApplication,
  createGameRuntime,
  installUnhandledRejectionHandler,
  renderCriticalError,
} from '../../src/main.ecs.js';
import { isDevelopment } from '../../src/shared/env.js';

vi.mock('../../src/shared/env.js', () => ({
  isDevelopment: vi.fn(() => false),
}));

describe('main.ecs.js', () => {
  let mockWindow;
  let mockDocument;
  let mockAppRoot;
  let mockOverlayRoot;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockAppRoot = { id: 'app', appendChild: vi.fn() };
    mockOverlayRoot = { id: 'overlay-root', setAttribute: vi.fn(), textContent: '' };

    mockDocument = {
      getElementById: vi.fn((id) => {
        if (id === 'app') return mockAppRoot;
        if (id === 'overlay-root') return mockOverlayRoot;
        return null;
      }),
      querySelector: vi.fn(() => ({})),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    mockWindow = {
      performance: { now: vi.fn(() => 100) },
      requestAnimationFrame: vi.fn((cb) => setTimeout(() => cb(200), 0)),
      cancelAnimationFrame: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      fetch: vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              level: 1,
              dimensions: { rows: 5, columns: 5 },
              grid: [
                [1, 1, 1, 1, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 5, 1],
                [1, 1, 1, 1, 1],
              ],
              spawn: {
                player: { row: 2, col: 2 },
                ghostSpawnPoint: { row: 3, col: 3 },
                ghostHouse: { topRow: 3, bottomRow: 3, leftCol: 3, rightCol: 3 },
              },
              metadata: {
                name: 'test',
                activeGhostTypes: [0],
                ghostSpeed: 1,
                maxGhosts: 1,
                timerSeconds: 60,
              },
            }),
        }),
      ),
    };
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('renderCriticalError', () => {
    it('does nothing if overlayRoot is missing', () => {
      expect(renderCriticalError(null, new Error('test'))).toBeUndefined();
    });

    it('renders error message and appends if called multiple times', () => {
      renderCriticalError(mockOverlayRoot, 'first');
      expect(mockOverlayRoot.textContent).toBe('Critical error: first');

      renderCriticalError(mockOverlayRoot, 'second');
      expect(mockOverlayRoot.textContent).toBe('Critical error: first\nCritical error: second');
    });

    it('handles non-Error objects', () => {
      renderCriticalError(mockOverlayRoot, null);
      expect(mockOverlayRoot.textContent).toBe('Critical error: Unknown error');
    });
  });

  describe('installUnhandledRejectionHandler', () => {
    it('installs handler on window', () => {
      installUnhandledRejectionHandler({ windowRef: mockWindow, overlayRoot: mockOverlayRoot });
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      );
    });

    it('avoids double installation', () => {
      installUnhandledRejectionHandler({ windowRef: mockWindow });
      installUnhandledRejectionHandler({ windowRef: mockWindow });
      expect(mockWindow.addEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('createGameRuntime', () => {
    it('throws if bootstrap is missing', () => {
      expect(() => createGameRuntime({})).toThrow('requires a bootstrap object');
    });

    it('throws if scheduleFrame is missing', () => {
      expect(() => createGameRuntime({ bootstrap: {}, windowRef: {} })).toThrow(
        'requires requestAnimationFrame',
      );
    });

    it('provides controls for game state', () => {
      const mockBootstrap = {
        world: { frame: 10 },
        clock: { isPaused: false, simTimeMs: 1000 },
        gameStatus: { currentState: 'PLAYING' },
        gameFlow: {
          pauseGame: vi.fn(),
          resumeGame: vi.fn(() => true),
          restartLevel: vi.fn(),
          setState: vi.fn(),
          startGame: vi.fn(() => true),
        },
        resyncTime: vi.fn(),
        stepFrame: vi.fn(),
      };
      const runtime = createGameRuntime({ bootstrap: mockBootstrap, windowRef: mockWindow });

      expect(runtime.controls.getSnapshot()).toEqual({
        frame: 10,
        isPaused: false,
        simTimeMs: 1000,
        state: 'PLAYING',
      });

      runtime.controls.pause();
      expect(mockBootstrap.gameFlow.pauseGame).toHaveBeenCalled();

      runtime.controls.resume();
      expect(mockBootstrap.gameFlow.resumeGame).toHaveBeenCalled();
      expect(mockBootstrap.resyncTime).toHaveBeenCalled();
    });

    it('quarantines runtime on repeated failures', async () => {
      const mockBootstrap = {
        stepFrame: vi.fn(() => {
          throw new Error('fail');
        }),
        clock: { lastFrameTime: 0 },
        getInputAdapter: vi.fn(),
      };
      const logger = { error: vi.fn() };
      const runtime = createGameRuntime({
        bootstrap: mockBootstrap,
        windowRef: mockWindow,
        logger,
        runtimeFaultBudget: 1,
        runtimeFaultCooldownMs: 1000,
      });

      runtime.start();

      // Wait for the first frame to fail and trigger quarantine
      await new Promise((r) => setTimeout(r, 10));

      // Wait another frame duration and verify that the quarantined simulation updates are skipped
      // (stepFrame is not called again during quarantine).
      await new Promise((r) => setTimeout(r, 10));

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('fault budget exceeded'));
      expect(mockBootstrap.stepFrame).toHaveBeenCalledTimes(1);
      runtime.stop();
    });

    it('does nothing when starting already running runtime', () => {
      const mockBootstrap = {
        clock: { lastFrameTime: 0 },
        setInputAdapter: vi.fn(),
        getInputAdapter: vi.fn(),
      };
      const runtime = createGameRuntime({ bootstrap: mockBootstrap, windowRef: mockWindow });
      runtime.start();

      runtime.start();
      expect(mockWindow.requestAnimationFrame).toHaveBeenCalledTimes(1);
      runtime.stop();
    });

    it('destroys adapter on stop if bootstrap.setInputAdapter is missing', () => {
      const destroy = vi.fn();
      const mockBootstrap = {
        clock: { lastFrameTime: 0 },
        getInputAdapter: vi.fn(() => ({ destroy })),
      };
      const runtime = createGameRuntime({ bootstrap: mockBootstrap, windowRef: mockWindow });
      runtime.stop();
      expect(destroy).toHaveBeenCalled();
    });

    it('handles startGame and resume returning false', () => {
      const mockBootstrap = {
        clock: { lastFrameTime: 100 },
        gameStatus: { currentState: 'IDLE' },
        gameFlow: {
          startGame: vi.fn(() => false),
          resumeGame: vi.fn(() => false),
        },
        resyncTime: vi.fn(),
        levelLoader: { getCurrentLevelIndex: () => 0 },
      };
      const runtime = createGameRuntime({ bootstrap: mockBootstrap, windowRef: mockWindow });

      expect(runtime.controls.startGame()).toBe(false);
      expect(mockBootstrap.resyncTime).not.toHaveBeenCalled();

      expect(runtime.controls.resume()).toBe(false);
      expect(mockBootstrap.resyncTime).not.toHaveBeenCalled();
    });

    it('discards warmup frames so boot-time jank does not poison percentile stats', () => {
      // Synthetic deltas: 5 slow "boot" frames (50ms each) followed by 5 steady
      // 16ms frames. Without warmup the slow frames dominate p95. With a
      // warmup window of 5 the slow frames are discarded and percentiles
      // reflect only the steady-state samples.
      const scheduledFrames = [];
      const requestFrame = vi.fn((cb) => {
        scheduledFrames.push(cb);
        return scheduledFrames.length;
      });
      const mockBootstrap = {
        clock: { lastFrameTime: 0 },
        gameStatus: { currentState: 'PLAYING' },
        gameFlow: { startGame: vi.fn(() => true), resumeGame: vi.fn(() => false) },
        resyncTime: vi.fn(),
        stepFrame: vi.fn(),
        getInputAdapter: vi.fn(),
      };
      const probeWindow = { ...mockWindow };
      const runtime = createGameRuntime({
        bootstrap: mockBootstrap,
        documentRef: mockDocument,
        frameProbeWarmupFrames: 5,
        nowProvider: () => 0,
        requestFrame,
        windowRef: probeWindow,
      });

      runtime.start();

      // The first non-zero timestamp seeds lastTimestamp without producing a
      // delta. After that, 5 slow "boot" frames (50ms apart) consume the
      // warmup window, and 5 fast "steady" frames (16ms apart) populate the
      // sample buffer.
      const timestamps = [1, 51, 101, 151, 201, 251, 267, 283, 299, 315, 331];
      for (const ts of timestamps) {
        const next = scheduledFrames.shift();
        if (next) next(ts);
      }

      const stats = probeWindow.__MS_GHOSTMAN_FRAME_PROBE__.getStats();
      expect(stats.sampleCount).toBe(5);
      expect(stats.p95FrameTime).toBeCloseTo(16, 5);
      expect(stats.p99FrameTime).toBeCloseTo(16, 5);
      expect(stats.p95Fps).toBeCloseTo(62.5, 1);

      runtime.stop();
    });

    it('drains event queue each frame through game runtime (BUG-01)', () => {
      const scheduledFrames = [];
      const requestFrame = vi.fn((cb) => {
        scheduledFrames.push(cb);
        return scheduledFrames.length;
      });

      const bootstrap = createBootstrap({ now: 0 });
      const eventQueue = bootstrap.world.getResource(bootstrap.eventQueueResourceKey);

      bootstrap.gameFlow.setState(GAME_STATE.PLAYING);
      enqueue(eventQueue, 'TestEvent', { value: 1 }, 0);

      const runtime = createGameRuntime({
        bootstrap,
        nowProvider: () => 0,
        requestFrame,
        cancelFrame: vi.fn(),
      });

      runtime.start();

      scheduledFrames.shift()(16);

      expect(eventQueue.events.length).toBe(0);

      runtime.stop();
    });
  });

  describe('bootstrapApplication - More Errors', () => {
    it('throws if fetch response is not ok', async () => {
      mockWindow.fetch.mockResolvedValue({ ok: false, status: 404 });
      const logger = { error: vi.fn() };
      await expect(
        bootstrapApplication({ documentRef: mockDocument, windowRef: mockWindow, logger }),
      ).rejects.toThrow('status: 404');
    });

    it('throws if fetch response is missing', async () => {
      mockWindow.fetch.mockResolvedValue(null);
      const logger = { error: vi.fn() };
      await expect(
        bootstrapApplication({ documentRef: mockDocument, windowRef: mockWindow, logger }),
      ).rejects.toThrow('status: unknown');
    });
  });

  describe('bootstrapApplication', () => {
    it('returns null if document is missing', async () => {
      expect(await bootstrapApplication({ documentRef: null })).toBeNull();
    });

    it('throws if #app is missing', async () => {
      mockDocument.getElementById.mockReturnValue(null);
      await expect(bootstrapApplication({ documentRef: mockDocument })).rejects.toThrow(
        'Missing #app root',
      );
    });

    it('handles initialization failure and cleans up', async () => {
      const logger = { error: vi.fn() };
      // Force failure in bootstrap
      mockWindow.fetch.mockRejectedValue(new Error('fetch fail'));

      await expect(
        bootstrapApplication({
          documentRef: mockDocument,
          windowRef: mockWindow,
          logger,
          overlayRoot: mockOverlayRoot,
        }),
      ).rejects.toThrow('fetch fail');

      expect(logger.error).toHaveBeenCalledWith('World initialization failed.', expect.any(Error));

      // Assert that input adapter listeners were cleaned up on the mock targets
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );
    });

    it('warns about missing HUD elements in development mode', async () => {
      vi.mocked(isDevelopment).mockReturnValue(true);

      const logger = { warn: vi.fn(), error: vi.fn() };
      // One HUD element missing
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '[data-hud="timer"]') return null;
        return {};
      });

      const runtime = await bootstrapApplication({
        documentRef: mockDocument,
        windowRef: mockWindow,
        logger,
      });
      try {
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('HUD element "[data-hud="timer"]" not found.'),
        );
      } finally {
        runtime?.stop();
      }
    });

    it('C-11A: restores persisted audio settings and applies them at startup', async () => {
      // Seed persisted settings (music muted, custom sfx/ui levels).
      const store = {
        'ms-ghostman.audioSettings': JSON.stringify({
          musicEnabled: false,
          sfxEnabled: true,
          musicVolume: 0.9,
          sfxVolume: 0.3,
          uiVolume: 0.5,
        }),
      };
      const originalLocalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => {
          store[key] = value;
        },
        removeItem: (key) => {
          delete store[key];
        },
      };

      // Minimal AudioContext that records the gain assigned to each category, in
      // the order the adapter creates them: master, music, sfx, ui.
      const createdGains = [];
      class MockAudioContext {
        constructor() {
          this.state = 'suspended';
          this.destination = {};
        }
        createGain() {
          const node = { gain: { value: 1 }, connect() {} };
          createdGains.push(node);
          return node;
        }
        resume() {
          this.state = 'running';
          return Promise.resolve();
        }
      }
      mockWindow.AudioContext = MockAudioContext;

      // Capture the unlock listeners so we can simulate the first gesture, which
      // is what materializes the AudioContext + gain nodes.
      const unlockHandlers = [];
      mockWindow.addEventListener = vi.fn((type, handler) => {
        if (type === 'keydown' || type === 'pointerdown') {
          unlockHandlers.push(handler);
        }
      });

      const runtime = await bootstrapApplication({
        documentRef: mockDocument,
        windowRef: mockWindow,
        logger: { warn: vi.fn(), error: vi.fn() },
      });

      try {
        // No context yet (autoplay policy): the restored settings live in the
        // adapter's volume map but no gain node exists until a gesture.
        expect(createdGains.length).toBe(0);

        // Simulate the first user gesture -> ensureContext() creates the gain
        // nodes and applies the already-restored category volumes to them.
        for (const handler of unlockHandlers) {
          handler({ type: 'keydown' });
        }

        // Gain nodes are created in CATEGORY_NAMES order: master, music, sfx, ui.
        expect(createdGains.length).toBe(4);
        const [, music, sfx, ui] = createdGains;
        expect(music.gain.value).toBe(0); // musicEnabled:false -> 0
        expect(sfx.gain.value).toBe(0.3); // sfxEnabled:true at stored volume
        expect(ui.gain.value).toBe(0.5);
      } finally {
        runtime?.stop();
        if (originalLocalStorage) {
          globalThis.localStorage = originalLocalStorage;
        } else {
          delete globalThis.localStorage;
        }
      }
    });

    it('C-06: constructs map and manifest fetch paths correctly based on root-hosted base URL', async () => {
      const originalBaseUrl = import.meta.env.BASE_URL;
      import.meta.env.BASE_URL = '/';
      let runtime;

      // Intercept the async fetch of audio-manifest.json to avoid setTimeout race conditions
      let resolveAudioFetch;
      const audioFetchPromise = new Promise((resolve) => {
        resolveAudioFetch = resolve;
      });
      mockWindow.fetch.mockImplementation((url) => {
        if (url.includes('audio-manifest.json')) {
          resolveAudioFetch(url);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              level: 1,
              dimensions: { rows: 5, columns: 5 },
              grid: [
                [1, 1, 1, 1, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 5, 1],
                [1, 1, 1, 1, 1],
              ],
              spawn: {
                player: { row: 2, col: 2 },
                ghostSpawnPoint: { row: 3, col: 3 },
                ghostHouse: { topRow: 3, bottomRow: 3, leftCol: 3, rightCol: 3 },
              },
              metadata: {
                name: 'test',
                activeGhostTypes: [0],
                ghostSpeed: 1,
                maxGhosts: 1,
                timerSeconds: 60,
              },
            }),
        });
      });

      try {
        runtime = await bootstrapApplication({
          documentRef: mockDocument,
          windowRef: mockWindow,
          logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        });

        // Map loads are synchronous during bootstrap
        expect(mockWindow.fetch).toHaveBeenCalledWith('/assets/maps/level-1.json');
        expect(mockWindow.fetch).toHaveBeenCalledWith('/assets/maps/level-2.json');
        expect(mockWindow.fetch).toHaveBeenCalledWith('/assets/maps/level-3.json');

        // Deterministically wait for the async audio manifest fetch to resolve
        const audioManifestUrl = await audioFetchPromise;
        expect(audioManifestUrl).toBe('/assets/manifests/audio-manifest.json');
      } finally {
        import.meta.env.BASE_URL = originalBaseUrl;
        runtime?.stop();
      }
    });

    it('C-06: constructs map and manifest fetch paths correctly based on sub-path base URL', async () => {
      const originalBaseUrl = import.meta.env.BASE_URL;
      import.meta.env.BASE_URL = '/make-your-game/';
      let runtime;

      // Intercept the async fetch of audio-manifest.json to avoid setTimeout race conditions
      let resolveAudioFetch;
      const audioFetchPromise = new Promise((resolve) => {
        resolveAudioFetch = resolve;
      });
      mockWindow.fetch.mockImplementation((url) => {
        if (url.includes('audio-manifest.json')) {
          resolveAudioFetch(url);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              level: 1,
              dimensions: { rows: 5, columns: 5 },
              grid: [
                [1, 1, 1, 1, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 3, 1],
                [1, 3, 3, 5, 1],
                [1, 1, 1, 1, 1],
              ],
              spawn: {
                player: { row: 2, col: 2 },
                ghostSpawnPoint: { row: 3, col: 3 },
                ghostHouse: { topRow: 3, bottomRow: 3, leftCol: 3, rightCol: 3 },
              },
              metadata: {
                name: 'test',
                activeGhostTypes: [0],
                ghostSpeed: 1,
                maxGhosts: 1,
                timerSeconds: 60,
              },
            }),
        });
      });

      try {
        runtime = await bootstrapApplication({
          documentRef: mockDocument,
          windowRef: mockWindow,
          logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        });

        // Map loads are synchronous during bootstrap
        expect(mockWindow.fetch).toHaveBeenCalledWith('/make-your-game/assets/maps/level-1.json');
        expect(mockWindow.fetch).toHaveBeenCalledWith('/make-your-game/assets/maps/level-2.json');
        expect(mockWindow.fetch).toHaveBeenCalledWith('/make-your-game/assets/maps/level-3.json');

        // Deterministically wait for the async audio manifest fetch to resolve
        const audioManifestUrl = await audioFetchPromise;
        expect(audioManifestUrl).toBe('/make-your-game/assets/manifests/audio-manifest.json');
      } finally {
        import.meta.env.BASE_URL = originalBaseUrl;
        runtime?.stop();
      }
    });
  });
});
