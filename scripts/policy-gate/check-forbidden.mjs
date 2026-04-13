/*
 * Script: check-forbidden.mjs
 * Purpose: Scans for forbidden technology usage such as frameworks, undocumented APIs, or unsafe canvas rendering.
 * Implementation Notes: This script supports both changed-files scoped scanning and full repo scanning.
 * It strictly uses synchronous file operations for simple execution.
 */

import fs from 'node:fs';
import process from 'node:process';
import { GATE_FAIL, GATE_PASS, parseArgs, readLines, walkFiles } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const scope = args.scope || 'repo';
const changedPath = args['changed-file'] || 'changed-files.txt';

// We filter by extension to restrict scanning down to logic and markup, avoiding binary or asset files.
const sourcePattern = /\.(js|mjs|cjs|ts|tsx|jsx|html)$/;
// We define regexes to ban direct use of frameworks or raw Canvas APIs, enforcing Vanilla DOM/ECS constraints.
const forbiddenPatterns = [
  { name: 'canvas element', pattern: /<\s*canvas\b/i },
  { name: 'canvas createElement', pattern: /createElement\s*\(\s*['"]canvas['"]\s*\)/i },
  {
    name: 'framework import',
    pattern: /from\s+['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]/,
  },
  {
    name: 'framework require',
    pattern:
      /require\s*\(\s*['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]\s*\)/,
  },
];

// We branch based on scope to support both targeted PR diff scanning (faster) and exhaustive repo audits.
const files =
  scope === 'changed'
    ? // We conditionally filter out deleted files by checking `existsSync` so we don't try to read paths that no longer exist.
      readLines(changedPath).filter((file) => sourcePattern.test(file) && fs.existsSync(file))
    : walkFiles(process.cwd(), (file) => sourcePattern.test(file));

const violations = [];

// We examine each file completely so we can accumulate all violations rather than failing on the first hit.
for (const file of files) {
  // We specify utf8 to ensure string interpretation for regex matching against raw byte buffers.
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      violations.push(`${file}: ${rule.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    `${GATE_FAIL} — Forbidden technology usage detected. The following files contain forbidden APIs or frameworks:`,
  );
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error(
    'Action: Use safe DOM APIs or Vanilla ESM imports instead. Frameworks, CJS imports, and raw canvas accesses are forbidden.',
  );
  process.exit(1);
}

console.log(`${GATE_PASS} — Forbidden scan passed for ${files.length} file(s).`);
