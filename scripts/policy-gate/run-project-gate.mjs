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
