/**
 * Test-only helpers for map-resource assertions (DEAD-23).
 *
 * Functions here were previously exported from src/ecs/resources/map-resource.js
 * but are not consumed by the runtime — only by tests. They live here so the
 * production module's surface area stays minimal.
 */

/**
 * Check if (row, col) is the player start cell.
 * @param {{ playerSpawnRow: number, playerSpawnCol: number }} map
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isPlayerStart(map, row, col) {
  return row === map.playerSpawnRow && col === map.playerSpawnCol;
}
