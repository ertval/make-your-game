/*
 * B-01 visual component stores.
 *
 * This file defines the ECS component storage for render-facing identity and
 * transient visual state. These stores remain pure data so render systems can
 * translate them into DOM work later without simulation systems touching the
 * browser directly.
 *
 * Public API:
 * - RENDERABLE_KIND: canonical render-kind enum values for gameplay entities.
 * - VISUAL_FLAGS: canonical class-bit values re-exported for discoverability.
 * - createRenderableStore(maxEntities): allocate typed arrays for renderable data.
 * - resetRenderable(store, entityId): clear one renderable slot to defaults.
 * - createVisualStateStore(maxEntities): allocate typed arrays for class bits.
 * - resetVisualState(store, entityId): clear one visual-state slot to defaults.
 *
 * Implementation notes:
 * - Render kind is an enum index because later render systems only need to map
 *   a small set of gameplay categories to sprites or CSS classes.
 * - Sprite IDs use -1 as the "no sprite assigned" sentinel, which requires an
 *   Int32Array instead of an unsigned integer array.
 * - classBits reuses the bitmask strategy already defined in VISUAL_FLAGS so a
 *   single numeric field can represent multiple visual modifiers at once.
 */

export { VISUAL_FLAGS } from '../resources/constants.js';

/**
 * Canonical render kinds used by renderable entities.
 * Zero means "no renderable kind assigned" so reset slots stay inert.
 */
export const RENDERABLE_KIND = Object.freeze({
  NONE: 0,
  PLAYER: 1,
  GHOST: 2,
  BOMB: 3,
  FIRE: 4,
  PELLET: 5,
  WALL: 6,
  POWER_UP: 7,
});

/**
 * Allocate the typed-array store for renderable identity data.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {RenderableStore} Fresh renderable store with inert defaults.
 */
export function createRenderableStore(maxEntities) {
  return {
    // Kind identifies the gameplay category the renderer should draw.
    kind: new Uint8Array(maxEntities),
    // Sprite ID starts unassigned so later asset systems can opt in explicitly.
    spriteId: new Int32Array(maxEntities).fill(-1),
  };
}

/**
 * Reset one renderable slot back to inert defaults.
 *
 * @param {RenderableStore} store - Mutable renderable store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetRenderable(store, entityId) {
  store.kind[entityId] = RENDERABLE_KIND.NONE;
  store.spriteId[entityId] = -1;
}

/**
 * Allocate the typed-array store for transient visual-state flags.
 *
 * @param {number} maxEntities - Total entity capacity for the world.
 * @returns {VisualStateStore} Fresh visual-state store with zeroed defaults.
 */
export function createVisualStateStore(maxEntities) {
  return {
    // classBits is a bitmask field. Later systems combine VISUAL_FLAGS such as
    // STUNNED | INVINCIBLE with bitwise OR so one byte can describe multiple
    // simultaneous visual modifiers without storing several booleans.
    classBits: new Uint8Array(maxEntities),
  };
}

/**
 * Reset one visual-state slot back to "no active flags".
 *
 * @param {VisualStateStore} store - Mutable visual-state store to reset.
 * @param {number} entityId - Entity slot index to reset.
 */
export function resetVisualState(store, entityId) {
  store.classBits[entityId] = 0;
}
