/*
 * B-01 stats component stores.
 *
 * This file defines ECS component storage for score, timer, and health-related
 * gameplay state. The stores stay numeric and data-only so later systems can
 * update them deterministically with no per-entity object churn.
 *
 * Public API:
 * - createScoreStore(maxEntities): allocate typed arrays for score state.
 * - resetScore(store, entityId): restore one score slot to defaults.
 * - createTimerStore(maxEntities): allocate typed arrays for timer state.
 * - resetTimer(store, entityId): restore one timer slot to defaults.
 * - createHealthStore(maxEntities): allocate typed arrays for health state.
 * - resetHealth(store, entityId): restore one health slot to defaults.
 *
 * Implementation notes:
 * - Score totals use Uint32Array because they are always non-negative and may
 *   grow larger than a byte-sized counter over multiple levels.
 * - Timer values use Float64Array because countdown systems will subtract
 *   fixed-step millisecond deltas rather than whole seconds only.
 * - Health keeps a boolean-like invincibility flag here because the ticket
 *   explicitly asks for invincibility state in the health component.
 */

import { PLAYER_START_LIVES } from '../resources/constants.js';

/**
 * Allocate the typed-array store for score state.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {ScoreStore} Fresh score store with zeroed defaults.
 */
export function createScoreStore(maxEntities) {
  return {
    // Total points are cumulative and always non-negative.
    totalPoints: new Uint32Array(maxEntities),
    // Combo counters are small non-negative integers.
    comboCounter: new Uint16Array(maxEntities),
  };
}

/**
 * Reset one score slot back to zeroed defaults.
 *
 * @param {ScoreStore} store - Mutable score store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetScore(store, entityId) {
  store.totalPoints[entityId] = 0;
  store.comboCounter[entityId] = 0;
}

/**
 * Allocate the typed-array store for level timer state.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {TimerStore} Fresh timer store with zeroed defaults.
 */
export function createTimerStore(maxEntities) {
  return {
    // Timer systems will write the level duration when a level is loaded.
    remainingMs: new Float64Array(maxEntities),
    levelDurationMs: new Float64Array(maxEntities),
  };
}

/**
 * Reset one timer slot back to zeroed defaults.
 *
 * @param {TimerStore} store - Mutable timer store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetTimer(store, entityId) {
  store.remainingMs[entityId] = 0;
  store.levelDurationMs[entityId] = 0;
}

/**
 * Allocate the typed-array store for health state.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {HealthStore} Fresh health store with canonical defaults.
 */
export function createHealthStore(maxEntities) {
  return {
    // Lives start at the canonical player default until gameplay changes them.
    livesRemaining: new Uint8Array(maxEntities).fill(PLAYER_START_LIVES),
    // Invincibility state is a boolean-like flag used by collision logic.
    isInvincible: new Uint8Array(maxEntities),
  };
}

/**
 * Reset one health slot back to canonical defaults.
 *
 * @param {HealthStore} store - Mutable health store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetHealth(store, entityId) {
  store.livesRemaining[entityId] = PLAYER_START_LIVES;
  store.isInvincible[entityId] = 0;
}
