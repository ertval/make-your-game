/**
 * BUG-22 integration: Inky chases the player when Blinky is absent.
 *
 * Reproduces issue #135: when BLINKY is not among the active ghosts,
 * `findBlinkyTile` previously fell through to `{ row: 0, col: 0 }`. Inky's
 * doubled-vector flank target was then computed off the (0,0) corner, sending
 * Inky to patrol the top-left edge of the map regardless of where the player is
 * — a silent mis-targeting bug. The fix makes `findBlinkyTile` return null and
 * routes Inky through the Blinky-style direct-chase fallback when Blinky is
 * absent.
 *
 * This test bootstraps a minimal ECS world containing ONLY an Inky ghost (no
 * Blinky), runs several simulation steps with the player far from the (0,0)
 * corner, and asserts Inky moves toward the player (chases) instead of drifting
 * toward the origin.
 */

import { describe, expect, it } from 'vitest';
import { createGhostStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore, createVelocityStore } from '../../../src/ecs/components/spatial.js';
import { FIXED_DT_MS, GHOST_STATE, GHOST_TYPE } from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  createGhostAiSystem,
  GHOST_AI_REQUIRED_MASK,
} from '../../../src/ecs/systems/ghost-ai-system.js';
import { World } from '../../../src/ecs/world/world.js';

// Open 9x9 map with only non-Blinky ghosts active (Inky present, Blinky absent).
function createInkyOnlyMap() {
  return {
    level: 1,
    metadata: {
      name: 'Inky Without Blinky Harness',
      timerSeconds: 120,
      maxGhosts: 4,
      ghostSpeed: 4.0,
      activeGhostTypes: [GHOST_TYPE.PINKY, GHOST_TYPE.INKY, GHOST_TYPE.CLYDE],
    },
    dimensions: { rows: 9, columns: 9 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 1, 0, 1],
      [1, 0, 0, 0, 6, 0, 0, 0, 1],
      [1, 0, 0, 5, 5, 5, 0, 0, 1],
      [1, 0, 0, 5, 5, 5, 0, 0, 1],
      [1, 0, 1, 0, 0, 0, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 3, col: 6 },
      ghostHouse: { topRow: 4, bottomRow: 5, leftCol: 3, rightCol: 5 },
      ghostSpawnPoint: { row: 4, col: 4 },
    },
  };
}

function buildWorld() {
  const world = new World();
  const ghostStore = createGhostStore(16);
  const positionStore = createPositionStore(16);
  const velocityStore = createVelocityStore(16);
  const playerStore = createPlayerStore(16);
  const mapResource = createMapResource(createInkyOnlyMap());

  // Player parked at (3,6), an open tile. When Blinky is absent the buggy
  // doubled-vector flank computes Inky's target as 2 × playerTile reflected
  // about the (0,0) origin — i.e. roughly (6,12), off the map to the
  // bottom-right — which steers Inky AWAY from a player sitting up-and-left of
  // the ghost. The corrected chase fallback instead targets the player tile
  // directly, so Inky converges on the player.
  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.POSITION);
  const playerRow = 3;
  const playerCol = 6;
  positionStore.row[playerEntity.id] = playerRow;
  positionStore.col[playerEntity.id] = playerCol;
  positionStore.targetRow[playerEntity.id] = playerRow;
  positionStore.targetCol[playerEntity.id] = playerCol;

  // Single Inky ghost starting beyond the player from the origin (bottom-right
  // open area), so the buggy origin-reflected target and the correct chase
  // target lie on OPPOSITE sides of Inky — making the two behaviors diverge.
  const inky = world.createEntity(GHOST_AI_REQUIRED_MASK);
  ghostStore.type[inky.id] = GHOST_TYPE.INKY;
  ghostStore.state[inky.id] = GHOST_STATE.NORMAL;
  ghostStore.timerMs[inky.id] = 0;
  ghostStore.speed[inky.id] = 4.0;
  const inkyStartRow = 7;
  const inkyStartCol = 7;
  positionStore.row[inky.id] = inkyStartRow;
  positionStore.col[inky.id] = inkyStartCol;
  positionStore.prevRow[inky.id] = inkyStartRow;
  positionStore.prevCol[inky.id] = inkyStartCol;
  positionStore.targetRow[inky.id] = inkyStartRow;
  positionStore.targetCol[inky.id] = inkyStartCol;

  world.setResource('ghost', ghostStore);
  world.setResource('position', positionStore);
  world.setResource('velocity', velocityStore);
  world.setResource('player', playerStore);
  world.setResource('mapResource', mapResource);
  world.setResource('playerEntity', playerEntity);
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));

  return {
    world,
    ghostStore,
    positionStore,
    inkyId: inky.id,
    playerRow,
    playerCol,
    inkyStartRow,
    inkyStartCol,
  };
}

function distanceToPlayer(positionStore, ghostId, playerRow, playerCol) {
  const dRow = positionStore.row[ghostId] - playerRow;
  const dCol = positionStore.col[ghostId] - playerCol;
  return Math.hypot(dRow, dCol);
}

describe('BUG-22 Inky chases when Blinky is absent (integration)', () => {
  it('Inky moves toward the player instead of flanking off a bogus (0,0) Blinky tile', () => {
    const { world, positionStore, inkyId, playerRow, playerCol } = buildWorld();

    const startDistance = distanceToPlayer(positionStore, inkyId, playerRow, playerCol);

    const system = createGhostAiSystem();
    for (let frame = 0; frame < 60; frame += 1) {
      system.update({ world, dtMs: FIXED_DT_MS, frame });
    }

    const endDistance = distanceToPlayer(positionStore, inkyId, playerRow, playerCol);

    // Chase behavior: Inky closes in on the player and ends up adjacent to it.
    // Under the bug, the doubled-vector flank target reflected about (0,0)
    // (≈ (6,12), off-map) walls Inky off ~2+ tiles short of the player, so this
    // tight threshold fails. The chase fallback brings it within one tile.
    expect(endDistance).toBeLessThan(startDistance);
    expect(endDistance).toBeLessThanOrEqual(1.5);
  });
});
