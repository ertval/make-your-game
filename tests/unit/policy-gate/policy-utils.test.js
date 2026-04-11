/**
 * Test: policy-utils.test.js
 * Purpose: Validates ticket/process detection and ownership resolution helpers used by policy gates.
 * Public API: N/A (test module).
 * Implementation Notes: Focuses on deterministic string/path parsing to keep policy decisions predictable.
 */

import { describe, expect, it } from 'vitest';

import {
  assertOwnerTrackMatch,
  describePolicyResolution,
  extractOwnerFromBranch,
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

describe('policy-utils owner-track validation', () => {
  it('extracts owner from branch name', () => {
    expect(extractOwnerFromBranch('ekaramet/A-03')).toBe('ekaramet');
    expect(extractOwnerFromBranch('asmyrogl/B-02')).toBe('asmyrogl');
    expect(extractOwnerFromBranch('medvall/D-04')).toBe('medvall');
    expect(extractOwnerFromBranch('user.name/C-05')).toBe('user.name');
  });

  it('returns empty string for invalid branch formats', () => {
    expect(extractOwnerFromBranch('')).toBe('');
    expect(extractOwnerFromBranch('no-slash')).toBe('');
    expect(extractOwnerFromBranch('/A-01')).toBe('');
  });

  it('passes when owner track matches ticket track', () => {
    // ekaramet owns Track A
    expect(() => assertOwnerTrackMatch('A', 'ekaramet/A-03')).not.toThrow();
    // asmyrogl owns Track B
    expect(() => assertOwnerTrackMatch('B', 'asmyrogl/B-02')).not.toThrow();
    // medvall owns Track D
    expect(() => assertOwnerTrackMatch('D', 'medvall/D-04')).not.toThrow();
  });

  it('throws when owner track mismatches ticket track', () => {
    // ekaramet (Track A owner) trying to use Track D ticket
    expect(() => assertOwnerTrackMatch('D', 'ekaramet/D-01')).toThrow(
      /Owner-track mismatch[\s\S]*ekaramet[\s\S]*Track A[\s\S]*Track D/,
    );

    // asmyrogl (Track B owner) trying to use Track A ticket
    expect(() => assertOwnerTrackMatch('A', 'asmyrogl/A-01')).toThrow(
      /Owner-track mismatch[\s\S]*asmyrogl[\s\S]*Track B[\s\S]*Track A/,
    );

    // medvall (Track D owner) trying to use Track B ticket
    expect(() => assertOwnerTrackMatch('B', 'medvall/B-03')).toThrow(
      /Owner-track mismatch[\s\S]*medvall[\s\S]*Track D[\s\S]*Track B/,
    );
  });

  it('skips validation for unregistered owners', () => {
    // Unknown owner — should not throw
    expect(() => assertOwnerTrackMatch('C', 'newdev/C-05')).not.toThrow();
    expect(() => assertOwnerTrackMatch('A', 'unknown/A-01')).not.toThrow();
  });

  it('skips validation when branch name is empty', () => {
    expect(() => assertOwnerTrackMatch('A', '')).not.toThrow();
    expect(() => assertOwnerTrackMatch('B', undefined)).not.toThrow();
    expect(() => assertOwnerTrackMatch('C', null)).not.toThrow();
  });
});
