/**
 * BUG-17 integration: ghost keeps moving without a configured ghost speed.
 *
 * Reproduces the freeze reported in issue #130: when a map omits `ghostSpeed`
 * and no per-entity speed is configured, `resolveGhostSpeed` previously returned
 * 0, the movement guard (`speed > 0`) skipped advancing the ghost, and the ghost
 * froze on its spawn tile forever. This test bootstraps a minimal ECS world with
 * NO ghost speed anywhere, runs ~60 simulation steps, and asserts the ghost's
 * position actually advances — proving the terminal `GHOST_DEFAULT_SPEED`
 * fallback keeps the AI moving.
 *
 * The harness mirrors the unit-test bootstrap style (direct World + component
 * stores) rather than the full game bootstrap, because we need precise control
 * over leaving `ghostSpeed` undefined while keeping every other resource valid.
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

// Open 9x9 map. Critically, `metadata` omits `ghostSpeed`, so the derived
// `mapResource.ghostSpeed` is undefined — the BUG-17 trigger condition.
function createNoSpeedMap() {
  return {
    level: 1,
    metadata: {
      name: 'No Ghost Speed Harness',
      timerSeconds: 120,
      maxGhosts: 4,
      // ghostSpeed intentionally omitted.
      activeGhostTypes: [0, 1, 2, 3],
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
      player: { row: 3, col: 4 },
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
  const mapResource = createMapResource(createNoSpeedMap());

  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.POSITION);
  positionStore.row[playerEntity.id] = mapResource.playerSpawnRow;
  positionStore.col[playerEntity.id] = mapResource.playerSpawnCol;
  positionStore.targetRow[playerEntity.id] = mapResource.playerSpawnRow;
  positionStore.targetCol[playerEntity.id] = mapResource.playerSpawnCol;

  // Single Blinky ghost placed in an open corridor tile, NOT in the ghost house,
  // so it has legal moves the moment the system ticks.
  const ghost = world.createEntity(GHOST_AI_REQUIRED_MASK);
  ghostStore.type[ghost.id] = GHOST_TYPE.BLINKY;
  ghostStore.state[ghost.id] = GHOST_STATE.NORMAL;
  ghostStore.timerMs[ghost.id] = 0;
  ghostStore.speed[ghost.id] = 0; // no per-entity speed: relies on the fallback
  positionStore.row[ghost.id] = 1;
  positionStore.col[ghost.id] = 5;
  positionStore.prevRow[ghost.id] = 1;
  positionStore.prevCol[ghost.id] = 5;
  positionStore.targetRow[ghost.id] = 1;
  positionStore.targetCol[ghost.id] = 5;

  world.setResource('ghost', ghostStore);
  world.setResource('position', positionStore);
  world.setResource('velocity', velocityStore);
  world.setResource('player', playerStore);
  world.setResource('mapResource', mapResource);
  world.setResource('playerEntity', playerEntity);
  world.setResource('gameStatus', createGameStatus(GAME_STATE.PLAYING));

  return { world, ghostStore, positionStore, velocityStore, mapResource, ghostId: ghost.id };
}

describe('BUG-17 ghost default speed fallback (integration)', () => {
  it('ghost without configured ghostSpeed still advances over ~60 steps', () => {
    const { world, positionStore, ghostId, mapResource } = buildWorld();
    // Confirm the bug's trigger condition is actually present.
    expect(mapResource.ghostSpeed).toBeUndefined();

    const startRow = positionStore.row[ghostId];
    const startCol = positionStore.col[ghostId];

    const system = createGhostAiSystem();
    for (let frame = 0; frame < 60; frame += 1) {
      system.update({ world, dtMs: FIXED_DT_MS, frame });
    }

    const moved =
      positionStore.row[ghostId] !== startRow || positionStore.col[ghostId] !== startCol;
    expect(moved).toBe(true);
  });

  it('reports a positive effective speed instead of freezing', () => {
    const { world, velocityStore, ghostId } = buildWorld();

    const system = createGhostAiSystem();
    system.update({ world, dtMs: FIXED_DT_MS, frame: 0 });

    // The system writes the resolved speed onto the velocity store each tick.
    expect(velocityStore.speedTilesPerSecond[ghostId]).toBeGreaterThan(0);
  });
});
