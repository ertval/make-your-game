/**
 * Unit tests for the B-03 player movement system.
 *
 * The contract group locks the static movement rules that must stay stable.
 * The stepping group exercises real per-tick movement behavior, including
 * directional coverage, wall and ghost-house blocking, previous-position
 * bookkeeping, and deterministic replay of identical input traces.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';
import { createPositionStore, createVelocityStore } from '../../../src/ecs/components/spatial.js';
import {
  CELL_TYPE,
  FIXED_DT_MS,
  PLAYER_BASE_SPEED,
  SPEED_BOOST_MULTIPLIER,
} from '../../../src/ecs/resources/constants.js';
import { createEventQueue, drain } from '../../../src/ecs/resources/event-queue.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import {
  GAMEPLAY_EVENT_SOURCE,
  GAMEPLAY_EVENT_TYPE,
} from '../../../src/ecs/systems/collision-gameplay-events.js';
import {
  advanceTowardTarget,
  canStartMove,
  createPlayerMoveSystem,
  getPlayerMoveSpeed,
  hasReachedTarget,
  MOVEMENT_EPSILON,
  PLAYER_MOVE_DIRECTION_PRIORITY,
  PLAYER_MOVE_DIRECTION_VECTOR,
  PLAYER_MOVE_REQUIRED_MASK,
  resolvePriorityDirection,
} from '../../../src/ecs/systems/player-move-system.js';
import { World } from '../../../src/ecs/world/world.js';

/**
 * Build a compact valid map used for movement-system unit tests.
 *
 * The layout intentionally gives the player a center spawn with open corridors
 * and a legal upward turn one cell to the right so the tests can cover moving,
 * stopping, blocking, and delayed turning without relying on large fixture data.
 *
 * @param {Array<[number, number, number]>} [overrides] - Optional [row, col, type] edits.
 * @returns {object} Raw map JSON object ready for createMapResource().
 */
function createMovementRawMap(overrides = []) {
  const rawMap = {
    level: 99,
    metadata: {
      name: 'Movement Harness',
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4.0,
      activeGhostTypes: [0, 1],
    },
    dimensions: { rows: 7, columns: 7 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 3, 3, 3, 3, 3, 1],
      [1, 3, 1, 3, 3, 3, 1],
      [1, 3, 3, 6, 3, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 3, 5, 5, 5, 3, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 3, col: 3 },
      ghostHouse: {
        topRow: 4,
        bottomRow: 5,
        leftCol: 2,
        rightCol: 4,
      },
      ghostSpawnPoint: { row: 4, col: 3 },
    },
  };

  // Each override lets one test tweak a single blocking cell without cloning
  // large JSON fixtures from disk.
  for (const [row, col, cellType] of overrides) {
    rawMap.grid[row][col] = cellType;
  }

  return rawMap;
}

/**
 * Create a minimal world harness for the player movement system.
 *
 * @param {Array<[number, number, number]>} [mapOverrides] - Optional map cell overrides.
 * @returns {{
 *   inputState: InputStateStore,
 *   mapResource: MapResource,
 *   player: { id: number, generation: number },
 *   playerStore: PlayerStore,
 *   positionStore: PositionStore,
 *   system: { update: Function },
 *   velocityStore: VelocityStore,
 *   world: World,
 * }} Ready-to-run movement system harness.
 */
function createMovementHarness(mapOverrides = []) {
  const world = new World();
  const system = createPlayerMoveSystem({ eventQueueResourceKey: 'eventQueue' });
  const mapResource = createMapResource(createMovementRawMap(mapOverrides));
  const playerStore = createPlayerStore(8);
  const positionStore = createPositionStore(8);
  const velocityStore = createVelocityStore(8);
  const inputState = createInputStateStore(8);
  const eventQueue = createEventQueue();
  const player = world.createEntity(PLAYER_MOVE_REQUIRED_MASK);

  // The player begins centered on the spawn tile with no pending motion.
  positionStore.row[player.id] = mapResource.playerSpawnRow;
  positionStore.col[player.id] = mapResource.playerSpawnCol;
  positionStore.prevRow[player.id] = mapResource.playerSpawnRow;
  positionStore.prevCol[player.id] = mapResource.playerSpawnCol;
  positionStore.targetRow[player.id] = mapResource.playerSpawnRow;
  positionStore.targetCol[player.id] = mapResource.playerSpawnCol;

  world.setResource('mapResource', mapResource);
  world.setResource('player', playerStore);
  world.setResource('position', positionStore);
  world.setResource('velocity', velocityStore);
  world.setResource('inputState', inputState);
  world.setResource('eventQueue', eventQueue);

  return {
    eventQueue,
    inputState,
    mapResource,
    player,
    playerStore,
    positionStore,
    system,
    velocityStore,
    world,
  };
}

/**
 * Clear the directional input snapshot for one entity.
 *
 * @param {InputStateStore} inputState - Mutable input snapshot store.
 * @param {number} entityId - Entity slot to clear.
 */
function clearMovementInput(inputState, entityId) {
  inputState.up[entityId] = 0;
  inputState.left[entityId] = 0;
  inputState.down[entityId] = 0;
  inputState.right[entityId] = 0;
}

/**
 * Set exactly one held movement direction for the entity.
 *
 * @param {InputStateStore} inputState - Mutable input snapshot store.
 * @param {number} entityId - Entity slot to update.
 * @param {'up' | 'left' | 'down' | 'right'} direction - Direction to hold.
 */
function holdSingleDirection(inputState, entityId, direction) {
  clearMovementInput(inputState, entityId);
  inputState[direction][entityId] = 1;
}

/**
 * Move the player instantly to a chosen tile for directional coverage tests.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {number} entityId - Entity slot to update.
 * @param {number} row - Tile row to occupy.
 * @param {number} col - Tile col to occupy.
 */
function setPlayerTile(positionStore, entityId, row, col) {
  // The player starts centered on the requested tile with no pending travel.
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.prevRow[entityId] = row;
  positionStore.prevCol[entityId] = col;
  positionStore.targetRow[entityId] = row;
  positionStore.targetCol[entityId] = col;
}

/**
 * Capture the full movement state needed for deterministic replay comparisons.
 *
 * @param {PositionStore} positionStore - Position component store.
 * @param {VelocityStore} velocityStore - Velocity component store.
 * @param {number} entityId - Entity slot to read.
 * @returns {object} Serializable movement state snapshot.
 */
function snapshotMovementState(positionStore, velocityStore, entityId) {
  return {
    col: positionStore.col[entityId],
    colDelta: velocityStore.colDelta[entityId],
    prevCol: positionStore.prevCol[entityId],
    prevRow: positionStore.prevRow[entityId],
    row: positionStore.row[entityId],
    rowDelta: velocityStore.rowDelta[entityId],
    speedTilesPerSecond: velocityStore.speedTilesPerSecond[entityId],
    targetCol: positionStore.targetCol[entityId],
    targetRow: positionStore.targetRow[entityId],
  };
}

/**
 * Execute one or more fixed-step movement updates.
 *
 * @param {{
 *   dtMs?: number,
 *   steps?: number,
 *   system: { update: Function },
 *   world: World,
 * }} options - Step-count and system harness configuration.
 */
function runMovementSteps({ system, world, steps = 1, dtMs = FIXED_DT_MS }) {
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    // The test harness mirrors the fixed-step context shape used by the runtime.
    system.update({
      dtMs,
      frame: stepIndex,
      simTimeMs: stepIndex * dtMs,
      world,
    });
  }
}

describe('player-move-system contract', () => {
  it('uses the locked fixed direction priority for held movement input', () => {
    expect(PLAYER_MOVE_DIRECTION_PRIORITY).toEqual(['up', 'left', 'down', 'right']);
  });

  it('maps each direction to exactly one cardinal axis', () => {
    expect(PLAYER_MOVE_DIRECTION_VECTOR.up).toEqual({ rowDelta: -1, colDelta: 0 });
    expect(PLAYER_MOVE_DIRECTION_VECTOR.left).toEqual({ rowDelta: 0, colDelta: -1 });
    expect(PLAYER_MOVE_DIRECTION_VECTOR.down).toEqual({ rowDelta: 1, colDelta: 0 });
    expect(PLAYER_MOVE_DIRECTION_VECTOR.right).toEqual({ rowDelta: 0, colDelta: 1 });
  });

  it('queries only the player movement component set required by B-03', () => {
    expect(PLAYER_MOVE_REQUIRED_MASK).toBe(
      COMPONENT_MASK.PLAYER |
        COMPONENT_MASK.POSITION |
        COMPONENT_MASK.VELOCITY |
        COMPONENT_MASK.INPUT_STATE,
    );
  });

  it('chooses the highest-priority held direction deterministically', () => {
    const inputState = createInputStateStore(4);
    const entityId = 1;

    // Multiple held keys must collapse to one deterministic direction.
    inputState.left[entityId] = 1;
    inputState.down[entityId] = 1;
    inputState.right[entityId] = 1;

    expect(resolvePriorityDirection(inputState, entityId)).toBe('left');
  });

  it('returns null when no movement key is held', () => {
    const inputState = createInputStateStore(2);

    expect(resolvePriorityDirection(inputState, 0)).toBeNull();
  });

  it('uses the canonical base speed when no speed boost is active', () => {
    const playerStore = createPlayerStore(2);

    expect(getPlayerMoveSpeed(playerStore, 0)).toBe(PLAYER_BASE_SPEED);
  });

  it('applies the canonical speed-boost multiplier when boosted', () => {
    const playerStore = createPlayerStore(2);

    // The explicit boost flag is the movement contract owned by B-03.
    playerStore.isSpeedBoosted[1] = 1;

    expect(getPlayerMoveSpeed(playerStore, 1)).toBe(PLAYER_BASE_SPEED * SPEED_BOOST_MULTIPLIER);
  });

  it('treats exact target matches as having reached the current cell target', () => {
    const positionStore = createPositionStore(2);

    positionStore.row[0] = 4;
    positionStore.col[0] = 7;
    positionStore.targetRow[0] = 4;
    positionStore.targetCol[0] = 7;

    expect(hasReachedTarget(positionStore, 0)).toBe(true);
  });

  it('treats epsilon-close positions as having reached the current cell target', () => {
    const positionStore = createPositionStore(2);

    positionStore.row[1] = 3 + MOVEMENT_EPSILON / 2;
    positionStore.col[1] = 5 - MOVEMENT_EPSILON / 2;
    positionStore.targetRow[1] = 3;
    positionStore.targetCol[1] = 5;

    expect(hasReachedTarget(positionStore, 1)).toBe(true);
  });

  it('rejects positions that are meaningfully away from the target cell', () => {
    const positionStore = createPositionStore(2);

    positionStore.row[1] = 3 + MOVEMENT_EPSILON * 2;
    positionStore.col[1] = 5;
    positionStore.targetRow[1] = 3;
    positionStore.targetCol[1] = 5;

    expect(hasReachedTarget(positionStore, 1)).toBe(false);
  });

  it('returns null when inputState is absent', () => {
    expect(resolvePriorityDirection(null, 0)).toBeNull();
  });

  it('returns base speed when playerStore is absent', () => {
    expect(getPlayerMoveSpeed(null, 0)).toBe(PLAYER_BASE_SPEED);
  });

  it('returns false when positionStore is absent', () => {
    expect(hasReachedTarget(null, 0)).toBe(false);
  });

  it('returns false when map resource is absent', () => {
    expect(canStartMove(null, 3, 3, 'up')).toBe(false);
  });

  it('returns false when direction is null', () => {
    const mapResource = createMapResource(createMovementRawMap());
    expect(canStartMove(mapResource, 3, 3, null)).toBe(false);
  });

  it('returns false for an unrecognized direction string', () => {
    const mapResource = createMapResource(createMovementRawMap());
    expect(canStartMove(mapResource, 3, 3, 'diagonal')).toBe(false);
  });

  it('returns the full distance unchanged when the entity is already at its target', () => {
    const positionStore = createPositionStore(2);
    const velocityStore = createVelocityStore(2);

    positionStore.row[0] = 3;
    positionStore.col[0] = 3;
    positionStore.targetRow[0] = 3;
    positionStore.targetCol[0] = 3;

    expect(advanceTowardTarget(positionStore, velocityStore, 0, 0.5)).toBe(0.5);
  });

  it('omits the event queue from write capabilities when no key is configured', () => {
    const system = createPlayerMoveSystem();
    expect(system.resourceCapabilities.write).toEqual(['position', 'velocity']);
  });
});

describe('player-move-system stepping behavior', () => {
  it('moves one fixed step toward an open adjacent tile', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // Holding right from spawn should start a move toward the open tile at (3, 4).
    inputState.right[player.id] = 1;

    runMovementSteps({ system, world });

    const expectedDistance = (PLAYER_BASE_SPEED * FIXED_DT_MS) / 1000;

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBeCloseTo(3 + expectedDistance, 9);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(1);
    expect(velocityStore.speedTilesPerSecond[player.id]).toBe(PLAYER_BASE_SPEED);
  });

  it('moves one fixed step upward toward an open adjacent tile', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    holdSingleDirection(inputState, player.id, 'up');
    runMovementSteps({ system, world });

    const expectedDistance = (PLAYER_BASE_SPEED * FIXED_DT_MS) / 1000;

    expect(positionStore.row[player.id]).toBeCloseTo(3 - expectedDistance, 9);
    expect(positionStore.col[player.id]).toBe(3);
    expect(positionStore.targetRow[player.id]).toBe(2);
    expect(positionStore.targetCol[player.id]).toBe(3);
    expect(velocityStore.rowDelta[player.id]).toBe(-1);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('moves one fixed step left toward an open adjacent tile', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    holdSingleDirection(inputState, player.id, 'left');
    runMovementSteps({ system, world });

    const expectedDistance = (PLAYER_BASE_SPEED * FIXED_DT_MS) / 1000;

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBeCloseTo(3 - expectedDistance, 9);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(2);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(-1);
  });

  it('moves one fixed step downward on an open corridor tile', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // Reposition away from the spawn-adjacent ghost house so downward motion
    // can be tested in isolation from the ghost-house blocking rule.
    setPlayerTile(positionStore, player.id, 1, 1);
    holdSingleDirection(inputState, player.id, 'down');
    runMovementSteps({ system, world });

    const expectedDistance = (PLAYER_BASE_SPEED * FIXED_DT_MS) / 1000;

    expect(positionStore.row[player.id]).toBeCloseTo(1 + expectedDistance, 9);
    expect(positionStore.col[player.id]).toBe(1);
    expect(positionStore.targetRow[player.id]).toBe(2);
    expect(positionStore.targetCol[player.id]).toBe(1);
    expect(velocityStore.rowDelta[player.id]).toBe(1);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('continues into the next open tile while the same direction stays held', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // The corridor to the right remains open for two tiles in the base fixture.
    inputState.right[player.id] = 1;

    runMovementSteps({ system, world, steps: 13 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBeGreaterThan(4);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(5);
    expect(velocityStore.colDelta[player.id]).toBe(1);
  });

  it('stops on the current tile when the next held direction is blocked by a wall', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness([[3, 5, CELL_TYPE.INDESTRUCTIBLE]]);

    // The first tile to the right stays open, but the second tile becomes a wall.
    inputState.right[player.id] = 1;

    runMovementSteps({ system, world, steps: 13 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('stops on the current tile when the next held direction is blocked by a destructible wall', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness([[3, 5, CELL_TYPE.DESTRUCTIBLE]]);

    // Destructible walls are still impassable for B-03 movement.
    inputState.right[player.id] = 1;

    runMovementSteps({ system, world, steps: 13 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('does not allow the player to enter ghost-house tiles', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // Spawn sits directly above the ghost house in this fixture, so down is illegal.
    holdSingleDirection(inputState, player.id, 'down');
    runMovementSteps({ system, world, steps: 12 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(3);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(3);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('finishes the current tile before stopping after the held input is released', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // The first step starts movement toward the next tile.
    inputState.right[player.id] = 1;
    runMovementSteps({ system, world, steps: 1 });

    // Releasing the key must not stop the player mid-cell.
    clearMovementInput(inputState, player.id);
    runMovementSteps({ system, world, steps: 11 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('records previous position before each movement step', () => {
    const { inputState, player, positionStore, system, world } = createMovementHarness();

    holdSingleDirection(inputState, player.id, 'right');
    runMovementSteps({ system, world, steps: 1 });

    expect(positionStore.prevRow[player.id]).toBe(3);
    expect(positionStore.prevCol[player.id]).toBe(3);
    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBeGreaterThan(3);
  });

  it('emits a queued position-change event when the player enters a new tile', () => {
    const { eventQueue, inputState, player, positionStore, system, world } =
      createMovementHarness();

    holdSingleDirection(inputState, player.id, 'right');
    runMovementSteps({ system, world, steps: 6 });

    expect(drain(eventQueue)).toEqual([
      {
        frame: 5,
        order: 0,
        payload: {
          entityId: player.id,
          position: {
            row: positionStore.row[player.id],
            col: positionStore.col[player.id],
          },
          previousTile: { row: 3, col: 3 },
          sourceSystem: GAMEPLAY_EVENT_SOURCE.PLAYER_MOVE,
          tile: { row: 3, col: 4 },
        },
        type: GAMEPLAY_EVENT_TYPE.PLAYER_POSITION_CHANGED,
      },
    ]);
  });

  it('finishes the current tile before turning into a new direction', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // The player starts moving right toward the open tile at (3, 4).
    inputState.right[player.id] = 1;
    runMovementSteps({ system, world, steps: 1 });

    // Switching to up should wait until the player reaches (3, 4).
    clearMovementInput(inputState, player.id);
    inputState.up[player.id] = 1;
    runMovementSteps({ system, world, steps: 11 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(positionStore.targetRow[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);

    // The next fixed step should start the upward move from the tile center.
    runMovementSteps({ system, world, steps: 1 });

    expect(positionStore.row[player.id]).toBeLessThan(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(positionStore.targetRow[player.id]).toBe(2);
    expect(positionStore.targetCol[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(-1);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('snaps exactly to the target tile instead of overshooting it', () => {
    const { inputState, player, positionStore, system, world } = createMovementHarness();

    // Start the move, then release input so the player must complete one tile only.
    inputState.right[player.id] = 1;
    runMovementSteps({ system, world, steps: 1 });
    clearMovementInput(inputState, player.id);
    runMovementSteps({ system, world, steps: 11 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(hasReachedTarget(positionStore, player.id)).toBe(true);
  });

  it('applies boosted speed during actual movement stepping', () => {
    const { inputState, player, playerStore, positionStore, system, velocityStore, world } =
      createMovementHarness();

    // The movement step should use the boosted speed immediately when active.
    playerStore.isSpeedBoosted[player.id] = 1;
    inputState.right[player.id] = 1;

    runMovementSteps({ system, world, steps: 1 });

    const expectedDistance = (PLAYER_BASE_SPEED * SPEED_BOOST_MULTIPLIER * FIXED_DT_MS) / 1000;

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBeCloseTo(3 + expectedDistance, 9);
    expect(velocityStore.speedTilesPerSecond[player.id]).toBe(
      PLAYER_BASE_SPEED * SPEED_BOOST_MULTIPLIER,
    );
  });

  it('returns early without throwing when required resources are absent', () => {
    const world = new World();
    const system = createPlayerMoveSystem();
    expect(() =>
      system.update({ dtMs: FIXED_DT_MS, frame: 0, simTimeMs: 0, world }),
    ).not.toThrow();
  });

  it('sets a move intent but does not advance position when dtMs is zero', () => {
    const { inputState, player, positionStore, system, world } = createMovementHarness();

    holdSingleDirection(inputState, player.id, 'right');
    runMovementSteps({ system, world, dtMs: 0 });

    // Target is updated but position stays on the tile center.
    expect(positionStore.col[player.id]).toBe(3);
    expect(positionStore.targetCol[player.id]).toBe(4);
  });

  it('snaps to the target tile and stops when a large dtMs overshoots the destination', () => {
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    holdSingleDirection(inputState, player.id, 'right');
    // 2 000 ms gives 10 tiles of distance — far more than the 1-tile gap at spawn.
    runMovementSteps({ system, world, dtMs: 2000 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(4);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
    expect(hasReachedTarget(positionStore, player.id)).toBe(true);
  });

  it('keeps the player stationary when the immediately adjacent tile is a wall', () => {
    // (2,2) is INDESTRUCTIBLE in the base fixture; holding 'up' from (3,2)
    // can never start a move so the player stays in place each step.
    const { inputState, player, positionStore, system, velocityStore, world } =
      createMovementHarness();

    setPlayerTile(positionStore, player.id, 3, 2);
    holdSingleDirection(inputState, player.id, 'up');
    runMovementSteps({ system, world, steps: 5 });

    expect(positionStore.row[player.id]).toBe(3);
    expect(positionStore.col[player.id]).toBe(2);
    expect(velocityStore.rowDelta[player.id]).toBe(0);
    expect(velocityStore.colDelta[player.id]).toBe(0);
  });

  it('runs movement without error when no event queue key is configured', () => {
    const world = new World();
    const system = createPlayerMoveSystem(); // no eventQueueResourceKey → null branch
    const mapResource = createMapResource(createMovementRawMap());
    const playerStore = createPlayerStore(8);
    const positionStore = createPositionStore(8);
    const velocityStore = createVelocityStore(8);
    const inputState = createInputStateStore(8);
    const player = world.createEntity(PLAYER_MOVE_REQUIRED_MASK);

    positionStore.row[player.id] = 3;
    positionStore.col[player.id] = 3;
    positionStore.prevRow[player.id] = 3;
    positionStore.prevCol[player.id] = 3;
    positionStore.targetRow[player.id] = 3;
    positionStore.targetCol[player.id] = 3;
    holdSingleDirection(inputState, player.id, 'right');

    world.setResource('mapResource', mapResource);
    world.setResource('player', playerStore);
    world.setResource('position', positionStore);
    world.setResource('velocity', velocityStore);
    world.setResource('inputState', inputState);
    // No eventQueue registered — exercises the `eventQueueResourceKey ? ... : null` branch.

    expect(() =>
      system.update({ dtMs: FIXED_DT_MS, frame: 0, simTimeMs: 0, world }),
    ).not.toThrow();
    expect(positionStore.col[player.id]).toBeGreaterThan(3);
  });

  it('produces identical movement traces for identical input sequences', () => {
    const harnessA = createMovementHarness();
    const harnessB = createMovementHarness();
    const traceA = [];
    const traceB = [];
    const steps = [
      { direction: 'right', count: 1 },
      { direction: 'right', count: 11 },
      { direction: null, count: 1 },
      { direction: 'right', count: 12 },
      { direction: null, count: 1 },
      { direction: 'up', count: 12 },
      { direction: null, count: 1 },
    ];

    for (const phase of steps) {
      if (phase.direction) {
        holdSingleDirection(harnessA.inputState, harnessA.player.id, phase.direction);
        holdSingleDirection(harnessB.inputState, harnessB.player.id, phase.direction);
      } else {
        clearMovementInput(harnessA.inputState, harnessA.player.id);
        clearMovementInput(harnessB.inputState, harnessB.player.id);
      }

      for (let stepIndex = 0; stepIndex < phase.count; stepIndex += 1) {
        runMovementSteps({
          system: harnessA.system,
          world: harnessA.world,
        });
        runMovementSteps({
          system: harnessB.system,
          world: harnessB.world,
        });

        traceA.push(
          snapshotMovementState(harnessA.positionStore, harnessA.velocityStore, harnessA.player.id),
        );
        traceB.push(
          snapshotMovementState(harnessB.positionStore, harnessB.velocityStore, harnessB.player.id),
        );
      }
    }

    expect(traceA).toEqual(traceB);
  });
});
