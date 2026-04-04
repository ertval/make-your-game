/**
 * D-01: Clock Resource
 *
 * Deterministic, injectable time tracking for fixed-step simulation.
 * Separates real (wall) time from simulation time so that pausing
 * freezes game progression while the render loop continues running.
 *
 * Public API:
 *   - createClock(now?) — factory that returns a mutable clock record.
 *   - tickClock(clock, now, maxStepsPerFrame, fixedDtMs) — advances
 *     the clock by one frame, updating accumulator, step count, and alpha.
 *     Reads pause state from clock.isPaused (set via setPauseState).
 *   - resetClock(clock, now) — resynchronizes the baseline after unpause or
 *     visibility change to prevent a burst catch-up frame.
 *
 * Implementation notes:
 *   - The clock is a plain data object (no methods on the record itself) so
 *     it can be stored as a World resource and mutated in place.
 *   - `tickClock` returns the number of simulation steps to execute this frame,
 *     clamped to `maxStepsPerFrame` to prevent spiral-of-death.
 *   - `lastFrameTime` is always the wall-clock timestamp of the last rAF tick,
 *     while `simTimeMs` only advances during unpaused simulation steps.
 */

import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from './constants.js';

/**
 * Create a new clock record.
 * @param {number} [now=0] — Initial wall-clock timestamp (ms).
 * @returns {Clock}
 */
export function createClock(now = 0) {
  return {
    /** Wall-clock timestamp of the last rAF tick (ms). */
    lastFrameTime: now,
    /** Elapsed simulation time (ms). Does not advance while paused. */
    simTimeMs: 0,
    /** Accumulator for fixed-step catch-up (ms). */
    accumulator: 0,
    /** Interpolation factor for render collect (0…1). */
    alpha: 0,
    /** Whether the simulation is currently paused. */
    isPaused: false,
  };
}

/**
 * Advance the clock by one frame. Returns the number of simulation steps
 * to execute this frame (0 when paused, 1+ when catching up).
 *
 * @param {Clock} clock — Mutable clock record to update.
 * @param {number} now — Current rAF timestamp (ms).
 * @param {number} [maxStepsPerFrame=MAX_STEPS_PER_FRAME] — Catch-up clamp.
 * @param {number} [fixedDtMs=FIXED_DT_MS] — Fixed timestep in ms.
 * @returns {number} Number of simulation steps to run this frame.
 */
export function tickClock(
  clock,
  now,
  maxStepsPerFrame = MAX_STEPS_PER_FRAME,
  fixedDtMs = FIXED_DT_MS,
) {
  // Calculate raw delta since last frame.
  let frameTime = now - clock.lastFrameTime;

  // Clamp negative or zero deltas (can happen on first frame or timer quirks).
  if (frameTime <= 0) {
    frameTime = fixedDtMs;
  }

  // Clamp large deltas to prevent spiral-of-death after tab throttling.
  // If the gap exceeds 10 fixed steps, cap it to avoid a massive catch-up burst.
  const maxDelta = fixedDtMs * 10;
  if (frameTime > maxDelta) {
    frameTime = maxDelta;
  }

  // Update wall-clock baseline.
  clock.lastFrameTime = now;

  // When paused, do NOT advance the accumulator or simulation time.
  // The render loop keeps running but simulation is frozen.
  if (clock.isPaused) {
    clock.alpha = 0;
    return 0;
  }

  // Accumulate elapsed time for fixed-step processing.
  clock.accumulator += frameTime;

  // Calculate how many full fixed steps fit in the accumulator, clamped.
  let steps = Math.floor(clock.accumulator / fixedDtMs);
  if (steps > maxStepsPerFrame) {
    steps = maxStepsPerFrame;
  }

  // Consume the time for the steps we're about to execute.
  clock.accumulator -= steps * fixedDtMs;

  // Compute interpolation factor for render collect.
  // Alpha represents how far we are into the next fixed step.
  clock.alpha = clock.accumulator / fixedDtMs;

  return steps;
}

/**
 * Advance simulation time by one fixed step. Called by the game loop
 * for each simulation step returned by `tickClock`.
 *
 * @param {Clock} clock — Mutable clock record to update.
 * @param {number} [fixedDtMs=FIXED_DT_MS] — Fixed timestep in ms.
 */
export function advanceSimTime(clock, fixedDtMs = FIXED_DT_MS) {
  clock.simTimeMs += fixedDtMs;
}

/**
 * Reset the clock baseline after unpause or visibility change.
 * Prevents a burst catch-up frame by clearing the accumulator and
 * re-syncing the last-frame timestamp to the current time.
 *
 * @param {Clock} clock — Mutable clock record to update.
 * @param {number} now — Current rAF timestamp (ms).
 */
export function resetClock(clock, now) {
  clock.lastFrameTime = now;
  clock.accumulator = 0;
  clock.alpha = 0;
}

/**
 * Set the pause state of the clock.
 *
 * @param {Clock} clock — Mutable clock record to update.
 * @param {boolean} paused — Whether to pause the simulation.
 */
export function setPauseState(clock, paused) {
  clock.isPaused = paused;
}
