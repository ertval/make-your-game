import fs from 'node:fs';
import process from 'node:process';
import { parseArgs, readLines, walkFiles } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const scope = args.scope || 'repo';
const changedPath = args['changed-file'] || 'changed-files.txt';

const sourcePattern = /\.(js|mjs|cjs|ts|tsx|jsx|html)$/;
const forbiddenPatterns = [
  { name: 'canvas element', pattern: /<\s*canvas\b/i },
  { name: 'canvas createElement', pattern: /createElement\s*\(\s*['\"]canvas['\"]\s*\)/i },
  {
    name: 'framework import',
    pattern: /from\s+['\"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['\"]/,
  },
  {
    name: 'framework require',
    pattern:
      /require\s*\(\s*['\"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['\"]\s*\)/,
  },
];

const files =
  scope === 'changed'
    ? readLines(changedPath).filter((file) => sourcePattern.test(file) && fs.existsSync(file))
    : walkFiles(process.cwd(), (file) => sourcePattern.test(file));

const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      violations.push(`${file}: ${rule.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Forbidden technology usage detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Forbidden scan passed for ${files.length} file(s).`);
