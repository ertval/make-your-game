/**
 * Test: a03-runtime-error-handling.test.js
 * Purpose: Verifies critical runtime error surfacing for unhandled promise rejections.
 * Public API: N/A (test module).
 * Implementation Notes: Uses window/logger/overlay stubs to validate handler installation and error UI output.
 */

import { describe, expect, it, vi } from 'vitest';

import { createGameRuntime, installUnhandledRejectionHandler } from '../../../src/main.ecs.js';

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
  };
}

describe('A-03 runtime critical error handling', () => {
  it('renders an overlay message for unhandled promise rejections', () => {
    const overlayRoot = {
      setAttribute: vi.fn(),
      textContent: '',
    };
    const logger = {
      error: vi.fn(),
    };
    const windowStub = createWindowStub();

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });

    const rejectionReason = new Error('boom');
    windowStub.dispatch('unhandledrejection', {
      reason: rejectionReason,
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled promise rejection in game runtime.',
      rejectionReason,
    );
    expect(overlayRoot.setAttribute).toHaveBeenCalledWith('aria-live', 'assertive');
    expect(overlayRoot.setAttribute).toHaveBeenCalledWith('role', 'alert');
    expect(overlayRoot.textContent).toBe('Critical error: boom');
  });

  it('installs only one unhandled rejection handler per window', () => {
    const overlayRoot = {
      setAttribute: vi.fn(),
      textContent: '',
    };
    const logger = {
      error: vi.fn(),
    };
    const windowStub = createWindowStub();

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });
    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });

    expect(windowStub.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('appends additional critical errors as plain-text lines for readability', () => {
    const overlayRoot = {
      setAttribute: vi.fn(),
      textContent: '',
    };
    const logger = {
      error: vi.fn(),
    };
    const windowStub = createWindowStub();

    installUnhandledRejectionHandler({
      logger,
      overlayRoot,
      windowRef: windowStub,
    });

    windowStub.dispatch('unhandledrejection', {
      reason: new Error('first'),
    });
    windowStub.dispatch('unhandledrejection', {
      reason: 'second',
    });

    expect(overlayRoot.textContent).toContain('Critical error: first');
    expect(overlayRoot.textContent).toContain('Critical error: second');
    expect(overlayRoot.textContent).toContain('\n');
  });

  it('forces quarantine and asserts p95 stays below 20 ms', () => {
    const windowStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const documentStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const clock = { lastFrameTime: 0, isPaused: false, simTimeMs: 0 };
    const bootstrapStub = {
      clock,
      world: { frame: 0 },
      gameStatus: { currentState: 'PLAYING' },
      stepFrame: vi.fn(() => {
        throw new Error('transient game crash');
      }),
      eventQueueResourceKey: 'eventQueue',
      getInputAdapter: () => null,
      setInputAdapter: () => null,
    };

    let frameCallback = null;
    const requestFrame = (cb) => {
      frameCallback = cb;
      return 1;
    };
    const cancelFrame = vi.fn();

    let currentTime = 1000;
    const nowProvider = () => currentTime;

    const runtime = createGameRuntime({
      bootstrap: bootstrapStub,
      cancelFrame,
      documentRef: documentStub,
      frameProbeWarmupFrames: 0,
      logger: { error: () => {} },
      nowProvider,
      requestFrame,
      runtimeFaultBudget: 2,
      runtimeFaultCooldownMs: 1500,
      windowRef: windowStub,
    });

    runtime.start();

    // Run first frame -> throws, budget = 1
    frameCallback(currentTime);

    // Run second frame -> throws, budget = 2 -> quarantined!
    currentTime += 16;
    frameCallback(currentTime);

    // Advance time past the 1500ms cooldown
    currentTime += 1600;
    // This frame runs out of quarantine, and under the old implementation,
    // it calculates delta from the last recorded frame (1016), resulting in ~1600ms delta!
    frameCallback(currentTime);

    // Verify stats: p95FrameTime should not include the 1600ms delta
    const probeStats = windowStub.__MS_GHOSTMAN_FRAME_PROBE__.getStats();
    expect(probeStats.p95FrameTime).toBeLessThan(20);
    expect(probeStats.p95FrameTime).toBeGreaterThan(0);
  });
});
