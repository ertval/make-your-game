/*
 * Script: check-branch-ownership.mjs
 * Purpose: Enforces branch push protection — each registered developer may only push to remote
 * branches whose name starts with their own username, the shared 'process/' namespace, or the
 * cross-track 'bugfix/' namespace.
 *
 * Public API: Callable as a standalone Node script (used by the pre-push git hook and by
 * npm run policy:branch). Exits with code 1 when the push is rejected; exits 0 otherwise.
 *
 * Expected env / CLI args:
 *   --username=<git-username>   Override the detected git user.name (optional; hook injects this).
 *   --branch=<remote-branch>    The remote branch being pushed to (optional; hook injects this).
 *
 * Implementation Notes:
 *   - When called from the pre-push hook, the branch name is passed via --branch.
 *   - When run standalone (e.g. in CI), it falls back to resolving the current branch via git.
 *   - Username detection order: --username arg → git config user.name → POLICY_PUSH_USER env var.
 *   - If the username is not a registered owner the check is skipped with a warning (allows
 *     unregistered CI service accounts to push to any branch without being blocked).
 */

import process from 'node:process';
import {
  GATE_FAIL,
  GATE_PASS,
  GATE_WARN,
  getAliasesForUser,
  isAllowedBranchForOwner,
  OWNER_TRACK_MAPPING,
  parseArgs,
  resolveBranchName,
  runCommand,
} from './lib/policy-utils.mjs';

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// 1. Resolve the pushing username.
// ---------------------------------------------------------------------------

function detectGitUsername() {
  try {
    return runCommand('git', ['config', 'user.name']).trim();
  } catch {
    return '';
  }
}

const username = args.username || process.env.POLICY_PUSH_USER || detectGitUsername();

if (!username) {
  console.error(`${GATE_FAIL} — Branch ownership check: could not determine git username.`);
  console.error('  Set git config user.name or pass --username=<name> to override.');
  process.exit(1);
}

const normalizedUsername = username.trim().toLowerCase();

// ---------------------------------------------------------------------------
// 2. Determine whether this username is a registered developer.
//    Unregistered usernames (e.g. CI bots) skip the check entirely.
// ---------------------------------------------------------------------------

const isRegisteredOwner = Object.keys(OWNER_TRACK_MAPPING).some(
  (key) => key.toLowerCase() === normalizedUsername,
);

if (!isRegisteredOwner) {
  // Warn rather than block — CI service accounts and bots (e.g. GitHub) are not in
  // OWNER_TRACK_MAPPING. This allows automated processes to push to any branch.
  console.log(
    `${GATE_WARN} — Branch ownership check: username "${username}" is not a registered ` +
      'developer. Skipping branch push protection to allow CI/bot pushes.',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Resolve the remote branch name.
//    Pre-push hook passes it via --branch; fallback to current HEAD branch.
// ---------------------------------------------------------------------------

const remoteBranch = args.branch || resolveBranchName(process.env.POLICY_PUSH_BRANCH || '');

if (!remoteBranch) {
  console.error(`${GATE_FAIL} — Branch ownership check: could not resolve the target branch name.`);
  console.error('  Pass --branch=<remote-branch> or ensure git HEAD is on a named branch.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Enforce the ownership rule.
// ---------------------------------------------------------------------------

if (!isAllowedBranchForOwner(username, remoteBranch)) {
  const aliases = getAliasesForUser(username);
  const ownPrefixes = aliases.map((a) => `${a.toLowerCase()}/`);

  console.error('');
  console.error('╭── ❌ Branch Push Protection ─────────────────────────────────────');
  console.error(`│ Developer:     ${username}`);
  console.error(`│ Target branch: ${remoteBranch}`);
  console.error('│');
  console.error(`│ REJECTED — "${username}" may only push to branches that start with:`);
  for (const prefix of ownPrefixes) {
    console.error(`│   • ${prefix}`);
  }
  console.error('│   • process/');
  console.error('│   • bugfix/');
  console.error('│');
  console.error('│ Action: Push to a branch that starts with one of your prefixes.');
  console.error('╰───────────────────────────────────────────────────────────────────');
  console.error('');
  process.exit(1);
}

console.log(`${GATE_PASS} — Branch ownership check: "${username}" → "${remoteBranch}" is allowed.`);
process.exit(0);
