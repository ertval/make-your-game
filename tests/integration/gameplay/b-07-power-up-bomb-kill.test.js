/*
 * Test: b-07-power-up-bomb-kill.test.js
 * Purpose: Integration coverage for BUG-18 — a ghost that is STUNNED (the state a
 *   power-pellet leaves it in) and then killed by bomb fire MUST have its stun
 *   timer (ghostStore.timerMs) cleared as part of the fire-kill, so no leftover
 *   countdown leaks across the DEAD → respawn transition.
 * Public API: N/A (test module).
 * Implementation Notes:
 * - Driven through the real World fixed-step dispatcher so the collision system
 *   runs in its registered logic phase after a scripted physics move, matching
 *   how b-04-collision-system.test.js exercises the system.
 * - A full bomb → explosion → fire spawn chain is out of scope for a focused
 *   regression test, so we drive the documented fire-kill collision entry point
 *   directly (a FIRE collider sharing the stunned ghost's tile) and assert the
 *   integration-level contract: state === DEAD AND timerMs === 0 after the step.
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
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact valid map for the bomb-kill integration harness.
 *
 * @param {Array<[number, number, number]>} [overrides] - Optional [row, col, cellType] edits.
 * @returns {object} Raw map JSON object that passes D-03 semantic validation.
 */
function createBombKillRawMap(overrides = []) {
  const rawMap = {
    level: 97,
    metadata: {
      name: 'Bomb Kill Integration Harness',
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
 *   positionStore: PositionStore,
 *   world: World,
 * }} Ready-to-run integration harness.
 */
function createBombKillWorld(mapOverrides = []) {
  const world = new World();
  const mapResource = createMapResource(createBombKillRawMap(mapOverrides));
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
    positionStore,
    world,
  };
}

describe('B-07 power-up bomb-kill stun-timer contract', () => {
  it('clears the stun timer when bomb fire kills a stunned ghost', () => {
    // Use an EMPTY tile so the only intents recorded are about the ghost death.
    const { collisionIntents, colliderStore, ghostStore, positionStore, world } =
      createBombKillWorld([[1, 2, CELL_TYPE.EMPTY]]);

    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      1,
      2,
    );
    // A power-pellet leaves the ghost STUNNED with a live countdown in timerMs.
    ghostStore.state[ghost.id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghost.id] = 5000;

    // The bomb's explosion is represented by a FIRE collider on the ghost's tile,
    // which is the documented fire-kill collision entry point.
    addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.FIRE, 1, 2);

    world.runFixedStep({ dtMs: 16.6667 });

    // The ghost is recorded dead and, critically for BUG-18, its leftover stun
    // timer is zeroed so it cannot leak across the upcoming respawn.
    expect(ghostStore.state[ghost.id]).toBe(GHOST_STATE.DEAD);
    expect(ghostStore.timerMs[ghost.id]).toBe(0);
    expect(collisionIntents.some((intent) => intent.type === 'ghost-death')).toBe(true);
  });
});
