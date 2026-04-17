/**
 * Unit tests for the B-04 collision-system scaffold.
 *
 * These tests prove the helper and system-shell contract: logic-phase
 * registration, deterministic helper behavior, reusable scratch buffers, and
 * the ability to inject a plain collision intent array without requiring a
 * dedicated resource module yet.
 */

import { describe, expect, it } from 'vitest';

import { createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import { createHealthStore } from '../../../src/ecs/components/stats.js';
import { CELL_TYPE } from '../../../src/ecs/resources/constants.js';
import { createMapResource, getCell } from '../../../src/ecs/resources/map-resource.js';
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
  const healthStore = createHealthStore(8);
  const collisionIntents = [{ type: 'stale-intent' }];
  const player = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

  // The harness keeps the player centered on the declared spawn tile.
  positionStore.row[player.id] = mapResource.playerSpawnRow;
  positionStore.col[player.id] = mapResource.playerSpawnCol;
  positionStore.targetRow[player.id] = mapResource.playerSpawnRow;
  positionStore.targetCol[player.id] = mapResource.playerSpawnCol;
  colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('player', playerStore);
  world.setResource('health', healthStore);
  world.setResource('collisionIntents', collisionIntents);

  return {
    colliderStore,
    collisionIntents,
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
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

describe('collision-system scaffold contract', () => {
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
});

describe('collision-system helpers', () => {
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
    scratch.fireByCell[2] = 9;
    scratch.ghostCounts[3] = 2;
    scratch.ghostIds[4] = 10;

    const returnedScratch = resetCollisionScratch(scratch);

    expect(returnedScratch).toBe(scratch);
    expect([...scratch.playerByCell]).toEqual([-1, -1, -1, -1]);
    expect([...scratch.bombByCell]).toEqual([-1, -1, -1, -1]);
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

  it('uses a real map resource fixture so the harness stays aligned with D-03 semantics', () => {
    const { mapResource } = createCollisionHarness();

    expect(mapResource.playerSpawnRow).toBe(2);
    expect(mapResource.playerSpawnCol).toBe(2);
    expect(mapResource.grid2D[3][2]).toBe(CELL_TYPE.GHOST_HOUSE);
  });
});
