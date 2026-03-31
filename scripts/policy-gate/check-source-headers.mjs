import fs from 'node:fs';
import process from 'node:process';
import { parseArgs, readLines, walkFiles } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const scope = args.scope || 'changed';
if (!['changed', 'repo'].includes(scope)) {
  throw new Error(`Invalid --scope value "${scope}". Expected one of: changed, repo.`);
}

const mode = String(args.mode || process.env.POLICY_HEADER_MODE || 'warn')
  .trim()
  .toLowerCase();
if (!['warn', 'error', 'fail'].includes(mode)) {
  throw new Error(`Invalid --mode value "${mode}". Expected one of: warn, error, fail.`);
}

const changedPath = args['changed-file'] || 'changed-files.txt';
const includePrefixes = String(args['include-prefixes'] || 'src/')
  .split(',')
  .map((value) => value.trim().replaceAll('\\', '/'))
  .filter(Boolean);
const sourcePattern = /\.(js|mjs|cjs)$/;

function shouldScan(filePath) {
  if (!sourcePattern.test(filePath)) {
    return false;
  }

  if (includePrefixes.length === 0) {
    return true;
  }

  return includePrefixes.some((prefix) => filePath.startsWith(prefix));
}

function startsWithBlockComment(content) {
  return content.trimStart().startsWith('/*');
}

const files =
  scope === 'changed'
    ? readLines(changedPath)
        .map((file) => file.replaceAll('\\', '/'))
        .filter((file) => shouldScan(file) && fs.existsSync(file))
    : walkFiles(process.cwd(), (file) => shouldScan(file));

const missingHeaders = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (!startsWithBlockComment(content)) {
    missingHeaders.push(file);
  }
}

if (missingHeaders.length === 0) {
  console.log(`Source header check passed for ${files.length} file(s).`);
  process.exit(0);
}

const details = [
  'Source files missing top-of-file block comments:',
  ...missingHeaders.map((file) => `- ${file}`),
].join('\n');

if (mode === 'error' || mode === 'fail') {
  console.error(details);
  process.exit(1);
}

console.warn(details);
console.log('Source header check completed in warn mode; continuing.');
