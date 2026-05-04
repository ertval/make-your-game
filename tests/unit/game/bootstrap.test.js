/**
 * Unit tests for bootstrap input-adapter registration.
 *
 * These checks pin the bootstrap-level contract for adapter resource keys,
 * validation, replacement, and explicit clearing so regressions fail close to
 * the registration site instead of cascading into runtime integration tests.
 */

import { describe, expect, it, vi } from 'vitest';

import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import { POOL_FIRE, POOL_MAX_BOMBS } from '../../../src/ecs/resources/constants.js';
import { GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
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

function createRuntimeRawMap() {
  return {
    level: 1,
    metadata: {
      activeGhostTypes: [0, 1],
      ghostSpeed: 4.0,
      maxGhosts: 2,
      name: 'Bomb Runtime Wiring Harness',
      timerSeconds: 120,
    },
    dimensions: { columns: 7, rows: 7 },
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
      ghostHouse: {
        bottomRow: 5,
        leftCol: 2,
        rightCol: 4,
        topRow: 4,
      },
      ghostSpawnPoint: { col: 3, row: 4 },
      player: { col: 3, row: 3 },
    },
  };
}

function createRuntimeMapResource() {
  return createMapResource(createRuntimeRawMap());
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

describe('bootstrap event-queue registration', () => {
  it('registers the default eventQueue resource for B-05 cross-system events', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(bootstrap.world.hasResource('eventQueue')).toBe(true);

    const eventQueue = bootstrap.world.getResource('eventQueue');
    expect(eventQueue).toBeDefined();
    expect(eventQueue).not.toBeNull();
    // Verify it looks like the event queue structure
    expect(Array.isArray(eventQueue.events)).toBe(true);
    expect(typeof eventQueue.orderCounter).toBe('number');
  });

  it('exposes the configured eventQueueResourceKey for B-05 consumers', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(bootstrap.eventQueueResourceKey).toBe('eventQueue');
  });

  it('honors a custom eventQueueResourceKey when provided in options', () => {
    const bootstrap = createBootstrap({
      eventQueueResourceKey: 'customEventQueue',
      now: 0,
    });

    expect(bootstrap.eventQueueResourceKey).toBe('customEventQueue');
    expect(bootstrap.world.hasResource('customEventQueue')).toBe(true);
    expect(bootstrap.world.hasResource('eventQueue')).toBe(false);
  });
});

describe('bootstrap bomb and explosion runtime wiring', () => {
  it('registers bomb, fire, collider, detonation queue, and rng resources by default', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(bootstrap.world.hasResource('collider')).toBe(true);
    expect(bootstrap.world.getResource('collider')?.type).toBeInstanceOf(Uint8Array);

    expect(bootstrap.world.hasResource('bomb')).toBe(true);
    expect(bootstrap.world.getResource('bomb')?.fuseMs).toBeInstanceOf(Float64Array);

    expect(bootstrap.world.hasResource('fire')).toBe(true);
    expect(bootstrap.world.getResource('fire')?.burnTimerMs).toBeInstanceOf(Float64Array);

    expect(bootstrap.world.hasResource('bombDetonationQueue')).toBe(true);
    expect(bootstrap.world.getResource('bombDetonationQueue')).toEqual([]);

    expect(bootstrap.world.hasResource('rng')).toBe(true);
    expect(typeof bootstrap.world.getResource('rng')?.state).toBe('number');
  });

  it('preallocates inactive bomb and fire entity pools before fixed-step systems run', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const colliderStore = bootstrap.world.getResource('collider');
    const bombPool = bootstrap.world.getResource('bombEntityPool');
    const firePool = bootstrap.world.getResource('fireEntityPool');

    expect(bombPool).toHaveLength(POOL_MAX_BOMBS);
    expect(firePool).toHaveLength(POOL_FIRE);

    expect(
      bootstrap.world.query(
        COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
      ),
    ).toHaveLength(POOL_MAX_BOMBS);
    expect(
      bootstrap.world.query(
        COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
      ),
    ).toHaveLength(POOL_FIRE);

    for (const handle of [...bombPool, ...firePool]) {
      expect(bootstrap.world.entityStore.isAlive(handle)).toBe(true);
      expect(colliderStore.type[handle.id]).toBe(COLLIDER_TYPE.NONE);
    }
  });

  it('keeps preallocated bomb and fire pools stable across repeated level loads', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createRuntimeMapResource(),
      now: 0,
    });
    const bombPool = bootstrap.world.getResource('bombEntityPool');
    const firePool = bootstrap.world.getResource('fireEntityPool');

    expect(bombPool).toHaveLength(POOL_MAX_BOMBS);
    expect(firePool).toHaveLength(POOL_FIRE);

    bootstrap.levelLoader.loadLevel(0);
    const entityCountAfterFirstLoad = bootstrap.world.getEntityCount();

    bootstrap.levelLoader.loadLevel(0);

    expect(bootstrap.world.getResource('bombEntityPool')).toBe(bombPool);
    expect(bootstrap.world.getResource('fireEntityPool')).toBe(firePool);
    expect(bootstrap.world.getEntityCount()).toBe(entityCountAfterFirstLoad);
  });

  it('registers bomb and explosion logic systems in deterministic detonation order', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const logicSystemNames = (bootstrap.world.systemsByPhase.get('logic') || []).map(
      (entry) => entry.system.name,
    );

    expect(logicSystemNames).toEqual(['bomb-tick-system', 'explosion-system']);
  });
});

describe('bootstrap renderer registration', () => {
  it('invokes registered renderer.update with the renderIntent buffer per stepFrame', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const renderer = {
      update: vi.fn(),
    };

    bootstrap.registerRenderer(renderer);
    bootstrap.stepFrame(16);

    expect(renderer.update).toHaveBeenCalledTimes(1);
    const buffer = renderer.update.mock.calls[0][0];
    // The buffer is the same renderIntent resource registered in the world.
    expect(buffer).toBe(bootstrap.world.getResource('renderIntent'));
    // It must be reset to count=0 at the start of each frame.
    expect(buffer._count).toBe(0);
  });

  it('rejects renderers without an update(buffer) method', () => {
    const bootstrap = createBootstrap({ now: 0 });

    expect(() => bootstrap.registerRenderer({})).toThrow(/update\(buffer\)/);
  });

  it('clears the slot and calls destroy when registerRenderer(null) is invoked', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const destroy = vi.fn();
    const renderer = { update: vi.fn(), destroy };

    bootstrap.registerRenderer(renderer);
    bootstrap.registerRenderer(null);

    expect(destroy).toHaveBeenCalledTimes(1);

    // After clearing, stepFrame must not call the (now-removed) renderer.
    bootstrap.stepFrame(16);
    expect(renderer.update).not.toHaveBeenCalled();
  });

  it('destroys the previous renderer when a new one replaces it', () => {
    const bootstrap = createBootstrap({ now: 0 });
    const destroy = vi.fn();
    const first = { update: vi.fn(), destroy };
    const second = { update: vi.fn() };

    bootstrap.registerRenderer(first);
    bootstrap.registerRenderer(second);

    expect(destroy).toHaveBeenCalledTimes(1);

    bootstrap.stepFrame(16);
    expect(first.update).not.toHaveBeenCalled();
    expect(second.update).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrap onRestart deterministic time', () => {
  it('uses the injected nowProvider when restarting the clock', () => {
    let synthetic = 1000;
    const nowProvider = vi.fn(() => synthetic);
    const bootstrap = createBootstrap({ now: 0, nowProvider });

    // Restart only fires onRestart from PLAYING/PAUSED; transition first so
    // the test exercises the actual nowProvider callback.
    bootstrap.gameFlow.setState(GAME_STATE.PLAYING);

    // Advance the synthetic clock and trigger a restart through gameFlow.
    synthetic = 5000;
    bootstrap.gameFlow.restartLevel();

    expect(nowProvider).toHaveBeenCalled();
    // resetClock zeroes simTimeMs and rebases lastFrameTime/realTimeMs to now.
    expect(bootstrap.clock.simTimeMs).toBe(0);
    expect(bootstrap.clock.lastFrameTime).toBe(5000);
    expect(bootstrap.clock.realTimeMs).toBe(5000);
  });
});

describe('BUG-01 regression: syncPlayerEntityFromMap handle corruption', () => {
  it('preserves playerHandle with valid id after reloading a level where player entity already exists', () => {
    const bootstrap = createBootstrap({
      loadMapForLevel: () => createRuntimeMapResource(),
      now: 0,
    });

    // First load creates the player entity from scratch
    bootstrap.levelLoader.loadLevel(0);
    const playerHandleFirst = bootstrap.world.getResource('playerEntity');
    expect(playerHandleFirst).not.toBeNull();
    expect(typeof playerHandleFirst.id).toBe('number');

    // Second load reuses the existing player entity — this previously corrupted
    // playerHandle because setEntityMask() returns a boolean, not the handle.
    bootstrap.levelLoader.loadLevel(0);
    const playerHandleSecond = bootstrap.world.getResource('playerEntity');
    expect(playerHandleSecond).not.toBeNull();
    expect(typeof playerHandleSecond.id).toBe('number');

    // The handle identity should be preserved (same entity, recycled)
    expect(playerHandleSecond.id).toBe(playerHandleFirst.id);
  });
});
