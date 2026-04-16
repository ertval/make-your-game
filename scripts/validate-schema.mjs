/*
 * Script: validate-schema.mjs
 * Purpose: Validates map and asset manifest JSON files against project JSON Schemas.
 * Public API: N/A (CLI script).
 * Implementation Notes: Compiles schemas once per run to avoid duplicate $id collisions and exits non-zero on validation errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = process.cwd();

/**
 * Collect all map JSON files from assets/maps/ and pair them with the map schema.
 * Fails closed when the directory is missing or empty.
 */
function collectMapPairs() {
  const mapsDir = path.join(root, 'assets', 'maps');
  const schemaPath = 'docs/schemas/map.schema.json';
  const pairs = [];
  const failures = [];

  if (!fs.existsSync(mapsDir)) {
    failures.push(`Required maps directory is missing: ${path.relative(root, mapsDir)}`);
    return {
      failures,
      pairs,
    };
  }

  const mapEntries = fs.readdirSync(mapsDir).filter((entry) => entry.endsWith('.json'));
  if (mapEntries.length === 0) {
    failures.push('No level map JSON files found in assets/maps/.');
    return {
      failures,
      pairs,
    };
  }

  for (const entry of mapEntries) {
    pairs.push({
      data: path.join('assets', 'maps', entry),
      schema: schemaPath,
    });
  }

  return {
    failures,
    pairs,
  };
}

const mapPairs = collectMapPairs();

const pairs = [
  {
    data: 'assets/manifests/audio-manifest.json',
    schema: 'docs/schemas/audio-manifest.schema.json',
  },
  {
    data: 'assets/manifests/visual-manifest.json',
    schema: 'docs/schemas/visual-manifest.schema.json',
  },
  ...mapPairs.pairs,
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let hasFailure = false;
const compiledSchemas = new Map();

for (const failure of mapPairs.failures) {
  hasFailure = true;
  console.error(`Schema validation setup failed: ${failure}`);
}

for (const pair of pairs) {
  const dataPath = path.join(root, pair.data);
  const schemaPath = path.join(root, pair.schema);

  if (!fs.existsSync(dataPath) || !fs.existsSync(schemaPath)) {
    hasFailure = true;
    console.error(
      `Schema validation failed: required file is missing (data=${pair.data}, schema=${pair.schema}).`,
    );
    continue;
  }

  // Compile each schema only once to avoid duplicate $id conflicts.
  // We compile ajv schemas lazily and memoize them because compiling complex JSONSchema references is computationally expensive.
  let validate;
  if (compiledSchemas.has(pair.schema)) {
    validate = compiledSchemas.get(pair.schema);
  } else {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      validate = ajv.compile(schema);
      compiledSchemas.set(pair.schema, validate);
    } catch (error) {
      hasFailure = true;
      console.error(`Schema compilation failed for ${pair.schema}: ${error.message}`);
      continue;
    }
  }

  // We parse synchronously here assuming asset data files are bounded and schema validation sits outside hot-paths.
  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    hasFailure = true;
    console.error(`Schema validation failed: ${pair.data} is not valid JSON (${error.message}).`);
    continue;
  }

  const valid = validate(data);

  if (!valid) {
    hasFailure = true;
    console.error(`Schema validation failed: ${pair.data}`);
    for (const issue of validate.errors ?? []) {
      console.error(`- ${issue.instancePath || '/'}: ${issue.message}`);
    }
  } else {
    console.log(`Schema validation passed: ${pair.data}`);
  }
}

if (hasFailure) {
  process.exit(1);
}
