/**
 * Test: a03-game-loop.test.js
 * Purpose: Covers fixed-step game-loop behavior, including pause freeze and resume clock resynchronization.
 * Public API: N/A (test module).
 * Implementation Notes: Uses deterministic stubs for window/document/timing to assert simulation invariants.
 */

import { describe, expect, it, vi } from 'vitest';

import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../../../src/ecs/resources/constants.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
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

describe('A-03 game loop and runtime', () => {
  it('loads the next level when continuing from LEVEL_COMPLETE', () => {
    const loadedMaps = [];
    const bootstrap = createBootstrap({
      loadMapForLevel: (levelIndex, options) => {
        const map = {
          levelIndex,
          options,
        };
        loadedMaps.push(map);
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
    expect(loadedMaps[1].options.advance).toBe(true);
    expect(bootstrap.gameStatus.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('freezes simulation while paused and resumes without burst catch-up', () => {
    const bootstrap = createBootstrap({ now: 0 });

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
    const bootstrap = createBootstrap({ now: 0 });

    bootstrap.gameFlow.startGame();

    const largeGapStep = bootstrap.stepFrame(1_000);
    expect(largeGapStep.steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('keeps requestAnimationFrame scheduling active while simulation is paused', () => {
    const bootstrap = createBootstrap({ now: 0 });
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
    const bootstrap = createBootstrap({ now: 0 });
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
    const bootstrap = createBootstrap({ now: 0 });
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
});
