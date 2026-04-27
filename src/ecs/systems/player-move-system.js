/*
 * B-03 player movement and grid-collision system scaffold.
 *
 * This module locks the movement contract for the B-03 ticket before the full
 * simulation logic is added. It defines the canonical query mask, direction
 * priority, cardinal vectors, and helper functions that later movement logic
 * will use to keep player motion deterministic and grid-constrained.
 *
 * Public API:
 * - PLAYER_MOVE_REQUIRED_MASK: canonical query mask for the player move system.
 * - PLAYER_MOVE_DIRECTION_PRIORITY: fixed held-input priority for B-03.
 * - PLAYER_MOVE_DIRECTION_VECTOR: direction-to-axis mapping for cardinal motion.
 * - MOVEMENT_EPSILON: floating-point tolerance for cell-center comparisons.
 * - resolvePriorityDirection(inputState, entityId): choose one held direction.
 * - getPlayerMoveSpeed(playerStore, entityId): resolve base vs boosted speed.
 * - hasReachedTarget(positionStore, entityId): compare current and target cell.
 * - canStartMove(mapResource, row, col, direction): check adjacent tile passability.
 * - startMoveTowardDirection(positionStore, velocityStore, entityId, row, col, direction): arm one move.
 * - advanceTowardTarget(positionStore, velocityStore, entityId, distanceTiles): move and snap deterministically.
 * - createPlayerMoveSystem(options): create the physics-phase ECS system shell.
 *
 * Implementation notes:
 * - The fixed priority is explicit because the current input-state component
 *   stores booleans only and does not preserve press ordering.
 * - The helper layer exists so later movement logic can stay small and easy to
 *   test without re-deriving direction and speed rules in multiple places.
 * - The system shell intentionally performs no movement yet because Batch 1
 *   only freezes the contract; movement stepping arrives in the next batch.
 * - B-05 wiring: accepts an optional `eventQueueResourceKey` (default `null`)
 *   so bootstrap can thread the D-01 event-queue resource key in for later
 *   emission code. We deliberately do not look up the queue here — that lookup
 *   lives next to the actual emit calls in the B-05 branch — and we only
 *   declare a `write` capability on the key when one was provided.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { PLAYER_BASE_SPEED, SPEED_BOOST_MULTIPLIER } from '../resources/constants.js';
import { isPassable } from '../resources/map-resource.js';

/**
 * Canonical component query for player movement.
 * The movement system needs player state, position, velocity, and input data.
 */
export const PLAYER_MOVE_REQUIRED_MASK =
  COMPONENT_MASK.PLAYER |
  COMPONENT_MASK.POSITION |
  COMPONENT_MASK.VELOCITY |
  COMPONENT_MASK.INPUT_STATE;

/**
 * Fixed held-input priority for B-03 movement resolution.
 * This is intentionally explicit so tests can lock the behavior deterministically.
 */
export const PLAYER_MOVE_DIRECTION_PRIORITY = Object.freeze(['up', 'left', 'down', 'right']);

/**
 * Canonical cardinal direction vectors.
 * Each direction changes exactly one axis so diagonal drift is impossible.
 */
export const PLAYER_MOVE_DIRECTION_VECTOR = Object.freeze({
  up: Object.freeze({ rowDelta: -1, colDelta: 0 }),
  left: Object.freeze({ rowDelta: 0, colDelta: -1 }),
  down: Object.freeze({ rowDelta: 1, colDelta: 0 }),
  right: Object.freeze({ rowDelta: 0, colDelta: 1 }),
});

/**
 * Small tolerance for floating-point target-cell comparisons.
 * A tiny epsilon avoids false negatives when fixed-step math lands extremely
 * close to the target due to decimal rounding.
 */
export const MOVEMENT_EPSILON = 1e-9;

/**
 * Resolve exactly one held movement direction using the locked B-03 priority.
 *
 * @param {InputStateStore | null | undefined} inputState - Input snapshot store.
 * @param {number} entityId - Player entity slot to read.
 * @returns {'up' | 'left' | 'down' | 'right' | null} Highest-priority held direction.
 */
export function resolvePriorityDirection(inputState, entityId) {
  // Missing input data means the player has no active movement intent.
  if (!inputState) {
    return null;
  }

  // Scan the fixed priority order so held input resolves deterministically.
  for (const direction of PLAYER_MOVE_DIRECTION_PRIORITY) {
    if (inputState[direction]?.[entityId] === 1) {
      return direction;
    }
  }

  return null;
}

/**
 * Resolve the player's movement speed for the current fixed step.
 *
 * @param {PlayerStore | null | undefined} playerStore - Player state store.
 * @param {number} entityId - Player entity slot to read.
 * @returns {number} Base speed or boosted speed in tiles per second.
 */
export function getPlayerMoveSpeed(playerStore, entityId) {
  // Missing player data falls back to the canonical base speed to keep the
  // helper safe for tests and partially wired worlds.
  if (!playerStore) {
    return PLAYER_BASE_SPEED;
  }

  // The explicit boost flag is the B-03 contract for speed selection.
  if (playerStore.isSpeedBoosted?.[entityId] === 1) {
    return PLAYER_BASE_SPEED * SPEED_BOOST_MULTIPLIER;
  }

  return PLAYER_BASE_SPEED;
}

/**
 * Check whether the entity is effectively sitting on its current target cell.
 *
 * @param {PositionStore | null | undefined} positionStore - Position component store.
 * @param {number} entityId - Entity slot to inspect.
 * @returns {boolean} True when current and target positions match within epsilon.
 */
export function hasReachedTarget(positionStore, entityId) {
  // Missing position data cannot satisfy the movement target contract.
  if (!positionStore) {
    return false;
  }

  // Compare both axes so later movement logic can safely snap to the tile center.
  const rowDistance = Math.abs(positionStore.row[entityId] - positionStore.targetRow[entityId]);
  const colDistance = Math.abs(positionStore.col[entityId] - positionStore.targetCol[entityId]);

  return rowDistance <= MOVEMENT_EPSILON && colDistance <= MOVEMENT_EPSILON;
}

/**
 * Check whether the player can start moving from one tile into the chosen direction.
 *
 * @param {MapResource | null | undefined} mapResource - Map lookup resource.
 * @param {number} row - Current tile row.
 * @param {number} col - Current tile col.
 * @param {'up' | 'left' | 'down' | 'right' | null} direction - Proposed direction.
 * @returns {boolean} True when the adjacent tile is inside the legal player path.
 */
export function canStartMove(mapResource, row, col, direction) {
  // Missing map data or missing direction means the system cannot approve a move.
  if (!mapResource || !direction) {
    return false;
  }

  const vector = PLAYER_MOVE_DIRECTION_VECTOR[direction];
  if (!vector) {
    return false;
  }

  // Passability is delegated to the canonical map resource so B-03 does not
  // create a second source of truth for walls or ghost-house blocking.
  return isPassable(mapResource, row + vector.rowDelta, col + vector.colDelta);
}

/**
 * Arm one tile-to-tile move from the current cell center.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {VelocityStore} velocityStore - Mutable velocity component store.
 * @param {number} entityId - Entity slot to mutate.
 * @param {number} row - Current tile row.
 * @param {number} col - Current tile col.
 * @param {'up' | 'left' | 'down' | 'right'} direction - Chosen move direction.
 */
export function startMoveTowardDirection(
  positionStore,
  velocityStore,
  entityId,
  row,
  col,
  direction,
) {
  const vector = PLAYER_MOVE_DIRECTION_VECTOR[direction];

  // Starting from the exact tile center prevents drift accumulation across cells.
  positionStore.row[entityId] = row;
  positionStore.col[entityId] = col;
  positionStore.targetRow[entityId] = row + vector.rowDelta;
  positionStore.targetCol[entityId] = col + vector.colDelta;
  velocityStore.rowDelta[entityId] = vector.rowDelta;
  velocityStore.colDelta[entityId] = vector.colDelta;
}

/**
 * Stop movement cleanly on the current target tile.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {VelocityStore} velocityStore - Mutable velocity component store.
 * @param {number} entityId - Entity slot to mutate.
 */
export function stopAtCurrentTarget(positionStore, velocityStore, entityId) {
  // Snapping to the target removes tiny floating-point leftovers before stopping.
  positionStore.row[entityId] = positionStore.targetRow[entityId];
  positionStore.col[entityId] = positionStore.targetCol[entityId];
  velocityStore.rowDelta[entityId] = 0;
  velocityStore.colDelta[entityId] = 0;
}

/**
 * Advance one entity toward its current target cell by a tile distance.
 *
 * @param {PositionStore} positionStore - Mutable position component store.
 * @param {VelocityStore} velocityStore - Mutable velocity component store.
 * @param {number} entityId - Entity slot to mutate.
 * @param {number} distanceTiles - Travel distance for this fixed step in tiles.
 * @returns {number} Remaining unconsumed distance after the move.
 */
export function advanceTowardTarget(positionStore, velocityStore, entityId, distanceTiles) {
  const rowDistance = positionStore.targetRow[entityId] - positionStore.row[entityId];
  const colDistance = positionStore.targetCol[entityId] - positionStore.col[entityId];
  const distanceToTarget = Math.max(Math.abs(rowDistance), Math.abs(colDistance));

  // When the entity is already at target, no distance needs to be consumed.
  if (distanceToTarget <= MOVEMENT_EPSILON) {
    stopAtCurrentTarget(positionStore, velocityStore, entityId);
    return distanceTiles;
  }

  const stepDistance = Math.min(distanceTiles, distanceToTarget);
  const directionRow = rowDistance === 0 ? 0 : rowDistance / Math.abs(rowDistance);
  const directionCol = colDistance === 0 ? 0 : colDistance / Math.abs(colDistance);

  // Exactly one axis is expected to move, so this preserves cardinal motion only.
  positionStore.row[entityId] += directionRow * stepDistance;
  positionStore.col[entityId] += directionCol * stepDistance;

  if (stepDistance + MOVEMENT_EPSILON >= distanceToTarget) {
    stopAtCurrentTarget(positionStore, velocityStore, entityId);
  }

  return distanceTiles - stepDistance;
}

/**
 * Create the B-03 player movement system.
 *
 * @param {{
 *   mapResourceKey?: string,
 *   playerResourceKey?: string,
 *   positionResourceKey?: string,
 *   velocityResourceKey?: string,
 *   inputStateResourceKey?: string,
 *   eventQueueResourceKey?: string,
 *   requiredMask?: number,
 * }} [options] - Optional resource key overrides for later wiring and tests.
 * @returns {{ name: string, phase: string, update: Function }} ECS system registration.
 */
export function createPlayerMoveSystem(options = {}) {
  const mapResourceKey = options.mapResourceKey || 'mapResource';
  const playerResourceKey = options.playerResourceKey || 'player';
  const positionResourceKey = options.positionResourceKey || 'position';
  const velocityResourceKey = options.velocityResourceKey || 'velocity';
  const inputStateResourceKey = options.inputStateResourceKey || 'inputState';
  // B-05 wiring: opt-in event queue key. When `null`, the system declares no
  // write access and never looks up the queue, so unwired tests stay quiet.
  // The bootstrap supplies the key explicitly in the default runtime stack.
  const eventQueueResourceKey = options.eventQueueResourceKey ?? null;
  const requiredMask = options.requiredMask ?? PLAYER_MOVE_REQUIRED_MASK;

  const writeCapabilities = [playerResourceKey, positionResourceKey, velocityResourceKey];
  if (eventQueueResourceKey) {
    writeCapabilities.push(eventQueueResourceKey);
  }

  return {
    name: 'player-move-system',
    phase: 'physics',
    resourceCapabilities: {
      read: [inputStateResourceKey, mapResourceKey],
      write: writeCapabilities,
    },
    update(context) {
      const world = context.world;
      const mapResource = world.getResource(mapResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const velocityStore = world.getResource(velocityResourceKey);
      const inputState = world.getResource(inputStateResourceKey);

      if (!mapResource || !playerStore || !positionStore || !velocityStore || !inputState) {
        return;
      }

      // The actual eventQueue lookup + emit calls land with B-05; we only thread
      // the key through here so wiring + capability declarations are stable.

      const entityIds = world.query(requiredMask);
      const stepDistanceBase = Math.max(0, Number(context.dtMs) || 0) / 1000;

      for (const entityId of entityIds) {
        // Previous position is captured before any movement so later interpolation
        // and change-detection systems can observe the exact last-step state.
        positionStore.prevRow[entityId] = positionStore.row[entityId];
        positionStore.prevCol[entityId] = positionStore.col[entityId];

        const speedTilesPerSecond = getPlayerMoveSpeed(playerStore, entityId);
        velocityStore.speedTilesPerSecond[entityId] = speedTilesPerSecond;

        // Reaching the target at the start of a step means the entity is centered
        // on a tile and can decide whether to start a fresh move this frame.
        if (hasReachedTarget(positionStore, entityId)) {
          stopAtCurrentTarget(positionStore, velocityStore, entityId);
        }

        const desiredDirection = resolvePriorityDirection(inputState, entityId);
        let remainingDistance = speedTilesPerSecond * stepDistanceBase;

        // If the player is centered on a tile, this is the only moment where a
        // new move may begin. This enforces "finish the current cell first."
        if (hasReachedTarget(positionStore, entityId)) {
          const currentRow = positionStore.targetRow[entityId];
          const currentCol = positionStore.targetCol[entityId];

          if (canStartMove(mapResource, currentRow, currentCol, desiredDirection)) {
            startMoveTowardDirection(
              positionStore,
              velocityStore,
              entityId,
              currentRow,
              currentCol,
              desiredDirection,
            );
          } else {
            stopAtCurrentTarget(positionStore, velocityStore, entityId);
            continue;
          }
        }

        remainingDistance = advanceTowardTarget(
          positionStore,
          velocityStore,
          entityId,
          remainingDistance,
        );

        // The system intentionally does not chain into a second move within the
        // same fixed step. A new decision happens only on the next simulation tick.
        if (remainingDistance > MOVEMENT_EPSILON && hasReachedTarget(positionStore, entityId)) {
          stopAtCurrentTarget(positionStore, velocityStore, entityId);
        }
      }
    },
  };
}
