/**
 * Unit tests for the B-04 collision system.
 *
 * These tests cover the helper layer, the logic-phase system contract, pickup
 * collection, fire and ghost contact, and occupancy-rule enforcement without
 * depending on runtime wiring in out-of-scope files.
 */

import { describe, expect, it } from 'vitest';

import { createGhostStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import { createHealthStore } from '../../../src/ecs/components/stats.js';
import { CELL_TYPE, GHOST_STATE } from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createMapResource, getCell } from '../../../src/ecs/resources/map-resource.js';
import {
  emitGameplayEvent,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
  validateGameplayEventPayload,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  appendCollisionIntent,
  COLLISION_ENTITY_REQUIRED_MASK,
  clearCollisionIntents,
  collectStaticPickup,
  createCollisionScratch,
  createCollisionSystem,
  DEFAULT_GHOST_SLOTS_PER_CELL,
  isPlayerInvincible,
  readEntityTile,
  resetCollisionScratch,
  tileToCellIndex,
} from '../../../src/ecs/systems/collision-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact valid map for collision-system unit tests.
 *
 * @param {Array<[number, number, number]>} [overrides] - Optional [row, col, cellType] edits.
 * @returns {object} Raw map JSON object that passes D-03 semantic validation.
 */
function createCollisionRawMap(overrides = []) {
  const rawMap = {
    level: 77,
    metadata: {
      name: 'Collision Harness',
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4.0,
      activeGhostTypes: [0, 1],
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 3, 3, 3, 1],
      [1, 3, 6, 3, 1],
      [1, 3, 5, 3, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 2, col: 2 },
      ghostHouse: {
        topRow: 3,
        bottomRow: 3,
        leftCol: 2,
        rightCol: 2,
      },
      ghostSpawnPoint: { row: 3, col: 2 },
    },
  };

  // Each override lets one test change exactly the tile it needs without
  // duplicating the fixture structure in multiple test bodies.
  for (const [row, col, cellType] of overrides) {
    rawMap.grid[row][col] = cellType;
  }

  return rawMap;
}

/**
 * Build a minimal world harness for the collision-system shell.
 *
 * @param {Array<[number, number, number]>} [mapOverrides] - Optional map cell overrides.
 * @returns {{
 *   colliderStore: ColliderStore,
 *   collisionIntents: Array<object>,
 *   ghostStore: GhostStore,
 *   healthStore: HealthStore,
 *   mapResource: MapResource,
 *   player: { id: number, generation: number },
 *   playerStore: PlayerStore,
 *   positionStore: PositionStore,
 *   system: { update: Function, phase: string, resourceCapabilities: object },
 *   world: World,
 * }} Ready-to-run collision harness.
 */
function createCollisionHarness(mapOverrides = []) {
  const world = new World();
  const system = createCollisionSystem();
  const mapResource = createMapResource(createCollisionRawMap(mapOverrides));
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const playerStore = createPlayerStore(8);
  const ghostStore = createGhostStore(8);
  const healthStore = createHealthStore(8);
  const collisionIntents = [{ type: 'stale-intent' }];
  const player = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

  // The harness keeps the player centered on the declared spawn tile.
  positionStore.row[player.id] = mapResource.playerSpawnRow;
  positionStore.col[player.id] = mapResource.playerSpawnCol;
  positionStore.prevRow[player.id] = mapResource.playerSpawnRow;
  positionStore.prevCol[player.id] = mapResource.playerSpawnCol;
  positionStore.targetRow[player.id] = mapResource.playerSpawnRow;
  positionStore.targetCol[player.id] = mapResource.playerSpawnCol;
  colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('health', healthStore);
  world.setResource('collisionIntents', collisionIntents);

  return {
    colliderStore,
    collisionIntents,
    ghostStore,
    healthStore,
    mapResource,
    player,
    playerStore,
    positionStore,
    system,
    world,
  };
}

/**
 * Move one entity directly onto a chosen tile for collision tests.
 *
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 */
function setEntityTile(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Set both the previous and current tile for one entity.
 *
 * This is useful for rules that depend on whether the entity entered a tile
 * this step versus already occupying it on the prior step.
 *
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} prevRow - Previous tile row.
 * @param {number} prevCol - Previous tile col.
 * @param {number} row - Current tile row.
 * @param {number} col - Current tile col.
 */
function setEntityPath(positionStore, entityId, prevRow, prevCol, row, col) {
  positionStore.prevRow[entityId] = prevRow;
  positionStore.prevCol[entityId] = prevCol;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Create one extra collision entity and place it on a chosen tile.
 *
 * @param {World} world - ECS world receiving the entity.
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {ColliderStore} colliderStore - Mutable collider store.
 * @param {number} colliderType - Canonical collider type to assign.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 * @returns {{ id: number, generation: number }} Created entity handle.
 */
function addCollisionEntity(world, positionStore, colliderStore, colliderType, row, col) {
  const entity = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

  colliderStore.type[entity.id] = colliderType;
  setEntityTile(positionStore, entity.id, row, col);

  return entity;
}

describe('collision-system contract', () => {
  it('registers as a logic-phase system so it can run after movement', () => {
    const system = createCollisionSystem();

    expect(system.phase).toBe('logic');
  });

  it('queries dynamic collision entities through position + collider masks', () => {
    expect(COLLISION_ENTITY_REQUIRED_MASK).toBe(COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER);
  });

  it('uses the canonical default ghost lane count for one-cell occupancy buffers', () => {
    expect(DEFAULT_GHOST_SLOTS_PER_CELL).toBe(4);
  });

  it('declares writes for every resource the system mutates during collision resolution', () => {
    const system = createCollisionSystem();

    expect(system.resourceCapabilities.write).toEqual([
      'mapResource',
      'position',
      'ghost',
      'collisionIntents',
      'eventQueue',
    ]);
  });
});

describe('collision-system helpers', () => {
  it('accepts canonical B-05 collectible event payloads', () => {
    expect(
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, {
        entityId: 1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 2, col: 3 },
      }),
    ).toBe(true);
  });

  it('rejects malformed B-05 payloads before they reach the queue', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED, {
        entityId: -1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 2, col: 3 },
      }),
    ).toThrow(/entityId/);
  });

  it('rejects power-up event payloads without a valid powerUpType', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED, {
        entityId: 1,
        powerUpType: 'unknown',
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 2, col: 3 },
      }),
    ).toThrow(/powerUpType/);
  });

  it('rejects player-ghost contact payloads without a ghost source entity', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT, {
        entityId: 1,
        ghostState: GHOST_STATE.NORMAL,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 2, col: 3 },
      }),
    ).toThrow(/sourceEntityId/);
  });

  it('rejects movement event payloads without previousTile and exact position', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED, {
        entityId: 1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.PLAYER_MOVE,
        tile: { row: 2, col: 3 },
      }),
    ).toThrow(/previousTile/);
  });

  it('enqueues validated B-05 events with deterministic frame and order envelope fields', () => {
    const queue = createEventQueue();

    const event = emitGameplayEvent(
      queue,
      GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
      {
        entityId: 4,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 2 },
      },
      9,
    );

    expect(event).toEqual({
      frame: 9,
      order: 0,
      payload: {
        entityId: 4,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 2 },
      },
      type: GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
    });
    expect(drain(queue)).toEqual([event]);
  });

  it('converts in-bounds tile coordinates into flat cell indices', () => {
    const mapResource = createMapResource(createCollisionRawMap());

    expect(tileToCellIndex(mapResource, 0, 0)).toBe(0);
    expect(tileToCellIndex(mapResource, 2, 3)).toBe(13);
    expect(tileToCellIndex(mapResource, 4, 4)).toBe(24);
  });

  it('rejects out-of-bounds tile coordinates when computing flat cell indices', () => {
    const mapResource = createMapResource(createCollisionRawMap());

    expect(tileToCellIndex(mapResource, -1, 0)).toBe(-1);
    expect(tileToCellIndex(mapResource, 0, -1)).toBe(-1);
    expect(tileToCellIndex(mapResource, mapResource.rows, 0)).toBe(-1);
    expect(tileToCellIndex(mapResource, 0, mapResource.cols)).toBe(-1);
  });

  it('copies one entity tile into a reusable output object', () => {
    const positionStore = createPositionStore(2);
    const outTile = { row: 0, col: 0 };

    positionStore.row[1] = 2;
    positionStore.col[1] = 3;

    const returnedTile = readEntityTile(positionStore, 1, outTile);

    expect(returnedTile).toBe(outTile);
    expect(outTile).toEqual({ row: 2, col: 3 });
  });

  it('returns null when asked to read a tile from a missing position store', () => {
    expect(readEntityTile(null, 0)).toBeNull();
  });

  it('allocates reusable scratch buffers sized from the map cell count', () => {
    const scratch = createCollisionScratch(9);

    expect(scratch.cellCount).toBe(9);
    expect(scratch.maxGhostsPerCell).toBe(DEFAULT_GHOST_SLOTS_PER_CELL);
    expect(scratch.playerByCell).toBeInstanceOf(Int32Array);
    expect(scratch.bombByCell).toBeInstanceOf(Int32Array);
    expect(scratch.fireByCell).toBeInstanceOf(Int32Array);
    expect(scratch.ghostCounts).toBeInstanceOf(Uint8Array);
    expect(scratch.ghostIds).toBeInstanceOf(Int32Array);
    expect(scratch.ghostIds).toHaveLength(9 * DEFAULT_GHOST_SLOTS_PER_CELL);
  });

  it('resets every scratch occupancy lane back to deterministic sentinels', () => {
    const scratch = createCollisionScratch(4, 2);

    scratch.playerByCell[0] = 7;
    scratch.bombByCell[1] = 8;
    scratch.droppedBombByCell[1] = 8;
    scratch.fireByCell[2] = 9;
    scratch.ghostCounts[3] = 2;
    scratch.ghostIds[4] = 10;

    const returnedScratch = resetCollisionScratch(scratch);

    expect(returnedScratch).toBe(scratch);
    expect([...scratch.playerByCell]).toEqual([-1, -1, -1, -1]);
    expect([...scratch.bombByCell]).toEqual([-1, -1, -1, -1]);
    expect([...scratch.droppedBombByCell]).toEqual([-1, -1, -1, -1]);
    expect([...scratch.fireByCell]).toEqual([-1, -1, -1, -1]);
    expect([...scratch.ghostCounts]).toEqual([0, 0, 0, 0]);
    expect([...scratch.ghostIds]).toEqual([-1, -1, -1, -1, -1, -1, -1, -1]);
  });

  it('clears an injected collision intent array in place', () => {
    const collisionIntents = [{ type: 'PelletCollected' }, { type: 'LifeLost' }];

    const returnedBuffer = clearCollisionIntents(collisionIntents);

    expect(returnedBuffer).toBe(collisionIntents);
    expect(collisionIntents).toEqual([]);
  });

  it('appends deterministic collision intents with monotonic order values', () => {
    const collisionIntents = [];

    const firstIntent = appendCollisionIntent(collisionIntents, {
      type: 'pellet-collected',
      entityId: 1,
    });
    const secondIntent = appendCollisionIntent(collisionIntents, {
      type: 'player-hit-fire',
      entityId: 1,
    });

    expect(firstIntent).toEqual({
      order: 0,
      type: 'pellet-collected',
      entityId: 1,
    });
    expect(secondIntent).toEqual({
      order: 1,
      type: 'player-hit-fire',
      entityId: 1,
    });
    expect(collisionIntents).toEqual([firstIntent, secondIntent]);
  });

  it('collects a regular pellet by clearing the map tile and recording the pickup', () => {
    const mapResource = createMapResource(createCollisionRawMap());
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 4, 1, 1);

    expect(appendedIntent).toEqual({
      order: 0,
      type: 'pellet-collected',
      entityId: 4,
      row: 1,
      col: 1,
    });
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
    expect(collisionIntents).toEqual([appendedIntent]);
  });

  it('collects a power pellet by clearing the map tile and recording the pickup', () => {
    const mapResource = createMapResource(createCollisionRawMap([[1, 1, CELL_TYPE.POWER_PELLET]]));
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 5, 1, 1);

    expect(appendedIntent).toEqual({
      order: 0,
      type: 'power-pellet-collected',
      entityId: 5,
      row: 1,
      col: 1,
    });
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
    expect(collisionIntents).toEqual([appendedIntent]);
  });

  it('collects a bomb power-up tile and records the normalized power-up type', () => {
    const mapResource = createMapResource(createCollisionRawMap([[1, 1, CELL_TYPE.POWER_UP_BOMB]]));
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 6, 1, 1);

    expect(appendedIntent).toEqual({
      order: 0,
      type: 'power-up-collected',
      entityId: 6,
      row: 1,
      col: 1,
      powerUpType: 'bombPlus',
    });
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
  });

  it('collects a fire power-up tile and records the normalized power-up type', () => {
    const mapResource = createMapResource(createCollisionRawMap([[1, 1, CELL_TYPE.POWER_UP_FIRE]]));
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 7, 1, 1);

    expect(appendedIntent).toEqual({
      order: 0,
      type: 'power-up-collected',
      entityId: 7,
      row: 1,
      col: 1,
      powerUpType: 'firePlus',
    });
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
  });

  it('collects a speed power-up tile and records the normalized power-up type', () => {
    const mapResource = createMapResource(
      createCollisionRawMap([[1, 1, CELL_TYPE.POWER_UP_SPEED]]),
    );
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 8, 1, 1);

    expect(appendedIntent).toEqual({
      order: 0,
      type: 'power-up-collected',
      entityId: 8,
      row: 1,
      col: 1,
      powerUpType: 'speedBoost',
    });
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
  });

  it('returns null without mutating the map when the tile is not collectible', () => {
    const mapResource = createMapResource(createCollisionRawMap([[1, 1, CELL_TYPE.EMPTY]]));
    const collisionIntents = [];

    const appendedIntent = collectStaticPickup(mapResource, collisionIntents, 9, 1, 1);

    expect(appendedIntent).toBeNull();
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
    expect(collisionIntents).toEqual([]);
  });

  it('treats the health flag as the highest-priority invincibility source', () => {
    const playerStore = createPlayerStore(2);
    const healthStore = createHealthStore(2);

    playerStore.invincibilityMs[1] = 0;
    healthStore.isInvincible[1] = 1;

    expect(isPlayerInvincible(playerStore, healthStore, 1)).toBe(true);
  });

  it('falls back to the player invincibility timer when the health flag is absent', () => {
    const playerStore = createPlayerStore(2);

    playerStore.invincibilityMs[0] = 250;

    expect(isPlayerInvincible(playerStore, null, 0)).toBe(true);
    expect(isPlayerInvincible(playerStore, null, 1)).toBe(false);
  });
});

describe('collision-system update shell', () => {
  it('safely returns early without mutating external state when required resources are missing', () => {
    const world = new World();
    const system = createCollisionSystem();
    const collisionIntents = [{ type: 'leave-me-alone' }];

    world.setResource('collisionIntents', collisionIntents);

    expect(() =>
      system.update({
        dtMs: 16.6667,
        frame: 0,
        world,
      }),
    ).not.toThrow();
    expect(collisionIntents).toEqual([{ type: 'leave-me-alone' }]);
  });

  it('accepts a plain injected collision intent array and clears it for the new step', () => {
    const { collisionIntents, system, world } = createCollisionHarness();

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(Array.isArray(collisionIntents)).toBe(true);
    expect(collisionIntents).toEqual([]);
  });

  it('collects a pellet from the player tile during the system update', () => {
    const { collisionIntents, mapResource, player, positionStore, system, world } =
      createCollisionHarness();

    setEntityTile(positionStore, player.id, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 1,
      },
    ]);
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
  });

  it('does not emit a duplicate pickup when the cleared tile is checked on the next step', () => {
    const { collisionIntents, mapResource, player, positionStore, system, world } =
      createCollisionHarness();

    setEntityTile(positionStore, player.id, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });
    expect(collisionIntents).toHaveLength(1);

    system.update({
      dtMs: 16.6667,
      frame: 1,
      world,
    });

    expect(collisionIntents).toEqual([]);
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
  });

  it('ignores collectible tiles for non-player colliders', () => {
    const { colliderStore, collisionIntents, mapResource, positionStore, system, world } =
      createCollisionHarness();
    const ghost = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

    colliderStore.type[ghost.id] = COLLIDER_TYPE.GHOST;
    setEntityTile(positionStore, ghost.id, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([]);
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.PELLET);
  });

  it('records a player-death intent when fire occupies the player tile', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness();

    setEntityTile(positionStore, player.id, 1, 1);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 1,
      },
      {
        order: 1,
        type: 'player-death',
        entityId: player.id,
        row: 1,
        col: 1,
        cause: 'fire',
        sourceEntityId: 1,
      },
    ]);
  });

  it('suppresses fire damage when the player is invincible through the player timer', () => {
    const { colliderStore, collisionIntents, player, playerStore, positionStore, system, world } =
      createCollisionHarness();

    playerStore.invincibilityMs[player.id] = 1500;
    setEntityTile(positionStore, player.id, 1, 2);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 2,
      },
    ]);
  });

  it('suppresses fire damage when the player is invincible through the health flag', () => {
    const { colliderStore, collisionIntents, healthStore, player, positionStore, system, world } =
      createCollisionHarness();

    healthStore.isInvincible[player.id] = 1;
    setEntityTile(positionStore, player.id, 1, 3);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 3);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 3,
      },
    ]);
  });

  it('records a ghost-death intent when fire occupies a normal ghost tile', () => {
    const { colliderStore, collisionIntents, ghostStore, positionStore, system, world } =
      createCollisionHarness([[1, 1, CELL_TYPE.EMPTY]]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      1,
    );
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'ghost-death',
        entityId: ghost.id,
        row: 1,
        col: 1,
        cause: 'fire',
        sourceEntityId: 2,
        ghostState: GHOST_STATE.NORMAL,
      },
    ]);
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
  });

  it('records a ghost-death intent for a stunned ghost and preserves the prior state in the intent', () => {
    const { colliderStore, collisionIntents, ghostStore, positionStore, system, world } =
      createCollisionHarness([[1, 2, CELL_TYPE.EMPTY]]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      2,
    );
    ghostStore.state[ghost.id] = GHOST_STATE.STUNNED;
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'ghost-death',
        entityId: ghost.id,
        row: 1,
        col: 2,
        cause: 'fire',
        sourceEntityId: 2,
        ghostState: GHOST_STATE.STUNNED,
      },
    ]);
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
  });

  it('ignores dead ghosts when fire occupies the same tile', () => {
    const { colliderStore, collisionIntents, ghostStore, positionStore, system, world } =
      createCollisionHarness([[1, 3, CELL_TYPE.EMPTY]]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      3,
    );
    ghostStore.state[ghost.id] = GHOST_STATE.DEAD;
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 3);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([]);
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
  });

  it('records a player-death intent for contact with a normal ghost when no fire is present', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness();

    setEntityTile(positionStore, player.id, 1, 2);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.GHOST, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 2,
      },
      {
        order: 1,
        type: 'player-death',
        entityId: player.id,
        row: 1,
        col: 2,
        cause: 'ghost',
        sourceEntityId: 1,
        ghostState: GHOST_STATE.NORMAL,
      },
    ]);
  });

  it('does not record player death for contact with a stunned ghost', () => {
    const { colliderStore, collisionIntents, ghostStore, player, positionStore, system, world } =
      createCollisionHarness();

    setEntityTile(positionStore, player.id, 1, 3);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      3,
    );
    ghostStore.state[ghost.id] = GHOST_STATE.STUNNED;

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 3,
      },
    ]);
  });

  it('suppresses ghost-contact death when the player is invincible', () => {
    const { colliderStore, collisionIntents, healthStore, player, positionStore, system, world } =
      createCollisionHarness();

    healthStore.isInvincible[player.id] = 1;
    setEntityTile(positionStore, player.id, 1, 2);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.GHOST, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'pellet-collected',
        entityId: player.id,
        row: 1,
        col: 2,
      },
    ]);
  });

  it('prioritizes fire over ghost contact when both occupy the player tile', () => {
    const { colliderStore, collisionIntents, ghostStore, player, positionStore, system, world } =
      createCollisionHarness([[1, 1, CELL_TYPE.EMPTY]]);

    setEntityTile(positionStore, player.id, 1, 1);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      1,
    );
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 1);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(collisionIntents).toEqual([
      {
        order: 0,
        type: 'player-death',
        entityId: player.id,
        row: 1,
        col: 1,
        cause: 'fire',
        sourceEntityId: 2,
      },
      {
        order: 1,
        type: 'ghost-death',
        entityId: ghost.id,
        row: 1,
        col: 1,
        cause: 'fire',
        sourceEntityId: 2,
        ghostState: GHOST_STATE.NORMAL,
      },
    ]);
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
  });

  it('reverts the player to the previous tile when the player occupies a ghost-house tile', () => {
    const { collisionIntents, player, positionStore, system, world } = createCollisionHarness([
      [1, 1, CELL_TYPE.EMPTY],
    ]);

    setEntityPath(positionStore, player.id, 2, 2, 3, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[player.id]).toBe(2);
    expect(positionStore.col[player.id]).toBe(2);
    expect(positionStore.targetRow[player.id]).toBe(2);
    expect(positionStore.targetCol[player.id]).toBe(2);
    expect(collisionIntents).toEqual([]);
  });

  it('allows a dead ghost to enter the ghost house from outside', () => {
    const { colliderStore, collisionIntents, ghostStore, player, positionStore, system, world } =
      createCollisionHarness([[1, 1, CELL_TYPE.EMPTY]]);

    setEntityTile(positionStore, player.id, 1, 1);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      3,
      2,
    );
    setEntityPath(positionStore, ghost.id, 2, 2, 3, 2);
    ghostStore.state[ghost.id] = GHOST_STATE.DEAD;

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[ghost.id]).toBe(3);
    expect(positionStore.col[ghost.id]).toBe(2);
    expect(collisionIntents).toEqual([]);
  });

  it('reverts a non-dead ghost that tries to enter the ghost house from outside', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness([[1, 1, CELL_TYPE.EMPTY]]);

    setEntityTile(positionStore, player.id, 1, 1);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      3,
      2,
    );
    setEntityPath(positionStore, ghost.id, 2, 2, 3, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[ghost.id]).toBe(2);
    expect(positionStore.col[ghost.id]).toBe(2);
    expect(positionStore.targetRow[ghost.id]).toBe(2);
    expect(positionStore.targetCol[ghost.id]).toBe(2);
    expect(collisionIntents).toEqual([]);
  });

  it('allows a ghost to exit the ghost house', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness([
        [1, 1, CELL_TYPE.EMPTY],
        [2, 2, CELL_TYPE.EMPTY],
      ]);

    setEntityTile(positionStore, player.id, 1, 1);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      2,
      2,
    );
    setEntityPath(positionStore, ghost.id, 3, 2, 2, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[ghost.id]).toBe(2);
    expect(positionStore.col[ghost.id]).toBe(2);
    expect(collisionIntents).toEqual([]);
  });

  it('reverts a ghost that enters a bomb cell from another tile', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness([
        [1, 2, CELL_TYPE.EMPTY],
        [1, 3, CELL_TYPE.EMPTY],
      ]);

    setEntityTile(positionStore, player.id, 2, 2);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      2,
    );
    setEntityPath(positionStore, ghost.id, 1, 1, 1, 2);
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.BOMB, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[ghost.id]).toBe(1);
    expect(positionStore.col[ghost.id]).toBe(1);
    expect(positionStore.targetRow[ghost.id]).toBe(1);
    expect(positionStore.targetCol[ghost.id]).toBe(1);
    expect(collisionIntents).toEqual([]);
  });

  it('pushes a ghost one cell in its travel direction when a bomb is dropped on the shared tile', () => {
    const { colliderStore, collisionIntents, player, positionStore, system, world } =
      createCollisionHarness([
        [1, 2, CELL_TYPE.EMPTY],
        [1, 3, CELL_TYPE.EMPTY],
      ]);

    setEntityTile(positionStore, player.id, 2, 2);
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      2,
    );
    setEntityPath(positionStore, ghost.id, 1, 1, 1, 2);
    const bomb = addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.BOMB, 1, 2);
    setEntityPath(positionStore, bomb.id, 0, 0, 1, 2);

    system.update({
      dtMs: 16.6667,
      frame: 0,
      world,
    });

    expect(positionStore.row[ghost.id]).toBe(1);
    expect(positionStore.col[ghost.id]).toBe(3);
    expect(positionStore.targetRow[ghost.id]).toBe(1);
    expect(positionStore.targetCol[ghost.id]).toBe(3);
    expect(collisionIntents).toEqual([]);
  });

  it('uses a real map resource fixture so the harness stays aligned with D-03 semantics', () => {
    const { mapResource } = createCollisionHarness();

    expect(mapResource.playerSpawnRow).toBe(2);
    expect(mapResource.playerSpawnCol).toBe(2);
    expect(mapResource.grid2D[3][2]).toBe(CELL_TYPE.GHOST_HOUSE);
  });
});
