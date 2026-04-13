# Policy Gate Scripts

This directory contains scripts used to enforce project policies via `npm run policy` and `npm run policy:repo`. Note: `npm run ci` runs project quality checks and does not replace policy ownership and PR-governance checks.

## Script Functionality

- **`run-all.mjs`**: The main orchestrator for the policy checks. Runs quality gates, prepares context (`prepare-context.mjs`), and sequentially evaluates PR/repo state depending on the context mode (PR vs Fallback/Repo).
- **`prepare-context.mjs`**: Gathers all execution metadata (branch name, commit logs, changed files). It identifies the current state, resolving PR vs working tree, and outputting the context into a `.policy-pr-meta.json` file. Crucially, it collects commits only specific to the current branch (using `merge-base` and `HEAD`).
- **`run-project-gate.mjs`**: Interrogates the `package.json` to detect standard automated QA scripts (`check`, `test`, `coverage`, `validate:schema`, `sbom`) and executes them. If a script isn't defined, it safely skips it.
- **`run-checks.mjs`**: Contains the core logic verification. It asserts:
  - Branch tracking format and process marker logic.
  - Ownership scopes (checks the tracked file paths and compares them against track definitions in `lib/policy-utils.mjs`).
  - Testing ownership boundary from the track docs: Track A can modify all tests (`tests/**`), and Tracks B/C/D can modify tests that map to files they own.
  - Security boundaries (forbids UI/sink vulnerabilities or non-adapter DOM usage).
  - Traceability mapping, lockfile syncs, audit-map consistency, and documentation coverage constraints.
- **`check-forbidden.mjs`**: Scans the codebase or specifically the changed files for forbidden imports (frameworks) or APIs (HTML5 canvas elements inside JS context constraints) based on the AGENTS.md rules.
- **`check-source-headers.mjs`**: Ensures that critical source files contain a top-of-file block comment for documentation and ownership clarity.
- **`require-approval.mjs`**: Enforces human review by reaching out to the remote platform API (e.g. GitHub/Gitea) using available tokens. Fails if independent approval is required but lacking. Falls back to letting the platform's branch protection logic handle approvals if no token exists.

## Libraries

- **`lib/policy-utils.mjs`**: A pure functional utility library that contains hardcoded tracking configurations (Track A through D domains, ownership patterns, parsing logic for ticket metadata, generic node commands wrapped using `spawnSync`).

## Ownership Model Notes

- Track ownership patterns are intentionally ticket-track level, not per-ticket granularity.
- Shared governance and docs paths are represented by `SHARED_OWNERSHIP_PATTERNS`.
- `styles/base.css` is shared ownership and can be modified by any track.
- Track A owns all test paths in policy enforcement (`tests/**`).
- Tracks B, C, and D can modify scoped tests that correspond to their owned implementation files via `testPatterns`.

## Repo Trace Behavior

- `npm run policy:trace` (`run-checks.mjs --check-set=repo`) always validates:
  - Traceability matrix integrity.
  - Audit question map inventory parity.
  - Dependency lockfile pairing rules when dependency metadata changes.
