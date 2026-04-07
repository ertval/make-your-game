/**
 * Unit tests for D-02 map schema validation.
 *
 * Verifies that the JSON Schema 2020-12 map schema correctly accepts valid
 * level maps and rejects invalid ones. Tests cover structure, cell type
 * constraints, dimension consistency, and spawn point validity.
 *
 * Structural map consistency (dimensions vs grid size, spawn bounds,
 * ghost-house ordering) is validated by the programmatic map-consistency
 * validator in `validateMapConsistency()`.
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const schemaPath = path.join(root, 'docs/schemas/map.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

/**
 * Compile the schema once and reuse for all tests.
 * Using strict: false to allow $data references.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

/**
 * Helper: validate a map object and return the validation result plus errors.
 */
function validateMap(mapData) {
  const valid = validate(mapData);
  return { valid, errors: validate.errors ?? [] };
}

/**
 * Minimal valid map fixture used as a base for invalid fixture mutations.
 * A 10x10 trivial map to satisfy schema minimum dimension constraints.
 */
function createMinimalValidMap() {
  return {
    level: 1,
    metadata: {
      name: 'Test Level',
      timerSeconds: 120,
      maxGhosts: 2,
      ghostSpeed: 4.0,
      activeGhostTypes: [0, 1],
    },
    dimensions: {
      columns: 10,
      rows: 10,
    },
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
// Structural consistency validator (programmatic, beyond JSON Schema)
// ---------------------------------------------------------------------------

/**
 * Validate cross-field structural consistency that JSON Schema cannot express.
 *
 * @param {object} map - A map data object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateMapConsistency(map) {
  const errors = [];

  // Grid row count must match dimensions.rows.
  if (map.dimensions && map.grid) {
    if (map.grid.length !== map.dimensions.rows) {
      errors.push(`grid has ${map.grid.length} rows but dimensions.rows is ${map.dimensions.rows}`);
    }

    // Each grid row must match dimensions.columns.
    for (let r = 0; r < map.grid.length; r += 1) {
      if (map.grid[r].length !== map.dimensions.columns) {
        errors.push(
          `grid row ${r} has ${map.grid[r].length} columns but dimensions.columns is ${map.dimensions.columns}`,
        );
      }
    }
  }

  // Player spawn must be inside grid bounds.
  if (map.spawn?.player && map.dimensions && map.grid) {
    const { row, col } = map.spawn.player;
    const maxRow = map.grid.length;
    const maxCol = maxRow > 0 ? map.grid[0].length : 0;
    if (row < 0 || row >= maxRow) {
      errors.push(`player spawn row ${row} is outside grid rows [0, ${maxRow - 1}]`);
    }
    if (col < 0 || col >= maxCol) {
      errors.push(`player spawn col ${col} is outside grid cols [0, ${maxCol - 1}]`);
    }
  }

  // Ghost spawn point must be inside grid bounds.
  if (map.spawn?.ghostSpawnPoint && map.dimensions && map.grid) {
    const { row, col } = map.spawn.ghostSpawnPoint;
    const maxRow = map.grid.length;
    const maxCol = maxRow > 0 ? map.grid[0].length : 0;
    if (row < 0 || row >= maxRow) {
      errors.push(`ghost spawn row ${row} is outside grid rows [0, ${maxRow - 1}]`);
    }
    if (col < 0 || col >= maxCol) {
      errors.push(`ghost spawn col ${col} is outside grid cols [0, ${maxCol - 1}]`);
    }
  }

  // Ghost house bounds must be well-formed.
  if (map.spawn?.ghostHouse) {
    const { topRow, bottomRow, leftCol, rightCol } = map.spawn.ghostHouse;
    if (topRow > bottomRow) {
      errors.push(`ghost house topRow ${topRow} > bottomRow ${bottomRow}`);
    }
    if (leftCol > rightCol) {
      errors.push(`ghost house leftCol ${leftCol} > rightCol ${rightCol}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Valid map tests
// ---------------------------------------------------------------------------

describe('map schema — valid level maps', () => {
  it('validates level-1.json against the schema', () => {
    const dataPath = path.join(root, 'assets/maps/level-1.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const { valid, errors } = validateMap(data);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('validates level-2.json against the schema', () => {
    const dataPath = path.join(root, 'assets/maps/level-2.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const { valid, errors } = validateMap(data);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('validates level-3.json against the schema', () => {
    const dataPath = path.join(root, 'assets/maps/level-3.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const { valid, errors } = validateMap(data);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('accepts maps containing power-up cell types (7, 8, 9)', () => {
    const map = createMinimalValidMap();
    map.grid[1][1] = 7;
    map.grid[1][2] = 8;
    map.grid[1][3] = 9;
    const { valid } = validateMap(map);
    expect(valid).toBe(true);
  });

  it('accepts a minimal valid map with all cell types', () => {
    const map = {
      level: 1,
      metadata: {
        name: 'Full Cell Test',
        timerSeconds: 120,
        maxGhosts: 2,
        ghostSpeed: 4.0,
        activeGhostTypes: [0],
      },
      dimensions: { columns: 10, rows: 10 },
      grid: [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 4, 2, 3, 3, 3, 3, 2, 3, 1],
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
        ghostHouse: { topRow: 5, bottomRow: 5, leftCol: 5, rightCol: 5 },
        ghostSpawnPoint: { row: 5, col: 5 },
      },
    };
    const { valid } = validateMap(map);
    expect(valid).toBe(true);
  });

  it('accepts map with optional asciiBlueprint field', () => {
    const map = createMinimalValidMap();
    map.asciiBlueprint = ['#####', '#...#', '#.@.#', '#...#', '#####'];
    const { valid } = validateMap(map);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — structural errors
// ---------------------------------------------------------------------------

describe('map schema — invalid structural fixtures', () => {
  it('rejects map missing required "level" field', () => {
    const map = createMinimalValidMap();
    map.level = undefined;
    const { valid, errors } = validateMap(map);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.instancePath === '')).toBe(true);
  });

  it('rejects map missing required "metadata" field', () => {
    const map = createMinimalValidMap();
    map.metadata = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing required "dimensions" field', () => {
    const map = createMinimalValidMap();
    map.dimensions = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing required "grid" field', () => {
    const map = createMinimalValidMap();
    map.grid = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing required "spawn" field', () => {
    const map = createMinimalValidMap();
    map.spawn = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with unknown top-level properties', () => {
    const map = createMinimalValidMap();
    map.unknownField = 'should not exist';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with level out of range (0)', () => {
    const map = createMinimalValidMap();
    map.level = 0;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with level out of range (4)', () => {
    const map = createMinimalValidMap();
    map.level = 4;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with non-integer level', () => {
    const map = createMinimalValidMap();
    map.level = 1.5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — metadata errors
// ---------------------------------------------------------------------------

describe('map schema — invalid metadata fixtures', () => {
  it('rejects map missing metadata.name', () => {
    const map = createMinimalValidMap();
    map.metadata.name = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with timerSeconds <= 0', () => {
    const map = createMinimalValidMap();
    map.metadata.timerSeconds = 0;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with maxGhosts > 4', () => {
    const map = createMinimalValidMap();
    map.metadata.maxGhosts = 5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with duplicate activeGhostTypes', () => {
    const map = createMinimalValidMap();
    map.metadata.activeGhostTypes = [0, 0, 1];
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with invalid ghost type ID (5)', () => {
    const map = createMinimalValidMap();
    map.metadata.activeGhostTypes = [0, 5];
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — grid cell type errors
// ---------------------------------------------------------------------------

describe('map schema — invalid grid cell types', () => {
  it('rejects grid cell with invalid type ID (10)', () => {
    const map = createMinimalValidMap();
    map.grid[1][1] = 10;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects grid cell with negative type ID (-1)', () => {
    const map = createMinimalValidMap();
    map.grid[1][1] = -1;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects grid cell with non-integer type (1.5)', () => {
    const map = createMinimalValidMap();
    map.grid[1][1] = 1.5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects grid cell with string type ("1")', () => {
    const map = createMinimalValidMap();
    map.grid[1][1] = '1';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects empty grid (no rows)', () => {
    const map = createMinimalValidMap();
    map.grid = [];
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects grid row that is empty array', () => {
    const map = createMinimalValidMap();
    map.grid[1] = [];
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — spawn point errors
// ---------------------------------------------------------------------------

describe('map schema — invalid spawn fixtures', () => {
  it('rejects map missing spawn.player', () => {
    const map = createMinimalValidMap();
    map.spawn.player = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing spawn.ghostHouse', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostHouse = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing spawn.ghostSpawnPoint', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostSpawnPoint = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects spawn with negative player row', () => {
    const map = createMinimalValidMap();
    map.spawn.player.row = -1;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects spawn with unknown properties', () => {
    const map = createMinimalValidMap();
    map.spawn.unknownField = 'bad';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — dimension errors
// ---------------------------------------------------------------------------

describe('map schema — invalid dimension fixtures', () => {
  it('rejects map missing dimensions.columns', () => {
    const map = createMinimalValidMap();
    map.dimensions.columns = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map missing dimensions.rows', () => {
    const map = createMinimalValidMap();
    map.dimensions.rows = undefined;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with columns < 10', () => {
    const map = createMinimalValidMap();
    map.dimensions.columns = 5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with rows < 10', () => {
    const map = createMinimalValidMap();
    map.dimensions.rows = 5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects map with non-integer columns', () => {
    const map = createMinimalValidMap();
    map.dimensions.columns = 15.5;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid fixture tests — unknown property rejection
// ---------------------------------------------------------------------------

describe('map schema — additionalProperties rejection', () => {
  it('rejects metadata with unknown extra field', () => {
    const map = createMinimalValidMap();
    map.metadata.difficulty = 'hard';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects dimensions with unknown extra field', () => {
    const map = createMinimalValidMap();
    map.dimensions.tileSize = 32;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects spawn.player with unknown extra field', () => {
    const map = createMinimalValidMap();
    map.spawn.player.facing = 'right';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects spawn.ghostHouse with unknown extra field', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostHouse.gateDirection = 'up';
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });

  it('rejects spawn.ghostSpawnPoint with unknown extra field', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostSpawnPoint.delay = 5000;
    const { valid } = validateMap(map);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structural consistency tests (programmatic — beyond JSON Schema)
// ---------------------------------------------------------------------------

describe('map consistency — programmatic structural validation', () => {
  it('passes consistency for all 3 shipped level maps', () => {
    for (const level of [1, 2, 3]) {
      const dataPath = path.join(root, `assets/maps/level-${level}.json`);
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const result = validateMapConsistency(data);
      expect(result.ok).toBe(
        true,
        `level-${level}.json consistency errors: ${result.errors.join('; ')}`,
      );
    }
  });

  it('fails when grid row count does not match dimensions.rows', () => {
    const map = createMinimalValidMap();
    map.grid.pop();
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('rows'))).toBe(true);
  });

  it('fails when grid column count does not match dimensions.columns', () => {
    const map = createMinimalValidMap();
    map.grid[0].pop();
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('columns'))).toBe(true);
  });

  it('fails when player spawn is outside grid bounds', () => {
    const map = createMinimalValidMap();
    map.spawn.player.row = 99;
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('player spawn'))).toBe(true);
  });

  it('fails when ghost spawn point is outside grid bounds', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostSpawnPoint.col = 99;
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost spawn'))).toBe(true);
  });

  it('fails when ghost house topRow > bottomRow', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostHouse.topRow = 8;
    map.spawn.ghostHouse.bottomRow = 2;
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('topRow'))).toBe(true);
  });

  it('fails when ghost house leftCol > rightCol', () => {
    const map = createMinimalValidMap();
    map.spawn.ghostHouse.leftCol = 8;
    map.spawn.ghostHouse.rightCol = 2;
    const result = validateMapConsistency(map);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('leftCol'))).toBe(true);
  });
});
