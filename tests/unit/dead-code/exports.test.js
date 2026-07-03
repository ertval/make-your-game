/**
 * Dead-code export assertions (DEAD-35, DEAD-36, DEAD-37, DEAD-03, DEAD-01).
 *
 * Verifies that exports and files identified as dead code have been removed.
 * DEAD-35: POWER_UP_TYPE removed from constants.js.
 * DEAD-36: skills-lock.json removed from git tracking.
 * DEAD-37: generate_reports.py removed from working tree.
 * DEAD-03: checklist constants removed from policy-utils.mjs.
 * DEAD-01: cross-module export sweep to ensure zero redundant exports.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

// Helper to recursively get all files matching extensions in a dir
function getFiles(dir, extensions = ['.js', '.mjs']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFiles(res, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(res);
    }
  }
  return results;
}

describe('DEAD-35: POWER_UP_TYPE removed from constants.js', () => {
  it('does not export POWER_UP_TYPE from constants.js', async () => {
    const mod = await import('../../../src/ecs/resources/constants.js');
    expect(mod).not.toHaveProperty('POWER_UP_TYPE');
  });
});

describe('DEAD-36: skills-lock.json untracked', () => {
  it('skills-lock.json is not tracked by git', () => {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', 'skills-lock.json'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result.status).not.toBe(0);
  });
});

describe('DEAD-37: generate_reports.py removed', () => {
  it('generate_reports.py does not exist in working tree', () => {
    const p = path.join(REPO_ROOT, 'generate_reports.py');
    expect(fs.existsSync(p)).toBe(false);
  });
});

describe('DEAD-03: policy-utils.mjs checklist constants removed', () => {
  it('does not export REQUIRED_SECTIONS, REQUIRED_CHECKBOXES, or REQUIRED_LAYER_CHECKBOXES', async () => {
    const mod = await import('../../../scripts/policy-gate/lib/policy-utils.mjs');
    expect(mod).not.toHaveProperty('REQUIRED_SECTIONS');
    expect(mod).not.toHaveProperty('REQUIRED_CHECKBOXES');
    expect(mod).not.toHaveProperty('REQUIRED_LAYER_CHECKBOXES');
  });
});

describe('DEAD-01: Global unused export check', () => {
  it('verifies that all exported symbols in src/ are imported or used in other files', async () => {
    const srcDir = path.resolve(REPO_ROOT, 'src');
    const testsDir = path.resolve(REPO_ROOT, 'tests');

    const srcFiles = getFiles(srcDir);
    const testFiles = getFiles(testsDir);
    const allFiles = [...srcFiles, ...testFiles];

    // Cache file contents
    const contents = {};
    for (const file of allFiles) {
      contents[file] = fs.readFileSync(file, 'utf-8');
    }

    const unusedExports = [];

    for (const file of srcFiles) {
      // Skip entrypoint src/main.js as it runs side-effects and exports nothing
      if (file.endsWith('src/main.js')) continue;

      const mod = await import(file);
      const exports = Object.keys(mod);

      for (const exp of exports) {
        if (exp === 'default') continue;

        // Check if the symbol name is used in any other file in src/ or tests/
        let isUsed = false;
        const regex = new RegExp(`\\b${exp}\\b`);

        for (const otherFile of allFiles) {
          if (otherFile === file) continue;
          if (regex.test(contents[otherFile])) {
            isUsed = true;
            break;
          }
        }

        if (!isUsed) {
          unusedExports.push({ file: path.relative(REPO_ROOT, file), symbol: exp });
        }
      }
    }

    expect(unusedExports).toEqual([]);
  });
});
