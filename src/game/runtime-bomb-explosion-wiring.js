/*
 * Runtime bomb/explosion wiring.
 *
 * This module owns Track A's default runtime assembly for bomb and fire
 * gameplay. It keeps bootstrap.js focused on orchestration while the resource
 * keys, pooled prop entities, and logic-system construction live together.
 *
 * Public API:
 * - createBombExplosionLogicSystems(options): build logic-phase bomb/explosion systems.
 * - initializeBombExplosionResources(world, options): register stores/resources
 *   and preallocate pooled bomb/fire entities before fixed-step dispatch.
 *
 * Implementation notes:
 * - These constants are runtime resource-key defaults, not gameplay tuning
 *   values, so they intentionally do not live in ecs/resources/constants.js.
 * - Pooled bomb/fire entities keep their component masks for stable queries;
 *   collider type NONE marks inactive pool slots.
 */

import { createBombStore, createFireStore } from '../ecs/components/props.js';
import { COMPONENT_MASK } from '../ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../ecs/components/spatial.js';
import { POOL_FIRE, POOL_MAX_BOMBS } from '../ecs/resources/constants.js';
import { createRNG } from '../ecs/resources/rng.js';
import { createBombTickSystem } from '../ecs/systems/bomb-tick-system.js';
import { createExplosionSystem } from '../ecs/systems/explosion-system.js';

const DEFAULT_PLAYER_RESOURCE_KEY = 'player';
const DEFAULT_POSITION_RESOURCE_KEY = 'position';
const DEFAULT_INPUT_STATE_RESOURCE_KEY = 'inputState';
const DEFAULT_EVENT_QUEUE_RESOURCE_KEY = 'eventQueue';
const DEFAULT_MAP_RESOURCE_KEY = 'mapResource';
const DEFAULT_COLLIDER_RESOURCE_KEY = 'collider';
const DEFAULT_BOMB_RESOURCE_KEY = 'bomb';
const DEFAULT_FIRE_RESOURCE_KEY = 'fire';
const DEFAULT_RNG_RESOURCE_KEY = 'rng';
const DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY = 'bombDetonationQueue';
const DEFAULT_BOMB_POOL_RESOURCE_KEY = 'bombEntityPool';
const DEFAULT_FIRE_POOL_RESOURCE_KEY = 'fireEntityPool';

/**
 * Ensure a world resource exists before runtime systems start reading it.
 *
 * @param {World} world - ECS world receiving the resource.
 * @param {string} resourceKey - Resource map key.
 * @param {Function} createResource - Factory for the missing resource.
 * @returns {unknown} The existing or newly created resource instance.
 */
function ensureWorldResource(world, resourceKey, createResource) {
  if (!world.hasResource(resourceKey)) {
    world.setResource(resourceKey, createResource());
  }

  return world.getResource(resourceKey);
}

/**
 * Create one inactive pooled prop entity with a stable gameplay mask.
 *
 * @param {World} world - ECS world receiving the entity.
 * @param {ColliderStore} colliderStore - Collider store to initialize.
 * @param {number} mask - Component mask for the pooled entity.
 * @returns {{ id: number, generation: number }} Created entity handle.
 */
function createInactivePooledPropEntity(world, colliderStore, mask) {
  const entity = world.createEntity(mask);

  colliderStore.type[entity.id] = COLLIDER_TYPE.NONE;
  return entity;
}

/**
 * Ensure a fixed-size pooled entity handle array exists.
 *
 * @param {World} world - ECS world receiving pool entities.
 * @param {string} poolResourceKey - Resource key storing pool handles.
 * @param {ColliderStore} colliderStore - Collider store for inactive setup.
 * @param {number} count - Number of pooled entities.
 * @param {number} mask - Component mask assigned to each pooled entity.
 * @returns {Array<{ id: number, generation: number }>} Stable pool handles.
 */
function ensurePooledPropEntities(world, poolResourceKey, colliderStore, count, mask) {
  const existingPool = world.getResource(poolResourceKey);
  if (Array.isArray(existingPool) && existingPool.length === count) {
    return existingPool;
  }

  const pool = [];
  for (let index = 0; index < count; index += 1) {
    pool.push(createInactivePooledPropEntity(world, colliderStore, mask));
  }

  world.setResource(poolResourceKey, pool);
  return pool;
}

/**
 * Build the default logic-phase systems for bomb and explosion simulation.
 *
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 * @returns {Array<object>} Ordered logic-phase system registrations.
 */
export function createBombExplosionLogicSystems(options = {}) {
  const inputStateResourceKey = options.inputStateResourceKey || DEFAULT_INPUT_STATE_RESOURCE_KEY;
  const playerResourceKey = options.playerResourceKey || DEFAULT_PLAYER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const mapResourceKey = options.mapResourceKey || DEFAULT_MAP_RESOURCE_KEY;
  const colliderResourceKey = options.colliderResourceKey || DEFAULT_COLLIDER_RESOURCE_KEY;
  const bombResourceKey = options.bombResourceKey || DEFAULT_BOMB_RESOURCE_KEY;
  const fireResourceKey = options.fireResourceKey || DEFAULT_FIRE_RESOURCE_KEY;
  const rngResourceKey = options.rngResourceKey || DEFAULT_RNG_RESOURCE_KEY;
  const bombDetonationQueueResourceKey =
    options.bombDetonationQueueResourceKey || DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY;
  const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;

  return [
    createBombTickSystem({
      bombDetonationQueueResourceKey,
      bombResourceKey,
      colliderResourceKey,
      inputStateResourceKey,
      mapResourceKey,
      playerResourceKey,
      positionResourceKey,
    }),
    createExplosionSystem({
      bombDetonationQueueResourceKey,
      bombResourceKey,
      colliderResourceKey,
      eventQueueResourceKey,
      fireResourceKey,
      mapResourceKey,
      positionResourceKey,
      rngResourceKey,
    }),
  ];
}

/**
 * Allocate the prop stores and pooled bomb/fire entities used by runtime systems.
 *
 * @param {World} world - ECS world receiving resources.
 * @param {object} [options] - Optional resource-key overrides shared with bootstrap.
 */
export function initializeBombExplosionResources(world, options = {}) {
  const colliderResourceKey = options.colliderResourceKey || DEFAULT_COLLIDER_RESOURCE_KEY;
  const positionResourceKey = options.positionResourceKey || DEFAULT_POSITION_RESOURCE_KEY;
  const bombResourceKey = options.bombResourceKey || DEFAULT_BOMB_RESOURCE_KEY;
  const fireResourceKey = options.fireResourceKey || DEFAULT_FIRE_RESOURCE_KEY;
  const rngResourceKey = options.rngResourceKey || DEFAULT_RNG_RESOURCE_KEY;
  const bombDetonationQueueResourceKey =
    options.bombDetonationQueueResourceKey || DEFAULT_BOMB_DETONATION_QUEUE_RESOURCE_KEY;
  const bombPoolResourceKey = options.bombPoolResourceKey || DEFAULT_BOMB_POOL_RESOURCE_KEY;
  const firePoolResourceKey = options.firePoolResourceKey || DEFAULT_FIRE_POOL_RESOURCE_KEY;
  const maxEntities = world.entityStore.maxEntities;

  const colliderStore = ensureWorldResource(world, colliderResourceKey, () =>
    createColliderStore(maxEntities),
  );
  ensureWorldResource(world, positionResourceKey, () => createPositionStore(maxEntities));
  ensureWorldResource(world, bombResourceKey, () => createBombStore(maxEntities));
  ensureWorldResource(world, fireResourceKey, () => createFireStore(maxEntities));
  ensureWorldResource(world, rngResourceKey, () => createRNG(options.seed || 42));
  ensureWorldResource(world, bombDetonationQueueResourceKey, () => []);

  ensurePooledPropEntities(
    world,
    bombPoolResourceKey,
    colliderStore,
    POOL_MAX_BOMBS,
    COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
  );
  ensurePooledPropEntities(
    world,
    firePoolResourceKey,
    colliderStore,
    POOL_FIRE,
    COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
  );
}
