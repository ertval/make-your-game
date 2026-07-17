/**
 * Test: markdown-links.test.js
 * Purpose: Verifies that markdown documentation files do not contain hardcoded absolute path links and all relative links resolve correctly.
 * Public API: N/A (test module).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('markdown links check', () => {
  it('verifies phase-testing-verification-report.md has no absolute path links and all relative links exist', () => {
    const filePath = path.join(repoRoot, 'docs/audit-reports/phase-testing-verification-report.md');
    const content = fs.readFileSync(filePath, 'utf8');

    // Regex to match markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const matches = [...content.matchAll(linkRegex)];
    const links = matches.map((m) => ({
      text: m[1],
      url: m[2],
    }));

    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const { url } = link;

      // Fail if link is absolute referencing local paths
      expect(url).not.toContain('/home/ertval');
      expect(url.startsWith('file:///home/')).toBe(false);

      // If it is a local relative link, verify file exists
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
        // Strip hash fragment
        const relativePath = url.split('#')[0];
        if (relativePath) {
          const absolutePath = path.resolve(path.dirname(filePath), relativePath);
          const exists = fs.existsSync(absolutePath);
          expect(
            exists,
            `Link target file does not exist: ${url} (resolved to: ${absolutePath})`,
          ).toBe(true);
        }
      }
    }
  });
});
