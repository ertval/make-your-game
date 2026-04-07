/*
 * Script: run-project-gate.mjs
 * Purpose: Evaluates package.json available scripts to automatically run essential
 * project quality gates: check, test, coverage, schema-validation, and sbom checks.
 * Implementation Notes: Runs the npm steps sequentially rather than locally parsing the codebase.
 */

import fs from 'node:fs';
import { runCommand } from './lib/policy-utils.mjs';

if (!fs.existsSync('package.json')) {
  console.log('package.json not present; skipping npm project gate.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts ?? {};

const commands = ['check', 'test'];
if (scripts['test:coverage']) {
  commands.push('test:coverage');
} else if (scripts.coverage) {
  commands.push('coverage');
}

if (scripts['validate:schema']) {
  commands.push('validate:schema');
}

if (scripts.sbom) {
  commands.push('sbom');
}

for (const script of commands) {
  console.log(`Running npm run ${script}`);
  runCommand('npm', ['run', script], { stdio: 'inherit' });
}

console.log('Project gate checks completed successfully.');
