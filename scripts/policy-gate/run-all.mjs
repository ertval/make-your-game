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

if (scope === 'pr' || scope === 'all') {
  runCommand('node', ['scripts/policy-gate/prepare-context.mjs', ...passThrough], {
    stdio: 'inherit',
  });

  runCommand(
    'node',
    [
      'scripts/policy-gate/run-checks.mjs',
      '--check-set=pr',
      ...passThrough,
      `--allow-missing-pr-body=${allowMissingPrBody ? 'true' : 'false'}`,
    ],
    { stdio: 'inherit' },
  );

  runCommand(
    'node',
    ['scripts/policy-gate/check-forbidden.mjs', '--scope=changed', ...passThrough],
    {
      stdio: 'inherit',
    },
  );

  runCommand(
    'node',
    [
      'scripts/policy-gate/check-source-headers.mjs',
      '--scope=changed',
      `--mode=${headerMode}`,
      ...passThrough,
    ],
    { stdio: 'inherit' },
  );

  runCommand(
    'node',
    [
      'scripts/policy-gate/require-approval.mjs',
      ...passThrough,
      `--require-approval=${requireApproval ? 'true' : 'false'}`,
    ],
    {
      stdio: 'inherit',
    },
  );
}

if (scope === 'repo' || scope === 'all') {
  runCommand('node', ['scripts/policy-gate/check-forbidden.mjs', '--scope=repo', ...passThrough], {
    stdio: 'inherit',
  });

  runCommand(
    'node',
    [
      'scripts/policy-gate/check-source-headers.mjs',
      '--scope=repo',
      `--mode=${headerMode}`,
      ...passThrough,
    ],
    { stdio: 'inherit' },
  );

  if (runIntegrityChecks) {
    runCommand('node', ['scripts/policy-gate/run-checks.mjs', '--check-set=repo', ...passThrough], {
      stdio: 'inherit',
    });
  } else {
    console.log('Skipping repo integrity checks by configuration.');
  }
}

console.log(`Policy gate completed in ${mode} mode for ${scope} scope.`);
