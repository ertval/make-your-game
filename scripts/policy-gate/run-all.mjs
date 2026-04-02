import process from 'node:process';
import { parseArgs, runCommand, toBool } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || 'local';
const scope = args.scope || 'pr';
const validScopes = new Set(['pr', 'repo', 'all']);
if (!validScopes.has(scope)) {
  throw new Error(`Invalid --scope value "${scope}". Expected one of: pr, repo, all.`);
}

const requireApproval =
  args['require-approval'] !== undefined ? toBool(args['require-approval']) : mode === 'ci';
const allowMissingPrBody =
  args['allow-missing-pr-body'] !== undefined
    ? toBool(args['allow-missing-pr-body'])
    : mode !== 'ci';
const runIntegrityChecks =
  args['run-integrity-checks'] !== undefined ? toBool(args['run-integrity-checks']) : true;
const headerMode = String(args['header-mode'] || process.env.POLICY_HEADER_MODE || 'warn')
  .trim()
  .toLowerCase();
if (!['warn', 'error', 'fail'].includes(headerMode)) {
  throw new Error(`Invalid header mode "${headerMode}". Expected one of: warn, error, fail.`);
}

const passThrough = [];
for (const [key, value] of Object.entries(args)) {
  if (
    key === 'mode' ||
    key === 'scope' ||
    key === 'require-approval' ||
    key === 'allow-missing-pr-body' ||
    key === 'run-integrity-checks' ||
    key === 'header-mode'
  ) {
    continue;
  }
  passThrough.push(`--${key}=${value}`);
}

function runStep(label, command, commandArgs, retryHint) {
  try {
    runCommand(command, commandArgs, { stdio: 'inherit' });
  } catch (error) {
    const hint = retryHint ? ` Retry with: ${retryHint}.` : '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed.${hint} Original error: ${detail}`);
  }
}

if (scope === 'pr' || scope === 'all') {
  runStep('Project quality gate', 'npm', ['run', 'policy:quality'], 'npm run policy:quality');

  runCommand('node', ['scripts/policy-gate/prepare-context.mjs', ...passThrough], {
    stdio: 'inherit',
  });

  runStep(
    'PR checklist and traceability checks',
    'npm',
    [
      'run',
      'policy:checks',
      '--',
      ...passThrough,
      `--allow-missing-pr-body=${allowMissingPrBody ? 'true' : 'false'}`,
    ],
    'npm run policy:checks -- --pr-body-file docs/pr-messages/<ticket>-pr.md --allow-missing-pr-body=false',
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
    ['run', 'policy:header', '--', `--mode=${headerMode}`, ...passThrough],
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
}

if (scope === 'repo' || scope === 'all') {
  runStep(
    'Repo-wide forbidden-tech scan',
    'npm',
    ['run', 'policy:forbidrepo', '--', ...passThrough],
    'npm run policy:forbidrepo',
  );

  runStep(
    'Repo-wide source-header scan',
    'npm',
    ['run', 'policy:headerrepo', '--', `--mode=${headerMode}`, ...passThrough],
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
