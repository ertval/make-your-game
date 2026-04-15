/**
 * Test: a03-game-loop.test.js
 * Purpose: Covers fixed-step game-loop behavior, including pause freeze and resume clock resynchronization.
 * Public API: N/A (test module).
 * Implementation Notes: Uses deterministic stubs for window/document/timing to assert simulation invariants.
 */

import { describe, expect, it, vi } from 'vitest';

import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../../../src/ecs/resources/constants.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { World } from '../../../src/ecs/world/world.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';
import { createGameRuntime } from '../../../src/main.ecs.js';

function createDocumentStub() {
  const listeners = new Map();

  return {
    addEventListener: (eventName, handler) => {
      listeners.set(eventName, handler);
    },
    dispatch: (eventName) => {
      const handler = listeners.get(eventName);
      if (handler) {
        handler();
      }
    },
    hidden: false,
    removeEventListener: (eventName) => {
      listeners.delete(eventName);
    },
  };
}

function createWindowStub() {
  const listeners = new Map();

  return {
    addEventListener: vi.fn((eventName, handler) => {
      listeners.set(eventName, handler);
    }),
    dispatch: (eventName, payload = {}) => {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(payload);
      }
    },
    removeEventListener: vi.fn((eventName) => {
      listeners.delete(eventName);
    }),
  };
}

function createMapResourceFixture(level = 1) {
  const rows = 3;
  const cols = 3;
  const grid2D = [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ];

  return {
    activeGhostTypes: ['blinky'],
    cols,
    ghostHouseBottomRow: 1,
    ghostHouseLeftCol: 1,
    ghostHouseRightCol: 1,
    ghostHouseTopRow: 1,
    ghostSpawnCol: 1,
    ghostSpawnRow: 1,
    grid: new Uint8Array(grid2D.flat()),
    grid2D: grid2D.map((row) => [...row]),
    initialPelletCount: 0,
    initialPowerPelletCount: 0,
    level,
    maxGhosts: 1,
    name: `fixture-level-${level}`,
    playerSpawnCol: 1,
    playerSpawnRow: 1,
    rows,
    timerSeconds: 120,
  };
}

function createBootstrapWithMaps(options = {}) {
  const { loadMapForLevel, ...bootstrapOptions } = options;

  return createBootstrap({
    ...bootstrapOptions,
    loadMapForLevel:
      loadMapForLevel ||
      ((levelIndex) => {
        return createMapResourceFixture(levelIndex + 1);
      }),
  });
}

describe('A-03 game loop and runtime', () => {
  it('treats runtime startGame as idempotent while already PLAYING', () => {
    const bootstrap = createBootstrapWithMaps({ now: 0 });
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
    const bootstrap = createBootstrapWithMaps({ now: 0 });
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
    const bootstrap = createBootstrapWithMaps({ now: 50 });
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
    const bootstrap = createBootstrapWithMaps({ now: 0 });
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
    const bootstrap = createBootstrapWithMaps({
      loadMapForLevel: (levelIndex, options) => {
        const map = createMapResourceFixture(levelIndex + 1);
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

  it('freezes simulation while paused and resumes without burst catch-up', () => {
    const bootstrap = createBootstrapWithMaps({ now: 0 });

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
    const bootstrap = createBootstrapWithMaps({ now: 0 });

    bootstrap.gameFlow.startGame();

    const largeGapStep = bootstrap.stepFrame(1_000);
    expect(largeGapStep.steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('keeps requestAnimationFrame scheduling active while simulation is paused', () => {
    const bootstrap = createBootstrapWithMaps({ now: 0 });
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
    const bootstrap = createBootstrapWithMaps({ now: 0 });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();
    let nowMs = 0;

    bootstrap.gameFlow.startGame();
    bootstrap.world.setResource('inputAdapter', {
      heldKeys: new Set(['ArrowLeft']),
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
    const bootstrap = createBootstrapWithMaps({ now: 0 });
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
    const world = new World();
    const immediateMutationErrors = [];

    const bootstrap = createBootstrapWithMaps({
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
      world,
    });

    bootstrap.gameFlow.startGame();
    bootstrap.stepFrame(FIXED_DT_MS);

    expect(immediateMutationErrors).toHaveLength(1);
    expect(immediateMutationErrors[0]).toContain('cannot be called during system dispatch');
    expect(world.getEntityCount()).toBe(1);
    expect(world.query(0b0010)).toEqual([0]);
  });
});
