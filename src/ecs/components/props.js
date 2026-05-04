/*
 * B-01 prop component stores.
 *
 * This file defines ECS component storage for gameplay props that exist in the
 * maze: bombs, fire tiles, power-ups, and pellets. These stores are data-only
 * and use typed arrays because the represented values are numeric, enum-like,
 * or grid-aligned.
 *
 * Runtime status:
 * - All stores in this module are planned gameplay scaffolding.
 * - None of them are registered by the current bootstrap path yet.
 *
 * Public API:
 * - PROP_STORE_RUNTIME_STATUS: runtime/bootstrap status for each prop store.
 * - PROP_POWER_UP_TYPE: ticket-aligned power-up type enum values.
 * - createBombStore(maxEntities): allocate typed arrays for bomb state.
 * - resetBomb(store, entityId): clear one bomb slot back to defaults.
 * - createFireStore(maxEntities): allocate typed arrays for fire state.
 * - resetFire(store, entityId): clear one fire slot back to defaults.
 * - createPowerUpStore(maxEntities): allocate typed arrays for power-up state.
 * - resetPowerUp(store, entityId): clear one power-up slot back to defaults.
 * - createPelletStore(maxEntities): allocate typed arrays for pellet state.
 * - resetPellet(store, entityId): clear one pellet slot back to defaults.
 *
 * Implementation notes:
 * - Bombs and fire are tile-locked, so row/col use Int32Array instead of
 *   Float64Array because they represent discrete grid cells rather than
 *   fractional movement positions.
 * - Owner, source, and sprite-like identifiers use -1 as the "unassigned"
 *   sentinel, which requires Int32Array rather than an unsigned array.
 * - Pellet and power-up variants are enum/flag values, so compact integer
 *   arrays are sufficient and avoid per-entity object allocation.
 */

import { BOMB_FUSE_MS, DEFAULT_FIRE_RADIUS, FIRE_DURATION_MS } from '../resources/constants.js';

/**
 * Ticket-aligned power-up type values.
 * NONE is an internal default/reset sentinel for empty slots.
 */
export const PROP_POWER_UP_TYPE = Object.freeze({
  NONE: 0,
  BOMB_PLUS: 1,
  FIRE_PLUS: 2,
  SPEED_BOOST: 3,
});

/**
 * Declarative runtime/bootstrap status for prop stores.
 * This metadata is descriptive only and must not be treated as a registration API.
 */
export const PROP_STORE_RUNTIME_STATUS = Object.freeze({
  bomb: 'planned',
  fire: 'planned',
  pellet: 'planned',
  powerUp: 'planned',
});

/**
 * Allocate the typed-array store for bomb gameplay state.
 * This store is planned scaffolding and is not part of the active runtime
 * bootstrap contract yet.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {BombStore} Fresh bomb store with canonical defaults.
 */
export function createBombStore(maxEntities) {
  return {
    // Bombs start with the design-defined fuse and radius until upgraded.
    fuseMs: new Float64Array(maxEntities).fill(BOMB_FUSE_MS),
    radius: new Uint8Array(maxEntities).fill(DEFAULT_FIRE_RADIUS),
    // Owner starts unassigned so recycled slots cannot point at stale entities.
    ownerId: new Int32Array(maxEntities).fill(-1),
    // Bomb placement is grid-aligned, so integer coordinates are enough.
    row: new Int32Array(maxEntities),
    col: new Int32Array(maxEntities),
  };
}

/**
 * Reset one bomb slot back to canonical defaults.
 *
 * @param {BombStore} store - Mutable bomb store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetBomb(store, entityId) {
  store.fuseMs[entityId] = BOMB_FUSE_MS;
  store.radius[entityId] = DEFAULT_FIRE_RADIUS;
  store.ownerId[entityId] = -1;
  store.row[entityId] = 0;
  store.col[entityId] = 0;
}

/**
 * Allocate the typed-array store for fire-tile gameplay state.
 * This store is planned scaffolding and is not part of the active runtime
 * bootstrap contract yet.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {FireStore} Fresh fire store with canonical defaults.
 */
export function createFireStore(maxEntities) {
  return {
    // Fire lifetime is time-based, so milliseconds use Float64Array.
    burnTimerMs: new Float64Array(maxEntities).fill(FIRE_DURATION_MS),
    // Fire occupies discrete map cells, so integer coordinates are enough.
    row: new Int32Array(maxEntities),
    col: new Int32Array(maxEntities),
    // Source bomb and chain depth let later collision/scoring code group kills.
    sourceBombId: new Int32Array(maxEntities).fill(-1),
    chainDepth: new Uint8Array(maxEntities),
  };
}

/**
 * Reset one fire slot back to canonical defaults.
 *
 * @param {FireStore} store - Mutable fire store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetFire(store, entityId) {
  store.burnTimerMs[entityId] = FIRE_DURATION_MS;
  store.row[entityId] = 0;
  store.col[entityId] = 0;
  store.sourceBombId[entityId] = -1;
  store.chainDepth[entityId] = 0;
}

/**
 * Allocate the typed-array store for power-up state.
 * This store is planned scaffolding and is not part of the active runtime
 * bootstrap contract yet.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {PowerUpStore} Fresh power-up store with canonical defaults.
 */
export function createPowerUpStore(maxEntities) {
  return {
    // Power-up type is an enum index, so a byte per entity is enough.
    type: new Uint8Array(maxEntities).fill(PROP_POWER_UP_TYPE.NONE),
  };
}

/**
 * Reset one power-up slot back to an empty type.
 *
 * @param {PowerUpStore} store - Mutable power-up store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetPowerUp(store, entityId) {
  store.type[entityId] = PROP_POWER_UP_TYPE.NONE;
}

/**
 * Allocate the typed-array store for pellet state.
 * This store is planned scaffolding and is not part of the active runtime
 * bootstrap contract yet.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {PelletStore} Fresh pellet store with "regular pellet" defaults.
 */
export function createPelletStore(maxEntities) {
  return {
    // A byte flag is enough because pellets are either regular or power pellets.
    isPowerPellet: new Uint8Array(maxEntities),
  };
}

/**
 * Reset one pellet slot back to a regular pellet default.
 *
 * @param {PelletStore} store - Mutable pellet store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetPellet(store, entityId) {
  store.isPowerPellet[entityId] = 0;
}
