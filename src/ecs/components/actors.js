/*
 * B-01 actor component stores.
 *
 * This file defines the ECS component storage for actor-centric gameplay data:
 * the player, ghosts, and the per-step input snapshot consumed by simulation
 * systems. The stores remain data-only so later systems can mutate them without
 * crossing the DOM or adapter boundary.
 *
 * Runtime status:
 * - `player` and `input-state` are part of the active runtime bootstrap path.
 * - `ghost` is a planned gameplay store that is intentionally not wired into
 *   the live bootstrap path yet.
 *
 * Public API:
 * - ACTOR_STORE_RUNTIME_STATUS: runtime/bootstrap status for each actor store.
 * - UNASSIGNED_GHOST_TYPE: sentinel value for ghost slots that are not yet configured.
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
 * - Ghost types/states are imported from the canonical constants resource so
 *   this file does not create a second source of truth for gameplay enums.
 * - Ghost type uses an Int16Array because a fresh slot must be able to hold an
 *   explicit "unassigned" sentinel rather than silently defaulting to Blinky.
 */

import {
  DEFAULT_FIRE_RADIUS,
  GHOST_STATE,
  PLAYER_START_LIVES,
  PLAYER_START_MAX_BOMBS,
} from '../resources/constants.js';

/**
 * Sentinel used for ghost slots that have not been configured with a real type yet.
 * This prevents a fresh slot from being misread as Blinky before initialization.
 */
export const UNASSIGNED_GHOST_TYPE = -1;

/**
 * Declarative runtime/bootstrap status for actor stores.
 * This metadata is descriptive only and must not be treated as a registration API.
 */
export const ACTOR_STORE_RUNTIME_STATUS = Object.freeze({
  ghost: 'planned',
  inputState: 'active',
  player: 'active',
});

/**
 * Allocate the typed-array store for player gameplay state.
 * This store is part of the active runtime contract today.
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
 * This store is planned scaffolding for later gameplay tickets and is not
 * registered by the current bootstrap path yet.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {GhostStore} Fresh ghost store with inert timer and speed defaults.
 */
export function createGhostStore(maxEntities) {
  return {
    // Type starts at an explicit sentinel so an uninitialized ghost never masquerades as Blinky.
    type: new Int16Array(maxEntities).fill(UNASSIGNED_GHOST_TYPE),
    // State values come from the canonical gameplay enum in constants.js.
    state: new Uint8Array(maxEntities).fill(GHOST_STATE.NORMAL),
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
  store.type[entityId] = UNASSIGNED_GHOST_TYPE;
  store.state[entityId] = GHOST_STATE.NORMAL;
  store.timerMs[entityId] = 0;
  store.speed[entityId] = 0;
}

/**
 * Allocate the typed-array store for the per-step input snapshot.
 * This store is part of the active runtime contract today.
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
    restart: new Uint8Array(maxEntities),
    confirm: new Uint8Array(maxEntities),
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
  store.restart[entityId] = 0;
  store.confirm[entityId] = 0;
}
