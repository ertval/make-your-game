/**
 * Unit tests for the bomb/explosion runtime wiring module (CI-09).
 *
 * These tests isolate runtime-bomb-explosion-wiring.js from full bootstrap and
 * DOM assembly. They pin two contracts at the unit level:
 *   - createBombExplosionLogicSystems() returns the ordered [bomb-tick,
 *     explosion] logic-phase systems with the expected names, phase, and
 *     resource read/write capabilities, threading resource-key overrides.
 *   - initializeBombExplosionResources() registers the prop stores and shared
 *     resources and preallocates the pooled bomb/fire entities, asserting the
 *     pool sizes, component masks, inactive collider state, idempotency, and
 *     resource-key overrides.
 *
 * A real World is used (no DOM) because the wiring under test only touches the
 * world's resource map and entity store; over-mocking would weaken the contract.
 */

import { describe, expect, it } from 'vitest';

import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { COLLIDER_TYPE } from '../../../src/ecs/components/spatial.js';
import { POOL_FIRE, POOL_MAX_BOMBS } from '../../../src/ecs/resources/constants.js';
import { World } from '../../../src/ecs/world/world.js';
import {
  createBombExplosionLogicSystems,
  initializeBombExplosionResources,
} from '../../../src/game/runtime-bomb-explosion-wiring.js';

const BOMB_POOL_MASK = COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;
const FIRE_POOL_MASK = COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER;

/**
 * Assert that every handle in a pool is alive, masked, and an inactive slot.
 *
 * @param {World} world - ECS world owning the pool.
 * @param {Array<{ id: number, generation: number }>} pool - Pooled entity handles.
 * @param {number} expectedMask - Component mask each pooled entity must carry.
 * @param {ColliderStore} colliderStore - Collider store backing the pool.
 */
function expectInactivePool(world, pool, expectedMask, colliderStore) {
  for (const handle of pool) {
    expect(world.isEntityAlive(handle)).toBe(true);
    expect(world.getEntityMask(handle)).toBe(expectedMask);
    expect(colliderStore.type[handle.id]).toBe(COLLIDER_TYPE.NONE);
  }
}

describe('createBombExplosionLogicSystems', () => {
  it('returns the bomb-tick then explosion logic-phase systems in order', () => {
    const systems = createBombExplosionLogicSystems();

    expect(systems).toHaveLength(2);
    const [bombTickSystem, explosionSystem] = systems;

    expect(bombTickSystem.name).toBe('bomb-tick-system');
    expect(bombTickSystem.phase).toBe('logic');
    expect(explosionSystem.name).toBe('explosion-system');
    expect(explosionSystem.phase).toBe('logic');
  });

  it('declares the default resource read/write capabilities for each system', () => {
    const [bombTickSystem, explosionSystem] = createBombExplosionLogicSystems();

    expect(bombTickSystem.resourceCapabilities).toEqual({
      read: ['mapResource', 'player', 'inputState'],
      write: [
        'position',
        'collider',
        'bomb',
        'bombDetonationQueue',
        'eventQueue',
        'bombAudioActive',
      ],
    });
    expect(explosionSystem.resourceCapabilities).toEqual({
      read: ['rng'],
      write: [
        'mapResource',
        'position',
        'collider',
        'bomb',
        'fire',
        'bombDetonationQueue',
        'eventQueue',
      ],
    });
  });

  it('threads resource-key overrides through both systems', () => {
    const [bombTickSystem, explosionSystem] = createBombExplosionLogicSystems({
      bombResourceKey: 'bombStore',
      colliderResourceKey: 'colliderStore',
      bombDetonationQueueResourceKey: 'detonations',
      fireResourceKey: 'fireStore',
      rngResourceKey: 'seededRng',
    });

    expect(bombTickSystem.resourceCapabilities.write).toContain('bombStore');
    expect(bombTickSystem.resourceCapabilities.write).toContain('colliderStore');
    expect(bombTickSystem.resourceCapabilities.write).toContain('detonations');
    expect(explosionSystem.resourceCapabilities.read).toContain('seededRng');
    expect(explosionSystem.resourceCapabilities.write).toContain('fireStore');
    expect(explosionSystem.resourceCapabilities.write).toContain('detonations');
  });
});

describe('initializeBombExplosionResources', () => {
  it('registers the prop stores and shared detonation queue on a fresh world', () => {
    const world = new World();

    initializeBombExplosionResources(world);

    for (const key of ['collider', 'position', 'bomb', 'fire', 'rng']) {
      expect(world.hasResource(key)).toBe(true);
    }
    expect(world.getResource('bombDetonationQueue')).toEqual([]);
  });

  it('preallocates inactive bomb and fire pools with the correct masks', () => {
    const world = new World();

    initializeBombExplosionResources(world);

    const colliderStore = world.getResource('collider');
    const bombPool = world.getResource('bombEntityPool');
    const firePool = world.getResource('fireEntityPool');

    expect(bombPool).toHaveLength(POOL_MAX_BOMBS);
    expect(firePool).toHaveLength(POOL_FIRE);
    expectInactivePool(world, bombPool, BOMB_POOL_MASK, colliderStore);
    expectInactivePool(world, firePool, FIRE_POOL_MASK, colliderStore);
  });

  it('is idempotent and does not rebuild already-valid pools when called twice', () => {
    const world = new World();

    initializeBombExplosionResources(world);
    const firstBombPool = world.getResource('bombEntityPool');
    const firstFirePool = world.getResource('fireEntityPool');
    const entityCountAfterFirst = world.getEntityCount();

    initializeBombExplosionResources(world);

    expect(world.getResource('bombEntityPool')).toBe(firstBombPool);
    expect(world.getResource('fireEntityPool')).toBe(firstFirePool);
    expect(world.getEntityCount()).toBe(entityCountAfterFirst);
  });

  it('honors resource-key overrides for stores and pools', () => {
    const world = new World();

    initializeBombExplosionResources(world, {
      colliderResourceKey: 'colliderStore',
      bombResourceKey: 'bombStore',
      fireResourceKey: 'fireStore',
      bombDetonationQueueResourceKey: 'detonations',
      bombPoolResourceKey: 'bombPool',
      firePoolResourceKey: 'firePool',
    });

    expect(world.hasResource('colliderStore')).toBe(true);
    expect(world.hasResource('bombStore')).toBe(true);
    expect(world.hasResource('fireStore')).toBe(true);
    expect(world.getResource('detonations')).toEqual([]);

    const colliderStore = world.getResource('colliderStore');
    const bombPool = world.getResource('bombPool');
    const firePool = world.getResource('firePool');

    expect(bombPool).toHaveLength(POOL_MAX_BOMBS);
    expect(firePool).toHaveLength(POOL_FIRE);
    expectInactivePool(world, bombPool, BOMB_POOL_MASK, colliderStore);
    expectInactivePool(world, firePool, FIRE_POOL_MASK, colliderStore);

    // Default keys must remain untouched when overrides are supplied.
    expect(world.hasResource('collider')).toBe(false);
    expect(world.hasResource('bombEntityPool')).toBe(false);
  });
});
