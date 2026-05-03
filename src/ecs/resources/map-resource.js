/**
 * D-03: Map Loading Resource
 *
 * Parses level map JSON data, validates semantic correctness beyond what JSON
 * Schema can express, and stores a fixed grid representation optimized for
 * O(1) cell lookups. Extracts spawn points, ghost house bounds, and level
 * metadata for downstream systems (movement, collision, AI, spawning).
 *
 * This resource is pure data — no DOM nodes, no browser APIs, no side effects.
 * It is registered as a World resource via world.setResource().
 *
 * Semantic validation covers:
 *   - Border integrity (all four edges must be indestructible walls)
 *   - Player spawn cell must be EMPTY or PLAYER_START
 *   - Ghost house cells must be GHOST_HOUSE type
 *   - Ghost spawn point must be inside ghost house bounds
 *   - Player spawn must NOT be inside ghost house
 *   - Grid dimensions must match declared dimensions
 *   - Exactly one PLAYER_START cell must exist (unless spawn section declares it)
 *
 * Public API:
 *   - createMapResource(rawMap) — factory that parses and validates a raw map
 *   - getCell(map, row, col) — O(1) cell type lookup
 *   - setCell(map, row, col, type) — mutate a cell (runtime destruction)
 *   - isWall(map, row, col) — convenience check for impassable cells
 *   - isPassable(map, row, col, isGhost) — check if a cell can be entered
 *   - isGhostHouseCell(map, row, col) — check if cell is inside ghost house
 *   - isPlayerStart(map, row, col) — check if cell is the player start
 *   - isInGhostHouse(map, row, col) — check if coords are within ghost house
 *   - countPellets(map) — count remaining pellets on the map
 *   - countPowerPellets(map) — count remaining power pellets on the map
 *   - cloneMap(map) — deep clone for level restart determinism
 *   - validateMapSemantic(rawMap) — semantic validation without parsing
 *
 * Implementation notes:
 *   - The grid is stored as a flat Uint8Array for cache-friendly access.
 *   - Row stride equals the declared column count.
 *   - O(1) lookup: grid[row * cols + col].
 *   - The raw map object is deeply cloned to prevent mutation of source data.
 *   - Validation errors are thrown as Error with descriptive messages.
 */

import { CELL_TYPE } from './constants.js';

// ---------------------------------------------------------------------------
// Semantic validation (runtime correctness beyond JSON Schema)
// ---------------------------------------------------------------------------

/**
 * Validate structural consistency between declared dimensions and actual grid.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateDimensionsConsistency(rawMap) {
  const errors = [];
  const { dimensions, grid } = rawMap;

  if (!dimensions || !grid) {
    errors.push('map is missing dimensions or grid');
    return { ok: false, errors };
  }

  if (grid.length !== dimensions.rows) {
    errors.push(`grid has ${grid.length} rows but dimensions.rows is ${dimensions.rows}`);
  }

  for (let r = 0; r < grid.length; r += 1) {
    if (grid[r].length !== dimensions.columns) {
      errors.push(
        `grid row ${r} has ${grid[r].length} columns but dimensions.columns is ${dimensions.columns}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate that border cells are wall types only (no passable content).
 *
 * The outer border must not contain pellets, power pellets, power-ups,
 * player start, empty space, or ghost house cells. Only indestructible
 * and destructible walls are allowed on the border, ensuring the map
 * is fully enclosed.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateBorderIntegrity(rawMap) {
  const errors = [];
  const { dimensions, grid } = rawMap;
  const rows = dimensions.rows;
  const cols = dimensions.columns;

  // Skip border checks if grid dimensions don't match (already caught by
  // validateDimensionsConsistency) to avoid accessing undefined indices.
  if (grid.length !== rows) {
    return { ok: false, errors: ['grid row count mismatch, skipping border check'] };
  }

  // Border cells must be wall types only (indestructible or destructible).
  const wallTypes = new Set([CELL_TYPE.INDESTRUCTIBLE, CELL_TYPE.DESTRUCTIBLE]);

  // Top row.
  for (let c = 0; c < cols; c += 1) {
    if (!wallTypes.has(grid[0][c])) {
      errors.push(`border: top row col ${c} is not a wall type (got ${grid[0][c]})`);
    }
  }

  // Bottom row.
  const bottomRow = rows - 1;
  for (let c = 0; c < cols; c += 1) {
    if (!wallTypes.has(grid[bottomRow][c])) {
      errors.push(`border: bottom row col ${c} is not a wall type (got ${grid[bottomRow][c]})`);
    }
  }

  // Left column.
  for (let r = 0; r < rows; r += 1) {
    if (!wallTypes.has(grid[r][0])) {
      errors.push(`border: left col row ${r} is not a wall type (got ${grid[r][0]})`);
    }
  }

  // Right column.
  for (let r = 0; r < rows; r += 1) {
    if (!wallTypes.has(grid[r][cols - 1])) {
      errors.push(`border: right col row ${r} is not a wall type (got ${grid[r][cols - 1]})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate ghost house cells are all GHOST_HOUSE type.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateGhostHouseCells(rawMap) {
  const errors = [];
  const { grid, spawn } = rawMap;
  const { ghostHouse } = spawn;

  if (!ghostHouse) {
    errors.push('spawn.ghostHouse is missing');
    return { ok: false, errors };
  }

  const { topRow, bottomRow, leftCol, rightCol } = ghostHouse;

  for (let r = topRow; r <= bottomRow; r += 1) {
    for (let c = leftCol; c <= rightCol; c += 1) {
      if (grid[r][c] !== CELL_TYPE.GHOST_HOUSE) {
        errors.push(`ghost house: cell (${r}, ${c}) is not GHOST_HOUSE (got ${grid[r][c]})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate ghost spawn point is inside ghost house bounds.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateGhostSpawnInsideHouse(rawMap) {
  const errors = [];
  const { spawn } = rawMap;
  const { ghostHouse, ghostSpawnPoint } = spawn;

  if (!ghostHouse || !ghostSpawnPoint) {
    errors.push('spawn.ghostHouse or spawn.ghostSpawnPoint is missing');
    return { ok: false, errors };
  }

  const { topRow, bottomRow, leftCol, rightCol } = ghostHouse;
  const { row, col } = ghostSpawnPoint;

  if (row < topRow || row > bottomRow || col < leftCol || col > rightCol) {
    errors.push(
      `ghost spawn point (${row}, ${col}) is outside ghost house bounds [${topRow}-${bottomRow}, ${leftCol}-${rightCol}]`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate player spawn is NOT inside the ghost house.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validatePlayerSpawnNotInGhostHouse(rawMap) {
  const errors = [];
  const { spawn } = rawMap;
  const { player, ghostHouse } = spawn;

  if (!player || !ghostHouse) {
    errors.push('spawn.player or spawn.ghostHouse is missing');
    return { ok: false, errors };
  }

  const { row, col } = player;
  const { topRow, bottomRow, leftCol, rightCol } = ghostHouse;

  if (row >= topRow && row <= bottomRow && col >= leftCol && col <= rightCol) {
    errors.push(
      `player spawn (${row}, ${col}) is inside ghost house bounds [${topRow}-${bottomRow}, ${leftCol}-${rightCol}]`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate player spawn cell type is valid (EMPTY, PLAYER_START, or passable).
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validatePlayerSpawnCellType(rawMap) {
  const errors = [];
  const { grid, spawn } = rawMap;
  const { row, col } = spawn.player;
  const cellType = grid[row][col];

  // Player start must be on a passable tile.
  const passableTypes = new Set([
    CELL_TYPE.EMPTY,
    CELL_TYPE.PLAYER_START,
    CELL_TYPE.PELLET,
    CELL_TYPE.POWER_PELLET,
  ]);

  if (!passableTypes.has(cellType)) {
    errors.push(`player spawn (${row}, ${col}) is on impassable cell type ${cellType}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Run all semantic validation checks on a raw map object.
 *
 * @param {object} rawMap — Raw map JSON object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateMapSemantic(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') {
    return { ok: false, errors: ['Map payload is not an object'] };
  }

  // Structural preflight to avoid TypeError during semantic traversal (BUG-07).
  const structuralErrors = [];
  if (!rawMap.dimensions || typeof rawMap.dimensions !== 'object') {
    structuralErrors.push('Missing map dimensions');
  }
  if (!Array.isArray(rawMap.grid)) {
    structuralErrors.push('Missing map grid array');
  }
  if (!rawMap.spawn || typeof rawMap.spawn !== 'object') {
    structuralErrors.push('Missing map spawn definitions');
  } else {
    if (!rawMap.spawn.player || typeof rawMap.spawn.player !== 'object') {
      structuralErrors.push('Missing spawn.player');
    }
    if (!rawMap.spawn.ghostHouse || typeof rawMap.spawn.ghostHouse !== 'object') {
      structuralErrors.push('Missing spawn.ghostHouse');
    }
    if (!rawMap.spawn.ghostSpawnPoint || typeof rawMap.spawn.ghostSpawnPoint !== 'object') {
      structuralErrors.push('Missing spawn.ghostSpawnPoint');
    }
  }

  if (structuralErrors.length > 0) {
    return { ok: false, errors: structuralErrors };
  }

  const allErrors = [];
  const checks = [
    validateDimensionsConsistency,
    validateBorderIntegrity,
    validateGhostHouseCells,
    validateGhostSpawnInsideHouse,
    validatePlayerSpawnNotInGhostHouse,
    validatePlayerSpawnCellType,
  ];

  for (const check of checks) {
    try {
      const result = check(rawMap);
      if (!result.ok) {
        allErrors.push(...result.errors);
      }
    } catch (e) {
      allErrors.push(`Validation crash in ${check.name}: ${e.message}`);
    }
  }

  return { ok: allErrors.length === 0, errors: allErrors };
}

// ---------------------------------------------------------------------------
// Flat grid data structure
// ---------------------------------------------------------------------------

/**
 * Build a flat Uint8Array grid from a 2D array.
 *
 * @param {number[][]} grid2D — 2D array of cell type IDs.
 * @param {number} cols — Number of columns.
 * @returns {Uint8Array}
 */
function buildFlatGrid(grid2D, cols) {
  const totalCells = grid2D.length * cols;
  const flat = new Uint8Array(totalCells);
  let offset = 0;

  for (let r = 0; r < grid2D.length; r += 1) {
    const row = grid2D[r];
    for (let c = 0; c < cols; c += 1) {
      flat[offset] = row[c];
      offset += 1;
    }
  }

  return flat;
}

/**
 * Count cells of a given type in the flat grid.
 *
 * @param {Uint8Array} flatGrid — Flat grid array.
 * @param {number} cellType — Cell type ID to count.
 * @returns {number}
 */
function countCellType(flatGrid, cellType) {
  let count = 0;
  for (let i = 0; i < flatGrid.length; i += 1) {
    if (flatGrid[i] === cellType) {
      count += 1;
    }
  }
  return count;
}

function isSafeInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

function assertMapResource(condition, message) {
  if (!condition) {
    throw new Error(`Map resource validation failed: ${message}`);
  }
}

/**
 * Validate that an object satisfies the trusted runtime MapResource contract.
 *
 * This guard is used at load boundaries before world resource injection.
 *
 * @param {object} map - Candidate map resource object.
 * @returns {boolean}
 */
export function assertValidMapResource(map) {
  assertMapResource(Boolean(map) && typeof map === 'object', 'map must be an object');

  assertMapResource(isSafeInteger(map.rows) && map.rows > 0, 'rows must be a positive integer');
  assertMapResource(isSafeInteger(map.cols) && map.cols > 0, 'cols must be a positive integer');
  assertMapResource(
    map.grid instanceof Uint8Array,
    'grid must be a Uint8Array for deterministic O(1) lookup',
  );
  assertMapResource(map.grid.length === map.rows * map.cols, 'grid size must equal rows * cols');
  assertMapResource(Array.isArray(map.grid2D), 'grid2D must be an array of rows');
  assertMapResource(map.grid2D.length === map.rows, 'grid2D row count must match rows');
  assertMapResource(Array.isArray(map.activeGhostTypes), 'activeGhostTypes must be an array');

  for (let rowIndex = 0; rowIndex < map.grid2D.length; rowIndex += 1) {
    const row = map.grid2D[rowIndex];
    assertMapResource(Array.isArray(row), `grid2D row ${rowIndex} must be an array`);
    assertMapResource(
      row.length === map.cols,
      `grid2D row ${rowIndex} length must match declared columns`,
    );
  }

  const coordinateKeys = [
    'playerSpawnRow',
    'playerSpawnCol',
    'ghostHouseTopRow',
    'ghostHouseBottomRow',
    'ghostHouseLeftCol',
    'ghostHouseRightCol',
    'ghostSpawnRow',
    'ghostSpawnCol',
  ];

  for (const key of coordinateKeys) {
    assertMapResource(isSafeInteger(map[key]), `${key} must be an integer`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Map resource factory
// ---------------------------------------------------------------------------

/**
 * Parse a raw map JSON object into an optimized map resource.
 *
 * Throws on semantic validation failure so that invalid data is rejected
 * before world injection.
 *
 * @param {object} rawMap — Raw map JSON object (as loaded from JSON file).
 * @returns {MapResource}
 */
export function createMapResource(rawMap) {
  // Semantic validation — throws on failure.
  const semantic = validateMapSemantic(rawMap);
  if (!semantic.ok) {
    throw new Error(`Map semantic validation failed: ${semantic.errors.join('; ')}`);
  }

  const { level, metadata, dimensions, grid: grid2D, spawn } = rawMap;
  const cols = dimensions.columns;
  const rows = dimensions.rows;
  const flatGrid = buildFlatGrid(grid2D, cols);

  return {
    // Level metadata.
    level,
    name: metadata.name,
    timerSeconds: metadata.timerSeconds,
    maxGhosts: metadata.maxGhosts,
    ghostSpeed: metadata.ghostSpeed,
    activeGhostTypes: [...metadata.activeGhostTypes],

    // Grid dimensions.
    rows,
    cols,

    // Flat grid for O(1) access: grid[row * cols + col].
    grid: flatGrid,

    // Spawn points.
    playerSpawnRow: spawn.player.row,
    playerSpawnCol: spawn.player.col,
    ghostHouseTopRow: spawn.ghostHouse.topRow,
    ghostHouseBottomRow: spawn.ghostHouse.bottomRow,
    ghostHouseLeftCol: spawn.ghostHouse.leftCol,
    ghostHouseRightCol: spawn.ghostHouse.rightCol,
    ghostSpawnRow: spawn.ghostSpawnPoint.row,
    ghostSpawnCol: spawn.ghostSpawnPoint.col,

    // Original 2D grid for systems that need row iteration.
    grid2D: grid2D.map((row) => [...row]),

    // Pellet tracking for level completion.
    initialPelletCount: countCellType(flatGrid, CELL_TYPE.PELLET),
    initialPowerPelletCount: countCellType(flatGrid, CELL_TYPE.POWER_PELLET),
  };
}

// ---------------------------------------------------------------------------
// Grid access helpers (O(1) lookup on flat grid)
// ---------------------------------------------------------------------------

/**
 * Get the cell type at (row, col).
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {number} Cell type ID.
 */
export function getCell(map, row, col) {
  // Missing bounds checks can lead to nondeterministic traversal (BUG-05).
  // Return INDESTRUCTIBLE as a safe impassable default for OOB access.
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    return CELL_TYPE.INDESTRUCTIBLE;
  }
  return map.grid[row * map.cols + col];
}

/**
 * Set the cell type at (row, col). Used by runtime destruction systems.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @param {number} type — New cell type ID.
 */
export function setCell(map, row, col, type) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    return;
  }
  map.grid[row * map.cols + col] = type;
  // Keep 2D grid in sync for systems that iterate rows.
  if (map.grid2D[row]) {
    map.grid2D[row][col] = type;
  }
}

/**
 * Check if (row, col) is inside the ghost house bounding box.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isInGhostHouse(map, row, col) {
  return (
    row >= map.ghostHouseTopRow &&
    row <= map.ghostHouseBottomRow &&
    col >= map.ghostHouseLeftCol &&
    col <= map.ghostHouseRightCol
  );
}

/**
 * Check if (row, col) is an indestructible or destructible wall.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isWall(map, row, col) {
  const cell = getCell(map, row, col);
  return cell === CELL_TYPE.INDESTRUCTIBLE || cell === CELL_TYPE.DESTRUCTIBLE;
}

/**
 * Check if (row, col) is a cell the player can enter.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isPassable(map, row, col) {
  // Player cannot enter ghost house cells.
  if (isInGhostHouse(map, row, col)) {
    return false;
  }

  const cell = getCell(map, row, col);
  return cell !== CELL_TYPE.INDESTRUCTIBLE && cell !== CELL_TYPE.DESTRUCTIBLE;
}

/**
 * Check if (row, col) is passable for ghosts.
 * Ghosts CAN enter ghost house cells but cannot enter walls.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isPassableForGhost(map, row, col) {
  const cell = getCell(map, row, col);
  // Ghosts should not pass through destructible walls (BUG-X01).
  return cell !== CELL_TYPE.INDESTRUCTIBLE && cell !== CELL_TYPE.DESTRUCTIBLE;
}

/**
 * Check if (row, col) is the player start cell.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isPlayerStart(map, row, col) {
  return row === map.playerSpawnRow && col === map.playerSpawnCol;
}

/**
 * Check if (row, col) is inside the ghost house bounding box AND has
 * GHOST_HOUSE cell type.
 *
 * @param {MapResource} map — Map resource.
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isGhostHouseCell(map, row, col) {
  return isInGhostHouse(map, row, col) && getCell(map, row, col) === CELL_TYPE.GHOST_HOUSE;
}

/**
 * Count remaining pellets on the map.
 *
 * @param {MapResource} map — Map resource.
 * @returns {number}
 */
export function countPellets(map) {
  return countCellType(map.grid, CELL_TYPE.PELLET);
}

/**
 * Count remaining power pellets on the map.
 *
 * @param {MapResource} map — Map resource.
 * @returns {number}
 */
export function countPowerPellets(map) {
  return countCellType(map.grid, CELL_TYPE.POWER_PELLET);
}

/**
 * Deep clone a map resource for level restart determinism.
 * Clones the flat grid, 2D grid, and metadata arrays.
 *
 * @param {MapResource} map — Map resource to clone.
 * @returns {MapResource}
 */
export function cloneMap(map) {
  return {
    level: map.level,
    name: map.name,
    timerSeconds: map.timerSeconds,
    maxGhosts: map.maxGhosts,
    ghostSpeed: map.ghostSpeed,
    activeGhostTypes: [...map.activeGhostTypes],
    rows: map.rows,
    cols: map.cols,
    grid: new Uint8Array(map.grid),
    grid2D: map.grid2D.map((row) => [...row]),
    playerSpawnRow: map.playerSpawnRow,
    playerSpawnCol: map.playerSpawnCol,
    ghostHouseTopRow: map.ghostHouseTopRow,
    ghostHouseBottomRow: map.ghostHouseBottomRow,
    ghostHouseLeftCol: map.ghostHouseLeftCol,
    ghostHouseRightCol: map.ghostHouseRightCol,
    ghostSpawnRow: map.ghostSpawnRow,
    ghostSpawnCol: map.ghostSpawnCol,
    initialPelletCount: map.initialPelletCount,
    initialPowerPelletCount: map.initialPowerPelletCount,
  };
}
