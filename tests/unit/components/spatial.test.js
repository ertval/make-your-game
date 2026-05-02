/**
 * Unit tests for the B-01 spatial component stores.
 *
 * These checks protect the storage contract that later movement and collision
 * systems will rely on, especially typed-array shape, deterministic defaults,
 * and reset behavior for recycled entity IDs.
 */

import { describe, expect, it } from 'vitest';

import {
  COLLIDER_TYPE,
  createColliderStore,
  createPositionStore,
  createVelocityStore,
  resetCollider,
  resetPosition,
  resetVelocity,
  SPATIAL_STORE_RUNTIME_STATUS,
} from '../../../src/ecs/components/spatial.js';

describe('spatial component stores', () => {
  it('documents which spatial stores are active versus planned in the runtime path', () => {
    expect(SPATIAL_STORE_RUNTIME_STATUS).toEqual({
      collider: 'planned',
      position: 'active',
      velocity: 'active',
    });
    expect(Object.isFrozen(SPATIAL_STORE_RUNTIME_STATUS)).toBe(true);
  });

  it('creates a position store with one Float64Array per position field', () => {
    const maxEntities = 8;
    const store = createPositionStore(maxEntities);

    expect(store.row).toBeInstanceOf(Float64Array);
    expect(store.col).toBeInstanceOf(Float64Array);
    expect(store.prevRow).toBeInstanceOf(Float64Array);
    expect(store.prevCol).toBeInstanceOf(Float64Array);
    expect(store.targetRow).toBeInstanceOf(Float64Array);
    expect(store.targetCol).toBeInstanceOf(Float64Array);

    expect(store.row).toHaveLength(maxEntities);
    expect(store.col).toHaveLength(maxEntities);
    expect(store.prevRow).toHaveLength(maxEntities);
    expect(store.prevCol).toHaveLength(maxEntities);
    expect(store.targetRow).toHaveLength(maxEntities);
    expect(store.targetCol).toHaveLength(maxEntities);
  });

  it('creates a velocity store with independent Float64Array fields', () => {
    const maxEntities = 6;
    const store = createVelocityStore(maxEntities);

    expect(store.rowDelta).toBeInstanceOf(Float64Array);
    expect(store.colDelta).toBeInstanceOf(Float64Array);
    expect(store.speedTilesPerSecond).toBeInstanceOf(Float64Array);

    expect(store.rowDelta).toHaveLength(maxEntities);
    expect(store.colDelta).toHaveLength(maxEntities);
    expect(store.speedTilesPerSecond).toHaveLength(maxEntities);

    // Independent arrays prevent writes in one field from corrupting another.
    expect(store.rowDelta).not.toBe(store.colDelta);
    expect(store.rowDelta).not.toBe(store.speedTilesPerSecond);
    expect(store.colDelta).not.toBe(store.speedTilesPerSecond);
  });

  it('creates a collider store with a compact Uint8Array and NONE defaults', () => {
    const maxEntities = 5;
    const store = createColliderStore(maxEntities);

    expect(store.type).toBeInstanceOf(Uint8Array);
    expect(store.type).toHaveLength(maxEntities);

    for (const colliderType of store.type) {
      expect(colliderType).toBe(COLLIDER_TYPE.NONE);
    }
  });

  it('resets one position slot back to zeroed defaults', () => {
    const store = createPositionStore(4);
    const entityId = 2;

    store.row[entityId] = 3.5;
    store.col[entityId] = 4.5;
    store.prevRow[entityId] = 3.0;
    store.prevCol[entityId] = 4.0;
    store.targetRow[entityId] = 4.0;
    store.targetCol[entityId] = 5.0;

    resetPosition(store, entityId);

    expect(store.row[entityId]).toBe(0);
    expect(store.col[entityId]).toBe(0);
    expect(store.prevRow[entityId]).toBe(0);
    expect(store.prevCol[entityId]).toBe(0);
    expect(store.targetRow[entityId]).toBe(0);
    expect(store.targetCol[entityId]).toBe(0);
  });

  it('resets one velocity slot back to zeroed defaults', () => {
    const store = createVelocityStore(4);
    const entityId = 1;

    store.rowDelta[entityId] = -1;
    store.colDelta[entityId] = 1;
    store.speedTilesPerSecond[entityId] = 5;

    resetVelocity(store, entityId);

    expect(store.rowDelta[entityId]).toBe(0);
    expect(store.colDelta[entityId]).toBe(0);
    expect(store.speedTilesPerSecond[entityId]).toBe(0);
  });

  it('resets one collider slot back to NONE without affecting other entities', () => {
    const store = createColliderStore(4);
    const targetEntityId = 1;
    const untouchedEntityId = 2;

    store.type[targetEntityId] = COLLIDER_TYPE.GHOST;
    store.type[untouchedEntityId] = COLLIDER_TYPE.PLAYER;

    resetCollider(store, targetEntityId);

    expect(store.type[targetEntityId]).toBe(COLLIDER_TYPE.NONE);
    expect(store.type[untouchedEntityId]).toBe(COLLIDER_TYPE.PLAYER);
  });
});
