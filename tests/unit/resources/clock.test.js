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
    // Use a gap of 2× fixedDtMs to avoid floating-point edge cases
    // where (baseline + FIXED_DT_MS) - baseline < FIXED_DT_MS.
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

  it('handles negative or zero delta gracefully', () => {
    const clock = createClock(100);
    const steps = tickClock(clock, 50);
    expect(steps).toBeGreaterThanOrEqual(0);
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
});
