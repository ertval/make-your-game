/**
 * Unit tests for bootstrap input-adapter registration.
 *
 * These checks pin the bootstrap-level contract for adapter resource keys,
 * validation, replacement, and explicit clearing so regressions fail close to
 * the registration site instead of cascading into runtime integration tests.
 */

import { describe, expect, it, vi } from 'vitest';

import { createBootstrap } from '../../../src/game/bootstrap.js';

function createAdapterStub({ heldKeys = ['left'], pressedKeys = [] } = {}) {
  const heldKeySet = new Set(heldKeys);
  const pressedKeySet = new Set(pressedKeys);

  return {
    clearHeldKeys: vi.fn(() => {
      heldKeySet.clear();
      pressedKeySet.clear();
    }),
    destroy: vi.fn(),
    drainPressedKeys: vi.fn(() => {
      const drainedKeys = new Set(pressedKeySet);
      pressedKeySet.clear();
      return drainedKeys;
    }),
    getHeldKeys: vi.fn(() => heldKeySet),
    heldKeys: heldKeySet,
  };
}

describe('bootstrap input-adapter registration', () => {
  it('pre-registers the default input adapter slot as null', () => {
    const bootstrap = createBootstrap({ now: 0 });

    // Pre-registration means "resource exists but is null", distinct from
    // "resource has never been set" so adapter consumers never race bootstrap.
    expect(bootstrap.world.hasResource('inputAdapter')).toBe(true);
    expect(bootstrap.world.getResource('inputAdapter')).toBeNull();
    expect(bootstrap.getInputAdapter()).toBeNull();
  });

  it('pre-registers the adapter slot under a custom resource key', () => {
    const bootstrap = createBootstrap({
      inputAdapterResourceKey: 'customInputAdapter',
      now: 0,
    });

    expect(bootstrap.world.hasResource('customInputAdapter')).toBe(true);
    expect(bootstrap.world.getResource('customInputAdapter')).toBeNull();
    expect(bootstrap.world.hasResource('inputAdapter')).toBe(false);
    expect(bootstrap.getInputAdapter()).toBeNull();
  });

  it('honors the legacy adapterResourceKey option for back-compat', () => {
    const bootstrap = createBootstrap({
      adapterResourceKey: 'legacyAdapterKey',
      now: 0,
    });

    expect(bootstrap.world.hasResource('legacyAdapterKey')).toBe(true);
    expect(bootstrap.world.hasResource('inputAdapter')).toBe(false);
  });

  it('stores a valid adapter through setInputAdapter and exposes it via getInputAdapter', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const adapter = createAdapterStub();

    expect(bootstrap.setInputAdapter(adapter)).toBe(adapter);
    expect(bootstrap.getInputAdapter()).toBe(adapter);
    expect(bootstrap.world.getResource('inputAdapter')).toBe(adapter);
  });

  it('clears the stored adapter when set to null or undefined and destroys it', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const firstAdapter = createAdapterStub();
    const secondAdapter = createAdapterStub({ heldKeys: ['right'] });

    bootstrap.setInputAdapter(firstAdapter);
    expect(bootstrap.getInputAdapter()).toBe(firstAdapter);

    expect(bootstrap.setInputAdapter(null)).toBeNull();
    expect(firstAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(bootstrap.getInputAdapter()).toBeNull();

    bootstrap.setInputAdapter(secondAdapter);
    expect(bootstrap.getInputAdapter()).toBe(secondAdapter);

    expect(bootstrap.setInputAdapter(undefined)).toBeNull();
    expect(secondAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(bootstrap.getInputAdapter()).toBeNull();
  });

  it('destroys the previous adapter when replacing it with a new one', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const firstAdapter = createAdapterStub({ heldKeys: ['left'] });
    const secondAdapter = createAdapterStub({ heldKeys: ['right'] });

    bootstrap.setInputAdapter(firstAdapter);
    bootstrap.setInputAdapter(secondAdapter);

    expect(firstAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(secondAdapter.destroy).not.toHaveBeenCalled();
    expect(bootstrap.getInputAdapter()).toBe(secondAdapter);
  });

  it('does not destroy the adapter when the same instance is re-registered', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const adapter = createAdapterStub();

    bootstrap.setInputAdapter(adapter);
    bootstrap.setInputAdapter(adapter);

    expect(adapter.destroy).not.toHaveBeenCalled();
    expect(bootstrap.getInputAdapter()).toBe(adapter);
  });

  it('rejects malformed adapters at registration time without clobbering the previous one', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const goodAdapter = createAdapterStub();

    bootstrap.setInputAdapter(goodAdapter);

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        destroy() {},
        drainPressedKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.getHeldKeys() must be defined');

    // Validation happens before side effects, so the previous adapter stays put.
    expect(bootstrap.getInputAdapter()).toBe(goodAdapter);
    expect(goodAdapter.destroy).not.toHaveBeenCalled();
  });

  it('rejects adapters missing each individual contract method', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        destroy() {},
        drainPressedKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.getHeldKeys() must be defined');

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        destroy() {},
        getHeldKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.drainPressedKeys() must be defined');

    expect(() => {
      bootstrap.setInputAdapter({
        destroy() {},
        drainPressedKeys() {
          return new Set();
        },
        getHeldKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.clearHeldKeys() must be defined');

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        drainPressedKeys() {
          return new Set();
        },
        getHeldKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.destroy() must be defined');
  });

  it('rejects adapters whose getters do not return Set instances', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        destroy() {},
        drainPressedKeys() {
          return new Set();
        },
        getHeldKeys() {
          return [];
        },
      });
    }).toThrow('adapter.getHeldKeys() must return a Set');

    expect(() => {
      bootstrap.setInputAdapter({
        clearHeldKeys() {},
        destroy() {},
        drainPressedKeys() {
          return [];
        },
        getHeldKeys() {
          return new Set();
        },
      });
    }).toThrow('adapter.drainPressedKeys() must return a Set');
  });

  it('exposes inputAdapterResourceKey so runtime code can consume it explicitly', () => {
    const bootstrap = createBootstrap({
      inputAdapterResourceKey: 'customInputAdapter',
      now: 0,
    });

    expect(bootstrap.inputAdapterResourceKey).toBe('customInputAdapter');
  });
});
