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
- **`require-approval.mjs`**: Enforces human review by reaching out to the GitHub PR review API when approval enforcement is enabled. Fails if independent approval is required but lacking. Falls back to letting branch protection handle approvals when approval enforcement is disabled.

## Libraries

- **`lib/policy-utils.mjs`**: A pure functional utility library that contains hardcoded tracking configurations (Track A through D domains, ownership patterns, parsing logic for ticket metadata, generic node commands wrapped using `spawnSync`).

## Ownership Model Notes

- Track ownership scope is defined by `docs/implementation/track-*.md`; `scripts/policy-gate/lib/policy-utils.mjs` is the enforcement mirror and must stay synchronized with those docs.
- Track ownership patterns are intentionally ticket-track level, not per-ticket granularity.
- Shared governance and docs paths are represented by `SHARED_OWNERSHIP_PATTERNS`.
- `styles/base.css` is shared ownership and can be modified by any track.
- Track A owns all test paths in policy enforcement (`tests/**`).
- Tracks B, C, and D can modify scoped tests that correspond to their owned implementation files via `testPatterns`.

## GENERAL_DOCS_PROCESS Semantics

- Process mode can be detected from branch name, commit metadata, or PR body markers.
- Process mode may relax ticket-association conflicts (for docs/process workflows).
- Process mode does **not** bypass ownership boundaries; changed files are still validated against the branch owner's mapped track.

## Bugfix Branch Mode

Branches named `<owner>/bugfix-<slug>` (for example `ekaramet/bugfix-ghost-collision`) activate **bugfix mode**, which:

- **Bypasses** track ownership checks (`assertTrackOwnership` and `assertOwnerScopedOwnership`) so a single developer can touch files across multiple tracks in one PR without splitting the branch.
- **Does not bypass** any other gates: security sink and ECS DOM boundary scans, forbidden-API checks, traceability coverage, lockfile pairing, and all quality gates still run normally.

### Rules and Constraints

| Rule | Requirement |
|---|---|
| **Registered Owner required** | The `<owner>` prefix MUST be present and MUST be one of the registered developers in `OWNER_TRACK_MAPPING` (ekaramet, asmyrogl, chbaikas, medvall). |
| **`bugfix-` keyword mandatory** | The slug must start exactly with `bugfix-` (case-sensitive). |
| **Ownership Relaxed** | Track ownership checks are bypassed, allowing the developer to touch files outside their assigned track. |
| **Ticket association Relaxed** | Ticket association is NOT a blocking factor. Bugfix branches can have no tickets or cross-track tickets. |
| **All other gates active** | Security, traceability, lockfile, and quality gates run unchanged. |

### Pattern

```
<owner>/bugfix-<slug>
```

**Examples:**
- `ekaramet/bugfix-ghost-collision`
- `asmyrogl/bugfix-B-07-timer-race`
- `chbaikas/bugfix-audio-pause-deadlock`

### Implementation reference

- `lib/policy-utils.mjs` — exports `BUGFIX_BRANCH_PATTERN` and `isBugfixBranch()`.
- `run-checks.mjs` — detects `bugfixMode` at startup and short-circuits both ownership functions.

## Integration Branch Mode

Branches named `<owner>/integration<slug>` (for example `ekaramet/integration-phase2-merge`) activate **integration mode**, which is a **named alias of bugfix mode**. It provides identical ownership-bypass semantics and is intended for cross-track integration or merge PRs rather than defect fixes.

- **Bypasses** track ownership checks (`assertTrackOwnership` and `assertOwnerScopedOwnership`) — same as bugfix mode.
- **Does not bypass** any other gates: security sink and ECS DOM boundary scans, forbidden-API checks, traceability coverage, lockfile pairing, and all quality gates still run normally.

### Rules and Constraints

| Rule | Requirement |
|---|---|
| **Registered Owner required** | The `<owner>` prefix MUST be present and MUST be one of the registered developers in `OWNER_TRACK_MAPPING` (ekaramet, asmyrogl, chbaikas, medvall). |
| **`integration` keyword mandatory** | The path segment after the `/` must start exactly with `integration` (case-sensitive). The remainder of the slug is free-form (including an empty slug). |
| **Ownership Relaxed** | Track ownership checks are bypassed, allowing the developer to touch files outside their assigned track. |
| **Ticket association Relaxed** | Ticket association is NOT a blocking factor. Integration branches can have no tickets or cross-track tickets. |
| **All other gates active** | Security, traceability, lockfile, and quality gates run unchanged. |

### Pattern

```
<owner>/integration<slug>
```

**Examples:**
- `ekaramet/integration-phase2-merge`
- `asmyrogl/integration`
- `chbaikas/integration-audio-and-hud`

### Implementation reference

- `lib/policy-utils.mjs` — exports `INTEGRATION_BRANCH_PATTERN` and `isIntegrationBranch()`.
- `run-checks.mjs` — detects `integrationMode` at startup and folds it into `bypassOwnershipMode` alongside `bugfixMode`.

## Repo Trace Behavior

- `npm run policy:trace` (`run-checks.mjs --check-set=repo`) always validates:
  - Traceability matrix integrity.
  - Audit question map inventory parity.
  - Dependency lockfile pairing rules when dependency metadata changes.
