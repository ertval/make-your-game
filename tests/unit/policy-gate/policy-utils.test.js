/**
 * Test: policy-utils.test.js
 * Purpose: Validates ticket/process detection and ownership resolution helpers used by policy gates.
 * Public API: N/A (test module).
 * Implementation Notes: Focuses on deterministic string/path parsing to keep policy decisions predictable.
 */

import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertOwnerTrackMatch,
  describePolicyResolution,
  extractOwnerFromBranch,
  extractTicketIdFromBranchName,
  findOwnershipViolations,
  getOwnersForTrack,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  isBugfixBranch,
  resolveBranchName,
  resolveOwnerTrackFromBranch,
  resolvePrPolicyPath,
  TRACK_OWNERSHIP_RULES,
} from '../../../scripts/policy-gate/lib/policy-utils.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('policy-utils ticket and process detection', () => {
  it('detects ticket ids from branch names and commit messages', () => {
    expect(inferTicketIdsFromSources('ekaramet/A-02', '')).toEqual(['A-02']);
    expect(inferTicketIdsFromSources('', 'feat: add A-02 ticket gate')).toEqual(['A-02']);
  });

  it('extracts ticket id only from explicit branch ticket format', () => {
    expect(extractTicketIdFromBranchName('ekaramet/A-03')).toBe('A-03');
    expect(extractTicketIdFromBranchName('asmyrogl/B-03-runtime-integration')).toBe('B-03');
    expect(extractTicketIdFromBranchName('medvall/D-10-fix-pool-thrash')).toBe('D-10');
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

    expect(ticketSummary).toContain('Mode:           TICKET');
    expect(ticketSummary).toContain('Path:           ticketed ownership checks');
    expect(ticketSummary).toContain('Tickets:        A-01, A-02');
    expect(ticketSummary).toContain('Branch Tickets: A-02');
    expect(ticketSummary).toContain('Commit Tickets: A-01, A-02');

    const processSummary = describePolicyResolution({
      auditMode: 'GENERAL_DOCS_PROCESS',
      branchTicketIds: [],
      commitTicketIds: [],
      owner: 'ekaramet',
      ownerTrack: 'A',
      processMarkerDetected: true,
      selectedPath: 'process-marker fallback',
      ticketIds: [],
      trackCode: 'GENERAL',
    });

    expect(processSummary).toContain('Mode:           GENERAL_DOCS_PROCESS');
    expect(processSummary).toContain('Path:           process-marker fallback');
    expect(processSummary).toContain('Tickets:        (none)');
    expect(processSummary).toContain('Branch Owner:   ekaramet');
    expect(processSummary).toContain('Owner Track:    A');
    expect(processSummary).toContain('Process Marker: true');
  });

  it('allows Track A to modify test files from any track', () => {
    const result = findOwnershipViolations('A', [
      'tests/unit/components/actors.test.js',
      'tests/unit/resources/clock.test.js',
      'tests/integration/gameplay/pause-invariants.test.js',
    ]);

    expect(result.violations).toEqual([]);
  });

  it('keeps Track A out of Track B and D implementation ownership', () => {
    const result = findOwnershipViolations('A', [
      'src/ecs/resources/game-status.js',
      'src/ecs/systems/input-system.js',
      'src/ecs/components/registry.js',
    ]);

    expect(result.violations).toEqual([
      'src/ecs/resources/game-status.js',
      'src/ecs/systems/input-system.js',
      'src/ecs/components/registry.js',
    ]);
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
      'assets/manifests/audio-manifest.json',
      'src/ecs/systems/input-system.js',
    ]);

    expect(result.violations).toEqual(['src/ecs/systems/input-system.js']);
  });

  it('allows Track D tests for D-owned files and rejects out-of-scope tests', () => {
    const result = findOwnershipViolations('D', [
      'tests/unit/resources/clock.test.js',
      'src/game/game-flow.js',
    ]);

    expect(result.violations).toEqual(['src/game/game-flow.js']);
  });

  it('keeps Track B ownership anchored to track deliverables and scoped tests', () => {
    expect(TRACK_OWNERSHIP_RULES.B.patterns).toEqual(
      expect.arrayContaining([
        'src/ecs/components/registry.js',
        'src/adapters/io/input-adapter.js',
        'src/ecs/systems/input-system.js',
        'src/ecs/systems/player-move-*.js',
        'src/ecs/systems/collision-*.js',
        'src/ecs/systems/bomb-*.js',
        'src/ecs/systems/explosion-*.js',
        'src/ecs/systems/power-up-*.js',
        'src/ecs/systems/ghost-ai-*.js',
      ]),
    );

    expect(TRACK_OWNERSHIP_RULES.B.testPatterns).toEqual(
      expect.arrayContaining([
        'tests/unit/components/registry.test.js',
        'tests/unit/systems/input-system.test.js',
        'tests/unit/systems/player-*.test.js',
        'tests/unit/systems/collision-*.test.js',
        'tests/unit/systems/bomb-*.test.js',
        'tests/unit/systems/explosion-*.test.js',
        'tests/unit/systems/power-up-*.test.js',
        'tests/unit/systems/ghost-ai-*.test.js',
        'tests/integration/adapters/input-adapter.test.js',
        'tests/integration/gameplay/b-*.test.js',
      ]),
    );
  });

  it('keeps Track C ownership anchored to track deliverables and scoped tests', () => {
    expect(TRACK_OWNERSHIP_RULES.C.patterns).toEqual(
      expect.arrayContaining([
        'src/ecs/systems/scoring-*.js',
        'src/ecs/systems/timer-*.js',
        'src/ecs/systems/life-*.js',
        'src/ecs/systems/spawn-*.js',
        'src/ecs/systems/pause-*.js',
        'src/ecs/systems/level-progress-*.js',
        'src/adapters/dom/hud-*.js',
        'src/adapters/dom/screens-*.js',
        'src/adapters/io/storage-*.js',
        'src/adapters/io/audio-*.js',
        'assets/manifests/audio-manifest.json',
        'docs/schemas/audio-manifest.schema.json',
      ]),
    );

    expect(TRACK_OWNERSHIP_RULES.C.testPatterns).toEqual(
      expect.arrayContaining([
        'tests/unit/systems/scoring-*.test.js',
        'tests/unit/systems/timer-*.test.js',
        'tests/unit/systems/life-*.test.js',
        'tests/unit/systems/spawn-*.test.js',
        'tests/unit/systems/pause-*.test.js',
        'tests/unit/systems/level-progress-*.test.js',
        'tests/integration/adapters/hud-*.test.js',
        'tests/integration/adapters/screens-*.test.js',
        'tests/integration/adapters/storage-*.test.js',
        'tests/integration/adapters/audio-*.test.js',
        'tests/integration/gameplay/c-*.test.js',
      ]),
    );
  });

  it('keeps Track D ownership anchored to track deliverables and scoped tests', () => {
    expect(TRACK_OWNERSHIP_RULES.D.patterns).toEqual(
      expect.arrayContaining([
        'src/ecs/resources/**',
        'src/ecs/render-intent.js',
        'src/ecs/systems/render-*.js',
        'src/adapters/dom/renderer-*.js',
        'src/adapters/dom/sprite-pool-*.js',
        'assets/maps/**',
        'assets/manifests/visual-manifest.json',
        'docs/schemas/map.schema.json',
        'docs/schemas/visual-manifest.schema.json',
      ]),
    );

    expect(TRACK_OWNERSHIP_RULES.D.testPatterns).toEqual(
      expect.arrayContaining([
        'tests/unit/resources/**',
        'tests/unit/schema/map-schema.test.js',
        'tests/unit/render-intent/render-intent.test.js',
        'tests/unit/systems/render-*.test.js',
        'tests/integration/adapters/renderer-*.test.js',
        'tests/integration/adapters/sprite-pool-*.test.js',
        'tests/integration/gameplay/d-*.test.js',
      ]),
    );
  });

  it('keeps concrete ownership paths aligned with files that exist in the repository', () => {
    const missingConcretePaths = [];
    const hasGlobToken = /[*?[\]{}]/;

    for (const [trackCode, rule] of Object.entries(TRACK_OWNERSHIP_RULES)) {
      const allPatterns = [...(rule.patterns || []), ...(rule.testPatterns || [])];
      for (const pattern of allPatterns) {
        if (hasGlobToken.test(pattern)) {
          continue;
        }

        if (!fs.existsSync(pattern)) {
          missingConcretePaths.push(`${trackCode}:${pattern}`);
        }
      }
    }

    expect(missingConcretePaths).toEqual([]);
  });
});

describe('policy-utils owner-track validation', () => {
  it('extracts owner from branch name', () => {
    expect(extractOwnerFromBranch('ekaramet/A-03')).toBe('ekaramet');
    expect(extractOwnerFromBranch('asmyrogl/B-02')).toBe('asmyrogl');
    expect(extractOwnerFromBranch('medvall/D-04')).toBe('medvall');
    expect(extractOwnerFromBranch('user.name/C-05')).toBe('user.name');
  });

  it('resolves owner track from branch name and exposes track owners', () => {
    expect(resolveOwnerTrackFromBranch('ekaramet/process-fixes')).toBe('A');
    expect(resolveOwnerTrackFromBranch('asmyrogl/B-02')).toBe('B');
    expect(resolveOwnerTrackFromBranch('unknown/anything')).toBe('');

    expect(getOwnersForTrack('A')).toContain('ekaramet');
    expect(getOwnersForTrack('D')).toContain('medvall');
    expect(getOwnersForTrack('Z')).toEqual([]);
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

describe('policy-utils PR path resolution', () => {
  it('runs PR checks for process mode even without branch ticket id', () => {
    const result = resolvePrPolicyPath({
      branchTicketIds: [],
      commitTicketIds: ['A-04', 'D-03'],
      hasProcessMode: true,
    });

    expect(result.shouldRunPrChecks).toBe(true);
    expect(result.auditMode).toBe('GENERAL_DOCS_PROCESS');
    expect(result.selectedPath).toBe('owner-scoped process checks');
  });

  it('falls back to repo checks only when no ticket metadata and no process marker exist', () => {
    const result = resolvePrPolicyPath({
      branchTicketIds: [],
      commitTicketIds: [],
      hasProcessMode: false,
    });

    expect(result.shouldRunPrChecks).toBe(false);
    expect(result.auditMode).toBe('REPO_FALLBACK');
  });
});

describe('policy-utils branch resolution', () => {
  it('uses CI head ref when preferred branch value is detached HEAD', () => {
    vi.stubEnv('BRANCH_NAME', '');
    vi.stubEnv('EVENT_PATH', '');
    vi.stubEnv('GITHUB_EVENT_PATH', '');
    vi.stubEnv('GITHUB_HEAD_REF', 'ekaramet/process-audit-fixes');

    expect(resolveBranchName('HEAD')).toBe('ekaramet/process-audit-fixes');
  });

  it('uses refs/heads branch fallback when head ref is absent', () => {
    vi.stubEnv('BRANCH_NAME', '');
    vi.stubEnv('EVENT_PATH', '');
    vi.stubEnv('GITHUB_EVENT_PATH', '');
    vi.stubEnv('GITHUB_HEAD_REF', '');
    vi.stubEnv('HEAD_REF', '');
    vi.stubEnv('GITHUB_REF', 'refs/heads/asmyrogl/B-03-runtime-integration');

    expect(resolveBranchName('HEAD')).toBe('asmyrogl/B-03-runtime-integration');
  });
});
describe('policy-utils bugfix branch detection', () => {
  it('identifies bugfix branches for registered owners', () => {
    expect(isBugfixBranch('ekaramet/bugfix-ghost-collision')).toBe(true);
    expect(isBugfixBranch('asmyrogl/bugfix-B-07-timer-race')).toBe(true);
    expect(isBugfixBranch('chbaikas/bugfix-audio-pause-deadlock')).toBe(true);
    expect(isBugfixBranch('medvall/bugfix-visuals')).toBe(true);
  });

  it('rejects bugfix branches for unregistered owners', () => {
    expect(isBugfixBranch('unknown/bugfix-test')).toBe(false);
    expect(isBugfixBranch('newdev/bugfix-something')).toBe(false);
    expect(isBugfixBranch('bugfix-no-owner')).toBe(false);
  });

  it('rejects branches without bugfix- keyword or with invalid format', () => {
    expect(isBugfixBranch('ekaramet/fix-typo')).toBe(false);
    expect(isBugfixBranch('ekaramet/A-03')).toBe(false);
    expect(isBugfixBranch('ekaramet/process-audit')).toBe(false);
    expect(isBugfixBranch('ekaramet/bugfix-')).toBe(false);
  });
});
