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
const REPORT_PATH = path.join(root, '.policy-runtime', 'a07-asset-gate-report.json');
const STRICT_GENERATED_BASENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Determine manifest type from pair data path.
 */
function getManifestType(dataPath) {
  if (dataPath.endsWith('audio-manifest.json')) {
    return 'audio';
  }

  if (dataPath.endsWith('visual-manifest.json')) {
    return 'visual';
  }

  return '';
}

/**
 * Normalize incoming paths for deterministic cross-platform comparisons.
 */
function normalizePath(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '')
    .replace(/\/+/gu, '/');
}

/**
 * Manifest schema allows generated/* and assets/generated/*; normalize both to assets/generated/*.
 */
function normalizeGeneratedAssetPath(assetPath) {
  const normalized = normalizePath(assetPath);
  if (normalized.startsWith('generated/')) {
    return `assets/${normalized}`;
  }
  return normalized;
}

/**
 * Stable violation ordering keeps CI logs deterministic and easy to diff.
 */
function sortViolations(violations) {
  violations.sort((left, right) => {
    const leftKey = [left.code, left.path, left.manifestType, left.assetId].join('|');
    const rightKey = [right.code, right.path, right.manifestType, right.assetId].join('|');
    return leftKey.localeCompare(rightKey);
  });
}

/**
 * Emit a machine-readable report for local/CI diagnostics.
 */
function writeReport({ schemaTargetCount, assetCount, violations }) {
  const summary = {
    schemaTargetsChecked: schemaTargetCount,
    manifestAssetsChecked: assetCount,
    missingFiles: violations.filter((violation) => violation.code === 'MISSING_FILE').length,
    namingViolations: violations.filter((violation) => violation.code === 'NAMING_RULE').length,
    budgetViolations: violations.filter((violation) => violation.code === 'SIZE_BUDGET').length,
    status: violations.length > 0 ? 'fail' : 'pass',
  };

  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary,
    violations,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

/**
 * Validate manifest asset file contracts beyond schema shape checks.
 */
function validateManifestAssets(manifestType, manifestData, violations) {
  const assets = Array.isArray(manifestData?.assets) ? [...manifestData.assets] : [];
  assets.sort((left, right) => String(left?.path || '').localeCompare(String(right?.path || '')));

  for (const asset of assets) {
    const rawPath = normalizePath(asset.path);
    const normalizedPath = normalizeGeneratedAssetPath(rawPath);
    const assetId = String(asset.id || '');
    const absolutePath = path.join(root, normalizedPath);

    if (!fs.existsSync(absolutePath)) {
      violations.push({
        code: 'MISSING_FILE',
        manifestType,
        assetId,
        path: normalizedPath,
        expected: 'File present on disk',
        actual: 'Missing',
        message: 'Manifest path does not exist on disk.',
      });
      continue;
    }

    const extension = path.extname(normalizedPath).toLowerCase();
    const baseName = path.basename(normalizedPath, extension);
    const expectedExtension = `.${String(asset.format || '').toLowerCase()}`;
    if (!STRICT_GENERATED_BASENAME_PATTERN.test(baseName) || extension !== expectedExtension) {
      violations.push({
        code: 'NAMING_RULE',
        manifestType,
        assetId,
        path: normalizedPath,
        expected: 'lower-kebab-case basename and extension matching format',
        actual: `${baseName}${extension}`,
        message: 'Generated asset filename violates naming contract.',
      });
    }

    if (typeof asset.maxBytes === 'number') {
      const sizeBytes = fs.statSync(absolutePath).size;
      if (sizeBytes > asset.maxBytes) {
        violations.push({
          code: 'SIZE_BUDGET',
          manifestType,
          assetId,
          path: normalizedPath,
          expected: `<= ${asset.maxBytes} bytes`,
          actual: `${sizeBytes} bytes`,
          message: 'Generated asset exceeds manifest maxBytes budget.',
        });
      }
    }
  }

  return assets.length;
}

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

  const mapEntries = fs
    .readdirSync(mapsDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
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
].sort((left, right) => left.data.localeCompare(right.data));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let hasFailure = false;
const compiledSchemas = new Map();
const parsedManifests = new Map();
const violations = [];

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
      violations.push({
        code: 'SCHEMA',
        manifestType: getManifestType(pair.data) || 'map',
        assetId: '',
        path: pair.data,
        expected: 'Valid JSON schema payload',
        actual: `${issue.instancePath || '/'}: ${issue.message}`,
        message: `Schema validation failed for ${pair.data}.`,
      });
    }
  } else {
    console.log(`Schema validation passed: ${pair.data}`);
    const manifestType = getManifestType(pair.data);
    if (manifestType) {
      parsedManifests.set(manifestType, data);
    }
  }
}

let manifestAssetCount = 0;
for (const [manifestType, manifestData] of parsedManifests.entries()) {
  manifestAssetCount += validateManifestAssets(manifestType, manifestData, violations);
}

sortViolations(violations);
for (const violation of violations) {
  if (violation.code === 'SCHEMA') {
    continue;
  }

  hasFailure = true;
  console.error(
    `[${violation.code}] ${violation.path} (${violation.manifestType}:${violation.assetId}) - ${violation.message} expected=${violation.expected}; actual=${violation.actual}`,
  );
}

writeReport({
  schemaTargetCount: pairs.length,
  assetCount: manifestAssetCount,
  violations,
});

if (hasFailure) {
  process.exit(1);
}
