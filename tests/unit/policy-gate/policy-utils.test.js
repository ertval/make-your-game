/**
 * Test: policy-utils.test.js
 * Purpose: Validates ticket/process detection and ownership resolution helpers used by policy gates.
 * Public API: N/A (test module).
 * Implementation Notes: Focuses on deterministic string/path parsing to keep policy decisions predictable.
 */

import { describe, expect, it } from 'vitest';

import {
  describePolicyResolution,
  extractTicketIdFromBranchName,
  findOwnershipViolations,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
} from '../../../scripts/policy-gate/lib/policy-utils.mjs';

describe('policy-utils ticket and process detection', () => {
  it('detects ticket ids from branch names and commit messages', () => {
    expect(inferTicketIdsFromSources('ekaramet/A-02', '')).toEqual(['A-02']);
    expect(inferTicketIdsFromSources('', 'feat: add A-02 ticket gate')).toEqual(['A-02']);
  });

  it('extracts ticket id only from explicit branch ticket format', () => {
    expect(extractTicketIdFromBranchName('ekaramet/A-03')).toBe('A-03');
    expect(extractTicketIdFromBranchName('ekaramet/A-3')).toBe('');
    expect(extractTicketIdFromBranchName('asmyrogl/TB-01')).toBe('');
    expect(extractTicketIdFromBranchName('feature/A03')).toBe('');
  });

  it('detects a process marker from branch or commit text', () => {
    expect(inferProcessModeFromSources('docs/process branch', '')).toBe(true);
    expect(inferProcessModeFromSources('', 'feat: update process docs')).toBe(true);
    expect(inferProcessModeFromSources('feat: improve docs', '')).toBe(false);
  });

  it('describes the selected policy path and metadata', () => {
    const ticketSummary = describePolicyResolution({
      auditMode: 'TICKET',
      branchTicketIds: ['A-02'],
      commitTicketIds: ['A-01', 'A-02'],
      processMarkerDetected: false,
      selectedPath: 'ticketed ownership checks',
      ticketIds: ['A-01', 'A-02'],
      trackCode: 'A',
    });

    expect(ticketSummary).toContain('mode=TICKET');
    expect(ticketSummary).toContain('path=ticketed ownership checks');
    expect(ticketSummary).toContain('tickets=A-01, A-02');
    expect(ticketSummary).toContain('branchTickets=A-02');
    expect(ticketSummary).toContain('commitTickets=A-01, A-02');

    const processSummary = describePolicyResolution({
      auditMode: 'GENERAL_DOCS_PROCESS',
      branchTicketIds: [],
      commitTicketIds: [],
      processMarkerDetected: true,
      selectedPath: 'process-marker fallback',
      ticketIds: [],
      trackCode: 'GENERAL',
    });

    expect(processSummary).toContain('mode=GENERAL_DOCS_PROCESS');
    expect(processSummary).toContain('path=process-marker fallback');
    expect(processSummary).toContain('tickets=(none)');
    expect(processSummary).toContain('processMarker=true');
  });

  it('allows Track A to modify test files from any track', () => {
    const result = findOwnershipViolations('A', [
      'tests/unit/components/actors.test.js',
      'tests/unit/resources/clock.test.js',
      'tests/integration/gameplay/pause-invariants.test.js',
    ]);

    expect(result.violations).toEqual([]);
  });

  it('allows shared styles/base.css for any track', () => {
    expect(findOwnershipViolations('A', ['styles/base.css']).violations).toEqual([]);
    expect(findOwnershipViolations('B', ['styles/base.css']).violations).toEqual([]);
    expect(findOwnershipViolations('C', ['styles/base.css']).violations).toEqual([]);
    expect(findOwnershipViolations('D', ['styles/base.css']).violations).toEqual([]);
  });

  it('treats registry.js as Track B-owned scope', () => {
    expect(findOwnershipViolations('B', ['src/ecs/components/registry.js']).violations).toEqual([]);
    expect(findOwnershipViolations('C', ['src/ecs/components/registry.js']).violations).toEqual([
      'src/ecs/components/registry.js',
    ]);
  });

  it('allows Track B tests for B-owned files and rejects out-of-scope files', () => {
    const result = findOwnershipViolations('B', [
      'tests/unit/components/actors.test.js',
      'tests/unit/resources/clock.test.js',
      'src/ecs/resources/constants.js',
    ]);

    expect(result.violations).toEqual([
      'tests/unit/resources/clock.test.js',
      'src/ecs/resources/constants.js',
    ]);
  });

  it('allows Track C tests for C-owned files and rejects out-of-scope tests', () => {
    const result = findOwnershipViolations('C', [
      'tests/unit/systems/scoring-system.test.js',
      'tests/unit/systems/ghost-ai-system.test.js',
    ]);

    expect(result.violations).toEqual(['tests/unit/systems/ghost-ai-system.test.js']);
  });

  it('allows Track D tests for D-owned files and rejects out-of-scope tests', () => {
    const result = findOwnershipViolations('D', [
      'tests/integration/adapters/renderer-adapter.test.js',
      'tests/integration/adapters/audio-adapter.test.js',
    ]);

    expect(result.violations).toEqual(['tests/integration/adapters/audio-adapter.test.js']);
  });
});
