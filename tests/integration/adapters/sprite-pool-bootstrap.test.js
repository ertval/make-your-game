/**
 * D-09: Sprite pool bootstrap integration tests.
 *
 * Verifies that createBootstrap pre-warms the sprite pool when a
 * spriteContainer is provided, exposes the pool as a World resource, and
 * resets the pool on every level load so each level starts with a fully-idle
 * pool.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SPRITE_TYPE } from '../../../src/adapters/dom/sprite-pool-adapter.js';
import { POOL_GHOSTS, POOL_MAX_BOMBS } from '../../../src/ecs/resources/constants.js';
import { createMapResource } from '../../../src/ecs/resources/map-resource.js';
import { createBootstrap } from '../../../src/game/bootstrap.js';

const root = path.resolve(import.meta.dirname, '../../..');

function loadMap(levelNumber = 1) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, `assets/maps/level-${levelNumber}.json`), 'utf8'),
  );
  return createMapResource(raw);
}

function createMockDocument() {
  return {
    createElement: vi.fn(() => ({
      classList: { add: vi.fn() },
      style: { transform: '' },
    })),
  };
}

function createMockContainer() {
  return { appendChild: vi.fn() };
}

describe('sprite pool bootstrap integration', () => {
  it('pre-warms the pool and registers it as a World resource on bootstrap', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const { world } = createBootstrap({
      document: doc,
      spriteContainer: container,
      loadMapForLevel: () => loadMap(),
    });

    const pool = world.getResource('spritePool');
    expect(pool).not.toBeNull();
    // Pool should have pre-allocated elements — idle counts match pool sizes
    expect(pool.stats(SPRITE_TYPE.GHOST).idle).toBe(POOL_GHOSTS);
    expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
  });

  it('appends pre-warmed elements to the provided spriteContainer', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    createBootstrap({
      document: doc,
      spriteContainer: container,
      loadMapForLevel: () => loadMap(),
    });

    expect(container.appendChild).toHaveBeenCalled();
  });

  it('resets the pool on level load so each level starts with a fully-idle pool', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const { world, levelLoader } = createBootstrap({
      document: doc,
      spriteContainer: container,
      loadMapForLevel: () => loadMap(),
    });

    const pool = world.getResource('spritePool');
    // Simulate active usage between levels
    pool.acquire(SPRITE_TYPE.BOMB);
    pool.acquire(SPRITE_TYPE.BOMB);
    expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(2);

    // Level load should reset all active back to idle
    levelLoader.restartCurrentLevel();
    expect(pool.stats(SPRITE_TYPE.BOMB).active).toBe(0);
    expect(pool.stats(SPRITE_TYPE.BOMB).idle).toBe(POOL_MAX_BOMBS);
  });

  it('does not register a spritePool resource when no spriteContainer is provided', () => {
    const { world } = createBootstrap({ loadMapForLevel: () => loadMap() });
    expect(world.getResource('spritePool')).toBeFalsy();
  });

  it('respects a custom spritePoolResourceKey', () => {
    const doc = createMockDocument();
    const container = createMockContainer();
    const { world } = createBootstrap({
      document: doc,
      spriteContainer: container,
      spritePoolResourceKey: 'myPool',
      loadMapForLevel: () => loadMap(),
    });
    expect(world.getResource('myPool')).toBeTruthy();
    expect(world.getResource('spritePool')).toBeFalsy();
  });
});
