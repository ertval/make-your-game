/**
 * Unit tests for level-loader state commit ordering and index normalization.
 *
 * Purpose: Verifies level-loader only commits index/resource on successful map
 * loads and keeps index clamping behavior deterministic for invalid inputs.
 * Public API: N/A (test module).
 * Implementation notes: Uses a real World resource container and controlled
 * sync map loader stubs for deterministic success/failure assertions.
 */

import { describe, expect, it, vi } from 'vitest';

import { World } from '../../../src/ecs/world/world.js';
import { createLevelLoader } from '../../../src/game/level-loader.js';

function createMapResourceFixture(level) {
  const rows = 3;
  const cols = 3;
  const grid2D = [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ];

  return {
    activeGhostTypes: ['blinky'],
    cols,
    ghostHouseBottomRow: 1,
    ghostHouseLeftCol: 1,
    ghostHouseRightCol: 1,
    ghostHouseTopRow: 1,
    ghostSpawnCol: 1,
    ghostSpawnRow: 1,
    grid: new Uint8Array(grid2D.flat()),
    grid2D: grid2D.map((row) => [...row]),
    initialPelletCount: 0,
    initialPowerPelletCount: 0,
    level,
    maxGhosts: 1,
    name: `fixture-level-${level}`,
    playerSpawnCol: 1,
    playerSpawnRow: 1,
    rows,
    ghostSpeed: 4,
    timerSeconds: 120,
  };
}

describe('level-loader', () => {
  it('commits level index and resource only after a successful load', () => {
    const world = new World();
    const firstMap = createMapResourceFixture(1);
    const loadMapForLevel = vi.fn((levelIndex) => {
      if (levelIndex === 0) {
        return firstMap;
      }

      return null;
    });

    const levelLoader = createLevelLoader({
      loadMapForLevel,
      totalLevels: 3,
      world,
    });

    const loadedMap = levelLoader.loadLevel(0, { reason: 'start-game' });
    expect(loadedMap).toEqual(firstMap);
    expect(loadedMap).not.toBe(firstMap);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);
    expect(world.getResource('mapResource')).toBe(loadedMap);

    expect(levelLoader.loadLevel(1, { reason: 'manual-load' })).toBeNull();
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);
    expect(world.getResource('mapResource')).toBe(loadedMap);
  });

  it('keeps current level commit intact when advance target fails to resolve', () => {
    const world = new World();
    const firstMap = createMapResourceFixture(1);
    const loadMapForLevel = vi.fn((levelIndex) => {
      if (levelIndex === 0) {
        return firstMap;
      }

      return null;
    });

    const levelLoader = createLevelLoader({
      loadMapForLevel,
      totalLevels: 3,
      world,
    });

    const loadedMap = levelLoader.loadLevel(0, { reason: 'start-game' });
    expect(loadedMap).toEqual(firstMap);
    expect(loadedMap).not.toBe(firstMap);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);

    expect(levelLoader.advanceLevel('level-complete')).toBe(false);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);
    expect(world.getResource('mapResource')).toBe(loadedMap);
  });

  it('clamps invalid and fractional level indexes to deterministic integer bounds', () => {
    const requestedIndexes = [];
    const maps = [
      createMapResourceFixture(1),
      createMapResourceFixture(2),
      createMapResourceFixture(3),
    ];
    const levelLoader = createLevelLoader({
      loadMapForLevel: (levelIndex) => {
        requestedIndexes.push(levelIndex);
        return maps[levelIndex] ?? null;
      },
      totalLevels: maps.length,
      world: new World(),
    });

    expect(levelLoader.loadLevel(1.9)).toEqual(maps[1]);
    expect(levelLoader.getCurrentLevelIndex()).toBe(1);

    expect(levelLoader.loadLevel(-5.1)).toEqual(maps[0]);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);

    expect(levelLoader.loadLevel(Number.NaN)).toEqual(maps[0]);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);

    expect(levelLoader.loadLevel(999.9)).toEqual(maps[2]);
    expect(levelLoader.getCurrentLevelIndex()).toBe(2);

    expect(requestedIndexes).toEqual([1, 0, 0, 2]);
  });
});
