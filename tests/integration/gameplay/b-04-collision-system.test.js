/*
 * Test: b-04-collision-system.test.js
 * Purpose: Covers collision-system behavior when it runs as a registered ECS logic system after a physics step.
 * Public API: N/A (test module).
 * Implementation Notes:
 * - These tests use the real World phase dispatcher so they catch regressions in phase ordering and resource access.
 * - The movement stub deliberately runs in the physics phase while the collision system is registered separately in logic.
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
import { createMapResource, getCell } from '../../../src/ecs/resources/map-resource.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact valid map for collision-system integration tests.
 *
 * @param {Array<[number, number, number]>} [overrides] - Optional [row, col, cellType] edits.
 * @returns {object} Raw map JSON object that passes D-03 semantic validation.
 */
function createCollisionRawMap(overrides = []) {
  const rawMap = {
    level: 88,
    metadata: {
      name: 'Collision Integration Harness',
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

  // Tests override only the tiles they need so the harness stays small and explicit.
  for (const [row, col, cellType] of overrides) {
    rawMap.grid[row][col] = cellType;
  }

  return rawMap;
}

/**
 * Place one entity directly on a chosen tile and keep previous/target fields aligned.
 *
 * @param {PositionStore} positionStore - Mutable position store.
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
 * Move one entity in a physics-step style update by preserving the previous tile first.
 *
 * @param {PositionStore} positionStore - Mutable position store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} row - New tile row.
 * @param {number} col - New tile col.
 */
function moveEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = positionStore.row[entityId];
  positionStore.prevCol[entityId] = positionStore.col[entityId];
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
  placeEntity(positionStore, entity.id, row, col);

  return entity;
}

/**
 * Build a world harness with the real collision system registered.
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
 *   world: World,
 * }} Ready-to-run integration harness.
 */
function createCollisionIntegrationWorld(mapOverrides = []) {
  const world = new World();
  const mapResource = createMapResource(createCollisionRawMap(mapOverrides));
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const playerStore = createPlayerStore(8);
  const ghostStore = createGhostStore(8);
  const healthStore = createHealthStore(8);
  const collisionIntents = [];
  const player = world.createEntity(COMPONENT_MASK.POSITION | COMPONENT_MASK.COLLIDER);

  colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;
  placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('health', healthStore);
  world.setResource('collisionIntents', collisionIntents);
  world.registerSystem(createCollisionSystem());

  return {
    colliderStore,
    collisionIntents,
    ghostStore,
    healthStore,
    mapResource,
    player,
    playerStore,
    positionStore,
    world,
  };
}

/**
 * Create a small scripted physics system for fixed-step integration tests.
 *
 * @param {(positionStore: PositionStore) => void} applyMovement - Physics-phase movement script.
 * @returns {{ name: string, phase: string, resourceCapabilities: object, update: Function }} ECS physics system.
 */
function createScriptedMovementSystem(applyMovement) {
  return {
    name: 'test-scripted-movement',
    phase: 'physics',
    resourceCapabilities: {
      read: ['position'],
      write: ['position'],
    },
    update(context) {
      const positionStore = context.world.getResource('position');
      applyMovement(positionStore);
    },
  };
}

describe('B-04 collision system integration', () => {
  it('resolves pickup and fire collisions after a physics movement step', () => {
    const {
      colliderStore,
      collisionIntents,
      ghostStore,
      mapResource,
      player,
      positionStore,
      world,
    } = createCollisionIntegrationWorld([[1, 2, CELL_TYPE.EMPTY]]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      2,
    );
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 1);

    world.registerSystem(
      createScriptedMovementSystem((store) => {
        moveEntity(store, player.id, 1, 1);
        moveEntity(store, ghost.id, 1, 1);
      }),
    );

    world.runFixedStep({ dtMs: 16.6667 });

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
        sourceEntityId: 2,
      },
      {
        order: 2,
        type: 'ghost-death',
        entityId: ghost.id,
        row: 1,
        col: 1,
        cause: 'fire',
        sourceEntityId: 2,
        ghostState: GHOST_STATE.NORMAL,
      },
    ]);
    expect(getCell(mapResource, 1, 1)).toBe(CELL_TYPE.EMPTY);
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
  });

  it('reverts illegal ghost-house and bomb-cell entries before collision resolution', () => {
    const { colliderStore, collisionIntents, player, positionStore, world } =
      createCollisionIntegrationWorld([
        [1, 2, CELL_TYPE.EMPTY],
        [1, 3, CELL_TYPE.EMPTY],
      ]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      1,
    );
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.BOMB, 1, 2);

    world.registerSystem(
      createScriptedMovementSystem((store) => {
        moveEntity(store, player.id, 3, 2);
        moveEntity(store, ghost.id, 1, 2);
      }),
    );

    world.runFixedStep({ dtMs: 16.6667 });

    expect(positionStore.row[player.id]).toBe(2);
    expect(positionStore.col[player.id]).toBe(2);
    expect(positionStore.targetRow[player.id]).toBe(2);
    expect(positionStore.targetCol[player.id]).toBe(2);
    expect(positionStore.row[ghost.id]).toBe(1);
    expect(positionStore.col[ghost.id]).toBe(1);
    expect(positionStore.targetRow[ghost.id]).toBe(1);
    expect(positionStore.targetCol[ghost.id]).toBe(1);
    expect(collisionIntents).toEqual([]);
  });
});
