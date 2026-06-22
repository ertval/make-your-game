/**
 * Test: package-config.test.js
 * Purpose: Verify package.json security and hygiene settings.
 * Public API: N/A (test module).
 * Implementation Notes: Reads package.json directly to assert config invariants.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

describe('package.json security configuration', () => {
  it('should be marked as private to prevent accidental npm publish', () => {
    expect(pkg.private).toBe(true);
  });

  it('should not have a duplicate coverage script', () => {
    const coverageScripts = Object.keys(pkg.scripts || {}).filter((key) => key === 'coverage');
    expect(coverageScripts).toHaveLength(0);
  });
});
