/*
 * Script: run-all.mjs
 * Purpose: The main orchestrator for the policy checks. Runs quality gates, prepares context,
 * and executes other specialized gates sequentially based on the scope ('pr' or 'repo').
 * Implementation Notes: Provides unified fallbacks (e.g. if a process marker is discovered
 * instead of ticket IDs, it switches to repo-wide scanning).
 */

import fs from 'node:fs';
import process from 'node:process';
import {
  describePolicyResolution,
  extractOwnerFromBranch,
  GATE_FAIL,
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  isBugfixBranch,
  isIntegrationBranch,
  parseArgs,
  readJson,
  resolveBranchName,
  resolveOwnerTrackFromBranch,
  resolvePrPolicyPath,
  runCommand,
  toBool,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || 'local';
const scope = args.scope || 'pr';
const metaPath = args['meta-file'] || '.policy-pr-meta.json';
const validScopes = new Set(['pr', 'repo', 'all']);
// We validate the scope early to prevent cascading failures in downstream scripts holding bad assumptions.
if (!validScopes.has(scope)) {
  throw new Error(`Invalid --scope value "${scope}". Expected one of: pr, repo, all.`);
}

// We fallback to strict requirements ('ci' mode limits) when the approval flag is not explicitly provided.
const requireApproval =
  args['require-approval'] !== undefined ? toBool(args['require-approval']) : mode === 'ci';
// We allow opting out of heavy integrity checks during local rapid development.
const runIntegrityChecks =
  args['run-integrity-checks'] !== undefined ? toBool(args['run-integrity-checks']) : true;
const rawHeaderMode = args['header-mode'] ?? process.env.POLICY_HEADER_MODE;
const headerMode =
  rawHeaderMode === undefined || rawHeaderMode === null
    ? ''
    : String(rawHeaderMode).trim().toLowerCase();
if (headerMode && !['warn', 'error', 'fail'].includes(headerMode)) {
  throw new Error(`Invalid header mode "${headerMode}". Expected one of: warn, error, fail.`);
}
const headerModeArgs = headerMode ? [`--mode=${headerMode}`] : [];

// We separate orchestrator-specific args from generic ones so we can forward context to child scripts unmodified.
const passThrough = [];
for (const [key, value] of Object.entries(args)) {
  if (
    key === 'mode' ||
    key === 'scope' ||
    key === 'require-approval' ||
    key === 'run-integrity-checks' ||
    key === 'header-mode'
  ) {
    continue;
  }
  passThrough.push(`--${key}=${value}`);
}

const aggregatedErrors = [];

// We wrap shell execution to unify error propagation and consistently hint the user on how to reproduce the step locally.
function runStep(label, command, commandArgs, retryHint) {
  try {
    runCommand(command, commandArgs, { stdio: 'inherit' });
  } catch (error) {
    const hint = retryHint ? ` Retry with: ${retryHint}.` : '';
    const detail = error instanceof Error ? error.message : String(error);
    const msg = `${label} failed.${hint}\n  Error details: ${detail}`;
    console.error(`\n${GATE_FAIL} — ${msg}\n`);
    aggregatedErrors.push(msg);
  }
}

// We centralize metadata parsing so PR/repo flows cannot drift in how they infer owner, tickets, or process mode.
function resolvePolicyContext() {
  const metadata = fs.existsSync(metaPath) ? readJson(metaPath) : {};
  const branchName = resolveBranchName(
    metadata.branchName,
    args['branch-name'] || '',
    process.env.BRANCH_NAME || '',
  );
  const branchOwner = extractOwnerFromBranch(branchName);
  const branchOwnerTrack = resolveOwnerTrackFromBranch(branchName);
  const branchTicketIds = inferTicketIdsFromSources(metadata.branchName || '');
  const commitTicketIds = inferTicketIdsFromSources(metadata.commitMessages || '');
  const hasPrMetadata = branchTicketIds.length > 0 || commitTicketIds.length > 0;
  const hasProcessMode =
    Boolean(metadata.processMode) ||
    inferProcessModeFromSources(
      metadata.branchName || '',
      metadata.commitMessages || '',
      metadata.body || '',
    );
  const ticketIds = inferTicketIdsFromSources(
    metadata.branchName || '',
    metadata.commitMessages || '',
  );
  const isBugfixMode = isBugfixBranch(branchName);
  // Integration branches are an alias of bugfix mode — detect both here for forwarding to policy path.
  const isIntegrationMode = isIntegrationBranch(branchName);

  return {
    metadata,
    branchOwner,
    branchOwnerTrack,
    branchTicketIds,
    commitTicketIds,
    hasPrMetadata,
    hasProcessMode,
    isBugfixMode,
    isIntegrationMode,
    ticketIds,
  };
}

let ranRepoFallback = false;
let contextPrepared = false;

if (scope === 'pr' || scope === 'all') {
  // We run the base project lint/test suite first so we don't bother doing policy validation on fundamentally broken code.
  runStep('Project quality gate', 'npm', ['run', 'policy:quality'], 'npm run policy:quality');

  runCommand('node', ['scripts/policy-gate/prepare-context.mjs', ...passThrough], {
    stdio: 'inherit',
  });
  contextPrepared = true;

  console.log('\n========================================================================');
  console.log('🚀 Phase 2: Starting Policy Enforcements');
  console.log('========================================================================\n');

  // Process-marker branches must still run PR checks so process-scope violations are enforced.
  const { branchTicketIds, commitTicketIds, hasProcessMode, isBugfixMode, isIntegrationMode } =
    resolvePolicyContext();

  // Process-marker branches must still run PR checks so process-scope violations are enforced.
  const policyPath = resolvePrPolicyPath({
    branchTicketIds,
    commitTicketIds,
    hasProcessMode,
    isBugfixMode,
    isIntegrationMode,
  });

  // The describePolicyResolution call was removed from here because run-checks.mjs
  if (policyPath.shouldRunPrChecks) {
    runStep(
      'PR checklist and traceability checks',
      'npm',
      ['run', 'policy:checks', '--', ...passThrough],
      'npm run policy:checks',
    );

    runStep(
      'Changed-file forbidden-tech scan',
      'npm',
      ['run', 'policy:forbidden', '--', ...passThrough],
      'npm run policy:forbidden',
    );

    runStep(
      'Changed-file source-header scan',
      'npm',
      ['run', 'policy:header', '--', ...headerModeArgs, ...passThrough],
      'npm run policy:header',
    );

    runStep(
      'Approval gate',
      'npm',
      [
        'run',
        'policy:approve',
        '--',
        ...passThrough,
        `--require-approval=${requireApproval ? 'true' : 'false'}`,
        `--ci-mode=${mode === 'ci' ? 'true' : 'false'}`,
      ],
      'npm run policy:approve',
    );
  } else {
    console.log('No branch/commit ticket metadata found. Running repo-wide policy checks instead.');
    runStep(
      'Repo-wide policy gate',
      'npm',
      ['run', 'policy:repo', '--', ...passThrough],
      'npm run policy:repo',
    );
    ranRepoFallback = true;
  }
}

if ((scope === 'repo' || scope === 'all') && !(scope === 'all' && ranRepoFallback)) {
  if (!contextPrepared) {
    runStep(
      'Policy context preparation',
      'node',
      ['scripts/policy-gate/prepare-context.mjs', ...passThrough],
      'npm run policy:prep',
    );
    contextPrepared = true;
  }

  // We read the prepared metadata to report owner and mode info for repo scope runs.
  const {
    metadata,
    branchOwner,
    branchOwnerTrack,
    branchTicketIds,
    commitTicketIds,
    hasProcessMode,
    isBugfixMode,
    isIntegrationMode,
    ticketIds,
  } = resolvePolicyContext();
  // Integration mode is an alias of bugfix mode; treat them equivalently for audit reporting.
  const effectiveBugfixMode = isBugfixMode || isIntegrationMode;
  const auditMode = effectiveBugfixMode
    ? 'BUGFIX'
    : hasProcessMode
      ? 'GENERAL_DOCS_PROCESS'
      : ticketIds.length > 0
        ? 'TICKET'
        : 'GENERAL_DOCS_PROCESS';

  // We execute repo-wide policies for deeper validation when specifically requested or on merge to main.
  // Suppress the duplicate resolution log if we're running all scopes, as PR already printed context.
  if (scope !== 'all') {
    console.log(
      describePolicyResolution({
        auditMode,
        branchTicketIds,
        commitTicketIds,
        owner: branchOwner,
        ownerTrack: branchOwnerTrack,
        processMarkerDetected: hasProcessMode,
        selectedPath: 'repo-wide validation',
        ticketIds,
        trackCode: branchOwnerTrack || metadata.trackCode || 'GENERAL',
      }),
    );
  } else {
    console.log('\n========================================================================');
    console.log('🚀 Phase 3: Repo-Wide Validations');
    console.log('========================================================================\n');
  }
  runStep(
    'Repo-wide forbidden-tech scan',
    'node',
    ['scripts/policy-gate/check-forbidden.mjs', '--scope=repo', ...passThrough],
    'node scripts/policy-gate/check-forbidden.mjs --scope=repo',
  );

  runStep(
    'Repo-wide source-header scan',
    'node',
    [
      'scripts/policy-gate/check-source-headers.mjs',
      '--scope=repo',
      ...headerModeArgs,
      ...passThrough,
    ],
    'node scripts/policy-gate/check-source-headers.mjs --scope=repo',
  );

  if (runIntegrityChecks) {
    runStep(
      'Repo integrity and traceability checks',
      'npm',
      ['run', 'policy:trace', '--', ...passThrough],
      'npm run policy:trace',
    );
  } else {
    console.log('Skipping repo integrity checks by configuration.');
  }
}

if (aggregatedErrors.length > 0) {
  console.error(
    `\n${GATE_FAIL} — Policy gate finished with ${aggregatedErrors.length} failure(s):`,
  );
  for (const err of aggregatedErrors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log(
  `\n🎉 🏁 ALL CLEAR: Policy gate successfully completed in ${mode} mode for ${scope} scope. 🏁 🎉\n`,
);
