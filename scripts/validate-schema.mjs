import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = process.cwd();

const pairs = [
  {
    data: 'assets/manifests/audio-manifest.json',
    schema: 'docs/schemas/audio-manifest.schema.json',
  },
  {
    data: 'assets/manifests/visual-manifest.json',
    schema: 'docs/schemas/visual-manifest.schema.json',
  },
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let hasFailure = false;

for (const pair of pairs) {
  const dataPath = path.join(root, pair.data);
  const schemaPath = path.join(root, pair.schema);

  if (!fs.existsSync(dataPath) || !fs.existsSync(schemaPath)) {
    console.warn(`Skipping validation for ${pair.data} because file is missing.`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);
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
