import process from 'node:process';
import { parseArgs, runCommand, toBool } from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || 'local';
const requireApproval =
  args['require-approval'] !== undefined ? toBool(args['require-approval']) : mode === 'ci';
const allowMissingPrBody =
  args['allow-missing-pr-body'] !== undefined
    ? toBool(args['allow-missing-pr-body'])
    : mode !== 'ci';

const passThrough = [];
for (const [key, value] of Object.entries(args)) {
  if (key === 'mode' || key === 'require-approval' || key === 'allow-missing-pr-body') {
    continue;
  }
  passThrough.push(`--${key}=${value}`);
}

runCommand('node', ['scripts/policy-gate/prepare-context.mjs', ...passThrough], {
  stdio: 'inherit',
});
runCommand(
  'node',
  [
    'scripts/policy-gate/run-checks.mjs',
    ...passThrough,
    `--allow-missing-pr-body=${allowMissingPrBody ? 'true' : 'false'}`,
  ],
  { stdio: 'inherit' },
);
runCommand('node', ['scripts/policy-gate/check-forbidden.mjs', '--scope=changed', ...passThrough], {
  stdio: 'inherit',
});
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
runCommand('node', ['scripts/policy-gate/run-project-gate.mjs'], { stdio: 'inherit' });

console.log(`Policy gate completed in ${mode} mode.`);
