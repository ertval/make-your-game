/**
 * Integration test: player respawn invincibility must be visible to
 * collision-system within the same frame it is granted, not one frame later.
 *
 * collision-system runs before life-system in the logic phase (bootstrap.js),
 * and reads `playerStore.invincibilityMs` to decide hazard damage. This test
 * places fire directly on the spawn tile, kills the player, and steps several
 * frames to confirm the respawned player never takes fatal fire damage from
 * the hazard it respawns onto.
 *
 * Note: this passes both before and after the fix that consolidated the two
 * independent invincibility-store writers into one (life-system.js), since
 * both writers happened to agree on this exact scenario — it guards the
 * invariant going forward rather than reproducing a live bug.
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
import { FIXED_DT_MS } from '../../../src/ecs/resources/constants.js';
import { createEventQueue } from '../../../src/ecs/resources/event-queue.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  COLLISION_ENTITY_REQUIRED_MASK,
  createCollisionSystem,
} from '../../../src/ecs/systems/collision-system.js';
import { createLifeSystem } from '../../../src/ecs/systems/life-system.js';
import { World } from '../../../src/ecs/world/world.js';

function createRespawnHazardRawMap() {
  return {
    level: 106,
    metadata: {
      activeGhostTypes: [0],
      ghostSpeed: 4,
      maxGhosts: 1,
      name: 'BUG-17 Respawn Hazard Harness',
      timerSeconds: 120,
    },
    dimensions: { rows: 5, columns: 5 },
    grid: [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 6, 0, 1],
      [1, 0, 5, 0, 1],
      [1, 1, 1, 1, 1],
    ],
    spawn: {
      ghostHouse: { bottomRow: 3, leftCol: 2, rightCol: 2, topRow: 3 },
      ghostSpawnPoint: { row: 3, col: 2 },
      player: { row: 2, col: 2 },
    },
  };
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

describe('BUG-17 respawn invincibility cross-step sync', () => {
  it('does not immediately kill the player again when fire sits on the respawn tile', () => {
    const world = new World();
    const mapResource = createMapResource(createRespawnHazardRawMap());
    const maxEntities = 8;
    const positionStore = createPositionStore(maxEntities);
    const colliderStore = createColliderStore(maxEntities);
    const playerStore = createPlayerStore(maxEntities);
    const ghostStore = createGhostStore(maxEntities);
    const healthStore = createHealthStore(maxEntities);
    const eventQueue = createEventQueue();
    const collisionIntents = [];

    const player = world.createEntity(COLLISION_ENTITY_REQUIRED_MASK | COMPONENT_MASK.PLAYER);
    colliderStore.type[player.id] = COLLIDER_TYPE.PLAYER;
    placeEntity(positionStore, player.id, mapResource.playerSpawnRow, mapResource.playerSpawnCol);

    const playerLife = {
      lives: 3,
      isInvincible: false,
      invincibilityRemainingMs: 0,
    };
    const gameStatus = createGameStatus(GAME_STATE.PLAYING);

    world.setResource('mapResource', mapResource);
    world.setResource('position', positionStore);
    world.setResource('collider', colliderStore);
    world.setResource('player', playerStore);
    world.setResource('ghost', ghostStore);
    world.setResource('health', healthStore);
    world.setResource('collisionIntents', collisionIntents);
    world.setResource('eventQueue', eventQueue);
    world.setResource('playerLife', playerLife);
    world.setResource('gameStatus', gameStatus);
    world.setResource('playerEntity', player);

    // Bootstrap wiring registers collision-system before life-system in the
    // logic phase (src/game/bootstrap.js ~L378, ~L394) — match that order
    // exactly so this test reflects real runtime scheduling.
    world.registerSystem(createCollisionSystem());
    world.registerSystem(createLifeSystem());

    // A fire entity sits directly on the player's spawn tile so that, once
    // the player dies and is respawned onto that same tile, the very next
    // collision pass will see the player and the fire sharing a cell.
    addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.FIRE,
      mapResource.playerSpawnRow,
      mapResource.playerSpawnCol,
    );

    // Frame 1: a ghost also shares the player's tile this frame, so
    // collision-system emits a player-death intent that life-system consumes,
    // decrementing lives and respawning the player back onto the spawn tile
    // (which the fire entity still occupies).
    const ghost = addCollisionEntity(
      world,
      positionStore,
      colliderStore,
      COLLIDER_TYPE.GHOST,
      mapResource.playerSpawnRow,
      mapResource.playerSpawnCol,
    );

    world.runFixedStep({ dtMs: FIXED_DT_MS });

    expect(playerLife.lives).toBe(2);
    expect(playerLife.isInvincible).toBe(true);

    // The store read by collision-system must reflect the just-granted
    // invincibility within the SAME frame respawn happened, not one frame
    // later. This is the exact cross-step sync guarantee BUG-17 is about:
    // playerStore.invincibilityMs must never lag behind playerLife.
    expect(playerStore.invincibilityMs[player.id]).toBe(playerLife.invincibilityRemainingMs);

    // Move the ghost away so only the fire remains on the spawn tile for
    // subsequent frames — isolating the fire/invincibility interaction.
    placeEntity(positionStore, ghost.id, 1, 1);

    // Step a few more frames while the player sits on the spawn tile with
    // fire present. If invincibility sync lags by a frame relative to
    // collision-system's read, the player will take fatal fire damage here
    // and lose a second life immediately after respawning.
    for (let i = 0; i < 3; i += 1) {
      world.runFixedStep({ dtMs: FIXED_DT_MS });
    }

    expect(playerLife.lives).toBe(2);
    expect(collisionIntents.some((intent) => intent.type === 'player-death')).toBe(false);
  });
});
