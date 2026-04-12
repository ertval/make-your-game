/**
 * Unit tests for the B-03 player movement contract scaffold.
 *
 * These tests lock the deterministic movement contract chosen for B-03 before
 * the full movement simulation is implemented. They cover direction priority,
 * speed selection, and target-cell comparison semantics.
 */

import { describe, expect, it } from 'vitest';

import { createInputStateStore, createPlayerStore } from '../../../src/ecs/components/actors.js';
import { createPositionStore } from '../../../src/ecs/components/spatial.js';
import {
  MOVEMENT_EPSILON,
  PLAYER_MOVE_DIRECTION_PRIORITY,
  PLAYER_MOVE_DIRECTION_VECTOR,
  PLAYER_MOVE_REQUIRED_MASK,
  getPlayerMoveSpeed,
  hasReachedTarget,
  resolvePriorityDirection,
} from '../../../src/ecs/systems/player-move-system.js';
import {
  PLAYER_BASE_SPEED,
  SPEED_BOOST_MULTIPLIER,
} from '../../../src/ecs/resources/constants.js';
import { COMPONENT_MASK } from '../../../src/ecs/components/registry.js';

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
});
