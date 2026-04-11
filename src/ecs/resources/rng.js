/**
 * D-01: RNG Resource
 *
 * Seeded pseudo-random number generator for deterministic game runs.
 * Replaces `Math.random()` with a predictable PRNG so that given the
 * same seed and sequence of calls, the game produces identical outcomes.
 * This is essential for replay determinism and reproducible test scenarios.
 *
 * Uses the Mulberry32 algorithm: a fast, simple 32-bit PRNG with a
 * period of 2^32 and good statistical properties for game use cases.
 *
 * Public API:
 *   - createRNG(seed) — factory that returns a mutable RNG record.
 *   - nextFloat(rng) — returns a float in [0, 1).
 *   - nextInt(rng, min, max) — returns an integer in [min, max] inclusive.
 *   - nextChance(rng) — returns a float in [0, 1) for probability checks.
 *   - pick(rng, array) — returns a random element from an array.
 *   - reseed(rng, seed) — changes the seed mid-run (e.g., for level transitions).
 *
 * Implementation notes:
 *   - The RNG state is a single 32-bit integer stored in a plain object
 *     so it can be stored as a World resource and mutated in place.
 *   - Mulberry32 is chosen for its simplicity, speed, and small state
 *     (single integer) — no need for complex state arrays.
 */

/**
 * Create a new seeded RNG record.
 * @param {number} [seed=42] — Initial seed value (32-bit integer).
 * @returns {RNG}
 */
export function createRNG(seed = 42) {
  // Ensure the seed is a valid 32-bit unsigned integer.
  return {
    state: seed >>> 0,
  };
}

/**
 * Generate the next pseudo-random float in [0, 1).
 * Uses the Mulberry32 algorithm.
 *
 * @param {RNG} rng — Mutable RNG record.
 * @returns {number} Float in [0, 1).
 */
export function nextFloat(rng) {
  // Mulberry32 step: mix state with bitwise operations.
  rng.state = (rng.state + 0x6d2b79f5) | 0;
  let t = Math.imul(rng.state ^ (rng.state >>> 15), 1 | rng.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  // Normalize to [0, 1) by dividing by 2^32.
  return (t >>> 0) / 4294967296;
}

/**
 * Generate the next pseudo-random integer in [min, max] inclusive.
 *
 * @param {RNG} rng — Mutable RNG record.
 * @param {number} min — Minimum value (inclusive).
 * @param {number} max — Maximum value (inclusive).
 * @returns {number} Integer in [min, max].
 */
export function nextInt(rng, min, max) {
  const range = max - min + 1;
  return min + Math.floor(nextFloat(rng) * range);
}

/**
 * Generate the next pseudo-random chance value in [0, 1).
 * Convenience alias for nextFloat — used for probability checks
 * like power-up drop rates.
 *
 * @param {RNG} rng — Mutable RNG record.
 * @returns {number} Float in [0, 1).
 */
export function nextChance(rng) {
  return nextFloat(rng);
}

/**
 * Pick a random element from an array.
 *
 * @param {RNG} rng — Mutable RNG record.
 * @param {unknown[]} array — Non-empty array to pick from.
 * @returns {unknown} A random element from the array.
 */
export function pick(rng, array) {
  if (array.length === 0) {
    return undefined;
  }
  const index = nextInt(rng, 0, array.length - 1);
  return array[index];
}

/**
 * Reseed the RNG mid-run (e.g., for level transitions or replay branching).
 *
 * @param {RNG} rng — Mutable RNG record.
 * @param {number} seed — New seed value (32-bit integer).
 */
export function reseed(rng, seed) {
  rng.state = seed >>> 0;
}