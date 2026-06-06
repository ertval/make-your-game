/**
 * Unit tests for the B-08 ghost AI system.
 *
 * These checks lock the personality targeting math, the Normal → Stunned →
 * Dead state machine, the no-reverse rule, the level-driven speed selection,
 * the eyes-return path, and seeded determinism of repeated steps.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGhostStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore, createVelocityStore } from '../../../src/ecs/components/spatial.js';
import {
  CLYDE_DISTANCE_THRESHOLD,
  FIXED_DT_MS,
  GHOST_STATE,
  GHOST_STUNNED_SPEED,
  GHOST_TYPE,
  PINKY_TARGET_OFFSET,
} from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  computeBlinkyTarget,
  computeClydeTarget,
  computeInkyTarget,
  computePinkyTarget,
  createGhostAiSystem,
  GHOST_AI_DIRECTIONS,
  GHOST_AI_REQUIRED_MASK,
  GHOST_DIRECTION_VECTOR,
  resolveGhostSpeed,
  resolveGhostTargetTile,
  selectDeadGhostReturnDirection,
  selectGhostDirection,
  vectorToDirection,
} from '../../../src/ecs/systems/ghost-ai-system.js';
import { World } from '../../../src/ecs/world/world.js';

const LEVEL_1_MAP = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../assets/maps/level-1.json', import.meta.url)),
    'utf8',
  ),
);

function createGhostMap() {
  return {
    level: 1,
    metadata: {
      name: 'Ghost AI Harness',
      timerSeconds: 120,
      maxGhosts: 4,
      ghostSpeed: 4.0,
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

function createGhostHarness({ ghostCount = 1, gameState = GAME_STATE.PLAYING } = {}) {
  const world = new World();
  const ghostStore = createGhostStore(16);
  const positionStore = createPositionStore(16);
  const velocityStore = createVelocityStore(16);
  const playerStore = createPlayerStore(16);
  const mapResource = createMapResource(createGhostMap());

  const playerEntity = world.createEntity(COMPONENT_MASK.PLAYER | COMPONENT_MASK.POSITION);
  positionStore.row[playerEntity.id] = mapResource.playerSpawnRow;
  positionStore.col[playerEntity.id] = mapResource.playerSpawnCol;
  positionStore.targetRow[playerEntity.id] = mapResource.playerSpawnRow;
  positionStore.targetCol[playerEntity.id] = mapResource.playerSpawnCol;

  const ghostHandles = [];
  for (let i = 0; i < ghostCount; i += 1) {
    const handle = world.createEntity(GHOST_AI_REQUIRED_MASK);
    ghostStore.type[handle.id] = i; // default: 0=Blinky, 1=Pinky, ...
    ghostStore.state[handle.id] = GHOST_STATE.NORMAL;
    ghostStore.timerMs[handle.id] = 0;
    ghostStore.speed[handle.id] = 0;
    positionStore.row[handle.id] = mapResource.ghostSpawnRow;
    positionStore.col[handle.id] = mapResource.ghostSpawnCol;
    positionStore.targetRow[handle.id] = mapResource.ghostSpawnRow;
    positionStore.targetCol[handle.id] = mapResource.ghostSpawnCol;
    ghostHandles.push(handle);
  }

  world.setResource('ghost', ghostStore);
  world.setResource('position', positionStore);
  world.setResource('velocity', velocityStore);
  world.setResource('player', playerStore);
  world.setResource('mapResource', mapResource);
  world.setResource('playerEntity', playerEntity);
  world.setResource('gameStatus', createGameStatus(gameState));

  return {
    world,
    ghostStore,
    positionStore,
    velocityStore,
    playerStore,
    mapResource,
    playerEntity,
    ghostHandles,
  };
}

function placeGhost(positionStore, ghostId, row, col) {
  positionStore.row[ghostId] = row;
  positionStore.col[ghostId] = col;
  positionStore.prevRow[ghostId] = row;
  positionStore.prevCol[ghostId] = col;
  positionStore.targetRow[ghostId] = row;
  positionStore.targetCol[ghostId] = col;
}

function runUpdate(system, world, { dtMs = FIXED_DT_MS, frame = 0 } = {}) {
  system.update({ world, dtMs, frame });
}

describe('ghost-ai-system: targeting math', () => {
  it('Blinky targets the player tile exactly', () => {
    expect(computeBlinkyTarget({ row: 3, col: 5 })).toEqual({ row: 3, col: 5 });
  });

  it('Pinky targets four tiles ahead of the player direction', () => {
    expect(computePinkyTarget({ row: 5, col: 5 }, { rowDelta: 0, colDelta: 1 })).toEqual({
      row: 5,
      col: 5 + PINKY_TARGET_OFFSET,
    });
    expect(computePinkyTarget({ row: 5, col: 5 }, { rowDelta: -1, colDelta: 0 })).toEqual({
      row: 5 - PINKY_TARGET_OFFSET,
      col: 5,
    });
  });

  it('Pinky targets player tile when player is idle', () => {
    expect(computePinkyTarget({ row: 3, col: 3 }, { rowDelta: 0, colDelta: 0 })).toEqual({
      row: 3,
      col: 3,
    });
  });

  it('Inky doubles the Blinky→pivot vector around Blinky', () => {
    // Player at (5,5), heading right. Pivot is 2 ahead: (5,7).
    // Blinky at (5,3). Doubled vector = pivot + (pivot - Blinky) = (5,7) + (0,4) = (5,11).
    expect(
      computeInkyTarget({ row: 5, col: 5 }, { rowDelta: 0, colDelta: 1 }, { row: 5, col: 3 }),
    ).toEqual({ row: 5, col: 11 });
  });

  it('Clyde chases like Blinky when far away (> threshold)', () => {
    const mapResource = { rows: 11, cols: 15 };
    // Ghost far from player.
    const ghostTile = { row: 1, col: 1 };
    const playerTile = { row: 9, col: 13 };
    expect(computeClydeTarget(playerTile, ghostTile, mapResource)).toEqual(playerTile);
  });

  it('Clyde retreats to the bottom-left corner when within threshold', () => {
    const mapResource = { rows: 11, cols: 15 };
    const ghostTile = { row: 5, col: 5 };
    const playerTile = { row: 5, col: 5 + CLYDE_DISTANCE_THRESHOLD - 1 };
    expect(computeClydeTarget(playerTile, ghostTile, mapResource)).toEqual({ row: 10, col: 0 });
  });

  it('resolveGhostTargetTile dispatches per ghost type', () => {
    const context = {
      ghostTile: { row: 5, col: 5 },
      playerTile: { row: 3, col: 3 },
      playerVector: { rowDelta: -1, colDelta: 0 },
      blinkyTile: { row: 6, col: 5 },
      mapResource: { rows: 11, cols: 15 },
    };

    expect(resolveGhostTargetTile(GHOST_TYPE.BLINKY, context)).toEqual({ row: 3, col: 3 });
    expect(resolveGhostTargetTile(GHOST_TYPE.PINKY, context)).toEqual({
      row: 3 - PINKY_TARGET_OFFSET,
      col: 3,
    });
    // For Clyde, distance is sqrt(8) ≈ 2.83 → close → bottom-left corner.
    expect(resolveGhostTargetTile(GHOST_TYPE.CLYDE, context)).toEqual({ row: 10, col: 0 });
  });
});

describe('ghost-ai-system: direction selection', () => {
  it('chooses the direction whose adjacent tile is closest to the target', () => {
    const mapResource = createMapResource(createGhostMap());
    // Place at center of an open area. Target is up-left so 'up' or 'left' should win.
    const direction = selectGhostDirection({
      ghostTile: { row: 3, col: 5 },
      targetTile: { row: 1, col: 3 },
      state: GHOST_STATE.NORMAL,
      previousVector: null,
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    // Tie-breaking order is up, left, down, right. From (3,5) target (1,3):
    //   up    → (2,5) dist² = 1+4 = 5
    //   left  → (3,4) dist² = 4+1 = 5
    //   down  → (4,5) blocked? (4,5) is ghost house; not passable for ghost? It IS passable for ghost.
    //   right → (3,6) dist² = 4+9 = 13
    // 'up' wins by stable tie-break order.
    expect(direction).toBe('up');
  });

  it('refuses to reverse when in NORMAL state', () => {
    const mapResource = createMapResource(createGhostMap());
    // Moving right currently. Target back-left should not pick 'left' (reverse).
    const direction = selectGhostDirection({
      ghostTile: { row: 1, col: 4 },
      targetTile: { row: 1, col: 1 },
      state: GHOST_STATE.NORMAL,
      previousVector: { rowDelta: 0, colDelta: 1 }, // last moved right
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    expect(direction).not.toBe('left');
  });

  it('allows reversing when DEAD (eyes returning)', () => {
    const mapResource = createMapResource(createGhostMap());
    const direction = selectGhostDirection({
      ghostTile: { row: 1, col: 4 },
      targetTile: { row: 1, col: 1 },
      state: GHOST_STATE.DEAD,
      previousVector: { rowDelta: 0, colDelta: 1 },
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    expect(direction).toBe('left');
  });

  it('Stunned ghosts flee — pick direction maximizing distance to player', () => {
    const mapResource = createMapResource(createGhostMap());
    // Ghost at (1,4); "target" passed in is the player tile to flee. With
    // prefersDistance=true, the direction whose adjacent tile is farthest
    // from the player wins.
    const direction = selectGhostDirection({
      ghostTile: { row: 1, col: 4 },
      targetTile: { row: 3, col: 4 }, // player is below ghost
      state: GHOST_STATE.STUNNED,
      previousVector: { rowDelta: 0, colDelta: 1 },
      mapResource,
      bombCells: null,
      prefersDistance: true,
    });
    // Only 'left' or 'right' are open (up/down blocked or ghost-house);
    // 'left' moves to (1,3) — farther from (3,4) than (1,5).
    // d²(1,3 → 3,4) = 4+1 = 5; d²(1,5 → 3,4) = 4+1 = 5 — tie.
    // First-by-iteration tie-break wins: 'up'? (1,4) up→(0,4) is wall.
    // 'left' is checked before 'right', so 'left' wins.
    expect(['left', 'right']).toContain(direction);
  });

  it('blocks live ghosts from entering the ghost house from outside (one-way gate)', () => {
    const mapResource = createMapResource(createGhostMap());
    // Ghost is just above the ghost-house top row; moving down would enter the house.
    const direction = selectGhostDirection({
      ghostTile: { row: 3, col: 4 },
      targetTile: { row: 7, col: 4 },
      state: GHOST_STATE.NORMAL,
      previousVector: { rowDelta: 1, colDelta: 0 },
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    expect(direction).not.toBe('down');
  });

  it('blocks stunned ghosts from entering the ghost house from outside', () => {
    const mapResource = createMapResource(createGhostMap());
    const direction = selectGhostDirection({
      ghostTile: { row: 3, col: 4 },
      targetTile: { row: 7, col: 4 },
      state: GHOST_STATE.STUNNED,
      previousVector: { rowDelta: 1, colDelta: 0 },
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    expect(direction).not.toBe('down');
  });

  it('allows DEAD eyes to enter the ghost house', () => {
    const mapResource = createMapResource(createGhostMap());
    const direction = selectGhostDirection({
      ghostTile: { row: 3, col: 4 },
      targetTile: { row: 4, col: 4 },
      state: GHOST_STATE.DEAD,
      previousVector: null,
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    expect(direction).toBe('down');
  });

  it('allows ghosts already inside the house to move freely between house cells', () => {
    const mapResource = createMapResource(createGhostMap());
    // Ghost is inside the ghost house and moves to another ghost-house cell.
    const direction = selectGhostDirection({
      ghostTile: { row: 4, col: 4 },
      targetTile: { row: 4, col: 5 },
      state: GHOST_STATE.NORMAL,
      previousVector: null,
      mapResource,
      bombCells: null,
      prefersDistance: false,
    });
    // Right is a ghost-house cell and the ghost is currently in the house, so it's allowed.
    expect(direction).toBe('right');
  });

  it('refuses bomb cells when the bomb-occupancy set marks them', () => {
    const mapResource = createMapResource(createGhostMap());
    // From (1,4) the candidates are up (wall), left(1,3), right(1,5), down(2,4).
    const cols = mapResource.cols;
    const bombCells = new Set([1 * cols + 3]); // block 'left'
    const direction = selectGhostDirection({
      ghostTile: { row: 1, col: 4 },
      targetTile: { row: 1, col: 1 },
      state: GHOST_STATE.NORMAL,
      previousVector: null,
      mapResource,
      bombCells,
      prefersDistance: false,
    });
    expect(direction).not.toBe('left');
  });

  it('vectorToDirection inverts cleanly', () => {
    expect(vectorToDirection(-1, 0)).toBe('up');
    expect(vectorToDirection(1, 0)).toBe('down');
    expect(vectorToDirection(0, -1)).toBe('left');
    expect(vectorToDirection(0, 1)).toBe('right');
    expect(vectorToDirection(0, 0)).toBeNull();
  });
});

describe('ghost-ai-system: speed resolution', () => {
  it('stunned ghosts always use canonical stunned speed', () => {
    const ghostStore = createGhostStore(4);
    ghostStore.state[0] = GHOST_STATE.STUNNED;
    ghostStore.speed[0] = 7.5;
    expect(resolveGhostSpeed(ghostStore, 0, { ghostSpeed: 4.0 })).toBe(GHOST_STUNNED_SPEED);
  });

  it('normal ghosts prefer per-entity speed, falling back to map ghostSpeed', () => {
    const ghostStore = createGhostStore(4);
    ghostStore.state[0] = GHOST_STATE.NORMAL;
    ghostStore.speed[0] = 5.0;
    expect(resolveGhostSpeed(ghostStore, 0, { ghostSpeed: 4.0 })).toBe(5.0);

    ghostStore.speed[0] = 0;
    expect(resolveGhostSpeed(ghostStore, 0, { ghostSpeed: 4.0 })).toBe(4.0);
  });
});

describe('ghost-ai-system: integration', () => {
  it('does nothing when game is not PLAYING', () => {
    const { world, ghostStore, positionStore, velocityStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
      gameState: GAME_STATE.PAUSED,
    });
    placeGhost(positionStore, ghostHandles[0].id, 1, 5);
    ghostStore.speed[ghostHandles[0].id] = 4.0;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: 100 });

    expect(positionStore.row[ghostHandles[0].id]).toBe(1);
    expect(positionStore.col[ghostHandles[0].id]).toBe(5);
    expect(velocityStore.rowDelta[ghostHandles[0].id]).toBe(0);
    expect(velocityStore.colDelta[ghostHandles[0].id]).toBe(0);
  });

  it('Blinky chases — moves toward the player after one tick', () => {
    const { world, ghostStore, positionStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    // Place Blinky at (1, 5); player is at (3, 4).
    placeGhost(positionStore, ghostHandles[0].id, 1, 5);
    ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
    ghostStore.speed[ghostHandles[0].id] = 4.0;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    // Should choose a direction reducing distance to the player.
    expect(
      positionStore.row[ghostHandles[0].id] > 1 || positionStore.col[ghostHandles[0].id] < 5,
    ).toBe(true);
  });

  it('keeps the no-reverse contract across consecutive ticks', () => {
    const { world, ghostStore, positionStore, velocityStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    placeGhost(positionStore, ghostHandles[0].id, 1, 4);
    ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
    ghostStore.speed[ghostHandles[0].id] = 4.0;
    velocityStore.rowDelta[ghostHandles[0].id] = 0;
    velocityStore.colDelta[ghostHandles[0].id] = 1; // last moved right

    // Force target to the left of ghost so it would prefer left.
    positionStore.row[1] = 1; // playerEntity.id === 1 in this harness
    positionStore.col[1] = 1;
    positionStore.targetRow[1] = 1;
    positionStore.targetCol[1] = 1;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    // Must not reverse to (1,3) within this step.
    expect(velocityStore.colDelta[ghostHandles[0].id]).not.toBe(-1);
  });

  it('Stunned ghost uses stunned speed (2.0 tiles/sec)', () => {
    const { world, ghostStore, positionStore, velocityStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    placeGhost(positionStore, ghostHandles[0].id, 1, 5);
    ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
    ghostStore.state[ghostHandles[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostHandles[0].id] = 2000;
    ghostStore.speed[ghostHandles[0].id] = 4.0;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    expect(velocityStore.speedTilesPerSecond[ghostHandles[0].id]).toBe(GHOST_STUNNED_SPEED);
  });

  it('clears stun back to NORMAL when the per-entity timer is depleted', () => {
    const { world, ghostStore, positionStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    placeGhost(positionStore, ghostHandles[0].id, 1, 5);
    ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
    ghostStore.state[ghostHandles[0].id] = GHOST_STATE.STUNNED;
    ghostStore.timerMs[ghostHandles[0].id] = 0;
    ghostStore.speed[ghostHandles[0].id] = 4.0;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    expect(ghostStore.state[ghostHandles[0].id]).toBe(GHOST_STATE.NORMAL);
  });

  it('Dead ghost moves toward the ghost spawn point', () => {
    const { world, ghostStore, positionStore, mapResource, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    // Place dead ghost away from the ghost spawn point.
    placeGhost(positionStore, ghostHandles[0].id, 1, 1);
    ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
    ghostStore.state[ghostHandles[0].id] = GHOST_STATE.DEAD;
    ghostStore.speed[ghostHandles[0].id] = 4.0;

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    // After one tick the ghost should have moved toward the ghost spawn point.
    const dRowToSpawn = mapResource.ghostSpawnRow - positionStore.row[ghostHandles[0].id];
    const dColToSpawn = mapResource.ghostSpawnCol - positionStore.col[ghostHandles[0].id];
    const initialDistanceSq =
      (mapResource.ghostSpawnRow - 1) ** 2 + (mapResource.ghostSpawnCol - 1) ** 2;
    const newDistanceSq = dRowToSpawn ** 2 + dColToSpawn ** 2;
    expect(newDistanceSq).toBeLessThan(initialDistanceSq);
  });

  it('respawn handoff: DEAD ghost at spawn point + in releasedGhostIds returns to NORMAL', () => {
    const { world, ghostStore, positionStore, mapResource, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    const ghostId = ghostHandles[0].id;
    // Ghost has already navigated its eyes back to the spawn point.
    placeGhost(positionStore, ghostId, mapResource.ghostSpawnRow, mapResource.ghostSpawnCol);
    ghostStore.type[ghostId] = GHOST_TYPE.BLINKY;
    ghostStore.state[ghostId] = GHOST_STATE.DEAD;
    ghostStore.speed[ghostId] = 4.0;

    world.setResource('ghostSpawnState', {
      elapsedMs: 0,
      releasedGhostIds: [ghostId],
      queuedGhostIds: [],
      respawnQueue: [],
      activeGhostCap: 4,
    });

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    expect(ghostStore.state[ghostId]).toBe(GHOST_STATE.NORMAL);
    expect(positionStore.row[ghostId]).toBe(mapResource.ghostSpawnRow);
    expect(positionStore.col[ghostId]).toBe(mapResource.ghostSpawnCol);
  });

  it('does NOT revive a just-killed DEAD ghost still in releasedGhostIds before it reaches spawn', () => {
    const { world, ghostStore, positionStore, ghostHandles } = createGhostHarness({
      ghostCount: 1,
    });
    const ghostId = ghostHandles[0].id;
    // Ghost just died mid-map; spawn-system hasn't pruned releasedGhostIds yet.
    placeGhost(positionStore, ghostId, 1, 1);
    ghostStore.type[ghostId] = GHOST_TYPE.BLINKY;
    ghostStore.state[ghostId] = GHOST_STATE.DEAD;
    ghostStore.speed[ghostId] = 4.0;

    world.setResource('ghostSpawnState', {
      elapsedMs: 0,
      releasedGhostIds: [ghostId],
      queuedGhostIds: [],
      respawnQueue: [],
      activeGhostCap: 4,
    });

    const system = createGhostAiSystem();
    runUpdate(system, world, { dtMs: FIXED_DT_MS });

    // The ghost must remain DEAD until it actually returns to the spawn point
    // and the C-03 respawn delay has completed.
    expect(ghostStore.state[ghostId]).toBe(GHOST_STATE.DEAD);
  });

  it('produces identical traces across two seeded runs (determinism)', () => {
    const seedRun = () => {
      const { world, ghostStore, positionStore, ghostHandles, playerEntity } = createGhostHarness({
        ghostCount: 2,
      });
      // Position both ghosts at known tiles.
      placeGhost(positionStore, ghostHandles[0].id, 1, 1);
      placeGhost(positionStore, ghostHandles[1].id, 1, 7);
      ghostStore.type[ghostHandles[0].id] = GHOST_TYPE.BLINKY;
      ghostStore.type[ghostHandles[1].id] = GHOST_TYPE.PINKY;
      ghostStore.speed[ghostHandles[0].id] = 4.0;
      ghostStore.speed[ghostHandles[1].id] = 4.0;

      // Player drifts right one tile per step to give Pinky a directional read.
      positionStore.row[playerEntity.id] = 5;
      positionStore.col[playerEntity.id] = 4;

      const system = createGhostAiSystem();
      const trace = [];
      for (let frame = 0; frame < 30; frame += 1) {
        runUpdate(system, world, { dtMs: FIXED_DT_MS, frame });
        trace.push([
          positionStore.row[ghostHandles[0].id],
          positionStore.col[ghostHandles[0].id],
          positionStore.row[ghostHandles[1].id],
          positionStore.col[ghostHandles[1].id],
        ]);
      }
      return trace;
    };

    expect(seedRun()).toEqual(seedRun());
  });

  it('exposes a stable iteration order for tie-breaking', () => {
    expect(GHOST_AI_DIRECTIONS).toEqual(['up', 'left', 'down', 'right']);
    expect(GHOST_DIRECTION_VECTOR.up).toEqual({ rowDelta: -1, colDelta: 0 });
  });
});

describe('dead ghost return-home pathfinding (BUG: eyes trapped in local minima)', () => {
  const map = createMapResource(LEVEL_1_MAP);
  const spawn = { row: map.ghostSpawnRow, col: map.ghostSpawnCol };

  // Step a dead ghost tile-by-tile toward home using only the BFS selector,
  // mirroring how the AI system advances eyes at each tile center.
  function walkHome(startRow, startCol, bombCells = null, maxSteps = 200) {
    let row = startRow;
    let col = startCol;
    const visited = [];
    for (let step = 0; step < maxSteps; step += 1) {
      if (row === spawn.row && col === spawn.col) {
        return { reached: true, steps: step, visited };
      }
      const direction = selectDeadGhostReturnDirection({
        mapResource: map,
        ghostTile: { row, col },
        targetTile: spawn,
        bombCells,
      });
      if (!direction) {
        return { reached: false, steps: step, visited, stuckAt: { row, col } };
      }
      const vector = GHOST_DIRECTION_VECTOR[direction];
      row += vector.rowDelta;
      col += vector.colDelta;
      visited.push([row, col]);
    }
    return { reached: false, steps: maxSteps, visited, stuckAt: { row, col } };
  }

  it('does not oscillate at the (3,11)/(4,11) tie-break trap greedy falls into', () => {
    // Greedy return-home traps eyes in column 11: at (4,11) the up neighbour
    // (3,11) and down neighbour (5,11) are equidistant from spawn (both score
    // 17), so the up/left/down/right tie-break picks 'up'; at (3,11) the down
    // neighbour wins again — an endless (3,11)<->(4,11) loop. BFS instead steps
    // 'down' along the only real route toward the spawn column.
    const direction = selectDeadGhostReturnDirection({
      mapResource: map,
      ghostTile: { row: 4, col: 11 },
      targetTile: spawn,
      bombCells: null,
    });
    expect(direction).toBe('down'); // 'up' is the greedy trap step
  });

  it('escapes the upper-right trap and reaches home without revisiting tiles', () => {
    // Enter from the top-right corridor (1,11), which greedy funnels into the
    // (3,11)<->(4,11) oscillation.
    const result = walkHome(1, 11);
    expect(result.reached).toBe(true);
    // A BFS shortest path never revisits a tile; a revisit would signal exactly
    // the kind of oscillation this fix removes.
    const unique = new Set(result.visited.map(([r, c]) => `${r},${c}`));
    expect(unique.size).toBe(result.visited.length);
  });

  it('returns home from every passable upper-right tile', () => {
    for (let row = 1; row <= 3; row += 1) {
      for (let col = 9; col <= 13; col += 1) {
        if (map.grid[row * map.cols + col] === 1 || map.grid[row * map.cols + col] === 2) {
          continue; // skip walls
        }
        const result = walkHome(row, col);
        expect(
          result.reached,
          `eyes from (${row},${col}) failed to reach spawn: ${JSON.stringify(result.stuckAt)}`,
        ).toBe(true);
      }
    }
  });

  it('routes around bomb cells when an alternative path exists', () => {
    // From (5,9) two routes reach spawn (4,7): up column 9, or left along
    // row 5. Bomb the column-9 route at (4,9); BFS must take the row-5 detour.
    const bombCells = new Set([4 * map.cols + 9]);
    const result = walkHome(5, 9, bombCells);
    expect(result.reached).toBe(true);
    expect(result.visited).not.toContainEqual([4, 9]);
  });

  it('falls back to ignoring transient bombs rather than stranding eyes', () => {
    // Fully wall off the spawn with bombs on all four sides: the bomb-avoiding
    // pass finds nothing, so the selector must still return a step (ignore-bomb
    // pass) toward home rather than null.
    const bombCells = new Set([
      (spawn.row - 1) * map.cols + spawn.col,
      (spawn.row + 1) * map.cols + spawn.col,
      spawn.row * map.cols + (spawn.col - 1),
      spawn.row * map.cols + (spawn.col + 1),
    ]);
    const direction = selectDeadGhostReturnDirection({
      mapResource: map,
      ghostTile: { row: 1, col: 11 },
      targetTile: spawn,
      bombCells,
    });
    expect(direction).not.toBeNull();
  });

  it('returns null when the eye is already at the spawn point', () => {
    const direction = selectDeadGhostReturnDirection({
      mapResource: map,
      ghostTile: { row: spawn.row, col: spawn.col },
      targetTile: spawn,
      bombCells: null,
    });
    expect(direction).toBeNull();
  });
});
