/**
 * D-09: Sprite pool board adapter wiring integration tests.
 *
 * Verifies that createBoardAdapter pre-warms the sprite pool against the
 * game container when generateBoard is called, and resets the pool on
 * clearBoard so each level starts with a fully-idle pool.
 */

import { describe, expect, it, vi } from 'vitest';
import { createBoardAdapter } from '../../../src/adapters/dom/renderer-adapter.js';
import { createSpritePool, SPRITE_TYPE } from '../../../src/adapters/dom/sprite-pool-adapter.js';
import { POOL_GHOSTS, POOL_MAX_BOMBS } from '../../../src/ecs/resources/constants.js';

function createMockDocument() {
  return {
    createElement: vi.fn((tag) => ({
      tagName: tag.toUpperCase(),
      classList: { add: vi.fn() },
      style: { transform: '', setProperty: vi.fn() },
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      parentNode: null,
    })),
  };
}

function createMockContainer() {
  return { appendChild: vi.fn() };
}

function createMockMap() {
  return {
    rows: 2,
    cols: 2,
    grid: new Uint8Array([0, 0, 0, 0]),
  };
}

function createMockSpritePool() {
  return {
    warmUp: vi.fn(),
    reset: vi.fn(),
    acquire: vi.fn(),
    release: vi.fn(),
    stats: vi.fn(() => ({ idle: 0, active: 0 })),
  };
}

function createRealPool() {
  const mockDoc = {
    createElement: vi.fn(() => ({
      classList: { add: vi.fn() },
      style: { transform: '' },
    })),
  };
  return createSpritePool({ document: mockDoc });
}

describe('sprite pool board adapter wiring', () => {
  it('calls warmUp on the container when generateBoard is called with a spritePool', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const pool = createMockSpritePool();
    const adapter = createBoardAdapter({ document: doc, spritePool: pool });

    adapter.generateBoard(createMockMap(), container);

    expect(pool.warmUp).toHaveBeenCalledOnce();
    expect(pool.warmUp).toHaveBeenCalledWith(container);
  });

  it('calls reset on clearBoard so active sprites are reclaimed before level teardown', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const pool = createMockSpritePool();
    const adapter = createBoardAdapter({ document: doc, spritePool: pool });

    adapter.generateBoard(createMockMap(), container);
    adapter.clearBoard();

    expect(pool.reset).toHaveBeenCalledOnce();
  });

  it('does not throw when no spritePool is provided (pool is optional)', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const adapter = createBoardAdapter({ document: doc });

    expect(() => adapter.generateBoard(createMockMap(), container)).not.toThrow();
    expect(() => adapter.clearBoard()).not.toThrow();
  });

  it('pre-warms the real pool against the container on level load', () => {
    const pool = createRealPool();
    const container = { appendChild: vi.fn() };
    const adapter = createBoardAdapter({ document: createMockDocument(), spritePool: pool });

    adapter.generateBoard(createMockMap(), container);

    expect(pool.stats(SPRITE_TYPE.GHOST).idle).toBe(POOL_GHOSTS);
    expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
    expect(container.appendChild).toHaveBeenCalled();
  });

  it('pool is fully idle again after clearBoard following level activity', () => {
    const pool = createRealPool();
    const container = { appendChild: vi.fn() };
    const adapter = createBoardAdapter({ document: createMockDocument(), spritePool: pool });

    adapter.generateBoard(createMockMap(), container);

    pool.acquire(SPRITE_TYPE.BOMB);
    pool.acquire(SPRITE_TYPE.BOMB);
    expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(2);

    adapter.clearBoard();

    expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(0);
    expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
  });
});
