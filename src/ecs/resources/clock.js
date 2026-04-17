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
    /** Absolute real-world timestamp tracked by the clock (ms). */
    realTimeMs: now,
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
  // Guard against non-finite timestamps (BUG-01/BUG-06/BUG-07).
  const timestamp = Number.isFinite(now) ? now : clock.lastFrameTime;

  // Calculate raw delta since last frame.
  let frameTime = timestamp - clock.lastFrameTime;

  // Detect and clamp time regressions or invalid baseline (BUG-01/BUG-06).
  const isBaselineValid = Number.isFinite(clock.lastFrameTime);
  const isTimeRegression = isBaselineValid && frameTime < 0;

  if (!Number.isFinite(frameTime) || isTimeRegression || frameTime === 0) {
    frameTime = 0;
  }

  // Update wall-clock baseline if it was invalid or if time moved forward.
  // We do NOT update if there was a regression (stick to last known good).
  if (!isBaselineValid || (!isTimeRegression && timestamp > clock.lastFrameTime)) {
    clock.lastFrameTime = timestamp;
    clock.realTimeMs = timestamp;
  }

  // Clamp large deltas to prevent spiral-of-death after tab throttling (BUG-09).
  const maxDelta = fixedDtMs * maxStepsPerFrame;
  if (frameTime > maxDelta) {
    frameTime = maxDelta;
  }

  // When paused, do NOT advance the accumulator or simulation time.
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

  // Robust epsilon-safe clamp for leftover accumulator (BUG-X03).
  // Ensures alpha stays in [0, 1) and avoids floating-point drift.
  if (clock.accumulator >= fixedDtMs) {
    clock.accumulator = Math.max(0, fixedDtMs - 1e-6);
  }

  // Compute interpolation factor for render collect.
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
 * Reset the clock baseline after unpause, visibility change, or game restart.
 * Prevents a burst catch-up frame by clearing the accumulator and
 * re-syncing the last-frame timestamp to the current time (BUG-12).
 *
 * @param {Clock} clock — Mutable clock record to update.
 * @param {number} now — Current rAF timestamp (ms).
 */
export function resetClock(clock, now) {
  clock.lastFrameTime = now;
  clock.simTimeMs = 0;
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
