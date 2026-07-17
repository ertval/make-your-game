/**
 * Test: playwright-no-tests.test.js
 * Purpose: Verifies that E2E test scripts in package.json fail if no specs are found.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('Playwright E2E script configuration', () => {
  it('test:e2e script exits with a non-zero code if no specs are found', () => {
    // Run npm run test:e2e with a grep pattern that matches nothing.
    // If --pass-with-no-tests is removed, this must exit with a non-zero code.
    const result = spawnSync('npm', ['run', 'test:e2e', '--', '--grep', 'non_existent_test_grep'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
  });

  it('test:audit:e2e script exits with a non-zero code if no specs are found', () => {
    const result = spawnSync(
      'npm',
      ['run', 'test:audit:e2e', '--', '--grep', 'non_existent_test_grep'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).not.toBe(0);
  });
});
