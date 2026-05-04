/**
 * Unit tests for frame-stats helper utilities.
 *
 * Purpose: Verifies deterministic sorting and percentile selection used by
 * runtime frame probes.
 * Public API: N/A (test module).
 * Implementation notes: Uses small deterministic arrays for stable assertions.
 */

import { describe, expect, it } from 'vitest';

import { percentileFromSorted, toSortedNumericArray } from '../../../src/debug/frame-stats.js';

describe('frame-stats helpers', () => {
  it('returns sorted numeric samples for the provided count', () => {
    const values = new Float64Array([16.7, 20.2, 15.1, 18.5]);
    const sorted = toSortedNumericArray(values, 3);

    expect(sorted).toEqual([15.1, 16.7, 20.2]);
  });

  it('clamps percentile selection to valid bounds', () => {
    const sorted = [10, 20, 30, 40, 50];

    expect(percentileFromSorted(sorted, -10)).toBe(10);
    expect(percentileFromSorted(sorted, 50)).toBe(30);
    expect(percentileFromSorted(sorted, 95)).toBe(40);
    expect(percentileFromSorted(sorted, 100)).toBe(50);
  });

  it('returns zero for empty samples', () => {
    expect(percentileFromSorted([], 95)).toBe(0);
  });
});
