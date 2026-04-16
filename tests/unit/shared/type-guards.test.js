/**
 * Unit tests for shared type guards.
 *
 * Purpose: Verify shared runtime type checks remain deterministic and side-effect free.
 * Public API: N/A (test module).
 * Implementation notes: Covers record and non-record values used by gameplay loaders.
 */

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../../src/shared/type-guards.js';

describe('type-guards', () => {
  it('returns true for plain objects and arrays', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
  });

  it('returns false for null and primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(0)).toBe(false);
    expect(isRecord('value')).toBe(false);
    expect(isRecord(false)).toBe(false);
  });
});
