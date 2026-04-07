/**
 * Unit tests for the B-01 component registry.
 *
 * These checks protect the ECS query contract by ensuring every component bit
 * remains unique, query-safe, and available through the exported registry.
 */

import { describe, expect, it } from 'vitest';

import { ALL_COMPONENT_MASKS, COMPONENT_MASK } from '../../../src/ecs/components/registry.js';

describe('component registry', () => {
  it('defines the full B-01 component registry with stable power-of-two values', () => {
    expect(COMPONENT_MASK).toEqual({
      POSITION: 1 << 0,
      VELOCITY: 1 << 1,
      COLLIDER: 1 << 2,
      PLAYER: 1 << 3,
      GHOST: 1 << 4,
      INPUT_STATE: 1 << 5,
      BOMB: 1 << 6,
      FIRE: 1 << 7,
      POWER_UP: 1 << 8,
      PELLET: 1 << 9,
      SCORE: 1 << 10,
      TIMER: 1 << 11,
      HEALTH: 1 << 12,
      RENDERABLE: 1 << 13,
      VISUAL_STATE: 1 << 14,
    });
  });

  it('assigns every component a unique power-of-two mask', () => {
    expect(ALL_COMPONENT_MASKS).toHaveLength(15);
    expect(new Set(ALL_COMPONENT_MASKS).size).toBe(ALL_COMPONENT_MASKS.length);

    for (const mask of ALL_COMPONENT_MASKS) {
      // Power-of-two values guarantee that one component uses one bit only.
      expect(mask & (mask - 1)).toBe(0);
    }
  });

  it('exports ALL_COMPONENT_MASKS as the registry values in declaration order', () => {
    expect(ALL_COMPONENT_MASKS).toEqual(Object.values(COMPONENT_MASK));
  });
});
