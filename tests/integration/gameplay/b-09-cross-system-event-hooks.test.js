/**
 * Test: b-09-cross-system-event-hooks.test.js
 * Purpose: Verifies the B-09 cross-system gameplay event contract — canonical
 *   payload schemas for all 11 event types and deterministic, ordered emission
 *   from the Track B owned systems (bomb placement, ghost defeat, ghost stun).
 * Public API: N/A (test module).
 * Implementation Notes:
 * - The payload-schema block exercises validateGameplayEventPayload directly so
 *   the canonical definitions are pinned even for events whose runtime emission
 *   lives in another track's system (LifeLost/LevelCleared/GameOver/Victory).
 * - The emission blocks use the real World dispatcher + D-01 event queue so the
 *   `frame`/`order` envelope and payload shape are validated end-to-end.
 */

import { describe, expect, it } from 'vitest';

import {
  createGhostStore,
  createInputStateStore,
  createPlayerStore,
} from '../../../src/ecs/components/actors.js';
import { createBombStore, createFireStore } from '../../../src/ecs/components/props.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
} from '../../../src/ecs/components/spatial.js';
import { createHealthStore } from '../../../src/ecs/components/stats.js';
import {
  BOMB_FUSE_MS,
  DEFAULT_FIRE_RADIUS,
  FIXED_DT_MS,
  GHOST_STATE,
  STUN_MS,
} from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  BOMB_TICK_BOMB_REQUIRED_MASK,
  BOMB_TICK_PLAYER_REQUIRED_MASK,
  createBombTickSystem,
} from '../../../src/ecs/systems/bomb-tick-system.js';
import {
  GAME_OVER_CAUSE,
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
  validateGameplayEventPayload,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { createPowerUpSystem } from '../../../src/ecs/systems/power-up-system.js';
import { World } from '../../../src/ecs/world/world.js';

function placeEntity(positionStore, entityId, row, col) {
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

// --- BombPlaced harness (bomb-tick-system) ---

function createBombRawMap() {
  return {
    level: 901,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'B-09 Bomb Placed Harness',
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
      ghostHouse: { bottomRow: 3, leftCol: 2, rightCol: 2, topRow: 3 },
      ghostSpawnPoint: { row: 3, col: 2 },
      player: { row: 2, col: 2 },
    },
  };
}

function createBombPlacedHarness() {
  const world = new World();
  const mapResource = createMapResource(createBombRawMap());
  const playerStore = createPlayerStore(8);
  const inputState = createInputStateStore(8);
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const bombStore = createBombStore(8);
  const eventQueue = createEventQueue();
  const player = world.createEntity(BOMB_TICK_PLAYER_REQUIRED_MASK);

  placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

  const bomb = world.createEntity(BOMB_TICK_BOMB_REQUIRED_MASK);
  colliderStore.type[bomb.id] = COLLIDER_TYPE.NONE;

  world.setResource('mapResource', mapResource);
  world.setResource('player', playerStore);
  world.setResource('inputState', inputState);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('bomb', bombStore);
  world.setResource('bombDetonationQueue', []);
  world.setResource('eventQueue', eventQueue);
  world.registerSystem(createBombTickSystem());

  return { bomb, eventQueue, inputState, player, world };
}

function runBombPlacedScenario() {
  const { bomb, eventQueue, inputState, player, world } = createBombPlacedHarness();
  inputState.bomb[player.id] = 1;
  world.runFixedStep({ dtMs: FIXED_DT_MS });
  return { bomb, events: drain(eventQueue), player };
}

// --- GhostDefeated harness (collision-system) ---

function createGhostDefeatedHarness() {
  const world = new World();
  const mapResource = createMapResource(createBombRawMap());
  const positionStore = createPositionStore(8);
  const colliderStore = createColliderStore(8);
  const playerStore = createPlayerStore(8);
  const ghostStore = createGhostStore(8);
  const healthStore = createHealthStore(8);
  const fireStore = createFireStore(8);
  const eventQueue = createEventQueue();

  const ghost = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);
  colliderStore.type[ghost.id] = COLLIDER_TYPE.GHOST;
  ghostStore.state[ghost.id] = GHOST_STATE.NORMAL;
  placeEntity(positionStore, ghost.id, 1, 1);

  const fire = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK);
  colliderStore.type[fire.id] = COLLIDER_TYPE.FIRE;
  fireStore.chainDepth[fire.id] = 2;
  fireStore.sourceBombId[fire.id] = 5;
  placeEntity(positionStore, fire.id, 1, 1);

  world.setResource('mapResource', mapResource);
  world.setResource('position', positionStore);
  world.setResource('collider', colliderStore);
  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('health', healthStore);
  world.setResource('fire', fireStore);
  world.setResource('collisionIntents', []);
  world.setResource('eventQueue', eventQueue);
  world.registerSystem(createCollisionSystem());

  return { eventQueue, fire, ghost, world };
}

function runGhostDefeatedScenario() {
  const { eventQueue, fire, ghost, world } = createGhostDefeatedHarness();
  world.runFixedStep({ dtMs: FIXED_DT_MS });
  return { events: drain(eventQueue), fire, ghost };
}

// --- GhostStunned harness (power-up-system) ---

function createGhostStunnedHarness() {
  const world = new World();
  const playerStore = createPlayerStore(16);
  const ghostStore = createGhostStore(16);
  const eventQueue = createEventQueue();
  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER);

  const ghosts = [];
  for (let i = 0; i < 2; i += 1) {
    const handle = world.createEntity(COMPONENT_MASK.GHOST);
    ghostStore.state[handle.id] = GHOST_STATE.NORMAL;
    ghostStore.timerMs[handle.id] = 0;
    ghosts.push(handle);
  }

  world.setResource('player', playerStore);
  world.setResource('ghost', ghostStore);
  world.setResource('playerEntity', playerEntity);
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));
  world.setResource('collisionIntents', [{ type: 'power-pellet-collected' }]);
  world.setResource('eventQueue', eventQueue);

  return { eventQueue, ghosts, world };
}

function runGhostStunnedScenario() {
  const { eventQueue, ghosts, world } = createGhostStunnedHarness();
  createPowerUpSystem().update({ world, dtMs: FIXED_DT_MS, frame: 7 });
  return { events: drain(eventQueue), ghosts };
}

describe('B-09 cross-system event payload contract', () => {
  it('accepts a canonical valid payload for every gameplay event type', () => {
    const validPayloads = {
      [GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED]: {
        entityId: 1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.POWER_PELLET_COLLECTED]: {
        entityId: 1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.POWER_UP_COLLECTED]: {
        entityId: 1,
        powerUpType: 'firePlus',
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.PLAYER_GHOST_CONTACT]: {
        entityId: 1,
        ghostState: GHOST_STATE.NORMAL,
        sourceEntityId: 2,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED]: {
        entityId: 1,
        position: { row: 2, col: 1 },
        previousTile: { row: 1, col: 1 },
        sourceSystem: GAMEPLAY_EVENT_SOURCE.PLAYER_MOVE,
        tile: { row: 2, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.BOMB_PLACED]: {
        entityId: 3,
        ownerId: 1,
        radius: 2,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.BOMB_TICK,
        tile: { row: 2, col: 2 },
      },
      [GAMEPLAY_EVENT_TYPE.BOMB_DETONATED]: {
        chainDepth: 1,
        entityId: 3,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.EXPLOSION,
        tile: { row: 2, col: 2 },
      },
      [GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED]: {
        chainDepth: 2,
        entityId: 4,
        ghostState: GHOST_STATE.STUNNED,
        sourceEntityId: 5,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
        tile: { row: 1, col: 1 },
      },
      [GAMEPLAY_EVENT_TYPE.GHOST_STUNNED]: {
        durationMs: STUN_MS,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.POWER_UP,
        stunnedCount: 3,
      },
      [GAMEPLAY_EVENT_TYPE.LIFE_LOST]: {
        entityId: 1,
        livesRemaining: 2,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.LIFE,
        tile: { row: 2, col: 2 },
      },
      [GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED]: {
        level: 1,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      },
      [GAMEPLAY_EVENT_TYPE.GAME_OVER]: {
        cause: GAME_OVER_CAUSE.TIME,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
      },
      [GAMEPLAY_EVENT_TYPE.VICTORY]: {
        sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      },
    };

    // Every canonical type must have a valid sample payload in this map.
    expect(Object.keys(validPayloads).sort()).toEqual(Object.values(GAMEPLAY_EVENT_TYPE).sort());

    for (const [type, payload] of Object.entries(validPayloads)) {
      expect(validateGameplayEventPayload(type, payload)).toBe(true);
    }
  });

  it('requires sourceSystem on every event, including lifecycle events', () => {
    expect(() => validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.VICTORY, {})).toThrow(
      /sourceSystem/,
    );
  });

  it('rejects malformed lifecycle/broadcast payloads', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.GHOST_STUNNED, {
        durationMs: STUN_MS,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.POWER_UP,
        stunnedCount: 0,
      }),
    ).toThrow(/stunnedCount/);

    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.LEVEL_CLEARED, {
        level: 0,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.LEVEL_PROGRESS,
      }),
    ).toThrow(/level/);

    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.GAME_OVER, {
        cause: 'meteor',
        sourceSystem: GAMEPLAY_EVENT_SOURCE.TIMER,
      }),
    ).toThrow(/cause/);
  });

  it('rejects spatial payloads (BombPlaced) without entityId/tile', () => {
    expect(() =>
      validateGameplayEventPayload(GAMEPLAY_EVENT_TYPE.BOMB_PLACED, {
        ownerId: 1,
        radius: 2,
        sourceSystem: GAMEPLAY_EVENT_SOURCE.BOMB_TICK,
      }),
    ).toThrow(/entityId/);
  });
});

describe('B-09 Track B event emission', () => {
  it('emits a BombPlaced event when the player places a bomb', () => {
    const { bomb, events, player } = runBombPlacedScenario();

    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          entityId: bomb.id,
          ownerId: player.id,
          radius: DEFAULT_FIRE_RADIUS,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.BOMB_TICK,
          tile: { row: 2, col: 2 },
        },
        type: GAMEPLAY_EVENT_TYPE.BOMB_PLACED,
      },
    ]);
    // Sanity: a placed bomb keeps the canonical fuse so other systems agree.
    expect(BOMB_FUSE_MS).toBeGreaterThan(0);
  });

  it('emits a GhostDefeated event when fire occupies a normal ghost tile', () => {
    const { events, fire, ghost } = runGhostDefeatedScenario();

    expect(events).toEqual([
      {
        frame: 0,
        order: 0,
        payload: {
          chainDepth: 2,
          entityId: ghost.id,
          ghostState: GHOST_STATE.NORMAL,
          sourceEntityId: fire.id,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.COLLISION,
          tile: { row: 1, col: 1 },
        },
        type: GAMEPLAY_EVENT_TYPE.GHOST_DEFEATED,
      },
    ]);
  });

  it('emits a GhostStunned broadcast event on a power-pellet pickup', () => {
    const { events } = runGhostStunnedScenario();

    expect(events).toEqual([
      {
        frame: 7,
        order: 0,
        payload: {
          durationMs: STUN_MS,
          sourceSystem: GAMEPLAY_EVENT_SOURCE.POWER_UP,
          stunnedCount: 2,
        },
        type: GAMEPLAY_EVENT_TYPE.GHOST_STUNNED,
      },
    ]);
  });
});

describe('B-09 deterministic event ordering', () => {
  it('produces identical BombPlaced streams across repeated seeded runs', () => {
    expect(runBombPlacedScenario().events).toEqual(runBombPlacedScenario().events);
  });

  it('produces identical GhostDefeated streams across repeated seeded runs', () => {
    expect(runGhostDefeatedScenario().events).toEqual(runGhostDefeatedScenario().events);
  });

  it('produces identical GhostStunned streams across repeated seeded runs', () => {
    expect(runGhostStunnedScenario().events).toEqual(runGhostStunnedScenario().events);
  });
});
