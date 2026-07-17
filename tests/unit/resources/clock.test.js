/**
 * Unit tests for D-01 clock resource.
 *
 * Verifies deterministic time tracking, pause semantics, spiral-of-death
 * clamping, and the critical contract that resetting the clock after a
 * paused frame or visibility gap prevents a burst catch-up on the next tick.
 */

import { describe, expect, it } from 'vitest';
import {
  advanceSimTime,
  createClock,
  resetClock,
  setPauseState,
  tickClock,
} from '../../../src/ecs/resources/clock.js';
import { FIXED_DT_MS, MAX_STEPS_PER_FRAME } from '../../../src/ecs/resources/constants.js';

describe('clock', () => {
  it('creates a clock with zeroed initial state', () => {
    const clock = createClock(0);
    expect(clock.lastFrameTime).toBe(0);
    expect(clock.realTimeMs).toBe(0);
    expect(clock.simTimeMs).toBe(0);
    expect(clock.accumulator).toBe(0);
    expect(clock.alpha).toBe(0);
    expect(clock.isPaused).toBe(false);
  });

  it('returns 1 step for a single fixed timestep', () => {
    const clock = createClock(0);
    const now = FIXED_DT_MS;
    const steps = tickClock(clock, now);
    expect(steps).toBe(1);
    expect(clock.lastFrameTime).toBe(now);
  });

  it('returns 0 steps when paused', () => {
    const clock = createClock(0);
    setPauseState(clock, true);
    const steps = tickClock(clock, FIXED_DT_MS);
    expect(steps).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('advances simulation time correctly', () => {
    const clock = createClock(0);
    advanceSimTime(clock);
    expect(clock.simTimeMs).toBeCloseTo(FIXED_DT_MS, 4);
    advanceSimTime(clock);
    expect(clock.simTimeMs).toBeCloseTo(FIXED_DT_MS * 2, 4);
  });

  it('does not advance sim time while paused', () => {
    const clock = createClock(0);
    setPauseState(clock, true);
    tickClock(clock, FIXED_DT_MS);
    expect(clock.simTimeMs).toBe(0);
  });

  it('clamps catch-up to MAX_STEPS_PER_FRAME after a large gap', () => {
    const clock = createClock(0);
    const steps = tickClock(clock, 500);
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('keeps alpha in [0, 1) after a lag spike that triggers step clamping', () => {
    const clock = createClock(0);
    tickClock(clock, 500);
    expect(clock.alpha).toBeGreaterThanOrEqual(0);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('prevents burst catch-up after reset following a paused frame', () => {
    const clock = createClock(0);
    // Simulate normal play for a few frames.
    tickClock(clock, FIXED_DT_MS);
    advanceSimTime(clock);
    tickClock(clock, FIXED_DT_MS * 2);
    advanceSimTime(clock);

    // Pause the game.
    setPauseState(clock, true);

    // Simulate a long visibility gap while paused (e.g., tab switch).
    tickClock(clock, 2000);
    // Steps should be 0 and sim time frozen.
    expect(clock.simTimeMs).toBeCloseTo(FIXED_DT_MS * 2, 4);

    // Unpause and reset the clock baseline.
    setPauseState(clock, false);
    resetClock(clock, 3000);

    // The next tick after reset should NOT produce a burst of steps.
    const nextTick = 3000 + FIXED_DT_MS * 2;
    const steps = tickClock(clock, nextTick);
    expect(steps).toBe(2);
    expect(clock.alpha).toBeGreaterThanOrEqual(0);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('resets baseline to prevent burst after unpause', () => {
    const clock = createClock(0);
    tickClock(clock, 100);
    advanceSimTime(clock);
    resetClock(clock, 200);
    expect(clock.lastFrameTime).toBe(200);
    expect(clock.accumulator).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('handles negative or zero delta gracefully (BUG-06)', () => {
    const clock = createClock(100);
    const steps = tickClock(clock, 50);
    expect(steps).toBe(0); // Should not produce negative steps or synthetic progress
    // #237: on a regression, resync the baseline to the new (lower) timestamp
    // rather than sticking to the stale high one (which would freeze the sim).
    expect(clock.lastFrameTime).toBe(50);
  });

  it('resynchronizes after a backward time regression instead of freezing (#237)', () => {
    const clock = createClock(0);
    // Advance to a high baseline.
    tickClock(clock, 1000);
    // Backward jump to a much lower timestamp (e.g. a non-monotonic clock adjust).
    expect(tickClock(clock, 100)).toBe(0); // the single jump frame yields no steps

    // Two subsequent forward steps that are STILL below the old baseline (1000).
    // Before the fix the stale baseline made these negative deltas → 0 steps
    // (frozen for the whole regression gap). After the fix the baseline resynced
    // to 100, so forward progress resumes stepping.
    tickClock(clock, 100 + FIXED_DT_MS);
    const resumedSteps = tickClock(clock, 100 + 2 * FIXED_DT_MS);
    expect(resumedSteps).toBeGreaterThanOrEqual(1);
  });

  it('prevents NaN propagation when tickClock is called with non-finite values (BUG-01)', () => {
    const clock = createClock(100);
    const steps = tickClock(clock, NaN);
    expect(steps).toBe(0);
    expect(clock.lastFrameTime).toBe(100);
    expect(clock.realTimeMs).toBe(100);
  });

  it('prevents NaN delta when resetClock is called with undefined (BUG-01)', () => {
    const clock = createClock(100);
    resetClock(clock, undefined);
    expect(clock.lastFrameTime).toBeUndefined();
    // Subsequent tick should handle undefined baseline gracefully
    const steps = tickClock(clock, 200);
    expect(steps).toBeGreaterThanOrEqual(0);
    expect(clock.lastFrameTime).toBe(200);
  });

  it('clamps large deltas using maxStepsPerFrame instead of hardcoded multiplier (BUG-09)', () => {
    const clock = createClock(0);
    const largeGap = 10_000;
    const steps = tickClock(clock, largeGap);
    // Should be exactly MAX_STEPS_PER_FRAME, not 10 steps.
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('uses epsilon-safe clamp for leftover accumulator (BUG-X03)', () => {
    const clock = createClock(0);
    // Set accumulator to a value larger than 1 step, and clamp maxStepsPerFrame to 1
    clock.accumulator = FIXED_DT_MS * 3.0;
    tickClock(clock, 0.1, 1); // frameTime = 0.1 > 0, triggering steps clamp
    expect(clock.accumulator).toBeLessThan(FIXED_DT_MS);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('computes correct alpha after partial step', () => {
    const clock = createClock(0);
    tickClock(clock, FIXED_DT_MS * 1.5);
    expect(clock.alpha).toBeCloseTo(0.5, 4);
  });

  it('handles fixed-step boundary conditions around epsilon without extra steps', () => {
    const baseline = 1_000;
    const epsilon = 0.000001;

    const barelyAdvancedClock = createClock(baseline);
    expect(tickClock(barelyAdvancedClock, baseline + epsilon)).toBe(0);

    const justBelowStepClock = createClock(baseline);
    expect(tickClock(justBelowStepClock, baseline + FIXED_DT_MS - epsilon)).toBe(0);

    const justAboveStepClock = createClock(baseline);
    expect(tickClock(justAboveStepClock, baseline + FIXED_DT_MS + epsilon)).toBe(1);
  });

  it('skips alpha recalculation on duplicate timestamps (BUG-14)', () => {
    const clock = createClock(0);

    // First tick advances time and leaves some accumulator
    const steps = tickClock(clock, FIXED_DT_MS * 1.5);
    expect(steps).toBe(1);
    const expectedAlpha = clock.alpha;
    expect(expectedAlpha).toBeCloseTo(0.5, 4);

    // Mutate alpha manually. If the duplicate tick recomputes alpha from the
    // accumulator, it will overwrite it back to 0.5. If it returns early,
    // alpha will remain 0.9.
    clock.alpha = 0.9;

    // Second tick with the exact same timestamp
    const nextSteps = tickClock(clock, FIXED_DT_MS * 1.5);
    expect(nextSteps).toBe(0);
    // Alpha should be unchanged, not reset or recomputed
    expect(clock.alpha).toBe(0.9);
  });

  it('sets alpha to 0 and does not return early when paused on duplicate timestamps', () => {
    const clock = createClock(0);

    // First tick advances time and leaves some accumulator
    const steps = tickClock(clock, FIXED_DT_MS * 1.5);
    expect(steps).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.5, 4);

    // Pause the clock
    setPauseState(clock, true);

    // Tick with duplicate timestamp. If the duplicate early-return guard is incorrectly
    // placed above the isPaused check, it will return early and keep alpha at 0.5.
    // Otherwise, it should hit the isPaused branch and set alpha to 0.
    const nextSteps = tickClock(clock, FIXED_DT_MS * 1.5);
    expect(nextSteps).toBe(0);
    expect(clock.alpha).toBe(0);
  });
});
