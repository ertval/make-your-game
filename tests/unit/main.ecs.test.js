import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  beforeEach(() => {
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

      // Wait for frame
      await new Promise((r) => setTimeout(r, 10));

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('fault budget exceeded'));
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
  });

  describe('bootstrapApplication - More Errors', () => {
    it('throws if fetch response is not ok', async () => {
      mockWindow.fetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(
        bootstrapApplication({ documentRef: mockDocument, windowRef: mockWindow }),
      ).rejects.toThrow('status: 404');
    });

    it('throws if fetch response is missing', async () => {
      mockWindow.fetch.mockResolvedValue(null);
      await expect(
        bootstrapApplication({ documentRef: mockDocument, windowRef: mockWindow }),
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
    });

    it('warns about missing HUD elements in development mode', async () => {
      vi.mocked(isDevelopment).mockReturnValue(true);

      const logger = { warn: vi.fn(), error: vi.fn() };
      // One HUD element missing
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '[data-hud="timer"]') return null;
        return {};
      });

      await bootstrapApplication({ documentRef: mockDocument, windowRef: mockWindow, logger });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HUD element "[data-hud="timer"]" not found.'),
      );
    });
  });
});
