/*
 * B-01 actor component stores.
 *
 * This file defines the ECS component storage for actor-centric gameplay data:
 * the player, ghosts, and the per-step input snapshot consumed by simulation
 * systems. The stores remain data-only so later systems can mutate them without
 * crossing the DOM or adapter boundary.
 *
 * Public API:
 * - ACTOR_GHOST_TYPE: canonical ghost-type values that match the ticket wording.
 * - ACTOR_GHOST_STATE: ghost-state aliases that match the gameplay wording.
 * - createPlayerStore(maxEntities): allocate typed arrays for player state.
 * - resetPlayer(store, entityId): restore one player slot to canonical defaults.
 * - createGhostStore(maxEntities): allocate typed arrays for ghost state.
 * - resetGhost(store, entityId): clear one ghost slot back to inert defaults.
 * - createInputStateStore(maxEntities): allocate typed arrays for input snapshots.
 * - resetInputState(store, entityId): clear one input slot back to "no input".
 *
 * Implementation notes:
 * - Small integer fields use Uint8Array to avoid object allocation in hot paths.
 * - Timer fields use Float64Array because future systems will decrement them with
 *   fixed-step fractional math in milliseconds.
 * - Ghost types and states are defined locally so this file stays aligned with
 *   the ticket wording even if other modules still use older naming.
 */

import {
  DEFAULT_FIRE_RADIUS,
  PLAYER_START_LIVES,
  PLAYER_START_MAX_BOMBS,
} from '../resources/constants.js';

/**
 * Ticket-aligned ghost type values.
 * These names match the Track B deliverable directly.
 */
export const ACTOR_GHOST_TYPE = Object.freeze({
  BLINKY: 0,
  PINKY: 1,
  INKY: 2,
  CLYDE: 3,
});

/**
 * Ticket-aligned ghost state values.
 * These names match the Track B deliverable directly.
 */
export const ACTOR_GHOST_STATE = Object.freeze({
  NORMAL: 0,
  STUNNED: 1,
  DEAD: 2,
});

/**
 * Allocate the typed-array store for player gameplay state.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {PlayerStore} Fresh player store pre-filled with canonical defaults.
 */
export function createPlayerStore(maxEntities) {
  return {
    // Lives, bomb count, and fire radius are positive gameplay defaults.
    lives: new Uint8Array(maxEntities).fill(PLAYER_START_LIVES),
    maxBombs: new Uint8Array(maxEntities).fill(PLAYER_START_MAX_BOMBS),
    fireRadius: new Uint8Array(maxEntities).fill(DEFAULT_FIRE_RADIUS),
    // Temporary timers start inactive at zero until gameplay systems enable them.
    invincibilityMs: new Float64Array(maxEntities),
    speedBoostMs: new Float64Array(maxEntities),
    // The boost flag is stored separately so systems can branch without rechecking timers.
    isSpeedBoosted: new Uint8Array(maxEntities),
  };
}

/**
 * Restore one player slot back to the canonical player defaults.
 *
 * @param {PlayerStore} store - Mutable player store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetPlayer(store, entityId) {
  store.lives[entityId] = PLAYER_START_LIVES;
  store.maxBombs[entityId] = PLAYER_START_MAX_BOMBS;
  store.fireRadius[entityId] = DEFAULT_FIRE_RADIUS;
  store.invincibilityMs[entityId] = 0;
  store.speedBoostMs[entityId] = 0;
  store.isSpeedBoosted[entityId] = 0;
}

/**
 * Allocate the typed-array store for ghost gameplay state.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {GhostStore} Fresh ghost store with inert timer and speed defaults.
 */
export function createGhostStore(maxEntities) {
  return {
    // Type and state are enum indices, so compact integer arrays are sufficient.
    type: new Uint8Array(maxEntities),
    state: new Uint8Array(maxEntities).fill(ACTOR_GHOST_STATE.NORMAL),
    // Timers and speed are numeric simulation values that will change per level.
    timerMs: new Float64Array(maxEntities),
    speed: new Float64Array(maxEntities),
  };
}

/**
 * Clear one ghost slot back to inert defaults.
 *
 * @param {GhostStore} store - Mutable ghost store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetGhost(store, entityId) {
  store.type[entityId] = 0;
  store.state[entityId] = ACTOR_GHOST_STATE.NORMAL;
  store.timerMs[entityId] = 0;
  store.speed[entityId] = 0;
}

/**
 * Allocate the typed-array store for the per-step input snapshot.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {InputStateStore} Fresh input-state store with "no input" defaults.
 */
export function createInputStateStore(maxEntities) {
  return {
    // Boolean-like inputs use 0/1 bytes to avoid per-frame object allocation.
    up: new Uint8Array(maxEntities),
    down: new Uint8Array(maxEntities),
    left: new Uint8Array(maxEntities),
    right: new Uint8Array(maxEntities),
    bomb: new Uint8Array(maxEntities),
    pause: new Uint8Array(maxEntities),
  };
}

/**
 * Clear one input snapshot slot back to "no input pressed".
 *
 * @param {InputStateStore} store - Mutable input-state store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetInputState(store, entityId) {
  store.up[entityId] = 0;
  store.down[entityId] = 0;
  store.left[entityId] = 0;
  store.right[entityId] = 0;
  store.bomb[entityId] = 0;
  store.pause[entityId] = 0;
}
