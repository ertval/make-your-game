/**
 * Test: b-05-gameplay-event-surface.test.js
 * Purpose: Verifies deterministic gameplay events emitted by Track B simulation systems.
 * Public API: N/A (test module).
 * Implementation Notes:
 * - Uses the real World dispatcher and D-01 event queue resource.
 * - Keeps legacy collision intents in the harness to prove B-05 does not break B-04 consumers.
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
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createEventSurfaceRawMap(overrides = []) {
  const rawMap = {
    level: 105,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'B-05 Event Surface Harness',
      timerSeconds: 120,
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
      ghostHouse: {
        bottomRow: 3,
        leftCol: 2,
        rightCol: 2,
        topRow: 3,
      },
      ghostSpawnPoint: { row: 3, col: 2 },
      player: { row: 2, col: 2 },
    },
  };

  for (const [row, col, cellType] of overrides) {
    rawMap.grid[row][col] = cellType;
  }

  return rawMap;
}

function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

function addCollisionEntity(world, positionStore, colliderStore, colliderType, row, col) {
  const entity = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);

  colliderStore.type[entity.id] = colliderType;
  placeEntity(positionStore, entity.id, row, col);

  return entity;
}

function createEventSurfaceHarness(mapOverrides = []) {
  const world = new World();
  const mapResource = createMapResource(createEventSurfaceRawMap(mapOverrides));
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const playerStore = createPlayerStore(8);
  const ghostStore = createGhostStore(8);
  const healthStore = createHealthStore(8);
  const eventQueue = createEventQueue();
  const collisionIntents = [];
  const player = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK | COMPONENT_MASK.PLAYER);

  colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;
  placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('health', healthStore);
  world.setResource('collisionIntents', collisionIntents);
  world.setResource('eventQueue', eventQueue);
  world.registerSystem(createCollisionSystem());

  return {
    colliderStore,
    collisionIntents,
    eventQueue,
    ghostStore,
    player,
    positionStore,
    world,
  };
}

function collectSingleStaticEvent(cellType) {
  const { eventQueue, player, positionStore, world } = createEventSurfaceHarness([
    [1, 1, cellType],
  ]);

  placeEntity(positionStore, player.id, 1, 1);
  world.runFixedStep({ dtMs: 16.6667 });
  return drain(eventQueue);
}

function runContactScenario() {
  const { colliderStore, collisionIntents, eventQueue, player, positionStore, world } =
    createEventSurfaceHarness([[1, 1, CELL_TYPE.PELLET]]);

  placeEntity(positionStore, player.id, 1, 1);
  const ghost = addCollisionEntity(world, positionStore, colliderStore, COLLIDER_TYPE.GHOST, 1, 1);

  world.runFixedStep({ dtMs: 16.6667 });

  return {
    collisionIntents,
    events: drain(eventQueue),
    ghost,
    player,
  };
}

describe('B-05 gameplay event surface integration', () => {
  it('emits canonical pickup events for each static collectible type', () => {
    expect(collectSingleStaticEvent(CELL_TYPE.PELLET).map((event) => event.type)).toEqual([
      GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
    ]);
    expect(collectSingleStaticEvent(CELL_TYPE.POWER_PELLET).map((event) => event.type)).toEqual([
      GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED,
    ]);
    expect(collectSingleStaticEvent(CELL_TYPE.POWER_UP_SPEED).map((event) => event.type)).toEqual([
      GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED,
    ]);
  });

  it('emits stable queued events for pickup followed by lethal ghost contact', () => {
    const { collisionIntents, events, ghost, player } = runContactScenario();

    expect(collisionIntents.map((intent) => intent.type)).toEqual([
      'pellet-collected',
      'player-death',
    ]);
    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          entityId: player.id,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
          tile: { row: 1, col: 1 },
        },
        type: GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED,
      },
      {
        frame: 0,
        order: 1,
        payload: {
          entityId: player.id,
          ghostState: GHOST_STATE.NORMAL,
          sourceEntityId: ghost.id,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
          tile: { row: 1, col: 1 },
        },
        type: GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT,
      },
    ]);
  });

  it('produces identical B-system event streams for identical repeated runs', () => {
    const firstRun = runContactScenario().events;
    const secondRun = runContactScenario().events;

    expect(secondRun).toEqual(firstRun);
  });
});
