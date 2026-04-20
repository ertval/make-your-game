/**
 * Test: a03-game-loop.test.js
 * Purpose: Covers fixed-step game-loop behavior, including pause freeze and resume clock resynchronization.
 * Public API: N/A (test module).
 * Implementation Notes: Uses deterministic stubs for window/document/timing to assert simulation invariants.
 */

import { describe, expect, it, vi } from 'vitest';

import { createInputAdapter } from '../../../src/adapters/io/input-adapter.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../../../src/ecs/resources/constants.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { PLAYER_MOVE_REQUIRED_MASK } from '../../../src/ecs/systems/player-move-system.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';
import { bootstrapApplication, createGameRuntime } from '../../../src/main.ecs.js';

/**
 * Create a tiny multi-listener event target for browser-runtime integration tests.
 *
 * The runtime now installs overlapping lifecycle listeners from both the input
 * adapter and the rAF loop, so the test stubs must support more than one
 * handler per event to match real browser behavior.
 *
 * @returns {{ add: Function, dispatch: Function, remove: Function }} Listener registry helpers.
 */
function createListenerTarget() {
  const listeners = new Map();

  return {
    add(eventName, handler) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, []);
      }

      listeners.get(eventName).push(handler);
    },
    dispatch(eventName, payload = {}) {
      const handlers = listeners.get(eventName) || [];
      for (const handler of handlers) {
        handler(payload);
      }
    },
    remove(eventName, handler) {
      const handlers = listeners.get(eventName) || [];
      listeners.set(
        eventName,
        handlers.filter((registeredHandler) => registeredHandler !== handler),
      );
    },
  };
}

/**
 * Build a minimal document stub with multi-listener event support.
 *
 * @returns {{ addEventListener: Function, dispatch: Function, hidden: boolean, removeEventListener: Function }}
 */
function createDocumentStub() {
  const listenerTarget = createListenerTarget();

  return {
    addEventListener: (eventName, handler) => {
      listenerTarget.add(eventName, handler);
    },
    dispatch: (eventName) => {
      listenerTarget.dispatch(eventName);
    },
    hidden: false,
    removeEventListener: (eventName, handler) => {
      listenerTarget.remove(eventName, handler);
    },
  };
}

/**
 * Build a minimal window stub with multi-listener event support.
 *
 * @returns {{ addEventListener: Function, dispatch: Function, removeEventListener: Function }}
 */
function createWindowStub() {
  const listenerTarget = createListenerTarget();

  return {
    addEventListener: vi.fn((eventName, handler) => {
      listenerTarget.add(eventName, handler);
    }),
    dispatch: (eventName, payload = {}) => {
      listenerTarget.dispatch(eventName, payload);
    },
    removeEventListener: vi.fn((eventName, handler) => {
      listenerTarget.remove(eventName, handler);
    }),
  };
}

/**
 * Create the document shell required by bootstrapApplication().
 *
 * @returns {{ appRoot: object, documentStub: object, overlayRoot: object }} Browser bootstrap document harness.
 */
function createBrowserDocumentStub() {
  const documentStub = createDocumentStub();
  const appRoot = {
    textContent: '',
  };
  const overlayRoot = {
    setAttribute: vi.fn(),
    textContent: '',
  };

  documentStub.getElementById = (id) => {
    if (id === 'app') {
      return appRoot;
    }

    if (id === 'overlay-root') {
      return overlayRoot;
    }

    return null;
  };

  return {
    appRoot,
    documentStub,
    overlayRoot,
  };
}

/**
 * Build a compact valid raw map for movement runtime integration tests.
 *
 * @returns {object} Raw map JSON payload accepted by createMapResource().
 */
function createMovementRawMap() {
  return {
    level: 1,
    metadata: {
      name: 'Runtime Wiring Harness',
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4.0,
      activeGhostTypes: [0, 1],
    },
    dimensions: { rows: 7, columns: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 6, 3, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 3, col: 3 },
      ghostHouse: {
        topRow: 4,
        bottomRow: 5,
        leftCol: 2,
        rightCol: 4,
      },
      ghostSpawnPoint: { row: 4, col: 3 },
    },
  };
}

/**
 * Parse the shared movement raw map into the canonical map resource shape.
 *
 * @returns {MapResource} Parsed movement map resource.
 */
function createMovementMapResource() {
  return createMapResource(createMovementRawMap());
}

describe('game loop and runtime', () => {
  it('treats runtime startGame as idempotent while already PLAYING', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    let nowMs = 100;

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => nowMs,
      requestFrame: vi.fn(() => 1),
      windowRef: windowStub,
    });

    expect(runtime.controls.startGame()).toBe(true);
    expect(bootstrap.clock.lastFrameTime).toBe(100);

    nowMs = 240;
    expect(runtime.controls.startGame()).toBe(false);
    expect(bootstrap.clock.lastFrameTime).toBe(100);
  });

  it('records latest frame time independently from sorted percentile samples', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    const scheduledFrames = [];
    const requestFrame = vi.fn((callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => 0,
      requestFrame,
      windowRef: windowStub,
    });

    bootstrap.gameFlow.startGame();
    runtime.start();

    const frameOne = scheduledFrames.shift();
    frameOne(10);
    const frameTwo = scheduledFrames.shift();
    frameTwo(26);
    const frameThree = scheduledFrames.shift();
    frameThree(44);
    const frameFour = scheduledFrames.shift();
    frameFour(61);

    const stats = windowStub.__MS_GHOSTMAN_FRAME_PROBE__.getStats();
    expect(stats.sampleCount).toBe(3);
    expect(stats.latestFrameTime).toBeCloseTo(17, 5);
    expect(stats.p95FrameTime).toBeCloseTo(17, 5);
    expect(stats.p99FrameTime).toBeCloseTo(17, 5);

    runtime.stop();
  });

  it('uses a finite nowProvider fallback when frame timestamps are invalid', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 50,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    const scheduledFrames = [];
    const nowMs = 120;

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => nowMs,
      requestFrame: vi.fn((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
      windowRef: windowStub,
    });

    bootstrap.gameFlow.startGame();
    runtime.start();

    const firstFrame = scheduledFrames.shift();
    firstFrame(Number.NaN);

    expect(bootstrap.clock.lastFrameTime).toBe(120);

    runtime.stop();
  });

  it('quarantines simulation updates after repeated frame faults within the configured budget window', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    const scheduledFrames = [];
    const logger = {
      error: vi.fn(),
    };

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      logger,
      nowProvider: () => 0,
      requestFrame: vi.fn((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
      runtimeFaultBudget: 3,
      runtimeFaultCooldownMs: 1_500,
      runtimeFaultWindowMs: 2_000,
      windowRef: windowStub,
    });

    const originalStepFrame = bootstrap.stepFrame;
    const throwingStepFrame = vi.fn(() => {
      throw new Error('simulated frame failure');
    });
    bootstrap.stepFrame = throwingStepFrame;

    try {
      bootstrap.gameFlow.startGame();
      runtime.start();

      scheduledFrames.shift()(16);
      scheduledFrames.shift()(32);
      scheduledFrames.shift()(48);

      expect(throwingStepFrame).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith('Game frame error.', expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Game runtime fault budget exceeded. Quarantining simulation updates for 1500ms.',
      );

      // During quarantine the frame still schedules, but simulation updates are skipped.
      scheduledFrames.shift()(64);
      expect(throwingStepFrame).toHaveBeenCalledTimes(3);

      // After cooldown, simulation attempts resume.
      scheduledFrames.shift()(1_700);
      expect(throwingStepFrame).toHaveBeenCalledTimes(4);
    } finally {
      bootstrap.stepFrame = originalStepFrame;
      runtime.stop();
    }
  });

  it('loads the next level when continuing from LEVEL_COMPLETE', () => {
    const loadedMaps = [];
    const bootstrap = createBootstrap({
      loadMapForLevel: (levelIndex, options) => {
        const map = createMovementMapResource();
        loadedMaps.push(map);
        map.options = options;
        map.levelIndex = levelIndex;
        return map;
      },
      now: 0,
    });

    expect(bootstrap.gameFlow.startGame({ levelIndex: 0 })).toBe(true);
    expect(bootstrap.levelLoader.getCurrentLevelIndex()).toBe(0);
    expect(bootstrap.gameFlow.setState(GAME_STATE.LEVEL_COMPLETE)).toBe(true);

    expect(bootstrap.gameFlow.startGame()).toBe(true);
    expect(bootstrap.levelLoader.getCurrentLevelIndex()).toBe(1);
    expect(loadedMaps).toHaveLength(2);
    expect(loadedMaps[1].levelIndex).toBe(1);
    expect(loadedMaps[1].options.reason).toBe('level-complete');
    expect(bootstrap.gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('registers the default movement systems and spawns a player entity when a level loads', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });

    expect(bootstrap.world.systemsByPhase.get('input').map((entry) => entry.system.name)).toContain(
      'input-system',
    );
    expect(
      bootstrap.world.systemsByPhase.get('physics').map((entry) => entry.system.name),
    ).toContain('player-move-system');

    expect(bootstrap.gameFlow.startGame({ levelIndex: 0 })).toBe(true);

    const playerHandle = bootstrap.world.getResource('playerEntity');
    const positionStore = bootstrap.world.getResource('position');

    expect(bootstrap.world.entityStore.isAlive(playerHandle)).toBe(true);
    expect(bootstrap.world.query(PLAYER_MOVE_REQUIRED_MASK)).toEqual([playerHandle.id]);
    expect(positionStore.row[playerHandle.id]).toBe(3);
    expect(positionStore.col[playerHandle.id]).toBe(3);
    expect(positionStore.targetRow[playerHandle.id]).toBe(3);
    expect(positionStore.targetCol[playerHandle.id]).toBe(3);
  });

  it('moves the runtime player after startGame when held input is provided through the adapter resource', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const heldKeys = new Set(['right']);
    const adapter = {
      drainPressedKeys: () => new Set(),
      clearHeldKeys() {
        heldKeys.clear();
      },
      destroy() {},
      getHeldKeys() {
        return heldKeys;
      },
      heldKeys,
    };

    bootstrap.setInputAdapter(adapter);

    expect(bootstrap.gameFlow.startGame({ levelIndex: 0 })).toBe(true);

    const playerHandle = bootstrap.world.getResource('playerEntity');
    const inputState = bootstrap.world.getResource('inputState');
    const positionStore = bootstrap.world.getResource('position');

    bootstrap.stepFrame(FIXED_DT_MS);

    expect(inputState.right[playerHandle.id]).toBe(1);
    expect(positionStore.row[playerHandle.id]).toBe(3);
    expect(positionStore.col[playerHandle.id]).toBeGreaterThan(3);
    expect(positionStore.col[playerHandle.id]).toBeLessThan(4);
  });

  it('runs the default bootstrap movement pipeline from adapter input through one fixed step', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    const inputAdapter = createInputAdapter({
      documentTarget: documentStub,
      eventTarget: windowStub,
      windowTarget: windowStub,
    });

    bootstrap.setInputAdapter(inputAdapter);

    expect(bootstrap.gameFlow.startGame({ levelIndex: 0 })).toBe(true);

    const playerHandle = bootstrap.world.getResource('playerEntity');
    const inputState = bootstrap.world.getResource('inputState');
    const positionStore = bootstrap.world.getResource('position');

    expect(inputState.right[playerHandle.id]).toBe(0);
    expect(positionStore.col[playerHandle.id]).toBe(3);

    windowStub.dispatch('keydown', {
      code: 'ArrowRight',
      preventDefault: vi.fn(),
      repeat: false,
    });

    const frameResult = bootstrap.stepFrame(FIXED_DT_MS);

    expect(frameResult.steps).toBe(1);
    expect(inputState.right[playerHandle.id]).toBe(1);
    expect(positionStore.row[playerHandle.id]).toBe(3);
    expect(positionStore.col[playerHandle.id]).toBeGreaterThan(3);
    expect(positionStore.col[playerHandle.id]).toBeLessThan(4);

    inputAdapter.destroy();
  });

  it('respawns the player entity at the map spawn when the level restarts', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const heldKeys = new Set(['right']);
    const adapter = {
      drainPressedKeys: () => new Set(),
      clearHeldKeys() {
        heldKeys.clear();
      },
      destroy() {},
      getHeldKeys() {
        return heldKeys;
      },
      heldKeys,
    };

    bootstrap.setInputAdapter(adapter);

    expect(bootstrap.gameFlow.startGame({ levelIndex: 0 })).toBe(true);

    const firstPlayerHandle = bootstrap.world.getResource('playerEntity');
    const positionStore = bootstrap.world.getResource('position');

    bootstrap.stepFrame(FIXED_DT_MS);
    expect(positionStore.col[firstPlayerHandle.id]).toBeGreaterThan(3);

    expect(bootstrap.gameFlow.restartLevel()).toBe(true);

    const restartedPlayerHandle = bootstrap.world.getResource('playerEntity');

    expect(bootstrap.world.entityStore.isAlive(restartedPlayerHandle)).toBe(true);
    expect(positionStore.row[restartedPlayerHandle.id]).toBe(3);
    expect(positionStore.col[restartedPlayerHandle.id]).toBe(3);
    expect(positionStore.targetRow[restartedPlayerHandle.id]).toBe(3);
    expect(positionStore.targetCol[restartedPlayerHandle.id]).toBe(3);
  });

  it('freezes simulation while paused and resumes without burst catch-up', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });

    bootstrap.gameFlow.startGame();
    const firstStep = bootstrap.stepFrame(FIXED_DT_MS);
    expect(firstStep.steps).toBe(1);

    const frameBeforePause = bootstrap.world.frame;
    const simBeforePause = bootstrap.clock.simTimeMs;

    expect(bootstrap.gameFlow.pauseGame()).toBe(true);

    const pausedStepOne = bootstrap.stepFrame(2_000);
    const pausedStepTwo = bootstrap.stepFrame(2_500);

    expect(pausedStepOne.steps).toBe(0);
    expect(pausedStepTwo.steps).toBe(0);
    expect(bootstrap.world.frame).toBe(frameBeforePause);
    expect(bootstrap.clock.simTimeMs).toBe(simBeforePause);

    expect(bootstrap.gameFlow.resumeGame()).toBe(true);
    bootstrap.resyncTime(3_000);

    const resumedStep = bootstrap.stepFrame(3_000 + FIXED_DT_MS * 2);
    expect(resumedStep.steps).toBe(2);
    expect(bootstrap.world.frame).toBe(frameBeforePause + 2);
  });

  it('clamps catch-up work per frame to prevent spiral-of-death bursts', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });

    bootstrap.gameFlow.startGame();

    const largeGapStep = bootstrap.stepFrame(1_000);
    expect(largeGapStep.steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('keeps requestAnimationFrame scheduling active while simulation is paused', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const scheduledFrames = [];
    const requestFrame = vi.fn((callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const cancelFrame = vi.fn();
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    bootstrap.gameFlow.startGame();
    bootstrap.gameFlow.pauseGame();

    const runtime = createGameRuntime({
      bootstrap,
      cancelFrame,
      documentRef: documentStub,
      nowProvider: () => 0,
      requestFrame,
      windowRef: windowStub,
    });

    runtime.start();

    expect(requestFrame).toHaveBeenCalledTimes(1);

    const firstAnimationCallback = scheduledFrames.shift();
    firstAnimationCallback(16);

    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(bootstrap.world.frame).toBe(0);
    expect(bootstrap.clock.simTimeMs).toBe(0);

    runtime.stop();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
  });

  it('resynchronizes baseline timing on blur, focus, and visibility restore', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    let nowMs = 0;

    bootstrap.gameFlow.startGame();
    const heldKeys = new Set(['ArrowLeft']);
    bootstrap.setInputAdapter({
      clearHeldKeys() {
        heldKeys.clear();
      },
      destroy() {},
      drainPressedKeys() {
        return new Set();
      },
      getHeldKeys() {
        return heldKeys;
      },
      heldKeys,
    });

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => nowMs,
      requestFrame: vi.fn(() => 1),
      windowRef: windowStub,
    });

    runtime.start();

    nowMs = 120;
    windowStub.dispatch('blur');
    expect(bootstrap.world.getResource('inputAdapter').heldKeys.size).toBe(0);
    expect(bootstrap.clock.lastFrameTime).toBe(120);

    nowMs = 240;
    windowStub.dispatch('focus');
    expect(bootstrap.clock.lastFrameTime).toBe(240);

    bootstrap.world.getResource('inputAdapter').heldKeys.add('ArrowRight');
    documentStub.hidden = true;
    documentStub.dispatch('visibilitychange');
    expect(bootstrap.world.getResource('inputAdapter').heldKeys.size).toBe(0);

    nowMs = 360;
    documentStub.hidden = false;
    documentStub.dispatch('visibilitychange');
    expect(bootstrap.clock.lastFrameTime).toBe(360);

    runtime.stop();
  });

  it('prevents large catch-up bursts after blur by resetting the timing baseline', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
    });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    const scheduledFrames = [];
    let nowMs = 0;

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => nowMs,
      requestFrame: vi.fn((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
      windowRef: windowStub,
    });

    bootstrap.gameFlow.startGame();
    runtime.start();

    const initialFrame = scheduledFrames.shift();
    initialFrame(20);

    const frameBeforeGap = bootstrap.world.frame;

    nowMs = 10_000;
    windowStub.dispatch('blur');

    const postBlurFrame = scheduledFrames.shift();
    postBlurFrame(10_000 + FIXED_DT_MS * 2);

    expect(bootstrap.world.frame - frameBeforeGap).toBe(2);
    expect(bootstrap.world.frame - frameBeforeGap).toBeLessThan(MAX_STEPS_PER_FRAME);

    runtime.stop();
  });

  it('enforces dispatch mutation discipline and preserves deferred structural mutation path', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createMovementMapResource(),
      now: 0,
      systemsByPhase: {
        logic: [
          {
            name: 'dispatch-mutation-discipline',
            phase: 'logic',
            update: (context) => {
              expect(context.world.createEntity).toBeUndefined();

              try {
                world.createEntity(0b0001);
              } catch (error) {
                immediateMutationErrors.push(error.message);
              }

              context.world.deferCreateEntity(0b0010);
            },
          },
        ],
      },
    });

    const world = bootstrap.world;
    const immediateMutationErrors = [];

    bootstrap.gameFlow.startGame();
    bootstrap.stepFrame(FIXED_DT_MS);

    expect(immediateMutationErrors).toHaveLength(1);
    expect(immediateMutationErrors[0]).toContain('cannot be called during system dispatch');
    expect(world.getEntityCount()).toBe(2); // bootstrap player + deferred entity
    expect(world.query(0b0010)).toEqual([0, 1]);
  });

  it('preloads the shipped maps and starts the browser runtime with an injected input adapter', async () => {
    const { documentStub, overlayRoot } = createBrowserDocumentStub();
    const requestedUrls = [];
    const windowStub = createWindowStub();

    windowStub.fetch = vi.fn(async (url) => {
      requestedUrls.push(url);
      return {
        json: async () => structuredClone(createMovementRawMap()),
        ok: true,
        status: 200,
      };
    });
    windowStub.performance = {
      now: () => 0,
    };
    windowStub.requestAnimationFrame = vi.fn(() => 1);
    windowStub.cancelAnimationFrame = vi.fn();

    const runtime = await bootstrapApplication({
      documentRef: documentStub,
      logger: {
        error: vi.fn(),
      },
      windowRef: windowStub,
    });

    expect(runtime).not.toBeNull();
    expect(requestedUrls).toEqual([
      '/assets/maps/level-1.json',
      '/assets/maps/level-2.json',
      '/assets/maps/level-3.json',
    ]);
    expect(windowStub.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(overlayRoot.textContent).toBe('Engine bootstrap ready.');

    runtime.stop();
  });
});
