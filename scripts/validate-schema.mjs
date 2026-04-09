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
 * Falls back to a single file if the directory does not exist yet.
 */
function collectMapPairs() {
  const mapsDir = path.join(root, 'assets', 'maps');
  const schemaPath = 'docs/schemas/map.schema.json';
  const pairs = [];

  // We guard against missing map directories so the project doesn't crash on absolute first-time setup or clean checkout.
  if (fs.existsSync(mapsDir)) {
    for (const entry of fs.readdirSync(mapsDir)) {
      if (entry.endsWith('.json')) {
        pairs.push({
          data: path.join('assets', 'maps', entry),
          schema: schemaPath,
        });
      }
    }
  }

  return pairs;
}

const pairs = [
  {
    data: 'assets/manifests/audio-manifest.json',
    schema: 'docs/schemas/audio-manifest.schema.json',
  },
  {
    data: 'assets/manifests/visual-manifest.json',
    schema: 'docs/schemas/visual-manifest.schema.json',
  },
  ...collectMapPairs(),
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let hasFailure = false;
const compiledSchemas = new Map();

for (const pair of pairs) {
  const dataPath = path.join(root, pair.data);
  const schemaPath = path.join(root, pair.schema);

  if (!fs.existsSync(dataPath) || !fs.existsSync(schemaPath)) {
    console.warn(`Skipping validation for ${pair.data} because file is missing.`);
    continue;
  }

  // Compile each schema only once to avoid duplicate $id conflicts.
  // We compile ajv schemas lazily and memoize them because compiling complex JSONSchema references is computationally expensive.
  let validate;
  if (compiledSchemas.has(pair.schema)) {
    validate = compiledSchemas.get(pair.schema);
  } else {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    validate = ajv.compile(schema);
    compiledSchemas.set(pair.schema, validate);
  }

  // We parse synchronously here assuming asset data files are bounded and schema validation sits outside hot-paths.
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
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
