import fs from 'node:fs';
import path from 'node:path';
import {
  describePolicyResolution,
  EXPLICIT_TICKET_BRANCH_PATTERN,
  extractTicketIdFromBranchName,
  findOwnershipViolations,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  inferTracksFromTicketIds,
  matchesOwnership,
  parseArgs,
  readJson,
  readLines,
  readText,
  readTicketIdsFromTracker,
  sortTicketIds,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const changedPath = args['changed-file'] || 'changed-files.txt';
const checkSet = args['check-set'] || 'pr';
const validCheckSets = new Set(['pr', 'repo', 'all']);
if (!validCheckSets.has(checkSet)) {
  throw new Error(`Invalid --check-set value "${checkSet}". Expected one of: pr, repo, all.`);
}

const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};
const changedFiles = readLines(changedPath);
const processMode =
  Boolean(meta.processMode) ||
  inferProcessModeFromSources(meta.branchName || '', meta.commitMessages || '', meta.body || '');

const PROCESS_SCOPE_PATTERNS = [
  'AGENTS.md',
  'README.md',
  '.github/**',
  '.gitea/**',
  'docs/**',
  'scripts/policy-gate/**',
  'changed-files.txt',
];

function deriveTicketContext() {
  const branchName = meta.branchName || '';
  const requireBranchTicket = String(args['require-branch-ticket'] || 'false') === 'true';
  const explicitTicketIds = inferTicketIdsFromSources(
    args['ticket-id'] || '',
    args['ticket-ids'] || '',
  );
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
        'Expected: <owner-or-scope>/<TRACK>-<NN>, for example ekaramet/A-03.',
        'Allowed track prefixes: A, B, C, D.',
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

function assertTicketAssociation() {
  const context = deriveTicketContext();

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
    console.warn(
      'No ticket ID found in branch or commit metadata. Continuing because a process marker was detected.',
    );
  }

  if (context.ticketIds.length === 0) {
    return {
      ticketIds: [],
      trackCode: 'GENERAL',
      processMode: true,
    };
  }

  if (context.trackCodes.length !== 1) {
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
      throw new Error(
        [
          `Detected ticket IDs are not present in ${trackerPath}: ${unknownTicketIds.join(', ')}.`,
          `Detected ticket IDs: ${context.ticketIds.join(', ')}.`,
          `Action: use a ticket ID from ${trackerPath} or update the ticket list first.`,
        ].join('\n'),
      );
    }
  } else {
    console.warn(`Ticket list has no discoverable ticket IDs in ${trackerPath}.`);
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

function assertProcessScope() {
  const violations = changedFiles.filter((file) => !matchesOwnership(file, PROCESS_SCOPE_PATTERNS));

  if (violations.length === 0) {
    console.log(`Process-scope check passed (${changedFiles.length} changed file(s)).`);
    return;
  }

  throw new Error(
    [
      'GENERAL_DOCS_PROCESS scope violation.',
      'The following changed files are outside allowed docs/process/governance areas:',
      ...violations.map((file) => `- ${file}`),
      `Allowed path patterns: ${PROCESS_SCOPE_PATTERNS.join(', ')}`,
      'Action: remove product/runtime changes from the process branch or move them to a ticketed branch.',
    ].join('\n'),
  );
}

function assertTrackOwnership(trackCode, ticketIds) {
  if (changedFiles.length === 0) {
    console.warn(
      'No changed files found in changed-files context. Skipping ownership path validation.',
    );
    return;
  }

  const result = findOwnershipViolations(trackCode, changedFiles);
  if (result.violations.length === 0) {
    console.log(
      `Ownership check passed for track ${trackCode} from tickets ${ticketIds.join(', ')} (${changedFiles.length} changed file(s)).`,
    );
    return;
  }

  const allowedSummary = result.allowedPatterns.join(', ');
  throw new Error(
    [
      `Ownership violation for ${result.trackName || `Track ${trackCode}`}.`,
      `Tickets: ${ticketIds.join(', ')}.`,
      'The following changed files are outside allowed ownership:',
      ...result.violations.map((file) => `- ${file}`),
      `Allowed path patterns for this track: ${allowedSummary}`,
      'Action: move out-of-scope file changes to the correct track branch, or use a ticket that matches the modified ownership area.',
    ].join('\n'),
  );
}

function buildIdRange(prefix, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || end < start) {
    throw new Error(`Invalid ID range for ${prefix}: ${start}..${end}`);
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
      'Unable to derive requirement IDs from docs/implementation/audit-traceability-matrix.md. Add explicit REQ-xx rows there.',
    );
  }

  const numericIds = requirementIds.map((id) => Number(id.split('-')[1]));
  const min = Math.min(...numericIds);
  const max = Math.max(...numericIds);
  const contiguousIds = buildIdRange('REQ', min, max);

  if (requirementIds.length !== contiguousIds.length) {
    throw new Error(
      'Requirement IDs in docs/implementation/audit-traceability-matrix.md must be contiguous REQ-xx rows without gaps.',
    );
  }

  for (let index = 0; index < requirementIds.length; index += 1) {
    if (requirementIds[index] !== contiguousIds[index]) {
      throw new Error(
        'Requirement IDs in docs/implementation/audit-traceability-matrix.md must be ordered and gap-free.',
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
      'Unable to derive audit IDs from docs/audit.md. Add explicit AUDIT IDs or keep canonical functional/bonus question headings.',
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

function verifyTraceabilityCoverage() {
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
    throw new Error(mismatches.join('\n'));
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

  const packageJsonChanged = has('package.json');
  const packageLockChanged = has('package-lock.json');
  if (!packageJsonChanged && packageLockChanged) {
    throw new Error('package.json and package-lock.json must change together.');
  }

  if (packageJsonChanged && !packageLockChanged) {
    if (!fs.existsSync('package-lock.json')) {
      throw new Error('package-lock.json is required when package.json is present.');
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
        'Dependency manifest changed without synchronized package-lock.json updates.',
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
        `Audit-related changes must update the following paths in the same PR: ${required.join(', ')}`,
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
      `Audit inventory mismatch: docs/audit.md has ${auditCount} questions, audit map has ${auditIds} IDs, unique IDs ${uniqueAuditIds}.`,
    );
  }
}

function scanSecurityAndArchitectureBoundaries() {
  const sourcePattern = /\.(js|mjs|cjs|ts|tsx|jsx|html)$/;
  const unsafeSinks = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\brequire\s*\(/,
    /\bvar\b/,
    /\bXMLHttpRequest\b/,
    /setTimeout\s*\(\s*['"]/,
    /setInterval\s*\(\s*['"]/,
    /<\s*canvas\b/i,
    /createElement\s*\(\s*['"]canvas['"]\s*\)/i,
  ];

  const frameworkImports = [
    /from\s+['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]/,
    /require\s*\(\s*['"](?:react|vue|angular|svelte|phaser|pixi\.js|three|jquery)['"]\s*\)/,
  ];

  const domAPIs = [
    /\bdocument\./,
    /\bwindow\./,
    /\bquerySelector(All)?\b/,
    /\bcreateElement(NS)?\b/,
    /\bappendChild\b/,
    /\binsertBefore\b/,
    /\baddEventListener\b/,
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
  ];

  for (const file of changedFiles) {
    if (!sourcePattern.test(file)) {
      continue;
    }

    if (!fs.existsSync(file)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const normalizedPath = file.replaceAll('\\', '/');
    if (normalizedPath.startsWith('scripts/policy-gate/')) {
      continue;
    }

    const isSystemFile = normalizedPath.startsWith('src/ecs/systems/');
    const isRenderSystem = normalizedPath === 'src/ecs/systems/render-dom-system.js';

    for (const pattern of unsafeSinks) {
      if (pattern.test(content)) {
        throw new Error(`Unsafe sink or forbidden API found in ${file}: ${pattern}`);
      }
    }

    for (const pattern of frameworkImports) {
      if (pattern.test(content)) {
        throw new Error(`Framework or CommonJS import found in ${file}: ${pattern}`);
      }
    }

    if (isSystemFile && !isRenderSystem) {
      for (const pattern of domAPIs) {
        if (pattern.test(content)) {
          throw new Error(`DOM boundary violation in ECS system file ${file}: ${pattern}`);
        }
      }
    }

    if (path.basename(file) === 'package.json') {
      const packageJson = JSON.parse(content);
      const deps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };
      for (const banned of [
        'react',
        'vue',
        'angular',
        'svelte',
        'phaser',
        'pixi.js',
        'three',
        'jquery',
      ]) {
        if (deps[banned]) {
          throw new Error(`Banned framework dependency detected in package.json: ${banned}`);
        }
      }
    }
  }
}

verifyTraceabilityCoverage();

if (checkSet === 'pr' || checkSet === 'all') {
  const ticketContext = assertTicketAssociation();
  console.log(
    describePolicyResolution({
      auditMode: ticketContext.processMode ? 'GENERAL_DOCS_PROCESS' : 'TICKET',
      branchTicketIds: ticketContext.branchTicketIds,
      commitTicketIds: ticketContext.commitTicketIds,
      processMarkerDetected: ticketContext.processMarkerDetected,
      selectedPath: ticketContext.processMode
        ? 'process-marker fallback'
        : 'ticketed ownership checks',
      ticketIds: ticketContext.ticketIds,
      trackCode: ticketContext.trackCode,
    }),
  );
  if (ticketContext.processMode) {
    assertProcessScope();
  } else {
    assertTrackOwnership(ticketContext.trackCode, ticketContext.ticketIds);
  }
  enforceAuditAndDependencyPairing();
  scanSecurityAndArchitectureBoundaries();
}

console.log(`Policy checks completed successfully for ${checkSet} checks.`);
