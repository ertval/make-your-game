/*
 * B-01 spatial component stores.
 *
 * This file defines the hot-path ECS component storage used by movement,
 * collision, and interpolation systems. The stores are intentionally split
 * into separate data-only records so later systems can query only the fields
 * they need while keeping numeric simulation data in typed arrays.
 *
 * Runtime status:
 * - `position`, `velocity`, and `collider` are part of the active runtime
 *   bootstrap path.
 *
 * Public API:
 * - SPATIAL_STORE_RUNTIME_STATUS: runtime/bootstrap status for each spatial store.
 * - COLLIDER_TYPE: canonical collider enum values used by collision systems.
 * - createPositionStore(maxEntities): allocate typed arrays for grid position.
 * - resetPosition(store, entityId): clear one entity slot back to defaults.
 * - createVelocityStore(maxEntities): allocate typed arrays for direction/speed.
 * - resetVelocity(store, entityId): clear one entity slot back to defaults.
 * - createColliderStore(maxEntities): allocate typed arrays for collider type.
 * - resetCollider(store, entityId): clear one entity slot back to defaults.
 *
 * Implementation notes:
 * - Float64Array is used for position and velocity because movement uses
 *   fractional tile values and deterministic interpolation between cells.
 * - Uint8Array is sufficient for collider types because the enum is small and
 *   does not require negative values or fractional precision.
 * - Reset helpers are important even though typed arrays start at zero because
 *   recycled entity IDs must not retain stale data from prior occupants.
 */

/**
 * Canonical collider types used by collision and occupancy systems.
 * Zero means "no collider" so a freshly allocated or reset slot is inert.
 */
export const COLLIDER_TYPE = Object.freeze({
  NONE: 0,
  PLAYER: 1,
  GHOST: 2,
  BOMB: 3,
  FIRE: 4,
  PELLET: 5,
  POWER_UP: 6,
  WALL: 7,
});

/**
 * Declarative runtime/bootstrap status for spatial stores.
 * This metadata is descriptive only and must not be treated as a registration API.
 *
 * @internal Test/tooling-only export — no production callers in `src/`.
 *   Used by `tests/unit/components/spatial.test.js` to assert store coverage.
 */
export const SPATIAL_STORE_RUNTIME_STATUS = Object.freeze({
  collider: 'active',
  position: 'active',
  velocity: 'active',
});

/**
 * Allocate the typed-array store for position data.
 * This store is part of the active runtime contract today.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {PositionStore} Fresh position store with zero-initialized arrays.
 */
export function createPositionStore(maxEntities) {
  return {
    // Current position is fractional so systems can move smoothly between tiles.
    row: new Float64Array(maxEntities),
    col: new Float64Array(maxEntities),
    // Previous position supports interpolation and change detection.
    prevRow: new Float64Array(maxEntities),
    prevCol: new Float64Array(maxEntities),
    // Target position lets movement systems aim for the next grid cell cleanly.
    targetRow: new Float64Array(maxEntities),
    targetCol: new Float64Array(maxEntities),
  };
}

/**
 * Reset one entity slot in the position store back to deterministic defaults.
 *
 * @param {PositionStore} store - Mutable position store to clear.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetPosition(store, entityId) {
  store.row[entityId] = 0;
  store.col[entityId] = 0;
  store.prevRow[entityId] = 0;
  store.prevCol[entityId] = 0;
  store.targetRow[entityId] = 0;
  store.targetCol[entityId] = 0;
}

/**
 * Allocate the typed-array store for velocity data.
 * This store is part of the active runtime contract today.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {VelocityStore} Fresh velocity store with zero-initialized arrays.
 */
export function createVelocityStore(maxEntities) {
  return {
    // Row/column deltas express the intended cardinal direction per step.
    rowDelta: new Float64Array(maxEntities),
    colDelta: new Float64Array(maxEntities),
    // Speed is stored separately so boosts can change speed without rewriting direction.
    speedTilesPerSecond: new Float64Array(maxEntities),
  };
}

/**
 * Reset one entity slot in the velocity store back to deterministic defaults.
 *
 * @param {VelocityStore} store - Mutable velocity store to clear.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetVelocity(store, entityId) {
  store.rowDelta[entityId] = 0;
  store.colDelta[entityId] = 0;
  store.speedTilesPerSecond[entityId] = 0;
}

/**
 * Allocate the typed-array store for collider type data.
 * This store is part of the active runtime contract today.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {ColliderStore} Fresh collider store with zero-initialized arrays.
 */
export function createColliderStore(maxEntities) {
  return {
    // Collider type is an enum index, so a compact integer array is enough.
    type: new Uint8Array(maxEntities),
  };
}

/**
 * Reset one entity slot in the collider store back to a non-colliding state.
 *
 * @param {ColliderStore} store - Mutable collider store to clear.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetCollider(store, entityId) {
  store.type[entityId] = COLLIDER_TYPE.NONE;
}
