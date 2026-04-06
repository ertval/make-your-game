import { describe, expect, it } from 'vitest';

import { hasAllComponents, QueryIndex } from '../../../src/ecs/world/query.js';

describe('QueryIndex', () => {
  it('matches required bitmasks deterministically', () => {
    const queryIndex = new QueryIndex();

    queryIndex.setMask(0, 0b0011);
    queryIndex.setMask(1, 0b0111);
    queryIndex.setMask(2, 0b0001);

    const matches = queryIndex.match(0b0011, [0, 1, 2]);
    expect(matches).toEqual([0, 1]);
  });

  it('returns empty results when no entities match', () => {
    const queryIndex = new QueryIndex();

    queryIndex.setMask(0, 0b0001);
    queryIndex.setMask(1, 0b0010);

    expect(queryIndex.match(0b0100, [0, 1])).toEqual([]);
  });
});

describe('hasAllComponents', () => {
  it('returns true only when all required bits are present', () => {
    expect(hasAllComponents(0b0111, 0b0011)).toBe(true);
    expect(hasAllComponents(0b0010, 0b0011)).toBe(false);
  });
});
