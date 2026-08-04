/**
 * Test: traceability-matrix-anchors.test.js
 * Purpose: Ensures audit-traceability-matrix.md links behavioral evidence to real test suites
 *          (CI-07 / #283) and that every backticked test path resolves on disk.
 * Public API: N/A (test module).
 * Implementation Notes: Parses markdown table cells for `path` anchors; rejects sole reliance on
 * the inventory-only audit.e2e.test.js for runtime behavioral questions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const MATRIX_PATH = path.join(repoRoot, 'docs/implementation/audit-traceability-matrix.md');

/** Extract backtick-wrapped repo-relative paths that look like test/source files. */
function extractAnchoredPaths(markdown) {
  const paths = new Set();
  const backtickPath = /`((?:tests|src|scripts|docs)\/[^`\s]+\.(?:js|mjs|ts|md|json))`/g;
  for (const match of markdown.matchAll(backtickPath)) {
    const relativePath = match[1];
    // Skip glob templates used as ownership labels (e.g. track-*.md).
    if (relativePath.includes('*')) {
      continue;
    }
    paths.add(relativePath);
  }
  return [...paths];
}

/**
 * Behavioral audit rows that must not cite only audit.e2e.test.js (metadata inventory).
 * Runtime mechanics belong in browser/unit/integration suites.
 */
const BEHAVIORAL_AUDIT_IDS = [
  'AUDIT-F-01',
  'AUDIT-F-02',
  'AUDIT-F-03',
  'AUDIT-F-04',
  'AUDIT-F-06',
  'AUDIT-F-11',
  'AUDIT-F-12',
  'AUDIT-F-13',
  'AUDIT-F-17',
  'AUDIT-F-18',
  'AUDIT-B-01',
];

const INVENTORY_ONLY_ANCHOR = 'tests/e2e/audit/audit.e2e.test.js';

function parseAuditTableRows(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| AUDIT-')) {
      continue;
    }
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 6) {
      continue;
    }
    rows.push({
      id: cells[0],
      anchor: cells[5],
    });
  }
  return rows;
}

describe('audit-traceability-matrix evidence anchors (CI-07 / #283)', () => {
  it('resolves every backticked test/source path in the matrix to an existing file', () => {
    expect(fs.existsSync(MATRIX_PATH)).toBe(true);
    const markdown = fs.readFileSync(MATRIX_PATH, 'utf8');
    const anchoredPaths = extractAnchoredPaths(markdown);
    expect(anchoredPaths.length).toBeGreaterThan(10);

    const missing = [];
    for (const relativePath of anchoredPaths) {
      const absolutePath = path.join(repoRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        missing.push(relativePath);
      }
    }

    expect(missing, `Missing matrix anchors:\n${missing.join('\n')}`).toEqual([]);
  });

  it('does not over-cite inventory audit.e2e.test.js as the sole behavioral evidence anchor', () => {
    const markdown = fs.readFileSync(MATRIX_PATH, 'utf8');
    const rows = parseAuditTableRows(markdown);
    expect(rows.length).toBeGreaterThan(10);

    const overCited = [];
    for (const row of rows) {
      if (!BEHAVIORAL_AUDIT_IDS.includes(row.id)) {
        continue;
      }
      const anchor = row.anchor;
      const citesInventory = anchor.includes(INVENTORY_ONLY_ANCHOR);
      const citesBrowser = anchor.includes('audit.browser.spec.js');
      const citesOtherSuite =
        /tests\/(?:unit|integration|e2e)\//.test(anchor) && !citesInventory
          ? true
          : citesBrowser ||
            /tests\/(?:unit|integration)\//.test(anchor) ||
            /tests\/e2e\/(?!audit\/audit\.e2e\.test\.js)/.test(anchor);

      // Sole inventory anchor (or inventory with only non-test evidence) is the CI-07 failure mode.
      if (citesInventory && !citesBrowser && !citesOtherSuite) {
        // Allow inventory + another real suite; reject inventory-only.
        const onlyInventory =
          !anchor.includes('audit.browser.spec.js') &&
          !/tests\/(?:unit|integration)\//.test(anchor) &&
          !/tests\/e2e\/(?!audit\/audit\.e2e\.test\.js)/.test(anchor);
        if (onlyInventory) {
          overCited.push(`${row.id}: ${anchor}`);
        }
      }

      // Also flag "Same as above" chains that still resolve to inventory-only via F-01.
      if (anchor === 'Same as above') {
        const f01 = rows.find((candidate) => candidate.id === 'AUDIT-F-01');
        if (
          f01?.anchor.includes(INVENTORY_ONLY_ANCHOR) &&
          !f01.anchor.includes('audit.browser.spec.js')
        ) {
          overCited.push(`${row.id}: Same as above → inventory-only F-01`);
        }
      }
    }

    expect(
      overCited,
      `Behavioral rows over-citing inventory suite:\n${overCited.join('\n')}`,
    ).toEqual([]);
  });

  it('points REQ-01/REQ-02/REQ-09 behavioral rows at browser or pause runtime suites, not inventory alone', () => {
    const markdown = fs.readFileSync(MATRIX_PATH, 'utf8');
    const reqRows = [];
    for (const line of markdown.split('\n')) {
      if (!line.startsWith('| REQ-')) {
        continue;
      }
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length < 5) {
        continue;
      }
      reqRows.push({ id: cells[0], anchor: cells[4] });
    }

    const required = {
      'REQ-01': /audit\.browser\.spec\.js/,
      'REQ-02': /audit\.browser\.spec\.js|requestAnimationFrame|game-loop/,
      'REQ-09': /game-loop\.pause|pause-system|screens-navigation|audit\.browser\.spec/,
    };

    for (const [reqId, pattern] of Object.entries(required)) {
      const row = reqRows.find((candidate) => candidate.id === reqId);
      expect(row, `${reqId} missing from matrix`).toBeDefined();
      expect(
        pattern.test(row.anchor),
        `${reqId} must cite a runtime suite, got: ${row.anchor}`,
      ).toBe(true);
      // Inventory-only is the CI-07 defect for these behavioral requirements.
      if (row.anchor.includes(INVENTORY_ONLY_ANCHOR)) {
        expect(
          row.anchor.includes('audit.browser.spec.js') ||
            /tests\/(?:unit|integration|e2e)\/(?!audit\/audit\.e2e\.test\.js)/.test(row.anchor),
          `${reqId} must not cite only ${INVENTORY_ONLY_ANCHOR}`,
        ).toBe(true);
      }
    }
  });
});
