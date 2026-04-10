/**
 * Unit tests for D-03 map loading resource.
 *
 * Verifies:
 *   - Valid map parsing from raw JSON into optimized map resource.
 *   - Semantic validation rejection (border integrity, ghost house, spawn).
 *   - Spawn point extraction and grid access helpers.
 *   - O(1) cell lookup correctness on flat grid.
 *   - Level restart cloning for canonical map reset.
 *   - createSyncMapLoader integration with level-loader.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CELL_TYPE } from '../../../src/ecs/resources/constants.js';
import {
  cloneMap,
  countPellets,
  countPowerPellets,
  createMapResource,
  getCell,
  isGhostHouseCell,
  isInGhostHouse,
  isPassable,
  isPassableForGhost,
  isPlayerStart,
  isWall,
  setCell,
  validateMapSemantic,
} from '../../../src/ecs/resources/map-resource.js';
import { createSyncMapLoader } from '../../../src/game/level-loader.js';

const root = path.resolve(import.meta.dirname, '../../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a real level map JSON file and parse it into a map resource.
 */
function loadLevelMap(levelNumber) {
  const dataPath = path.join(root, `assets/maps/level-${levelNumber}.json`);
  const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return createMapResource(rawMap);
}

/**
 * Build a minimal valid raw map object for testing semantic validation.
 */
function createMinimalValidRawMap() {
  return {
    level: 1,
    metadata: {
      name: 'Test Level',
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4.0,
      activeGhostTypes: [0, 1],
    },
    dimensions: { columns: 10, rows: 10 },
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 6, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 5, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 3, 3, 3, 3, 3, 3, 3, 3, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    spawn: {
      player: { row: 4, col: 5 },
      ghostHouse: {
        topRow: 5,
        bottomRow: 5,
        leftCol: 5,
        rightCol: 5,
      },
      ghostSpawnPoint: { row: 5, col: 5 },
    },
  };
}

// ---------------------------------------------------------------------------
// Valid map parsing
// ---------------------------------------------------------------------------

describe('map-resource — valid map parsing', () => {
  it('parses level-1.json without throwing', () => {
    const map = loadLevelMap(1);
    expect(map).toBeDefined();
    expect(map.level).toBe(1);
    expect(map.rows).toBe(11);
    expect(map.cols).toBe(15);
  });

  it('parses level-2.json without throwing', () => {
    const map = loadLevelMap(2);
    expect(map.level).toBe(2);
    expect(map.rows).toBe(11);
    expect(map.cols).toBe(15);
  });

  it('parses level-3.json without throwing', () => {
    const map = loadLevelMap(3);
    expect(map.level).toBe(3);
    expect(map.rows).toBe(11);
    expect(map.cols).toBe(15);
  });

  it('extracts level metadata correctly', () => {
    const map = loadLevelMap(1);
    expect(map.name).toBe('Level 1');
    expect(map.timerSeconds).toBe(120);
    expect(map.maxGhosts).toBe(2);
    expect(map.ghostSpeed).toBe(4.0);
    expect(map.activeGhostTypes).toEqual([0, 1]);
  });

  it('stores grid as a flat Uint8Array', () => {
    const map = loadLevelMap(1);
    expect(map.grid).toBeInstanceOf(Uint8Array);
    expect(map.grid.length).toBe(map.rows * map.cols);
  });

  it('stores a 2D grid copy for row iteration', () => {
    const map = loadLevelMap(1);
    expect(Array.isArray(map.grid2D)).toBe(true);
    expect(map.grid2D.length).toBe(map.rows);
    expect(map.grid2D[0].length).toBe(map.cols);
  });

  it('extracts player spawn coordinates', () => {
    const map = loadLevelMap(1);
    expect(map.playerSpawnRow).toBe(7);
    expect(map.playerSpawnCol).toBe(7);
  });

  it('extracts ghost house bounds', () => {
    const map = loadLevelMap(1);
    expect(map.ghostHouseTopRow).toBe(4);
    expect(map.ghostHouseBottomRow).toBe(5);
    expect(map.ghostHouseLeftCol).toBe(6);
    expect(map.ghostHouseRightCol).toBe(8);
  });

  it('extracts ghost spawn point', () => {
    const map = loadLevelMap(1);
    expect(map.ghostSpawnRow).toBe(4);
    expect(map.ghostSpawnCol).toBe(7);
  });

  it('counts initial pellets correctly', () => {
    const map = loadLevelMap(1);
    // Level 1 has pellets at specific positions per the ASCII blueprint.
    expect(map.initialPelletCount).toBeGreaterThan(0);
  });

  it('counts initial power pellets correctly', () => {
    const map = loadLevelMap(1);
    // Level 1 has 4 power pellets (corners).
    expect(map.initialPowerPelletCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// O(1) cell access
// ---------------------------------------------------------------------------

describe('map-resource — cell access helpers', () => {
  it('getCell returns correct values for known level-1 positions', () => {
    const map = loadLevelMap(1);

    // Corners are indestructible walls.
    expect(getCell(map, 0, 0)).toBe(CELL_TYPE.INDESTRUCTIBLE);
    expect(getCell(map, 10, 14)).toBe(CELL_TYPE.INDESTRUCTIBLE);

    // Player start position.
    expect(getCell(map, 7, 7)).toBe(CELL_TYPE.PLAYER_START);

    // Ghost house cells.
    expect(getCell(map, 4, 6)).toBe(CELL_TYPE.GHOST_HOUSE);
    expect(getCell(map, 5, 7)).toBe(CELL_TYPE.GHOST_HOUSE);

    // A destructible wall.
    expect(getCell(map, 1, 6)).toBe(CELL_TYPE.DESTRUCTIBLE);

    // A pellet.
    expect(getCell(map, 1, 1)).toBe(CELL_TYPE.POWER_PELLET);
  });

  it('setCell updates both flat and 2D grids', () => {
    const map = loadLevelMap(1);
    setCell(map, 1, 6, CELL_TYPE.EMPTY);
    expect(getCell(map, 1, 6)).toBe(CELL_TYPE.EMPTY);
    expect(map.grid2D[1][6]).toBe(CELL_TYPE.EMPTY);
  });

  it('isWall returns true for indestructible and destructible walls', () => {
    const map = loadLevelMap(1);
    expect(isWall(map, 0, 0)).toBe(true);
    expect(isWall(map, 1, 6)).toBe(true);
    expect(isWall(map, 7, 7)).toBe(false);
    expect(isWall(map, 4, 6)).toBe(false);
  });

  it('isPassable rejects walls and ghost house for player', () => {
    const map = loadLevelMap(1);
    expect(isPassable(map, 0, 0)).toBe(false); // indestructible
    expect(isPassable(map, 1, 6)).toBe(false); // destructible
    expect(isPassable(map, 4, 6)).toBe(false); // ghost house
    expect(isPassable(map, 7, 7)).toBe(true); // player start
  });

  it('isPassableForGhost allows ghost house but rejects indestructible', () => {
    const map = loadLevelMap(1);
    expect(isPassableForGhost(map, 0, 0)).toBe(false); // indestructible
    expect(isPassableForGhost(map, 4, 6)).toBe(true); // ghost house
    expect(isPassableForGhost(map, 7, 7)).toBe(true); // player start
  });

  it('isPlayerStart matches the player spawn coordinates', () => {
    const map = loadLevelMap(1);
    expect(isPlayerStart(map, 7, 7)).toBe(true);
    expect(isPlayerStart(map, 0, 0)).toBe(false);
  });

  it('isGhostHouseCell returns true only for GHOST_HOUSE cells inside bounds', () => {
    const map = loadLevelMap(1);
    expect(isGhostHouseCell(map, 4, 6)).toBe(true);
    expect(isGhostHouseCell(map, 5, 7)).toBe(true);
    expect(isGhostHouseCell(map, 3, 7)).toBe(false); // above ghost house
    expect(isGhostHouseCell(map, 6, 7)).toBe(false); // below ghost house
  });

  it('isInGhostHouse checks bounding box regardless of cell type', () => {
    const map = loadLevelMap(1);
    expect(isInGhostHouse(map, 4, 6)).toBe(true);
    expect(isInGhostHouse(map, 5, 8)).toBe(true);
    expect(isInGhostHouse(map, 3, 7)).toBe(false);
    expect(isInGhostHouse(map, 6, 7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Semantic validation — valid maps
// ---------------------------------------------------------------------------

describe('map-resource — semantic validation (valid)', () => {
  it('passes semantic validation for level-1.json', () => {
    const dataPath = path.join(root, 'assets/maps/level-1.json');
    const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes semantic validation for level-2.json', () => {
    const dataPath = path.join(root, 'assets/maps/level-2.json');
    const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes semantic validation for level-3.json', () => {
    const dataPath = path.join(root, 'assets/maps/level-3.json');
    const rawMap = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Semantic validation — invalid maps (rejection)
// ---------------------------------------------------------------------------

describe('map-resource — semantic validation (invalid rejection)', () => {
  it('rejects map with broken border (top row not a wall)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[0][3] = CELL_TYPE.EMPTY;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('border'))).toBe(true);
  });

  it('rejects map with broken border (left column not a wall)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[3][0] = CELL_TYPE.EMPTY;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('border'))).toBe(true);
  });

  it('rejects map with broken border (bottom row not a wall)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[9][5] = CELL_TYPE.EMPTY;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('border'))).toBe(true);
  });

  it('rejects map with broken border (right column not a wall)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[4][9] = CELL_TYPE.EMPTY;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('border'))).toBe(true);
  });

  it('rejects map with non-GHOST_HOUSE cell inside ghost house', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[5][5] = CELL_TYPE.EMPTY;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost house'))).toBe(true);
  });

  it('rejects map with ghost spawn point outside ghost house', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.spawn.ghostSpawnPoint = { row: 0, col: 0 };
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost spawn point'))).toBe(true);
  });

  it('rejects map with player spawn inside ghost house', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.spawn.player = { row: 5, col: 5 };
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('player spawn'))).toBe(true);
  });

  it('rejects map with player spawn on indestructible wall', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.spawn.player = { row: 0, col: 5 };
    rawMap.grid[0][5] = CELL_TYPE.INDESTRUCTIBLE;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('player spawn'))).toBe(true);
  });

  it('rejects map with dimension mismatch (grid rows != dimensions.rows)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.dimensions.rows = 15;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('rows'))).toBe(true);
  });

  it('rejects map with dimension mismatch (grid cols != dimensions.columns)', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.dimensions.columns = 20;
    const result = validateMapSemantic(rawMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('columns'))).toBe(true);
  });

  it('throws on createMapResource for invalid map', () => {
    const rawMap = createMinimalValidRawMap();
    rawMap.grid[0][3] = CELL_TYPE.EMPTY;
    expect(() => createMapResource(rawMap)).toThrow('Map semantic validation failed');
  });
});

// ---------------------------------------------------------------------------
// Cloning for level restart
// ---------------------------------------------------------------------------

describe('map-resource — clone for restart determinism', () => {
  it('produces a deep clone with identical values', () => {
    const map = loadLevelMap(1);
    const cloned = cloneMap(map);

    expect(cloned.level).toBe(map.level);
    expect(cloned.rows).toBe(map.rows);
    expect(cloned.cols).toBe(map.cols);
    expect(cloned.playerSpawnRow).toBe(map.playerSpawnRow);
    expect(cloned.ghostHouseTopRow).toBe(map.ghostHouseTopRow);
    expect(cloned.activeGhostTypes).toEqual(map.activeGhostTypes);
  });

  it('clone has independent grid arrays', () => {
    const map = loadLevelMap(1);
    const cloned = cloneMap(map);

    // Mutate the clone.
    setCell(cloned, 1, 6, CELL_TYPE.EMPTY);

    // Original must be unchanged.
    expect(getCell(map, 1, 6)).toBe(CELL_TYPE.DESTRUCTIBLE);
    expect(getCell(cloned, 1, 6)).toBe(CELL_TYPE.EMPTY);
  });

  it('clone has independent 2D grid arrays', () => {
    const map = loadLevelMap(1);
    const cloned = cloneMap(map);
    cloned.grid2D[1][6] = CELL_TYPE.EMPTY;
    expect(map.grid2D[1][6]).toBe(CELL_TYPE.DESTRUCTIBLE);
  });

  it('clone has independent activeGhostTypes array', () => {
    const map = loadLevelMap(1);
    const cloned = cloneMap(map);
    cloned.activeGhostTypes.push(99);
    expect(map.activeGhostTypes).not.toContain(99);
  });
});

// ---------------------------------------------------------------------------
// Pellet counting
// ---------------------------------------------------------------------------

describe('map-resource — pellet counting', () => {
  it('countPellets returns correct count for level-1', () => {
    const map = loadLevelMap(1);
    expect(countPellets(map)).toBe(map.initialPelletCount);
  });

  it('countPellets decreases after setCell destroys a pellet', () => {
    const map = loadLevelMap(1);
    const before = countPellets(map);
    // Find and destroy the first pellet cell.
    let destroyed = false;
    for (let r = 0; r < map.rows && !destroyed; r += 1) {
      for (let c = 0; c < map.cols; c += 1) {
        if (getCell(map, r, c) === CELL_TYPE.PELLET) {
          setCell(map, r, c, CELL_TYPE.EMPTY);
          destroyed = true;
          break;
        }
      }
    }
    expect(destroyed).toBe(true);
    expect(countPellets(map)).toBe(before - 1);
  });

  it('countPowerPellets returns correct count for level-1', () => {
    const map = loadLevelMap(1);
    expect(countPowerPellets(map)).toBe(map.initialPowerPelletCount);
  });
});

// ---------------------------------------------------------------------------
// createSyncMapLoader integration
// ---------------------------------------------------------------------------

describe('map-resource — createSyncMapLoader integration', () => {
  it('returns map resource for valid level index', () => {
    const maps = [loadLevelMap(1), loadLevelMap(2), loadLevelMap(3)];
    const loader = createSyncMapLoader(maps);
    const result = loader(0, {});
    expect(result).toBeDefined();
    expect(result.level).toBe(1);
  });

  it('returns cloned map on restart', () => {
    const maps = [loadLevelMap(1)];
    const loader = createSyncMapLoader(maps);
    const first = loader(0, {});
    const restarted = loader(0, { restart: true, cachedMapResource: first });
    expect(restarted).not.toBe(first);
    expect(restarted.level).toBe(first.level);
    // Mutating the clone should not affect the original.
    setCell(restarted, 1, 1, CELL_TYPE.EMPTY);
    expect(getCell(first, 1, 1)).not.toBe(CELL_TYPE.EMPTY);
  });

  it('returns null for out-of-bounds level index', () => {
    const maps = [loadLevelMap(1)];
    const loader = createSyncMapLoader(maps);
    expect(loader(1, {})).toBeNull();
    expect(loader(-1, {})).toBeNull();
  });

  it('returns null for non-numeric level index', () => {
    const maps = [loadLevelMap(1)];
    const loader = createSyncMapLoader(maps);
    expect(loader(NaN, {})).toBeNull();
  });
});
