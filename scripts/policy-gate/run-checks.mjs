/*
 * Script: run-checks.mjs
 * Purpose: Core verification logic. Enforces branch ticket formatting, ownership scopes, process scopes,
 * audit dependencies, and security boundaries.
 * Implementation Notes: Employs strict string checks and regex heuristics for DOM and Framework boundaries.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertOwnerTrackMatch,
  BANNED_FRAMEWORK_DEPENDENCIES,
  DEFAULT_CHANGED_FILES_PATH,
  describePolicyResolution,
  ECS_DOM_API_RULES,
  EXPLICIT_TICKET_BRANCH_PATTERN,
  extractOwnerFromBranch,
  extractTicketIdFromBranchName,
  FORBIDDEN_TECH_RULES,
  findOwnershipViolations,
  GATE_PASS,
  GATE_WARN,
  getOwnersForTrack,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  inferTracksFromTicketIds,
  matchesOwnership,
  parseArgs,
  readJson,
  readLines,
  readText,
  readTicketIdsFromTracker,
  resolveOwnerTrackFromBranch,
  resolveBranchName,
  SECURITY_SINK_RULES,
  SECURITY_SOURCE_PATTERN,
  SHARED_OWNERSHIP_PATTERNS,
  sortTicketIds,
  TRACK_OWNERSHIP_RULES,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
// Resolve input metadata from CLI arguments or the generated PR meta JSON.
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const changedPath = args['changed-file'] || DEFAULT_CHANGED_FILES_PATH;
const checkSet = args['check-set'] || 'pr';
const validCheckSets = new Set(['pr', 'repo', 'all']);
if (!validCheckSets.has(checkSet)) {
  throw new Error(`Invalid --check-set value "${checkSet}". Expected one of: pr, repo, all.`);
}

const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};
const changedFiles = readLines(changedPath);
const existingChangedFiles = changedFiles.filter((file) => fs.existsSync(file));
const branchName = resolveBranchName(meta.branchName, args['branch-name'], process.env.BRANCH_NAME);
const branchOwner = extractOwnerFromBranch(branchName);
const branchOwnerTrack = resolveOwnerTrackFromBranch(branchName);
const processMode =
  Boolean(meta.processMode) ||
  inferProcessModeFromSources(branchName, meta.commitMessages || '', meta.body || '');

// Ticket context resolution prioritizes explicit CLI and branch ticket IDs to keep checks deterministic.
function deriveTicketContext() {
  // Extract and merge ticket IDs from branch name, commit messages, CLI args, and meta JSON.
  const requireBranchTicket = String(args['require-branch-ticket'] || 'false') === 'true';
  const explicitTicketIds = inferTicketIdsFromSources(
    args['ticket-id'] || '',
    args['ticket-ids'] || '',
  );
  // Try the strict <owner>/<TRACK>-<NN>[-<COMMENT>] pattern first, then fall back to general extraction.
  const explicitBranchTicketId = extractTicketIdFromBranchName(branchName);
  const branchTicketIds = explicitBranchTicketId
    ? [explicitBranchTicketId]
    : inferTicketIdsFromSources(branchName);
  const commitTicketIds = inferTicketIdsFromSources(meta.commitMessages || '');
  const metaTicketIds = Array.isArray(meta.ticketIds) ? meta.ticketIds : [];
  const ticketIds =
    requireBranchTicket && !processMode && explicitBranchTicketId
      ? sortTicketIds([...explicitTicketIds, explicitBranchTicketId])
      : sortTicketIds([
          ...explicitTicketIds,
          ...metaTicketIds,
          ...branchTicketIds,
          ...commitTicketIds,
        ]);
  const trackCodes = inferTracksFromTicketIds(ticketIds);

  if (
    requireBranchTicket &&
    !processMode &&
    branchName &&
    !EXPLICIT_TICKET_BRANCH_PATTERN.test(branchName)
  ) {
    throw new Error(
      [
        `Branch "${branchName}" does not follow the required ticket format.`,
        'Expected: <owner-or-scope>/<TRACK>-<NN>[-<COMMENT>], for example ekaramet/A-03 or asmyrogl/B-03-runtime-integration.',
        'Allowed track prefixes: A, B, C, D.',
        'Action: Rename your branch using the format <owner-or-scope>/<TRACK>-<NN>[-<COMMENT>] (e.g., git branch -m new-branch-name).',
      ].join('\n'),
    );
  }

  return {
    branchTicketIds,
    commitTicketIds,
    ticketIds,
    trackCodes,
  };
}

// Association checks enforce one-track ownership so cross-track branches are split before review.
function assertTicketAssociation() {
  const context = deriveTicketContext();

  function createProcessFallback(message, originalTicketIds = []) {
    console.warn(`\n${GATE_WARN} — POLICY WARNING: ${message}\n`);
    return {
      branchTicketIds: context.branchTicketIds,
      commitTicketIds: context.commitTicketIds,
      ticketIds: originalTicketIds,
      trackCode: 'GENERAL',
      processMode: true,
      processMarkerDetected: true,
    };
  }

  if (context.ticketIds.length === 0 && !processMode) {
    throw new Error(
      [
        'No ticket ID found in branch name or branch commit messages.',
        'Expected branch naming or branch commits to include a ticket ID such as A-01, B-12, C-03, or D-11.',
        'Action: include a valid ticket ID in the branch name or at least one branch commit message.',
      ].join('\n'),
    );
  }

  if (context.ticketIds.length === 0 && processMode) {
    return createProcessFallback(
      'No ticket ID found in branch or commit metadata. Continuing because a "process" marker was detected.',
      [],
    );
  }

  if (context.trackCodes.length !== 1) {
    if (processMode) {
      return createProcessFallback(
        [
          'Track Association Conflict Detected.',
          `The branch contains ticket IDs from multiple tracks: ${context.trackCodes.join(', ')}.`,
          'Normally, this would require splitting the branch into track-specific PRs.',
          '',
          'PROCEEDING IN OWNER-SCOPED PROCESS MODE:',
          'A "process" marker was detected, so the gate will allow this ticket-track conflict but will still',
          'enforce changed-file ownership against the branch owner track.',
          '',
          `Detected ticket IDs: ${context.ticketIds.join(', ')}`,
        ].join('\n'),
        context.ticketIds,
      );
    }

    throw new Error(
      [
        `Ticket IDs resolve to ${context.trackCodes.length} tracks: ${context.trackCodes.join(', ') || '(none)'}.`,
        `Detected ticket IDs: ${context.ticketIds.join(', ')}.`,
        'Action: keep one ticket track per branch or split the branch into separate track-specific PRs.',
      ].join('\n'),
    );
  }

  const trackerPath = String(
    args['ticket-tracker-file'] || 'docs/implementation/ticket-tracker.md',
  );
  const resolvedTicketIds = readTicketIdsFromTracker(trackerPath);

  if (resolvedTicketIds.length > 0) {
    const knownSet = new Set(resolvedTicketIds);
    const unknownTicketIds = context.ticketIds.filter((ticketId) => !knownSet.has(ticketId));
    if (unknownTicketIds.length > 0) {
      if (processMode) {
        return createProcessFallback(
          [
            'Process marker detected with non-resolvable ticket IDs; continuing in GENERAL_DOCS_PROCESS mode.',
            `Unknown ticket IDs in tracker: ${unknownTicketIds.join(', ')}.`,
            `Detected ticket IDs: ${context.ticketIds.join(', ')}.`,
          ].join('\n'),
        );
      }

      throw new Error(
        [
          `Detected ticket IDs are not present in ${trackerPath}: ${unknownTicketIds.join(', ')}.`,
          `Detected ticket IDs: ${context.ticketIds.join(', ')}.`,
          `Action: use a ticket ID from ${trackerPath} or update the ticket list first.`,
        ].join('\n'),
      );
    }
  } else {
    console.warn(`${GATE_WARN} — Ticket list has no discoverable ticket IDs in ${trackerPath}.`);
  }

  return {
    branchTicketIds: context.branchTicketIds,
    commitTicketIds: context.commitTicketIds,
    ticketIds: context.ticketIds,
    trackCode: context.trackCodes[0],
    processMode: false,
    processMarkerDetected: processMode,
  };
}

function describeFileOwnership(file) {
  const actualTracks = [];
  if (matchesOwnership(file, SHARED_OWNERSHIP_PATTERNS)) {
    actualTracks.push('Shared');
  } else {
    for (const [key, rule] of Object.entries(TRACK_OWNERSHIP_RULES)) {
      const rules = [...(rule.patterns || []), ...(rule.testPatterns || [])];
      if (matchesOwnership(file, rules)) {
        const owners = getOwnersForTrack(key);
        const ownerLabel = owners.length > 0 ? owners.join(', ') : 'unassigned';
        actualTracks.push(`Track ${key} (owner: ${ownerLabel})`);
      }
    }
  }

  return actualTracks.length > 0 ? actualTracks.join(', ') : 'Unknown Track';
}

function formatOwnershipViolations(violations) {
  return violations.map((file) => `- ${file} (Belongs to: ${describeFileOwnership(file)})`);
}

// Ownership enforcement uses path patterns instead of AST analysis to keep policy checks lightweight.
function assertTrackOwnership(trackCode, ticketIds) {
  if (existingChangedFiles.length === 0) {
    console.warn(
      `${GATE_WARN} — No changed files found in changed-files context. Skipping ownership path validation.`,
    );
    return;
  }

  // Validate that the branch owner is authorized for this track.
  assertOwnerTrackMatch(trackCode, branchName);

  const result = findOwnershipViolations(trackCode, existingChangedFiles);
  if (result.violations.length === 0) {
    console.log(
      `${GATE_PASS} — Ownership check for track ${trackCode} from tickets ${ticketIds.join(', ')} (${existingChangedFiles.length} existing changed file(s)).`,
    );
    return;
  }

  const allowedSummary = result.allowedPatterns.join(', ');

  throw new Error(
    [
      `Ownership violation for ${result.trackName || `Track ${trackCode}`}.`,
      `Tickets: ${ticketIds.join(', ')}.`,
      'The following changed files are outside allowed ownership patterns for the current track:',
      ...formatOwnershipViolations(result.violations),
      `Allowed path patterns for this track: ${allowedSummary}`,
      'Action: move out-of-scope file changes to the correct track branch, or use a ticket that matches the modified ownership area.',
    ].join('\n'),
  );
}

function assertOwnerScopedOwnership(ticketIds) {
  if (!branchOwner) {
    throw new Error(
      [
        'GENERAL_DOCS_PROCESS ownership validation failed: unable to infer branch owner.',
        `Branch name: "${branchName || '(empty)'}"`,
        'Expected branch format: <owner>/<slug-or-ticket>.',
        'Action: rename the branch so the owner prefix is present (for example: ekaramet/process-audit-fixes).',
      ].join('\n'),
    );
  }

  if (!branchOwnerTrack) {
    throw new Error(
      [
        'GENERAL_DOCS_PROCESS ownership validation failed: branch owner is not registered.',
        `Branch owner: "${branchOwner}"`,
        'Action: add the owner to OWNER_TRACK_MAPPING in scripts/policy-gate/lib/policy-utils.mjs so ownership checks can resolve a track.',
      ].join('\n'),
    );
  }

  const result = findOwnershipViolations(branchOwnerTrack, existingChangedFiles);
  if (result.violations.length === 0) {
    console.log(
      `${GATE_PASS} — Owner-scoped ownership check for ${branchOwner} (Track ${branchOwnerTrack}) with ${existingChangedFiles.length} existing changed file(s).`,
    );
    return;
  }

  const owners = getOwnersForTrack(branchOwnerTrack);
  const ownerList = owners.length > 0 ? owners.join(', ') : branchOwner;
  throw new Error(
    [
      `GENERAL_DOCS_PROCESS ownership violation for branch owner "${branchOwner}" (Track ${branchOwnerTrack}).`,
      `Owner track maintainers: ${ownerList}.`,
      `Context ticket IDs (informational): ${ticketIds.length > 0 ? ticketIds.join(', ') : '(none)'}.`,
      'The following changed files are outside allowed ownership patterns for this owner track:',
      ...formatOwnershipViolations(result.violations),
      `Allowed path patterns for Track ${branchOwnerTrack}: ${result.allowedPatterns.join(', ')}`,
      `Action: keep changes within Track ${branchOwnerTrack} ownership, or use a branch owned by the matching track owner.`,
    ].join('\n'),
  );
}

// Canonical ranges guard against matrix drift when requirement/audit IDs are edited manually.
function buildIdRange(prefix, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || end < start) {
    throw new Error(
      [
        `Invalid ID range for ${prefix}: ${start}..${end}.`,
        'Action: Check the numeric bounds provided to buildIdRange.',
      ].join('\n'),
    );
  }

  return Array.from({ length: end - start + 1 }, (_, offset) => {
    return `${prefix}-${String(start + offset).padStart(2, '0')}`;
  });
}

function collectUniqueMatches(text, pattern) {
  return [...new Set(text.match(pattern) || [])].sort();
}

function collectExpectedRequirementIds(matrixText) {
  const { requirementIds } = collectMatrixTraceabilityIds(matrixText);
  if (requirementIds.length === 0) {
    throw new Error(
      [
        'Unable to derive requirement IDs from docs/implementation/audit-traceability-matrix.md.',
        'Action: Add explicit REQ-xx rows to the traceability matrix table.',
      ].join('\n'),
    );
  }

  const numericIds = requirementIds.map((id) => Number(id.split('-')[1]));
  const min = Math.min(...numericIds);
  const max = Math.max(...numericIds);
  const contiguousIds = buildIdRange('REQ', min, max);

  if (requirementIds.length !== contiguousIds.length) {
    throw new Error(
      [
        'Requirement IDs in docs/implementation/audit-traceability-matrix.md must be contiguous REQ-xx rows without gaps.',
        `Detected gap in range from ${min} to ${max}.`,
        'Action: Review the bounds and ensure every REQ-xx id is present in the document sequentially.',
      ].join('\n'),
    );
  }

  for (let index = 0; index < requirementIds.length; index += 1) {
    if (requirementIds[index] !== contiguousIds[index]) {
      throw new Error(
        [
          'Requirement IDs in docs/implementation/audit-traceability-matrix.md must be ordered and gap-free.',
          `Mismatched sequence at position ${index}: expected ${contiguousIds[index]}, found ${requirementIds[index]}.`,
          'Action: Sort the requirement IDs in ascending order without gaps.',
        ].join('\n'),
      );
    }
  }

  return requirementIds;
}

function collectExpectedAuditIds(auditText) {
  const explicitIds = collectUniqueMatches(auditText, /AUDIT-[FB]-\d{2}/g);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const lines = auditText.split(/\r?\n/);
  let section = '';
  let functionalCount = 0;
  let bonusCount = 0;

  for (const line of lines) {
    if (/^####\s+Functional\b/i.test(line)) {
      section = 'functional';
      continue;
    }
    if (/^####\s+Bonus\b/i.test(line)) {
      section = 'bonus';
      continue;
    }
    if (!/^######\s+/.test(line)) {
      continue;
    }

    if (section === 'functional') {
      functionalCount += 1;
    } else if (section === 'bonus') {
      bonusCount += 1;
    }
  }

  if (functionalCount === 0 && bonusCount === 0) {
    throw new Error(
      [
        'Unable to derive audit IDs from docs/audit.md.',
        'Action: Add explicit AUDIT IDs or keep canonical functional/bonus question headings.',
      ].join('\n'),
    );
  }

  return [
    ...buildIdRange('AUDIT-F', 1, functionalCount),
    ...buildIdRange('AUDIT-B', 1, bonusCount),
  ];
}

function collectMatrixTraceabilityIds(matrixText) {
  const requirementIds = new Set();
  const auditIds = new Set();

  for (const line of matrixText.split(/\r?\n/)) {
    const reqMatch = line.match(/^\|\s*(REQ-\d{2})\s*\|/);
    if (reqMatch) {
      requirementIds.add(reqMatch[1]);
    }

    const auditMatch = line.match(/^\|\s*(AUDIT-[FB]-\d{2})\s*\|/);
    if (auditMatch) {
      auditIds.add(auditMatch[1]);
    }
  }

  return {
    requirementIds: [...requirementIds].sort(),
    auditIds: [...auditIds].sort(),
  };
}

// Traceability verification ensures docs/audit.md and matrix rows remain synchronized for gate reliability.
function verifyTraceabilityCoverage() {
  // Read canonical audit requirement sources and cross-check the traceability matrix.
  const auditText = readText('docs/audit.md');
  const matrixText = readText('docs/implementation/audit-traceability-matrix.md');

  const expectedRequirementIds = collectExpectedRequirementIds(matrixText);
  const expectedAuditIds = collectExpectedAuditIds(auditText);
  const matrixIds = collectMatrixTraceabilityIds(matrixText);

  const matrixRequirementSet = new Set(matrixIds.requirementIds);
  const matrixAuditSet = new Set(matrixIds.auditIds);
  const expectedRequirementSet = new Set(expectedRequirementIds);
  const expectedAuditSet = new Set(expectedAuditIds);

  const missingRequirements = expectedRequirementIds.filter((id) => !matrixRequirementSet.has(id));
  const extraRequirements = matrixIds.requirementIds.filter(
    (id) => !expectedRequirementSet.has(id),
  );
  const missingAuditIds = expectedAuditIds.filter((id) => !matrixAuditSet.has(id));
  const extraAuditIds = matrixIds.auditIds.filter((id) => !expectedAuditSet.has(id));

  const mismatches = [];
  if (missingRequirements.length > 0) {
    mismatches.push(
      `Missing requirement IDs in docs/implementation/audit-traceability-matrix.md: ${missingRequirements.join(', ')}`,
    );
  }
  if (extraRequirements.length > 0) {
    mismatches.push(
      `Unexpected requirement IDs in docs/implementation/audit-traceability-matrix.md: ${extraRequirements.join(', ')}`,
    );
  }
  if (missingAuditIds.length > 0) {
    mismatches.push(
      `Missing audit IDs in docs/implementation/audit-traceability-matrix.md: ${missingAuditIds.join(', ')}`,
    );
  }
  if (extraAuditIds.length > 0) {
    mismatches.push(
      `Unexpected audit IDs in docs/implementation/audit-traceability-matrix.md: ${extraAuditIds.join(', ')}`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      [
        'Traceability matrix coverage violation:',
        ...mismatches,
        'Action: Synchronize docs/implementation/audit-traceability-matrix.md with docs/audit.md to ensure all requirements and audits are mapped correctly.',
      ].join('\n'),
    );
  }
}

async function loadAuditQuestionMapModule() {
  const modulePath = path.resolve('tests/e2e/audit/audit-question-map.js');
  if (!fs.existsSync(modulePath)) {
    throw new Error(
      [
        'Missing tests/e2e/audit/audit-question-map.js.',
        'Action: Restore the canonical audit question map used by audit tests and policy gates.',
      ].join('\n'),
    );
  }

  return import(pathToFileURL(modulePath).href);
}

function assertNumericThreshold(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(
      [
        `Invalid threshold value for ${label}: ${String(value)}.`,
        'Action: Set an explicit finite numeric threshold in tests/e2e/audit/audit-question-map.js.',
      ].join('\n'),
    );
  }
}

async function verifyAuditExecutionObligations() {
  const module = await loadAuditQuestionMapModule();
  const questions = Array.isArray(module.AUDIT_QUESTIONS) ? module.AUDIT_QUESTIONS : [];
  const executionSplit = module.AUDIT_EXECUTION_SPLIT || {};
  const semiThresholds = module.SEMI_AUTOMATABLE_THRESHOLDS || {};
  const manualEvidenceIds = Array.isArray(module.MANUAL_EVIDENCE_AUDIT_IDS)
    ? module.MANUAL_EVIDENCE_AUDIT_IDS
    : [];
  const manifestPath =
    typeof module.MANUAL_EVIDENCE_MANIFEST_PATH === 'string'
      ? module.MANUAL_EVIDENCE_MANIFEST_PATH
      : 'docs/audit-reports/manual-evidence.manifest.json';

  const fullyAutomatableCount = questions.filter(
    (question) => question.executionType === 'Fully Automatable',
  ).length;
  const semiAutomatableCount = questions.filter(
    (question) => question.executionType === 'Semi-Automatable',
  ).length;
  const manualWithEvidenceCount = questions.filter(
    (question) => question.executionType === 'Manual-With-Evidence',
  ).length;

  if (questions.length !== executionSplit.total) {
    throw new Error(
      [
        'Audit question inventory mismatch in tests/e2e/audit/audit-question-map.js.',
        `Expected total ${executionSplit.total}, found ${questions.length}.`,
        'Action: Keep audit-question-map.js aligned with docs/audit.md and the declared execution split.',
      ].join('\n'),
    );
  }

  if (fullyAutomatableCount !== executionSplit.fullyAutomatable) {
    throw new Error(
      [
        'Fully automatable audit category mismatch.',
        `Expected ${executionSplit.fullyAutomatable}, found ${fullyAutomatableCount}.`,
        'Action: Correct executionType assignments in tests/e2e/audit/audit-question-map.js.',
      ].join('\n'),
    );
  }

  if (semiAutomatableCount !== executionSplit.semiAutomatable) {
    throw new Error(
      [
        'Semi-automatable audit category mismatch.',
        `Expected ${executionSplit.semiAutomatable}, found ${semiAutomatableCount}.`,
        'Action: Correct executionType assignments in tests/e2e/audit/audit-question-map.js.',
      ].join('\n'),
    );
  }

  if (manualWithEvidenceCount !== executionSplit.manualWithEvidence) {
    throw new Error(
      [
        'Manual-with-evidence audit category mismatch.',
        `Expected ${executionSplit.manualWithEvidence}, found ${manualWithEvidenceCount}.`,
        'Action: Correct executionType assignments in tests/e2e/audit/audit-question-map.js.',
      ].join('\n'),
    );
  }

  for (const requiredSemiId of ['AUDIT-F-17', 'AUDIT-F-18', 'AUDIT-B-05']) {
    const question = questions.find((candidate) => candidate.id === requiredSemiId);
    if (!question) {
      throw new Error(
        [
          `Missing semi-automatable audit ID: ${requiredSemiId}.`,
          'Action: Add the missing audit question entry to tests/e2e/audit/audit-question-map.js.',
        ].join('\n'),
      );
    }

    const thresholds = semiThresholds[requiredSemiId] || question.thresholds;
    if (!thresholds || typeof thresholds !== 'object') {
      throw new Error(
        [
          `Missing threshold definition for ${requiredSemiId}.`,
          'Action: Provide explicit thresholds in SEMI_AUTOMATABLE_THRESHOLDS and reference them from the audit question entry.',
        ].join('\n'),
      );
    }

    if (requiredSemiId === 'AUDIT-F-17') {
      assertNumericThreshold(thresholds.minFrameSamples, 'AUDIT-F-17.minFrameSamples');
      assertNumericThreshold(thresholds.maxP95FrameTimeMs, 'AUDIT-F-17.maxP95FrameTimeMs');
      assertNumericThreshold(thresholds.maxP99FrameTimeMs, 'AUDIT-F-17.maxP99FrameTimeMs');
    } else if (requiredSemiId === 'AUDIT-F-18') {
      assertNumericThreshold(thresholds.minFrameSamples, 'AUDIT-F-18.minFrameSamples');
      assertNumericThreshold(thresholds.minP95Fps, 'AUDIT-F-18.minP95Fps');
    } else if (requiredSemiId === 'AUDIT-B-05') {
      assertNumericThreshold(thresholds.maxLongTaskCount, 'AUDIT-B-05.maxLongTaskCount');
      assertNumericThreshold(thresholds.maxLongTaskMs, 'AUDIT-B-05.maxLongTaskMs');
      assertNumericThreshold(thresholds.sampleWindowMs, 'AUDIT-B-05.sampleWindowMs');
    }
  }

  const manifestAbsolutePath = path.resolve(manifestPath);
  if (!fs.existsSync(manifestAbsolutePath)) {
    throw new Error(
      [
        `Missing manual evidence manifest: ${manifestPath}.`,
        'Action: Add docs/audit-reports/manual-evidence.manifest.json and include entries for manual audit IDs.',
      ].join('\n'),
    );
  }

  const manifest = readJson(manifestAbsolutePath);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

  for (const auditId of manualEvidenceIds) {
    const entry = entries.find((candidate) => candidate.auditId === auditId);
    if (!entry) {
      throw new Error(
        [
          `Missing manual evidence entry for ${auditId} in ${manifestPath}.`,
          'Action: Add an entry with executionType and requiredArtifacts for this audit ID.',
        ].join('\n'),
      );
    }

    if (entry.executionType !== 'Manual-With-Evidence') {
      throw new Error(
        [
          `Invalid executionType for ${auditId} in ${manifestPath}.`,
          'Action: Set executionType to "Manual-With-Evidence".',
        ].join('\n'),
      );
    }

    if (!Array.isArray(entry.requiredArtifacts) || entry.requiredArtifacts.length === 0) {
      throw new Error(
        [
          `Missing requiredArtifacts for ${auditId} in ${manifestPath}.`,
          'Action: Add at least one artifact path for the manual evidence obligation.',
        ].join('\n'),
      );
    }

    for (const artifact of entry.requiredArtifacts) {
      const artifactPath = typeof artifact?.path === 'string' ? artifact.path : '';
      if (!artifactPath) {
        throw new Error(
          [
            `Invalid artifact path for ${auditId} in ${manifestPath}.`,
            'Action: Every requiredArtifacts entry must include a non-empty path string.',
          ].join('\n'),
        );
      }

      if (!fs.existsSync(path.resolve(artifactPath))) {
        throw new Error(
          [
            `Missing manual evidence artifact for ${auditId}: ${artifactPath}.`,
            'Action: Add the referenced artifact file or fix the artifact path.',
          ].join('\n'),
        );
      }
    }
  }

  const phaseReport = readText('docs/audit-reports/phase-testing-verification-report.md');
  if (!phaseReport.includes('docs/audit-reports/manual-evidence.manifest.json')) {
    throw new Error(
      [
        'Phase testing report is missing manual evidence manifest guidance.',
        'Action: Reference docs/audit-reports/manual-evidence.manifest.json in docs/audit-reports/phase-testing-verification-report.md.',
      ].join('\n'),
    );
  }

  const traceabilityMatrix = readText('docs/implementation/audit-traceability-matrix.md');
  if (/placeholder/i.test(traceabilityMatrix)) {
    throw new Error(
      [
        'Traceability matrix still references placeholder audit execution.',
        'Action: Update docs/implementation/audit-traceability-matrix.md to describe executable audit checks.',
      ].join('\n'),
    );
  }
}

function mapsEqual(left, right) {
  const leftEntries = Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (let index = 0; index < leftEntries.length; index += 1) {
    if (leftEntries[index][0] !== rightEntries[index][0]) {
      return false;
    }
    if (leftEntries[index][1] !== rightEntries[index][1]) {
      return false;
    }
  }

  return true;
}

function enforceAuditAndDependencyPairing() {
  const changed = new Set(changedFiles);
  const touchesPrefix = (prefix) => changedFiles.some((file) => file.startsWith(prefix));
  const has = (file) => changed.has(file);

  // Verify package.json and package-lock.json changed together to prevent lockfile drift.
  const packageJsonChanged = has('package.json');
  const packageLockChanged = has('package-lock.json');
  if (!packageJsonChanged && packageLockChanged) {
    throw new Error(
      [
        'package.json and package-lock.json must change together.',
        'Action: If you updated package-lock.json manually, ensure package.json reflects the matching changes or revert it.',
      ].join('\n'),
    );
  }

  if (packageJsonChanged && !packageLockChanged) {
    if (!fs.existsSync('package-lock.json')) {
      throw new Error(
        [
          'package-lock.json is required when package.json is present.',
          'Action: Run `npm install` and commit the generated package-lock.json.',
        ].join('\n'),
      );
    }

    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');
    const lockRoot = packageLock.packages?.[''] ?? {};

    const manifestDependencies = packageJson.dependencies ?? {};
    const manifestDevDependencies = packageJson.devDependencies ?? {};
    const lockDependencies = lockRoot.dependencies ?? packageLock.dependencies ?? {};
    const lockDevDependencies = lockRoot.devDependencies ?? {};

    const dependencyMismatch =
      !mapsEqual(manifestDependencies, lockDependencies) ||
      !mapsEqual(manifestDevDependencies, lockDevDependencies);

    if (dependencyMismatch) {
      throw new Error(
        [
          'Dependency manifest drift detected.',
          'File package.json changed without synchronized package-lock.json updates.',
          'Action: Run `npm install` to update package-lock.json and commit the result.',
        ].join('\n'),
      );
    }
  }

  const touchesAuditDocs = has('docs/audit.md');
  const touchesRequirements = has('docs/requirements.md');
  const touchesGameDescription = has('docs/game-description.md');
  const touchesTraceability = has('docs/implementation/audit-traceability-matrix.md');
  const touchesAuditTests = touchesPrefix('tests/e2e/audit/');

  if (touchesAuditDocs || touchesRequirements || touchesGameDescription || touchesAuditTests) {
    const required = [];
    if (!touchesTraceability) required.push('docs/implementation/audit-traceability-matrix.md');
    if (!touchesAuditTests) required.push('tests/e2e/audit/');
    if (
      (touchesAuditDocs || touchesRequirements || touchesGameDescription) &&
      !has('docs/audit.md')
    ) {
      required.push('docs/audit.md');
    }
    if (required.length) {
      throw new Error(
        [
          'Audit-related doc or test drift violation.',
          `The active branch changed audit docs/tests, which requires coordinated updates on the following paths: ${required.join(', ')}`,
          'Action: Include changes to all required audit or traceability files in the same branch to keep validation synchronized.',
        ].join('\n'),
      );
    }
  }

  const auditDoc = readText('docs/audit.md');
  const auditMap = readText('tests/e2e/audit/audit-question-map.js');

  const auditCount = (auditDoc.match(/^######\s+/gm) || []).length;
  const idMatches = auditMap.match(/id:\s*'AUDIT-[A-Z]-\d{2}'/g) || [];
  const auditIds = idMatches.length;
  const uniqueAuditIds = new Set(idMatches).size;

  if (auditCount !== auditIds || auditIds !== uniqueAuditIds) {
    throw new Error(
      [
        'Audit inventory mismatch between docs/audit.md and tests/e2e/audit/audit-question-map.js.',
        `Details: docs/audit.md has ${auditCount} questions. audit-question-map.js has ${auditIds} IDs (unique: ${uniqueAuditIds}).`,
        'Action: Ensure every question in docs/audit.md has an entry in tests/e2e/audit/audit-question-map.js and IDs are unique.',
      ].join('\n'),
    );
  }
}

function scanSecurityAndArchitectureBoundaries() {
  const forbiddenPatterns = [...FORBIDDEN_TECH_RULES, ...SECURITY_SINK_RULES];

  for (const file of changedFiles) {
    if (path.basename(file) === 'package.json') {
      if (!fs.existsSync(file)) {
        continue;
      }

      const packageJson = readJson(file);
      const deps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      for (const banned of BANNED_FRAMEWORK_DEPENDENCIES) {
        if (deps[banned]) {
          throw new Error(
            [
              `Banned framework dependency detected in package.json: ${banned}.`,
              'Action: Remove the framework dependency to comply with project constraints (Vanilla DOM/ECS).',
            ].join('\n'),
          );
        }
      }

      continue;
    }

    if (!SECURITY_SOURCE_PATTERN.test(file)) {
      continue;
    }

    if (!fs.existsSync(file)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const normalizedPath = file.replaceAll('\\', '/');

    const isSystemFile = normalizedPath.startsWith('src/ecs/systems/');
    const isRenderSystem = normalizedPath === 'src/ecs/systems/render-dom-system.js';

    // Reject any unsafe sinks unconditionally across all source files.
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(content)) {
        throw new Error(
          [
            `Unsafe sink or forbidden API found in file: ${file}`,
            `Matched rule: ${rule.name}`,
            `Matched pattern: ${rule.pattern}`,
            'Action: Use safe DOM APIs (e.g., textContent, classList) or predefined abstractions instead of innerHTML/eval.',
          ].join('\n'),
        );
      }
    }

    if (isSystemFile && !isRenderSystem) {
      for (const pattern of ECS_DOM_API_RULES) {
        if (pattern.test(content)) {
          throw new Error(
            [
              `DOM boundary violation in ECS system file: ${file}`,
              `Matched pattern: ${pattern}`,
              'Action: DO NOT mutate DOM in simulation systems. Move DOM logic to an adapter or src/ecs/systems/render-dom-system.js.',
            ].join('\n'),
          );
        }
      }
    }
  }
}

function assertGeneratedArtifactsUntracked() {
  const listResult = spawnSync('git', ['ls-files', '--', 'coverage', 'test-results'], {
    encoding: 'utf8',
  });

  if (listResult.error) {
    throw new Error(
      [
        `Unable to verify generated artifact tracking status: ${listResult.error.message}`,
        'Action: Ensure git is available in PATH and rerun policy checks.',
      ].join('\n'),
    );
  }

  if (listResult.status !== 0) {
    throw new Error(
      [
        'Unable to verify generated artifact tracking status via git ls-files.',
        `Exit code: ${listResult.status}`,
        'Action: Run from the repository root with a valid git worktree.',
      ].join('\n'),
    );
  }

  const trackedArtifacts = String(listResult.stdout || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (trackedArtifacts.length > 0) {
    throw new Error(
      [
        'Generated artifact tracking violation: coverage/ and test-results/ must not be tracked.',
        ...trackedArtifacts.map((entry) => `- ${entry}`),
        'Action: Remove generated files from git tracking (git rm --cached ...) and keep them ignored.',
      ].join('\n'),
    );
  }
}

assertGeneratedArtifactsUntracked();
verifyTraceabilityCoverage();
await verifyAuditExecutionObligations();

const hasPrContextArtifacts = fs.existsSync(metaPath) && fs.existsSync(changedPath);
if (checkSet === 'pr' && !hasPrContextArtifacts) {
  console.warn(
    `${GATE_WARN} — PR context artifacts are missing (${metaPath}, ${changedPath}); falling back to repo-style checks.`,
  );

  enforceAuditAndDependencyPairing();
  scanSecurityAndArchitectureBoundaries();
  console.log(`${GATE_PASS} — Policy checks completed for pr checks (repo fallback mode).`);
  process.exit(0);
}

if (checkSet === 'repo' || checkSet === 'all') {
  enforceAuditAndDependencyPairing();
}

if (checkSet === 'pr' || checkSet === 'all') {
  const ticketContext = assertTicketAssociation();
  const effectiveTrack = ticketContext.processMode
    ? branchOwnerTrack || ticketContext.trackCode
    : ticketContext.trackCode;
  console.log(
    describePolicyResolution({
      auditMode: ticketContext.processMode ? 'GENERAL_DOCS_PROCESS' : 'TICKET',
      branchTicketIds: ticketContext.branchTicketIds,
      commitTicketIds: ticketContext.commitTicketIds,
      owner: branchOwner,
      ownerTrack: branchOwnerTrack,
      processMarkerDetected: ticketContext.processMarkerDetected,
      selectedPath: ticketContext.processMode
        ? 'owner-scoped process checks'
        : 'ticketed ownership checks',
      ticketIds: ticketContext.ticketIds,
      trackCode: effectiveTrack,
    }),
  );
  if (ticketContext.processMode) {
    assertOwnerScopedOwnership(ticketContext.ticketIds);
  } else {
    assertTrackOwnership(ticketContext.trackCode, ticketContext.ticketIds);
  }
  scanSecurityAndArchitectureBoundaries();
}

console.log(`${GATE_PASS} — Policy checks completed for ${checkSet} checks.`);
