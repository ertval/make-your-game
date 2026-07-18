import { describe, expect, it, vi } from 'vitest';
import {
  assertDomElementBudget,
  createGameRuntime,
  installUnhandledRejectionHandler,
  renderCriticalError,
} from '../../src/main.ecs.js';

// Access internal createFrameProbe by extracting it via createGameRuntime's setup
// or we can test it through createGameRuntime's window hook if window is stubbed.
// Wait, createGameRuntime does:
//   if (targetWindow) {
//     targetWindow[FRAME_PROBE_KEY] = { getStats: frameProbe.getStats };
//   }
// Let's test it by stubbing the dependencies of createGameRuntime.

describe('main.ecs.js createFrameProbe & helpers', () => {
  it('createFrameProbe tracks contiguous slow frames and memory accumulation', () => {
    const windowStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      performance: {
        now: vi.fn().mockReturnValue(0),
        memory: {
          usedJSHeapSize: 10_000_000,
        },
      },
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
      stepFrame: vi.fn(),
      getInputAdapter: () => null,
      setInputAdapter: () => null,
    };

    let frameCallback = null;
    const requestFrame = (cb) => {
      frameCallback = cb;
      return 1;
    };
    const cancelFrame = vi.fn();

    const runtime = createGameRuntime({
      bootstrap: bootstrapStub,
      cancelFrame,
      documentRef: documentStub,
      frameProbeWarmupFrames: 2, // 2 warmup frames
      logger: { error: vi.fn(), warn: vi.fn() },
      nowProvider: windowStub.performance.now,
      requestFrame,
      windowRef: windowStub,
    });

    runtime.start();

    // Check targetWindow configuration hooks
    const probe = windowStub.__MS_GHOSTMAN_FRAME_PROBE__;
    expect(probe).toBeDefined();

    // Warmup frame 1: delta doesn't exist yet (lastTimestamp not set)
    frameCallback(1000);
    expect(probe.getStats().sampleCount).toBe(0);

    // Warmup frame 2: consumed as a warmup slot (warmupRemaining 2 -> 1)
    frameCallback(1016);
    expect(probe.getStats().sampleCount).toBe(0);

    // Warmup frame 3: consumed as a warmup slot (warmupRemaining 1 -> 0)
    frameCallback(1032);
    expect(probe.getStats().sampleCount).toBe(0);

    // Post-warmup frame 1 (gets recorded, initial memory set to 10MB)
    windowStub.performance.memory.usedJSHeapSize = 10_000_000;
    frameCallback(1048); // delta = 16
    expect(probe.getStats().sampleCount).toBe(1);
    expect(probe.getStats().memoryAccumulationBytes).toBe(0);

    // Post-warmup frame 2 (gets recorded, memory increases by 500KB)
    windowStub.performance.memory.usedJSHeapSize = 10_500_000;
    frameCallback(1078); // delta = 30 (slow frame > 16.7ms)
    expect(probe.getStats().sampleCount).toBe(2);
    expect(probe.getStats().memoryAccumulationBytes).toBe(500_000);
    expect(probe.getStats({ slowFrameThresholdMs: 16.7 }).maxContiguousSlowDurationMs).toBe(30);

    // Post-warmup frame 3 (gets recorded, delta = 40 (slow frame > 16.7ms))
    windowStub.performance.memory.usedJSHeapSize = 11_200_000;
    frameCallback(1118); // delta = 40
    expect(probe.getStats().sampleCount).toBe(3);
    expect(probe.getStats().memoryAccumulationBytes).toBe(1_200_000);
    // Two consecutive slow frames: 30 + 40 = 70 ms
    expect(probe.getStats({ slowFrameThresholdMs: 16.7 }).maxContiguousSlowDurationMs).toBe(70);

    // Post-warmup frame 4 (gets recorded, delta = 10 (fast frame))
    frameCallback(1128); // delta = 10
    // Consecutive sequence broke, max remains 70
    expect(probe.getStats({ slowFrameThresholdMs: 16.7 }).maxContiguousSlowDurationMs).toBe(70);

    // Test recordFrame with invalid inputs
    frameCallback(NaN);
    frameCallback(undefined);

    runtime.stop();
  });

  it('assertDomElementBudget checks DOM budget limits', () => {
    const mockElements = { length: 10 };
    const documentStub = {
      querySelectorAll: vi.fn().mockReturnValue(mockElements),
    };

    // Under limit passes
    expect(assertDomElementBudget({ documentRef: documentStub, limit: 15 })).toBe(10);

    // Exceeding limit throws
    expect(() => assertDomElementBudget({ documentRef: documentStub, limit: 5 })).toThrowError(
      /DOM element budget exceeded/,
    );
  });

  it('renderCriticalError formats and appends error overlay', () => {
    const errorElement = {
      classList: {
        remove: vi.fn(),
      },
      setAttribute: vi.fn(),
      textContent: '',
    };
    const overlayRoot = {
      querySelector: vi.fn().mockReturnValue(errorElement),
    };

    renderCriticalError(overlayRoot, new Error('Test crash'));
    expect(errorElement.textContent).toBe('Critical error: Test crash');
  });

  it('installUnhandledRejectionHandler avoids duplicates', () => {
    const windowStub = {
      addEventListener: vi.fn(),
    };
    installUnhandledRejectionHandler({ windowRef: windowStub });
    installUnhandledRejectionHandler({ windowRef: windowStub });
    expect(windowStub.addEventListener).toHaveBeenCalledTimes(1);
  });
});
