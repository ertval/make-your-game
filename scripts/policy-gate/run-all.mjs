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
  inferProcessModeFromSources,
  inferTicketIdsFromSources,
  parseArgs,
  readJson,
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

// We wrap shell execution to unify error propagation and consistently hint the user on how to reproduce the step locally.
function runStep(label, command, commandArgs, retryHint) {
  try {
    runCommand(command, commandArgs, { stdio: 'inherit' });
  } catch (error) {
    const hint = retryHint ? ` Retry with: ${retryHint}.` : '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed.${hint} Original error: ${detail}`);
  }
}

let ranRepoFallback = false;

if (scope === 'pr' || scope === 'all') {
  // We run the base project lint/test suite first so we don't bother doing policy validation on fundamentally broken code.
  runStep('Project quality gate', 'npm', ['run', 'policy:quality'], 'npm run policy:quality');

  runCommand('node', ['scripts/policy-gate/prepare-context.mjs', ...passThrough], {
    stdio: 'inherit',
  });

  // We parse the extracted git metadata file to infer PR intent and verify traceability.
  const metadata = fs.existsSync(metaPath) ? readJson(metaPath) : {};
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

  // We establish an audit mode flag based on context clues to control the rigor of subsequent gates.
  const auditMode = hasPrMetadata
    ? 'TICKET'
    : hasProcessMode
      ? 'GENERAL_DOCS_PROCESS'
      : 'REPO_FALLBACK';
  const selectedPath = hasPrMetadata
    ? 'PR ticket checks'
    : hasProcessMode
      ? 'repo-wide fallback from process marker'
      : 'repo-wide fallback from missing ticket metadata';
  const ticketIds = hasPrMetadata
    ? inferTicketIdsFromSources(metadata.branchName || '', metadata.commitMessages || '')
    : [];

  console.log(
    describePolicyResolution({
      auditMode,
      branchTicketIds,
      commitTicketIds,
      processMarkerDetected: hasProcessMode,
      selectedPath,
      ticketIds,
      trackCode: metadata.trackCode || 'GENERAL',
    }),
  );

  if (hasPrMetadata) {
    runStep(
      'PR checklist and traceability checks',
      'npm',
      ['run', 'policy:checks', '--', ...passThrough],
      'npm run policy:checks',
    );

    runStep(
      'Changed-file forbidden-tech scan',
      'npm',
      ['run', 'policy:forbid', '--', ...passThrough],
      'npm run policy:forbid',
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
      ],
      'npm run policy:approve',
    );
  } else if (hasProcessMode) {
    console.log(
      'No ticket IDs found, but a process marker was detected. Running repo-wide policy checks instead.',
    );
    runStep(
      'Repo-wide policy gate',
      'npm',
      ['run', 'policy:repo', '--', ...passThrough],
      'npm run policy:repo',
    );
    ranRepoFallback = true;
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
  // We execute repo-wide policies for deeper validation when specifically requested or on merge to main.
  runStep(
    'Repo-wide forbidden-tech scan',
    'npm',
    ['run', 'policy:forbidrepo', '--', ...passThrough],
    'npm run policy:forbidrepo',
  );

  runStep(
    'Repo-wide source-header scan',
    'npm',
    ['run', 'policy:headerrepo', '--', ...headerModeArgs, ...passThrough],
    'npm run policy:headerrepo',
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

console.log(`Policy gate completed in ${mode} mode for ${scope} scope.`);
