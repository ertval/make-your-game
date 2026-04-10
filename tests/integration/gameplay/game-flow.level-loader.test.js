/**
 * Integration tests for game-flow + level-loader map behavior.
 *
 * Purpose: Verify game-flow drives real level loading through createSyncMapLoader
 * and that world map resources change correctly during start/advance/restart.
 * Public API: N/A (test module).
 * Implementation notes: Uses real map JSON files from assets/maps and avoids
 * mocks for load/advance/restart code paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createClock } from '../../../src/ecs/resources/clock.js';
import { CELL_TYPE } from '../../../src/ecs/resources/constants.js';
import { createGameStatus, GAME_STATE } from '../../../src/ecs/resources/game-status.js';
import { createMapResource, getCell, setCell } from '../../../src/ecs/resources/map-resource.js';
import { World } from '../../../src/ecs/world/world.js';
import { createGameFlow } from '../../../src/game/game-flow.js';
import { createLevelLoader, createSyncMapLoader } from '../../../src/game/level-loader.js';

const root = path.resolve(import.meta.dirname, '../../..');

function loadMap(levelNumber) {
  const dataPath = path.join(root, `assets/maps/level-${levelNumber}.json`);
  const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return createMapResource(rawMap);
}

describe('game-flow + level-loader integration', () => {
  it('loads level resources into the world and advances to the next level', () => {
    const world = new World();
    const preloadedMaps = [loadMap(1), loadMap(2), loadMap(3)];
    const levelLoader = createLevelLoader({
      loadMapForLevel: createSyncMapLoader(preloadedMaps),
      totalLevels: preloadedMaps.length,
      world,
    });
    const gameFlow = createGameFlow({
      clock: createClock(0),
      gameStatus: createGameStatus(GAME_STATE.MENU),
      levelLoader,
      world,
    });

    expect(gameFlow.startGame({ levelIndex: 0 })).toBe(true);
    const firstMap = world.getResource('mapResource');
    expect(firstMap.level).toBe(1);
    expect(levelLoader.getCurrentLevelIndex()).toBe(0);

    expect(gameFlow.setState(GAME_STATE.LEVEL_COMPLETE)).toBe(true);
    expect(gameFlow.startGame()).toBe(true);
    const secondMap = world.getResource('mapResource');
    expect(secondMap.level).toBe(2);
    expect(levelLoader.getCurrentLevelIndex()).toBe(1);
    expect(secondMap).not.toBe(firstMap);
  });

  it('restores canonical cell state after level restart', () => {
    const world = new World();
    const preloadedMaps = [loadMap(1)];
    const levelLoader = createLevelLoader({
      loadMapForLevel: createSyncMapLoader(preloadedMaps),
      totalLevels: preloadedMaps.length,
      world,
    });
    const gameFlow = createGameFlow({
      clock: createClock(0),
      gameStatus: createGameStatus(GAME_STATE.MENU),
      levelLoader,
      world,
    });

    expect(gameFlow.startGame({ levelIndex: 0 })).toBe(true);
    const mapBeforeRestart = world.getResource('mapResource');
    expect(getCell(mapBeforeRestart, 1, 6)).toBe(CELL_TYPE.DESTRUCTIBLE);

    setCell(mapBeforeRestart, 1, 6, CELL_TYPE.EMPTY);
    expect(getCell(mapBeforeRestart, 1, 6)).toBe(CELL_TYPE.EMPTY);

    expect(gameFlow.restartLevel()).toBe(true);
    const restartedMap = world.getResource('mapResource');

    expect(restartedMap).not.toBe(mapBeforeRestart);
    expect(getCell(restartedMap, 1, 6)).toBe(CELL_TYPE.DESTRUCTIBLE);
  });
});
