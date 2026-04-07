/*
 * B-01 component registry.
 *
 * This file owns the canonical bitmask for every ECS component introduced by
 * Track B. Systems and world-query code use these bits to describe which
 * component stores an entity currently has without storing a large boolean
 * object per entity.
 *
 * Public API:
 * - COMPONENT_MASK: named power-of-two bit flags for each component store.
 * - ALL_COMPONENT_MASKS: stable list of every registered component bit.
 *
 * Implementation notes:
 * - Each mask must remain a unique power of two so multiple components can be
 *   combined safely with bitwise OR.
 * - The registry is frozen to prevent accidental mutation during runtime or
 *   tests, because a changed bit would corrupt every ECS query that uses it.
 */

/**
 * Canonical component bit flags used by ECS queries and entity masks.
 * Each bit represents the presence of one component store on an entity.
 */
export const COMPONENT_MASK = Object.freeze({
  // Spatial data is split into separate stores so systems can query exactly
  // the data they need on hot paths.
  POSITION: 1 << 0,
  VELOCITY: 1 << 1,
  COLLIDER: 1 << 2,

  // Actor state stores drive player, ghost, and per-step input simulation.
  PLAYER: 1 << 3,
  GHOST: 1 << 4,
  INPUT_STATE: 1 << 5,

  // Gameplay prop stores cover bombs, fire, collectible power-ups, and pellets.
  BOMB: 1 << 6,
  FIRE: 1 << 7,
  POWER_UP: 1 << 8,
  PELLET: 1 << 9,

  // Stats stores keep scoring, countdown, and life-related state isolated.
  SCORE: 1 << 10,
  TIMER: 1 << 11,
  HEALTH: 1 << 12,

  // Visual stores define render identity and transient presentation flags.
  RENDERABLE: 1 << 13,
  VISUAL_STATE: 1 << 14,
});

/**
 * Stable list of every registered component mask.
 * Consumers can iterate this when they need to validate registry integrity.
 */
export const ALL_COMPONENT_MASKS = Object.freeze(Object.values(COMPONENT_MASK));
