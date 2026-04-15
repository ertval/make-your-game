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
  const appRoot = {};
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
  it('bootstraps through explicit entrypoint and exposes runtime hooks on window', () => {
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    const runtime = bootstrapApplication({
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

  it('clears held input through the input adapter boundary when blur occurs', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const inputAdapter = {
      clearHeldKeys: vi.fn(),
      heldKeys: new Set(['left']),
    };
    const documentStub = createDocumentStub();
    const windowStub = createWindowStub();

    bootstrap.world.setResource('inputAdapter', inputAdapter);

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
});
