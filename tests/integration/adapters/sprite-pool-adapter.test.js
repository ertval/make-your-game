/**
 * D-09: Sprite Pool Adapter Tests
 *
 * Validates pool sizing, offscreen-hiding strategy, acquire/release API,
 * exhaustion behavior, and reset.
 */

import { describe, expect, it, vi } from 'vitest';
import { createSpritePool, SPRITE_TYPE } from '../../../src/adapters/dom/sprite-pool-adapter.js';
import {
  POOL_FIRE,
  POOL_GHOSTS,
  POOL_MAX_BOMBS,
  POOL_PELLETS,
} from '../../../src/ecs/resources/constants.js';

const OFFSCREEN = 'translate(-9999px, -9999px)';

function createMockDocument() {
  return {
    createElement: vi.fn(() => ({
      classList: { add: vi.fn() },
      style: { transform: '' },
      appendChild: vi.fn(),
    })),
  };
}

function makePool(dev = false) {
  const doc = createMockDocument();
  const pool = createSpritePool({ document: doc, dev });
  const container = doc.createElement('div');
  pool.warmUp(container);
  return { pool, doc, container };
}

describe('sprite-pool-adapter', () => {
  describe('warmUp — pool sizing', () => {
    it('pre-allocates correct number of player elements', () => {
      const { pool } = makePool();
      expect(pool.stats(SPRITE_TYPE.PLAYER).idle).toBe(1);
    });

    it('pre-allocates correct number of ghost elements', () => {
      const { pool } = makePool();
      expect(pool.stats(SPRITE_TYPE.GHOST).idle).toBe(POOL_GHOSTS);
    });

    it('pre-allocates correct number of bomb elements', () => {
      const { pool } = makePool();
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
    });

    it('pre-allocates correct number of fire elements', () => {
      const { pool } = makePool();
      expect(pool.stats(SPRITE_TYPE.FIRE).idle).toBe(POOL_FIRE);
    });

    it('pre-allocates correct number of pellet elements', () => {
      const { pool } = makePool();
      expect(pool.stats(SPRITE_TYPE.PELLET).idle).toBe(POOL_PELLETS);
    });

    it('all pre-allocated elements are hidden offscreen', () => {
      const doc = createMockDocument();
      const pool = createSpritePool({ document: doc });
      const container = doc.createElement('div');
      pool.warmUp(container);
      const created = doc.createElement.mock.results.slice(1); // skip container
      for (const r of created) {
        expect(r.value.style.transform).toBe(OFFSCREEN);
      }
    });

    it('appends all elements to the container', () => {
      const doc = createMockDocument();
      const pool = createSpritePool({ document: doc });
      const container = { appendChild: vi.fn() };
      pool.warmUp(container);
      const total = 1 + POOL_GHOSTS + POOL_MAX_BOMBS + POOL_FIRE + POOL_PELLETS;
      expect(container.appendChild).toHaveBeenCalledTimes(total);
    });
  });

  describe('acquire', () => {
    it('returns an element and moves it to active', () => {
      const { pool } = makePool();
      const el = pool.acquire(SPRITE_TYPE.BOMB);
      expect(el).toBeDefined();
      expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(1);
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS - 1);
    });

    it('throws for unknown sprite type', () => {
      const { pool } = makePool();
      expect(() => pool.acquire('unknown')).toThrow();
    });
  });

  describe('release', () => {
    it('moves element back to idle and sets offscreen transform', () => {
      const { pool } = makePool();
      const el = pool.acquire(SPRITE_TYPE.BOMB);
      pool.release(SPRITE_TYPE.BOMB, el);
      expect(el.style.transform).toBe(OFFSCREEN);
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
      expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(0);
    });

    it('throws for unknown sprite type', () => {
      const { pool } = makePool();
      expect(() => pool.release('unknown', {})).toThrow();
    });

    it('is a no-op for a foreign element not tracked as active (double-release guard)', () => {
      const { pool } = makePool();
      const idleBefore = pool.stats(SPRITE_TYPE.BOMB).idle;
      const foreignEl = { style: { transform: '' } };
      // Should not throw and should not inflate the idle pool
      expect(() => pool.release(SPRITE_TYPE.BOMB, foreignEl)).not.toThrow();
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(idleBefore);
    });

    it('is a no-op on double-release of the same element', () => {
      const { pool } = makePool();
      const el = pool.acquire(SPRITE_TYPE.BOMB);
      pool.release(SPRITE_TYPE.BOMB, el);
      const idleAfterFirst = pool.stats(SPRITE_TYPE.BOMB).idle;
      pool.release(SPRITE_TYPE.BOMB, el);
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(idleAfterFirst);
    });
  });

  describe('exhaustion behavior', () => {
    it('warns in dev mode when pool is exhausted', () => {
      const { pool } = makePool(true);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (let i = 0; i < POOL_GHOSTS; i++) pool.acquire(SPRITE_TYPE.GHOST);
      pool.acquire(SPRITE_TYPE.GHOST);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ghost'));
      warn.mockRestore();
    });

    it('silently recycles oldest active element in production', () => {
      const { pool } = makePool(false);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const acquired = [];
      for (let i = 0; i < POOL_GHOSTS; i++) acquired.push(pool.acquire(SPRITE_TYPE.GHOST));
      const recycled = pool.acquire(SPRITE_TYPE.GHOST);
      expect(recycled).toBe(acquired[0]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('reset', () => {
    it('returns all active elements to idle', () => {
      const { pool } = makePool();
      pool.acquire(SPRITE_TYPE.BOMB);
      pool.acquire(SPRITE_TYPE.BOMB);
      pool.reset();
      expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(0);
      expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
    });

    it('sets offscreen transform on all released elements', () => {
      const { pool } = makePool();
      const el = pool.acquire(SPRITE_TYPE.PELLET);
      el.style.transform = 'translate3d(100px, 200px, 0)';
      pool.reset();
      expect(el.style.transform).toBe(OFFSCREEN);
    });
  });

  describe('BUG-05: acquire() on un-warmed pool', () => {
    it('does not throw when acquire() is called before warmUp()', () => {
      const doc = createMockDocument();
      const pool = createSpritePool({ document: doc });
      // Pool was never warmed: idle and active are both empty.
      expect(() => pool.acquire(SPRITE_TYPE.PLAYER)).not.toThrow();
    });

    it('does not throw when idle and active are both exhausted', () => {
      const doc = createMockDocument();
      const pool = createSpritePool({ document: doc });
      // No warmUp; force the un-warmed-and-empty path.
      expect(() => pool.acquire(SPRITE_TYPE.GHOST)).not.toThrow();
    });
  });
});
