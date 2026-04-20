/*
 * Script: run-project-gate.mjs
 * Purpose: Evaluates package.json available scripts to automatically run essential
 * project quality gates: check, test, coverage, schema-validation, and sbom checks.
 * Implementation Notes: Runs the npm steps sequentially rather than locally parsing the codebase.
 */

import fs from 'node:fs';
import { GATE_PASS, runCommand } from './lib/policy-utils.mjs';

if (!fs.existsSync('package.json')) {
  console.log('package.json not present; skipping npm project gate.');
  process.exit(0);
}

console.log('\n========================================================================');
console.log('🚀 Phase 1: Project Quality Gates (Linters, Tests, Security)');
console.log('========================================================================\n');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts ?? {};

const commands = ['check'];
// test:coverage implies a vitest run, which covers unit, integration, and audit unit tests.
if (scripts['test:coverage']) {
  commands.push('test:coverage');
} else if (scripts.coverage) {
  commands.push('coverage');
} else if (scripts.test) {
  commands.push('test');
}

// We only run the e2e part of audit tests here to avoid running vitest audit tests twice.
if (scripts['test:audit:e2e']) {
  commands.push('test:audit:e2e');
} else if (scripts['test:audit']) {
  commands.push('test:audit');
}

if (scripts['test:e2e']) {
  commands.push('test:e2e');
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

console.log(`${GATE_PASS} — Project gate checks completed.`);
