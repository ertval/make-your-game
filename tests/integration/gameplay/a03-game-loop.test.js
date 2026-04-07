/**
 * Test: a03-game-loop.test.js
 * Purpose: Covers fixed-step game-loop behavior, including pause freeze and resume clock resynchronization.
 * Public API: N/A (test module).
 * Implementation Notes: Uses deterministic stubs for window/document/timing to assert simulation invariants.
 */

import { describe, expect, it, vi } from 'vitest';

import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
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

describe('A-03 game loop and runtime', () => {
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

  it('keeps requestAnimationFrame scheduling active while simulation is paused', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const scheduledFrames = [];
    const requestFrame = vi.fn((callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const cancelFrame = vi.fn();
    const documentStub = createDocumentStub();
    const windowStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

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
});
