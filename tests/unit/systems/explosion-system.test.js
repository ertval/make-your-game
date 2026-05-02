/**
 * Unit tests for the B-06 explosion system.
 *
 * These tests define the expected behavior for bomb detonation resolution:
 * cross-pattern fire geometry, wall interactions, power-up drops, fire cleanup,
 * and iterative chain reactions. Scoring is deliberately not asserted here
 * because B6 only emits chain metadata; scoring authority belongs to Track C.
 */

import { describe, expect, it } from 'vitest';

import { createBombStore, createFireStore } from '../../../src/ecs/components/props.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import {
  CELL_TYPE,
  DEFAULT_FIRE_RADIUS,
  FIRE_DURATION_MS,
  MAX_CHAIN_DEPTH,
} from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createMapResource, getCell } from '../../../src/ecs/resources/map-resource.js';
import { createRNG } from '../../../src/ecs/resources/rng.js';
import {
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  createExplosionSystem,
  EXPLOSION_BOMB_REQUIRED_MASK,
  EXPLOSION_FIRE_REQUIRED_MASK,
  resolvePowerUpDropCellType,
} from '../../../src/ecs/systems/explosion-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact map with enough open space to exercise radius-2 explosions.
 *
 * @param {Array<[number, number, number]>} [overrides] - Optional [row, col, type] edits.
 * @returns {object} Raw map JSON object accepted by createMapResource().
 */
function createExplosionRawMap(overrides = []) {
  const rawMap = {
    level: 306,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'B-06 Explosion Harness',
      timerSeconds: 120,
    },
    dimensions: { rows: 7, columns: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 6, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: {
        bottomRow: 5,
        leftCol: 2,
        rightCol: 4,
        topRow: 5,
      },
      ghostSpawnPoint: { row: 5, col: 3 },
      player: { row: 3, col: 3 },
    },
  };

  // Per-test overrides keep each rule fixture small and explicit.
  for (const [row, col, cellType] of overrides) {
    rawMap.grid[row][col] = cellType;
  }

  return rawMap;
}

/**
 * Place one entity at an exact grid tile with no pending movement.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 */
function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Create and activate one bomb entity.
 *
 * @param {World} world - ECS world receiving the entity.
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @param {BombStore} bombStore - Mutable bomb component store.
 * @param {number} row - Bomb tile row.
 * @param {number} col - Bomb tile col.
 * @param {number} [radius=DEFAULT_FIRE_RADIUS] - Explosion arm length.
 * @returns {{ id: number, generation: number }} Created bomb handle.
 */
function addActiveBomb(
  world,
  positionStore,
  colliderStore,
  bombStore,
  row,
  col,
  radius = DEFAULT_FIRE_RADIUS,
) {
  const bomb = world.createEntity(EXPLOSION_BOMB_REQUIRED_MASK);

  colliderStore.type[bomb.id] = COLLIDER_TYPE.BOMB;
  bombStore.row[bomb.id] = row;
  bombStore.col[bomb.id] = col;
  bombStore.radius[bomb.id] = radius;
  placeEntity(positionStore, bomb.id, row, col);

  return bomb;
}

/**
 * Create one inactive fire pool entity.
 *
 * @param {World} world - ECS world receiving the entity.
 * @param {ColliderStore} colliderStore - Mutable collider component store.
 * @returns {{ id: number, generation: number }} Created fire handle.
 */
function addInactiveFireSlot(world, colliderStore) {
  const fire = world.createEntity(EXPLOSION_FIRE_REQUIRED_MASK);

  colliderStore.type[fire.id] = COLLIDER_TYPE.NONE;
  return fire;
}

/**
 * Build a minimal world harness for explosion-system tests.
 *
 * @param {Array<[number, number, number]>} [mapOverrides] - Optional map cell overrides.
 * @returns {{
 *   bombDetonationQueue: Array<object>,
 *   bombStore: BombStore,
 *   colliderStore: ColliderStore,
 *   eventQueue: EventQueue,
 *   fireStore: FireStore,
 *   fireSlots: Array<{ id: number, generation: number }>,
 *   mapResource: MapResource,
 *   positionStore: PositionStore,
 *   system: { update: Function },
 *   world: World,
 * }} Ready-to-run explosion harness.
 */
function createExplosionHarness(mapOverrides = []) {
  const world = new World();
  const system = createExplosionSystem();
  const mapResource = createMapResource(createExplosionRawMap(mapOverrides));
  const positionStore = createPositionStore(32);
  const colliderStore = createColliderStore(32);
  const bombStore = createBombStore(32);
  const fireStore = createFireStore(32);
  const bombDetonationQueue = [];
  const eventQueue = createEventQueue();
  const fireSlots = [];

  for (let index = 0; index < 20; index += 1) {
    fireSlots.push(addInactiveFireSlot(world, colliderStore));
  }

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('bomb', bombStore);
  world.setResource('fire', fireStore);
  world.setResource('rng', createRNG(123));
  world.setResource('bombDetonationQueue', bombDetonationQueue);
  world.setResource('eventQueue', eventQueue);

  return {
    bombDetonationQueue,
    bombStore,
    colliderStore,
    eventQueue,
    fireSlots,
    fireStore,
    mapResource,
    positionStore,
    system,
    world,
  };
}

/**
 * Read active fire tile coordinates in deterministic row/column order.
 *
 * @param {Array<{ id: number }>} fireSlots - Pooled fire handles.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {PositionStore} positionStore - Position component store.
 * @returns {Array<{ row: number, col: number }>} Active fire tiles.
 */
function readActiveFireTiles(fireSlots, colliderStore, positionStore) {
  const tiles = [];

  for (const fire of fireSlots) {
    if (colliderStore.type[fire.id] !== COLLIDER_TYPE.FIRE) {
      continue;
    }

    tiles.push({
      col: Math.round(positionStore.col[fire.id]),
      row: Math.round(positionStore.row[fire.id]),
    });
  }

  return tiles.sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Find an active fire entity occupying one tile.
 *
 * @param {Array<{ id: number }>} fireSlots - Pooled fire handles.
 * @param {ColliderStore} colliderStore - Collider component store.
 * @param {PositionStore} positionStore - Position component store.
 * @param {number} row - Tile row.
 * @param {number} col - Tile column.
 * @returns {{ id: number } | null} Matching fire handle, or null.
 */
function findActiveFireAtTile(fireSlots, colliderStore, positionStore, row, col) {
  return (
    fireSlots.find(
      (fire) =>
        colliderStore.type[fire.id] === COLLIDER_TYPE.FIRE &&
        Math.round(positionStore.row[fire.id]) === row &&
        Math.round(positionStore.col[fire.id]) === col,
    ) || null
  );
}

/**
 * Queue one bomb detonation request using the B6 chain metadata shape.
 *
 * @param {Array<object>} queue - Mutable bomb detonation queue resource.
 * @param {{ id: number }} bomb - Bomb handle to detonate.
 * @param {BombStore} bombStore - Bomb component store.
 * @param {number} [chainDepth=1] - Current chain depth.
 */
function queueDetonation(queue, bomb, bombStore, chainDepth = 1) {
  queue.push({
    bombEntityId: bomb.id,
    chainDepth,
    frame: 0,
    radius: bombStore.radius[bomb.id],
    row: bombStore.row[bomb.id],
    col: bombStore.col[bomb.id],
  });
}

describe('explosion-system contract', () => {
  it('queries pooled bombs and fire through explicit component masks', () => {
    expect(EXPLOSION_BOMB_REQUIRED_MASK).toBe(
      COMPONENT_MASK.BOMB | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
    );
    expect(EXPLOSION_FIRE_REQUIRED_MASK).toBe(
      COMPONENT_MASK.FIRE | COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER,
    );
  });

  it('registers as a logic-phase system and declares all mutated resources', () => {
    const system = createExplosionSystem();

    expect(system.phase).toBe('logic');
    expect(system.resourceCapabilities).toEqual({
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
});

describe('explosion-system geometry and map interaction', () => {
  it('turns one detonated bomb into radius-based cross-pattern fire tiles', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      fireSlots,
      positionStore,
      system,
      world,
    } = createExplosionHarness();
    const bomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);

    queueDetonation(bombDetonationQueue, bomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).toEqual([
      { row: 1, col: 3 },
      { row: 2, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 3, col: 5 },
      { row: 4, col: 3 },
      { row: 5, col: 3 },
    ]);
  });

  it('stops before indestructible walls and does not create fire on the wall cell', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      fireSlots,
      positionStore,
      system,
      world,
    } = createExplosionHarness([[3, 4, CELL_TYPE.INDESTRUCTIBLE]]);
    const bomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);

    queueDetonation(bombDetonationQueue, bomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).not.toContainEqual({
      row: 3,
      col: 4,
    });
    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).not.toContainEqual({
      row: 3,
      col: 5,
    });
  });

  it('destroys destructible walls, creates fire on that cell, and stops beyond it', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      fireSlots,
      mapResource,
      positionStore,
      system,
      world,
    } = createExplosionHarness([
      [3, 4, CELL_TYPE.DESTRUCTIBLE],
      [3, 5, CELL_TYPE.PELLET],
    ]);
    const bomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);

    queueDetonation(bombDetonationQueue, bomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(getCell(mapResource, 3, 4)).not.toBe(CELL_TYPE.DESTRUCTIBLE);
    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).toContainEqual({
      row: 3,
      col: 4,
    });
    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).not.toContainEqual({
      row: 3,
      col: 5,
    });
  });

  it('lets fire pass through pellets without destroying them', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      fireSlots,
      mapResource,
      positionStore,
      system,
      world,
    } = createExplosionHarness([[3, 4, CELL_TYPE.PELLET]]);
    const bomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);

    queueDetonation(bombDetonationQueue, bomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(getCell(mapResource, 3, 4)).toBe(CELL_TYPE.PELLET);
    expect(readActiveFireTiles(fireSlots, colliderStore, positionStore)).toContainEqual({
      row: 3,
      col: 5,
    });
  });

  it('destroys power-ups hit by fire without collecting them', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      mapResource,
      positionStore,
      system,
      world,
    } = createExplosionHarness([[3, 4, CELL_TYPE.POWER_UP_FIRE]]);
    const bomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);

    queueDetonation(bombDetonationQueue, bomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(getCell(mapResource, 3, 4)).toBe(CELL_TYPE.EMPTY);
  });
});

describe('explosion-system drops and cleanup', () => {
  it('maps exact drop-rate thresholds to empty, bomb+, fire+, and speed boost cells', () => {
    expect(resolvePowerUpDropCellType(0)).toBe(CELL_TYPE.EMPTY);
    expect(resolvePowerUpDropCellType(0.849_999)).toBe(CELL_TYPE.EMPTY);
    expect(resolvePowerUpDropCellType(0.85)).toBe(CELL_TYPE.POWER_UP_BOMB);
    expect(resolvePowerUpDropCellType(0.899_999)).toBe(CELL_TYPE.POWER_UP_BOMB);
    expect(resolvePowerUpDropCellType(0.9)).toBe(CELL_TYPE.POWER_UP_FIRE);
    expect(resolvePowerUpDropCellType(0.949_999)).toBe(CELL_TYPE.POWER_UP_FIRE);
    expect(resolvePowerUpDropCellType(0.95)).toBe(CELL_TYPE.POWER_UP_SPEED);
    expect(resolvePowerUpDropCellType(0.999_999)).toBe(CELL_TYPE.POWER_UP_SPEED);
  });

  it('produces deterministic wall-drop outcomes for identical seeded runs', () => {
    const first = createExplosionHarness([[3, 4, CELL_TYPE.DESTRUCTIBLE]]);
    const second = createExplosionHarness([[3, 4, CELL_TYPE.DESTRUCTIBLE]]);
    const firstBomb = addActiveBomb(
      first.world,
      first.positionStore,
      first.colliderStore,
      first.bombStore,
      3,
      3,
      2,
    );
    const secondBomb = addActiveBomb(
      second.world,
      second.positionStore,
      second.colliderStore,
      second.bombStore,
      3,
      3,
      2,
    );

    queueDetonation(first.bombDetonationQueue, firstBomb, first.bombStore);
    queueDetonation(second.bombDetonationQueue, secondBomb, second.bombStore);
    first.system.update({ dtMs: 0, frame: 0, world: first.world });
    second.system.update({ dtMs: 0, frame: 0, world: second.world });

    expect(getCell(second.mapResource, 3, 4)).toBe(getCell(first.mapResource, 3, 4));
  });

  it('deactivates fire tiles after the canonical fire lifetime expires', () => {
    const { colliderStore, fireSlots, fireStore, positionStore, system, world } =
      createExplosionHarness();
    const fire = fireSlots[0];

    colliderStore.type[fire.id] = COLLIDER_TYPE.FIRE;
    fireStore.burnTimerMs[fire.id] = FIRE_DURATION_MS;
    fireStore.sourceBombId[fire.id] = 7;
    fireStore.chainDepth[fire.id] = 2;
    placeEntity(positionStore, fire.id, 3, 3);

    system.update({ dtMs: FIRE_DURATION_MS, frame: 1, world });

    expect(colliderStore.type[fire.id]).toBe(COLLIDER_TYPE.NONE);
    expect(fireStore.sourceBombId[fire.id]).toBe(-1);
    expect(fireStore.chainDepth[fire.id]).toBe(0);
  });
});

describe('explosion-system chain reactions', () => {
  it('detonates bombs hit by fire through an iterative chain queue', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      eventQueue,
      positionStore,
      system,
      world,
    } = createExplosionHarness();
    const firstBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);
    const chainedBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 5, 1);

    queueDetonation(bombDetonationQueue, firstBomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    expect(colliderStore.type[firstBomb.id]).toBe(COLLIDER_TYPE.NONE);
    expect(colliderStore.type[chainedBomb.id]).toBe(COLLIDER_TYPE.NONE);
    expect(drain(eventQueue).map((event) => event.payload.chainDepth)).toEqual([1, 2]);
  });

  it('stores source bomb and chain depth metadata on active fire tiles', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      fireSlots,
      fireStore,
      positionStore,
      system,
      world,
    } = createExplosionHarness();
    const firstBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);
    const chainedBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 5, 1);

    queueDetonation(bombDetonationQueue, firstBomb, bombStore);
    system.update({ dtMs: 0, frame: 0, world });

    const rootFire = findActiveFireAtTile(fireSlots, colliderStore, positionStore, 3, 3);
    const chainedFire = findActiveFireAtTile(fireSlots, colliderStore, positionStore, 2, 5);

    expect(rootFire).not.toBeNull();
    expect(chainedFire).not.toBeNull();
    expect(fireStore.sourceBombId[rootFire.id]).toBe(firstBomb.id);
    expect(fireStore.chainDepth[rootFire.id]).toBe(1);
    expect(fireStore.sourceBombId[chainedFire.id]).toBe(chainedBomb.id);
    expect(fireStore.chainDepth[chainedFire.id]).toBe(2);
  });

  it('caps chain reactions at MAX_CHAIN_DEPTH and leaves deeper bombs active', () => {
    const {
      bombDetonationQueue,
      bombStore,
      colliderStore,
      eventQueue,
      positionStore,
      system,
      world,
    } = createExplosionHarness();
    const firstBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 3, 2);
    const cappedBomb = addActiveBomb(world, positionStore, colliderStore, bombStore, 3, 5, 1);

    queueDetonation(bombDetonationQueue, firstBomb, bombStore, MAX_CHAIN_DEPTH);
    system.update({ dtMs: 0, frame: 0, world });

    expect(colliderStore.type[cappedBomb.id]).toBe(COLLIDER_TYPE.BOMB);
    expect(drain(eventQueue)).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          chainDepth: MAX_CHAIN_DEPTH,
          entityId: firstBomb.id,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.EXPLOSION,
          tile: { row: 3, col: 3 },
        },
        type: GAMEPLAY_EVENT_TYPE.BOMB_DETONATED,
      },
    ]);
  });
});
