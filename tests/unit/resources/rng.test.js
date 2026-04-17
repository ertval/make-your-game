/**
 * Unit tests for D-01 RNG resource.
 *
 * Verifies deterministic sequences, range bounds, and reseed behavior
 * for the Mulberry32 seeded PRNG.
 */

import { describe, expect, it } from 'vitest';

import {
  createRNG,
  nextChance,
  nextFloat,
  nextInt,
  pick,
  reseed,
} from '../../../src/ecs/resources/rng.js';

describe('rng', () => {
  it('produces deterministic sequences for the same seed', () => {
    const rng1 = createRNG(12345);
    const rng2 = createRNG(12345);

    for (let i = 0; i < 100; i++) {
      expect(nextFloat(rng1)).toBe(nextFloat(rng2));
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRNG(1);
    const rng2 = createRNG(2);

    let matchCount = 0;
    for (let i = 0; i < 100; i++) {
      if (nextFloat(rng1) === nextFloat(rng2)) {
        matchCount += 1;
      }
    }
    expect(matchCount).toBeLessThan(5);
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      const val = nextFloat(rng);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('returns integers in [min, max] inclusive', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = nextInt(rng, 5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('nextChance returns values in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const val = nextChance(rng);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('pick returns an element from the array', () => {
    const rng = createRNG(42);
    const arr = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 50; i++) {
      const val = pick(rng, arr);
      expect(arr).toContain(val);
    }
  });

  it('pick returns undefined for empty array', () => {
    const rng = createRNG(42);
    expect(pick(rng, [])).toBeUndefined();
  });

  it('reseed changes the sequence', () => {
    const rng = createRNG(1);
    const beforeReseed = nextFloat(rng);
    reseed(rng, 999);
    const afterReseed = nextFloat(rng);
    const rngFresh = createRNG(999);
    expect(afterReseed).toBe(nextFloat(rngFresh));
    expect(typeof beforeReseed).toBe('number');
    expect(typeof afterReseed).toBe('number');
  });

  it('maintains 32-bit unsigned integrity for seeds and state (SEC-X01)', () => {
    // Large positive seed
    const rng1 = createRNG(0xffffffff);
    expect(rng1.state).toBe(4294967295);

    // Negative seed (should be converted to 32-bit unsigned via >>> 0)
    const rng2 = createRNG(-1);
    expect(rng2.state).toBe(4294967295);

    // Test bitwise wrap-around behavior over many steps
    const rng3 = createRNG(1);
    for (let i = 0; i < 1000; i++) {
      nextFloat(rng3);
      expect(rng3.state).toBeGreaterThanOrEqual(0);
      expect(rng3.state).toBeLessThan(4294967296);
    }
  });
});
