/*
 * Script: check-source-headers.mjs
 * Purpose: Ensures all critical source files (.js, .mjs, .cjs) begin with a block comment header
 * defining their purpose and constraints.
 * Implementation Notes: Allows scanning only changed files (PR scope) or the whole repository.
 * Can operate in multiple modes: 'warn' (default), 'error', or 'fail'.
 */

import fs from 'node:fs';
import process from 'node:process';
import { parseArgs, readLines, walkFiles } from './lib/policy-utils.mjs';

// Parse CLI arguments and validate execution mode
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
const missingPurpose = [];
const missingJSDoc = [];
const lowCommentRatio = [];

const MIN_COMMENT_RATIO = 0.02; // 2% minimum comment to LOC ratio

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  if (!content.trimStart().startsWith('/*')) {
    missingHeaders.push(file);
  } else {
    const endIdx = content.indexOf('*/');
    if (endIdx !== -1) {
      const headerBlock = content.substring(0, endIdx).toLowerCase();
      // Ensure the comment block explains the file's purpose, public API, or notes/constraints.
      if (!headerBlock.includes('purpose') && !headerBlock.includes('api') && !headerBlock.includes('note') && !headerBlock.includes('constraint')) {
        missingPurpose.push(file);
      }
    }
  }

  const lines = content.split('\n');
  let commentLines = 0;
  let codeLines = 0;
  let inBlockComment = false;
  let hasJSDoc = false;

  for (let line of lines) {
    const t = line.trim();
    if (inBlockComment) {
      commentLines++;
      if (t.includes('*/')) inBlockComment = false;
    } else {
      if (t.startsWith('//')) {
        commentLines++;
      } else if (t.startsWith('/*')) {
        commentLines++;
        if (t.startsWith('/**')) {
          hasJSDoc = true;
        }
        if (!t.includes('*/')) {
          inBlockComment = true;
        }
      } else if (t.length > 0) {
        codeLines++;
      }
    }
  }

  const totalLines = commentLines + codeLines;
  const ratio = totalLines === 0 ? 1 : commentLines / totalLines;
  
  if (ratio < MIN_COMMENT_RATIO && totalLines > 10) {
     lowCommentRatio.push(`${file} (ratio: ${(ratio*100).toFixed(1)}%)`);
  }
  
  // Exclude extremely tiny files from strict JSDoc enforcement
  if (!hasJSDoc && totalLines > 25) {
     missingJSDoc.push(file);
  }
}

let hasViolations = false;
const details = [];

if (missingHeaders.length > 0) {
  hasViolations = true;
  details.push('Source files missing top-of-file block comments:');
  missingHeaders.forEach((f) => details.push(`- ${f}`));
}

if (missingPurpose.length > 0) {
  hasViolations = true;
  details.push('Source files missing "purpose", "API", "notes", or "constraints" in header comment:');
  missingPurpose.forEach((f) => details.push(`- ${f}`));
}

if (lowCommentRatio.length > 0) {
  hasViolations = true;
  details.push(`Source files below minimum comment ratio (${MIN_COMMENT_RATIO * 100}%):`);
  lowCommentRatio.forEach((f) => details.push(`- ${f}`));
}

if (missingJSDoc.length > 0) {
  hasViolations = true;
  details.push('Source files entirely missing JSDoc (/** ... */) usage:');
  missingJSDoc.forEach((f) => details.push(`- ${f}`));
}

if (!hasViolations) {
  console.log(`Code quality and comment check passed for ${files.length} file(s).`);
  process.exit(0);
}

const errorOutput = details.join('\n');

if (mode === 'error' || mode === 'fail') {
  console.error(errorOutput);
  process.exit(1);
}

console.warn(errorOutput);
console.log('Code quality and comment check completed in warn mode; continuing.');
