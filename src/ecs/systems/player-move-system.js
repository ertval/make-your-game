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
 * - createPlayerMoveSystem(options): create the physics-phase ECS system shell.
 *
 * Implementation notes:
 * - The fixed priority is explicit because the current input-state component
 *   stores booleans only and does not preserve press ordering.
 * - The helper layer exists so later movement logic can stay small and easy to
 *   test without re-deriving direction and speed rules in multiple places.
 * - The system shell intentionally performs no movement yet because Batch 1
 *   only freezes the contract; movement stepping arrives in the next batch.
 */

import { COMPONENT_MASK } from '../components/registry.js';
import { PLAYER_BASE_SPEED, SPEED_BOOST_MULTIPLIER } from '../resources/constants.js';

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
 * Create the B-03 player movement system shell.
 *
 * @param {{
 *   mapResourceKey?: string,
 *   playerResourceKey?: string,
 *   positionResourceKey?: string,
 *   velocityResourceKey?: string,
 *   inputStateResourceKey?: string,
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
  const requiredMask = options.requiredMask ?? PLAYER_MOVE_REQUIRED_MASK;

  return {
    name: 'player-move-system',
    phase: 'physics',
    update(context) {
      const world = context.world;
      const mapResource = world.getResource(mapResourceKey);
      const playerStore = world.getResource(playerResourceKey);
      const positionStore = world.getResource(positionResourceKey);
      const velocityStore = world.getResource(velocityResourceKey);
      const inputState = world.getResource(inputStateResourceKey);

      // Batch 1 freezes resource expectations without performing movement yet.
      if (!mapResource || !playerStore || !positionStore || !velocityStore || !inputState) {
        return;
      }

      // Query resolution is part of the locked contract even before stepping logic exists.
      world.query(requiredMask);
    },
  };
}
