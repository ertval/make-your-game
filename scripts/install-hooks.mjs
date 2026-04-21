/*
 * Script: install-hooks.mjs
 * Purpose: Installs the repository git hooks from scripts/policy-gate/hooks/ into .git/hooks/.
 * Run this once after cloning, or via `npm run install:hooks` / `npm run prepare`.
 * Implementation Notes:
 *   - Copies (not symlinks) the hook files so they work on all platforms and in CI.
 *   - Sets the executable bit on the installed hooks (chmod +x).
 *   - Idempotent: safe to run multiple times.
 */

import fs from 'node:fs';
import path from 'node:path';

// import.meta.dirname is the directory of THIS file: <repo-root>/scripts/
// One level up reaches the repo root.
const repoRoot = path.resolve(import.meta.dirname, '..');
const hooksSourceDir = path.join(repoRoot, 'scripts', 'policy-gate', 'hooks');
const hooksTargetDir = path.join(repoRoot, '.git', 'hooks');

function installHooks() {
  if (!fs.existsSync(hooksSourceDir)) {
    console.log('No hooks directory found — nothing to install.');
    return;
  }

  // Bail out gracefully in bare repos or CI environments without .git/hooks.
  if (!fs.existsSync(hooksTargetDir)) {
    console.warn('⚠️  .git/hooks/ not found — skipping hook installation (bare repo or CI).');
    return;
  }

  const hookFiles = fs.readdirSync(hooksSourceDir);
  let installed = 0;

  for (const hookFile of hookFiles) {
    const src = path.join(hooksSourceDir, hookFile);
    const dst = path.join(hooksTargetDir, hookFile);

    if (!fs.statSync(src).isFile()) {
      continue;
    }

    fs.copyFileSync(src, dst);
    // Mark the installed hook as executable (owner + group + other execute bits).
    fs.chmodSync(dst, 0o755);
    console.log(`✅ Installed hook: ${hookFile} → .git/hooks/${hookFile}`);
    installed += 1;
  }

  if (installed === 0) {
    console.log('No hook files found in scripts/policy-gate/hooks/ — nothing to install.');
  } else {
    console.log(`\n🎉 ${installed} hook(s) installed successfully.`);
  }
}

installHooks();
