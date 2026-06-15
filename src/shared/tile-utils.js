/*
 * Shared tile utilities for ECS systems.
 *
 * Public API:
 * - readEntityTile(positionStore, entityId, outTile): read rounded tile coords.
 */

/**
 * Read one entity's tile position from the shared position store.
 *
 * Positions may be fractional while entities move between cells. Rounding keeps
 * the helper stable for exact centered positions and produces deterministic
 * tile coordinates that callers can use as occupancy keys.
 *
 * @param {PositionStore | null | undefined} positionStore - Position component store.
 * @param {number} entityId - Entity slot to read.
 * @param {{ row: number, col: number }} [outTile] - Reusable output object.
 * @returns {{ row: number, col: number } | null} Tile coords, or null without position data.
 */
export function readEntityTile(positionStore, entityId, outTile = { row: 0, col: 0 }) {
  if (!positionStore) {
    return null;
  }

  outTile.row = Math.round(positionStore.row[entityId]);
  outTile.col = Math.round(positionStore.col[entityId]);
  return outTile;
}
