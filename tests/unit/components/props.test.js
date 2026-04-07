/**
 * Unit tests for the B-01 prop component stores.
 *
 * These checks protect the storage contract for bombs, fire, power-ups, and
 * pellets so later gameplay systems can rely on deterministic defaults.
 */

import { describe, expect, it } from 'vitest';

import {
  BOMB_FUSE_MS,
  DEFAULT_FIRE_RADIUS,
  FIRE_DURATION_MS,
} from '../../../src/ecs/resources/constants.js';
import {
  PROP_POWER_UP_TYPE,
  createBombStore,
  createFireStore,
  createPelletStore,
  createPowerUpStore,
  resetBomb,
  resetFire,
  resetPellet,
  resetPowerUp,
} from '../../../src/ecs/components/props.js';

describe('prop component stores', () => {
  it('creates a bomb store with canonical defaults', () => {
    const maxEntities = 4;
    const store = createBombStore(maxEntities);

    expect(store.fuseMs).toBeInstanceOf(Float64Array);
    expect(store.radius).toBeInstanceOf(Uint8Array);
    expect(store.ownerId).toBeInstanceOf(Int32Array);
    expect(store.row).toBeInstanceOf(Int32Array);
    expect(store.col).toBeInstanceOf(Int32Array);

    for (let entityId = 0; entityId < maxEntities; entityId += 1) {
      expect(store.fuseMs[entityId]).toBe(BOMB_FUSE_MS);
      expect(store.radius[entityId]).toBe(DEFAULT_FIRE_RADIUS);
      expect(store.ownerId[entityId]).toBe(-1);
      expect(store.row[entityId]).toBe(0);
      expect(store.col[entityId]).toBe(0);
    }
  });

  it('resets one bomb slot back to canonical defaults', () => {
    const store = createBombStore(3);
    const entityId = 1;
    const untouchedEntityId = 2;

    store.fuseMs[entityId] = 1250;
    store.radius[entityId] = 5;
    store.ownerId[entityId] = 9;
    store.row[entityId] = 7;
    store.col[entityId] = 8;
    store.ownerId[untouchedEntityId] = 3;

    resetBomb(store, entityId);

    expect(store.fuseMs[entityId]).toBe(BOMB_FUSE_MS);
    expect(store.radius[entityId]).toBe(DEFAULT_FIRE_RADIUS);
    expect(store.ownerId[entityId]).toBe(-1);
    expect(store.row[entityId]).toBe(0);
    expect(store.col[entityId]).toBe(0);
    expect(store.ownerId[untouchedEntityId]).toBe(3);
  });

  it('creates and resets a fire store with canonical burn duration', () => {
    const store = createFireStore(3);
    const entityId = 0;

    expect(store.burnTimerMs).toBeInstanceOf(Float64Array);
    expect(store.row).toBeInstanceOf(Int32Array);
    expect(store.col).toBeInstanceOf(Int32Array);
    expect(store.burnTimerMs[entityId]).toBe(FIRE_DURATION_MS);

    store.burnTimerMs[entityId] = 100;
    store.row[entityId] = 3;
    store.col[entityId] = 4;

    resetFire(store, entityId);

    expect(store.burnTimerMs[entityId]).toBe(FIRE_DURATION_MS);
    expect(store.row[entityId]).toBe(0);
    expect(store.col[entityId]).toBe(0);
  });

  it('creates and resets a power-up store with NONE defaults', () => {
    const store = createPowerUpStore(2);

    expect(store.type).toBeInstanceOf(Uint8Array);
    expect(store.type[0]).toBe(PROP_POWER_UP_TYPE.NONE);

    store.type[0] = PROP_POWER_UP_TYPE.SPEED_BOOST;
    resetPowerUp(store, 0);

    expect(store.type[0]).toBe(PROP_POWER_UP_TYPE.NONE);
  });

  it('creates and resets a pellet store with regular-pellet defaults', () => {
    const store = createPelletStore(2);

    expect(store.isPowerPellet).toBeInstanceOf(Uint8Array);
    expect(store.isPowerPellet[1]).toBe(0);

    store.isPowerPellet[1] = 1;
    resetPellet(store, 1);

    expect(store.isPowerPellet[1]).toBe(0);
  });
});
