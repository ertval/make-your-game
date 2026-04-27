/**
 * Integration tests for runtime-to-adapter boundaries.
 *
 * Purpose: Verifies browser I/O concerns remain contained in runtime/adapters and
 * that input/overlay side effects are exercised through adapter resources.
 * Public API: N/A (test module).
 */

import { describe, expect, it, vi } from 'vitest';

import { createBootstrap } from '../../../src/game/bootstrap.js';
import { bootstrapApplication, createGameRuntime } from '../../../src/main.ecs.js';

function createDocumentStub() {
  const listeners = new Map();
  // The DOM renderer registered by main.ecs.js calls appendChild/removeChild
  // on the appRoot once render-collect systems start emitting intents. The
  // bootstrap currently issues no real intents in this harness, but the
  // stubs are here so a future intent producer doesn't trip the test on a
  // missing DOM method.
  const appRoot = {
    appendChild() {},
    removeChild() {},
  };
  const overlayRoot = {
    setAttribute: vi.fn(),
    textContent: '',
  };

  return {
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    },
    appRoot,
    dispatch(eventName) {
      const handler = listeners.get(eventName);
      if (handler) {
        handler();
      }
    },
    getElementById(id) {
      if (id === 'app') {
        return appRoot;
      }
      if (id === 'overlay-root') {
        return overlayRoot;
      }
      return null;
    },
    querySelector() {
      return null;
    },
    hidden: false,
    overlayRoot,
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
  };
}

function createWindowStub() {
  const listeners = new Map();
  const scheduled = [];

  return {
    __scheduled: scheduled,
    addEventListener: vi.fn((eventName, handler) => {
      listeners.set(eventName, handler);
    }),
    cancelAnimationFrame: vi.fn(),
    dispatch(eventName, payload = {}) {
      const handler = listeners.get(eventName);
      if (handler) {
        handler(payload);
      }
    },
    performance: {
      now: () => 0,
    },
    removeEventListener: vi.fn((eventName) => {
      listeners.delete(eventName);
    }),
    requestAnimationFrame: vi.fn((callback) => {
      scheduled.push(callback);
      return scheduled.length;
    }),
  };
}

describe('runtime adapter boundaries', () => {
  it('pre-registers the input adapter slot and stores validated adapters through bootstrap', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const heldKeys = new Set(['left']);
    const inputAdapter = {
      clearHeldKeys: vi.fn(() => {
        heldKeys.clear();
      }),
      destroy: vi.fn(),
      drainPressedKeys: vi.fn(() => new Set()),
      getHeldKeys: vi.fn(() => heldKeys),
      heldKeys,
    };

    expect(bootstrap.world.getResource('inputAdapter')).toBeNull();

    bootstrap.setInputAdapter(inputAdapter);

    expect(bootstrap.world.getResource('inputAdapter')).toBe(inputAdapter);
    expect(bootstrap.getInputAdapter()).toBe(inputAdapter);
  });

  it('rejects malformed input adapters at bootstrap registration time', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(() => {
      bootstrap.setInputAdapter({
        heldKeys: new Set(['left']),
      });
    }).toThrow('adapter.getHeldKeys() must be defined');
  });

  it('bootstraps through explicit entrypoint and exposes runtime hooks on window', async () => {
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    windowStub.fetch = vi.fn(async () => ({
      json: async () => ({
        level: 1,
        metadata: {
          activeGhostTypes: [0, 1],
          ghostSpeed: 4.0,
          maxGhosts: 2,
          name: 'test-map',
          timerSeconds: 120,
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
      }),
      ok: true,
    }));

    const runtime = await bootstrapApplication({
      documentRef: documentStub,
      nowProvider: () => 0,
      windowRef: windowStub,
    });

    expect(runtime).toBeTruthy();
    expect(typeof runtime.start).toBe('function');
    expect(typeof windowStub.__MS_GHOSTMAN_RUNTIME__.startGame).toBe('function');
    expect(documentStub.overlayRoot.textContent).toBe('Engine bootstrap ready.');

    runtime.stop();
  });

  it('clears held input through the input adapter boundary when blur occurs', async () => {
    const bootstrap = createBootstrap({ now: 0 });
    const heldKeys = new Set(['left']);
    const inputAdapter = {
      clearHeldKeys: vi.fn(() => {
        heldKeys.clear();
      }),
      destroy: vi.fn(),
      drainPressedKeys: vi.fn(() => new Set()),
      getHeldKeys: vi.fn(() => heldKeys),
      heldKeys,
    };
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    bootstrap.setInputAdapter(inputAdapter);

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => 0,
      requestFrame: windowStub.requestAnimationFrame,
      windowRef: windowStub,
    });

    runtime.start();
    windowStub.dispatch('blur');

    expect(inputAdapter.clearHeldKeys).toHaveBeenCalledTimes(1);

    runtime.stop();
  });

  it('tears down the input adapter when the runtime stops', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const inputAdapter = {
      clearHeldKeys: vi.fn(),
      destroy: vi.fn(),
      drainPressedKeys: vi.fn(() => new Set()),
      getHeldKeys: vi.fn(() => new Set()),
    };
    bootstrap.setInputAdapter(inputAdapter);

    const runtime = createGameRuntime({
      bootstrap,
      requestFrame: vi.fn(),
    });

    runtime.stop();
    expect(inputAdapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('clears the stored adapter resource when the runtime stops', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const inputAdapter = {
      clearHeldKeys: vi.fn(),
      destroy: vi.fn(),
      drainPressedKeys: vi.fn(() => new Set()),
      getHeldKeys: vi.fn(() => new Set()),
    };
    bootstrap.setInputAdapter(inputAdapter);

    const runtime = createGameRuntime({
      bootstrap,
      requestFrame: vi.fn(),
    });

    runtime.stop();

    expect(inputAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(bootstrap.getInputAdapter()).toBeNull();
  });

  it('throws on blur when a caller bypasses bootstrap adapter registration', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    // Skip the explicit setInputAdapter contract by writing directly to the
    // world resource. This simulates a regression where new code wires the
    // adapter without going through bootstrap and should fail loudly.
    bootstrap.world.setResource('inputAdapter', {
      heldKeys: new Set(['left']),
    });

    const runtime = createGameRuntime({
      bootstrap,
      documentRef: documentStub,
      nowProvider: () => 0,
      requestFrame: windowStub.requestAnimationFrame,
      windowRef: windowStub,
    });

    runtime.start();

    expect(() => {
      windowStub.dispatch('blur');
    }).toThrow('must expose clearHeldKeys()');

    runtime.stop();
  });
});
