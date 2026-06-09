/**
 * Dead-code export assertions (DEAD-35, DEAD-36, DEAD-37).
 *
 * Verifies that exports and files identified as dead code have been removed.
 * DEAD-35: POWER_UP_TYPE removed from constants.js.
 * DEAD-36: skills-lock.json removed from git tracking.
 * DEAD-37: generate_reports.py removed from working tree.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

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
