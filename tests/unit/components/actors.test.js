/**
 * Unit tests for the B-01 actor component stores.
 *
 * These checks protect the data contract for player, ghost, and input-state
 * components so later systems can rely on stable typed-array shapes and
 * deterministic default/reset behavior.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTOR_STORE_RUNTIME_STATUS,
  createGhostStore,
  createInputStateStore,
  createPlayerStore,
  resetGhost,
  resetInputState,
  resetPlayer,
  UNASSIGNED_GHOST_TYPE,
} from '../../../src/ecs/components/actors.js';
import {
  DEFAULT_FIRE_RADIUS,
  GHOST_STATE,
  GHOST_TYPE,
  PLAYER_START_LIVES,
  PLAYER_START_MAX_BOMBS,
} from '../../../src/ecs/resources/constants.js';

describe('actor component stores', () => {
  it('documents which actor stores are active versus planned in the runtime path', () => {
    expect(ACTOR_STORE_RUNTIME_STATUS).toEqual({
      ghost: 'planned',
      inputState: 'active',
      player: 'active',
    });
    expect(Object.isFrozen(ACTOR_STORE_RUNTIME_STATUS)).toBe(true);
  });

  it('uses the canonical ghost enums from the constants resource', () => {
    expect(GHOST_TYPE.BLINKY).toBe(0);
    expect(GHOST_TYPE.PINKY).toBe(1);
    expect(GHOST_TYPE.INKY).toBe(2);
    expect(GHOST_TYPE.CLYDE).toBe(3);
    expect(GHOST_STATE.NORMAL).toBe(0);
    expect(GHOST_STATE.STUNNED).toBe(1);
    expect(GHOST_STATE.DEAD).toBe(2);
    expect(UNASSIGNED_GHOST_TYPE).toBe(-1);
  });

  it('creates a player store with canonical default gameplay values', () => {
    const maxEntities = 5;
    const store = createPlayerStore(maxEntities);

    expect(store.lives).toBeInstanceOf(Uint8Array);
    expect(store.maxBombs).toBeInstanceOf(Uint8Array);
    expect(store.fireRadius).toBeInstanceOf(Uint8Array);
    expect(store.invincibilityMs).toBeInstanceOf(Float64Array);
    expect(store.speedBoostMs).toBeInstanceOf(Float64Array);
    expect(store.isSpeedBoosted).toBeInstanceOf(Uint8Array);

    expect(store.lives).toHaveLength(maxEntities);
    expect(store.maxBombs).toHaveLength(maxEntities);
    expect(store.fireRadius).toHaveLength(maxEntities);
    expect(store.invincibilityMs).toHaveLength(maxEntities);
    expect(store.speedBoostMs).toHaveLength(maxEntities);
    expect(store.isSpeedBoosted).toHaveLength(maxEntities);

    for (let entityId = 0; entityId < maxEntities; entityId += 1) {
      expect(store.lives[entityId]).toBe(PLAYER_START_LIVES);
      expect(store.maxBombs[entityId]).toBe(PLAYER_START_MAX_BOMBS);
      expect(store.fireRadius[entityId]).toBe(DEFAULT_FIRE_RADIUS);
      expect(store.invincibilityMs[entityId]).toBe(0);
      expect(store.speedBoostMs[entityId]).toBe(0);
      expect(store.isSpeedBoosted[entityId]).toBe(0);
    }
  });

  it('resets one player slot back to gameplay defaults', () => {
    const store = createPlayerStore(4);
    const entityId = 2;
    const untouchedEntityId = 1;

    store.lives[entityId] = 1;
    store.maxBombs[entityId] = 4;
    store.fireRadius[entityId] = 6;
    store.invincibilityMs[entityId] = 1500;
    store.speedBoostMs[entityId] = 4000;
    store.isSpeedBoosted[entityId] = 1;

    resetPlayer(store, entityId);

    expect(store.lives[entityId]).toBe(PLAYER_START_LIVES);
    expect(store.maxBombs[entityId]).toBe(PLAYER_START_MAX_BOMBS);
    expect(store.fireRadius[entityId]).toBe(DEFAULT_FIRE_RADIUS);
    expect(store.invincibilityMs[entityId]).toBe(0);
    expect(store.speedBoostMs[entityId]).toBe(0);
    expect(store.isSpeedBoosted[entityId]).toBe(0);

    expect(store.lives[untouchedEntityId]).toBe(PLAYER_START_LIVES);
  });

  it('creates a ghost store with compact enums and inert defaults', () => {
    const maxEntities = 4;
    const store = createGhostStore(maxEntities);

    expect(store.type).toBeInstanceOf(Int16Array);
    expect(store.state).toBeInstanceOf(Uint8Array);
    expect(store.timerMs).toBeInstanceOf(Float64Array);
    expect(store.speed).toBeInstanceOf(Float64Array);

    expect(store.type).toHaveLength(maxEntities);
    expect(store.state).toHaveLength(maxEntities);
    expect(store.timerMs).toHaveLength(maxEntities);
    expect(store.speed).toHaveLength(maxEntities);

    for (let entityId = 0; entityId < maxEntities; entityId += 1) {
      expect(store.type[entityId]).toBe(UNASSIGNED_GHOST_TYPE);
      expect(store.state[entityId]).toBe(GHOST_STATE.NORMAL);
      expect(store.timerMs[entityId]).toBe(0);
      expect(store.speed[entityId]).toBe(0);
    }
  });

  it('resets one ghost slot without affecting other ghost entities', () => {
    const store = createGhostStore(4);
    const entityId = 3;
    const untouchedEntityId = 1;

    store.type[entityId] = GHOST_TYPE.INKY;
    store.state[entityId] = GHOST_STATE.DEAD;
    store.timerMs[entityId] = 5000;
    store.speed[entityId] = 4.5;
    store.speed[untouchedEntityId] = 2.0;

    resetGhost(store, entityId);

    expect(store.type[entityId]).toBe(UNASSIGNED_GHOST_TYPE);
    expect(store.state[entityId]).toBe(GHOST_STATE.NORMAL);
    expect(store.timerMs[entityId]).toBe(0);
    expect(store.speed[entityId]).toBe(0);

    expect(store.speed[untouchedEntityId]).toBe(2.0);
  });

  it('creates an input-state store with one byte flag per input', () => {
    const maxEntities = 3;
    const store = createInputStateStore(maxEntities);

    expect(store.up).toBeInstanceOf(Uint8Array);
    expect(store.down).toBeInstanceOf(Uint8Array);
    expect(store.left).toBeInstanceOf(Uint8Array);
    expect(store.right).toBeInstanceOf(Uint8Array);
    expect(store.bomb).toBeInstanceOf(Uint8Array);
    expect(store.pause).toBeInstanceOf(Uint8Array);
    expect(store.confirm).toBeInstanceOf(Uint8Array);

    expect(store.up).toHaveLength(maxEntities);
    expect(store.down).toHaveLength(maxEntities);
    expect(store.left).toHaveLength(maxEntities);
    expect(store.right).toHaveLength(maxEntities);
    expect(store.bomb).toHaveLength(maxEntities);
    expect(store.pause).toHaveLength(maxEntities);
    expect(store.confirm).toHaveLength(maxEntities);
  });

  it('resets one input snapshot slot back to no pressed inputs', () => {
    const store = createInputStateStore(4);
    const entityId = 0;
    const untouchedEntityId = 3;

    store.up[entityId] = 1;
    store.down[entityId] = 1;
    store.left[entityId] = 1;
    store.right[entityId] = 1;
    store.bomb[entityId] = 1;
    store.pause[entityId] = 1;
    store.confirm[entityId] = 1;
    store.right[untouchedEntityId] = 1;

    resetInputState(store, entityId);

    expect(store.up[entityId]).toBe(0);
    expect(store.down[entityId]).toBe(0);
    expect(store.left[entityId]).toBe(0);
    expect(store.right[entityId]).toBe(0);
    expect(store.bomb[entityId]).toBe(0);
    expect(store.pause[entityId]).toBe(0);
    expect(store.confirm[entityId]).toBe(0);

    expect(store.right[untouchedEntityId]).toBe(1);
  });
});
