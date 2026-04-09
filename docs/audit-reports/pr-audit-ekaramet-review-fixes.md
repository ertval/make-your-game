# ekaramet/review-fixes PR Audit Report

Date: 2026-04-09

## Report Metadata
- Output file path: docs/audit-reports/pr-audit-ekaramet-review-fixes.md
- Base branch: main
- Head branch: ekaramet/review-fixes

## Scope Reviewed
- Branch: ekaramet/review-fixes
- Ticket scope: A-03, B-01, D-01, D-02 (detected from commit messages only; branch name contains no ticket ID)
- Track: MULTI-TRACK (A, B, D) -- single-track ownership violated
- Audit mode: GENERAL_DOCS_PROCESS (fallback -- branch name fails ticket format validation AND no "process" keyword found in branch name or commit messages)
- Base comparison: cbfcc65574f544d2f7b57188242a5b74127080e5..HEAD
- Files changed: 55

## Merge Verdict
- VERDICT: **RED**
- READY_FOR_MAIN: **NO**
- AUDIT_MODE: GENERAL_DOCS_PROCESS
- TICKET_SCOPE: A-03, B-01, D-01, D-02 (multi-track; no single track ownership)
- TRACK: GENERAL

## Commands Executed
- npm ci
- npm run check
- npm run test
- npm run test:coverage
- npm run validate:schema
- npm run sbom
- npm run ci
- npm run test:unit
- npm run test:integration
- npm run test:e2e
- npm run test:audit
- npm run check:forbidden
- npm run policy -- --require-approval=false
- npm run policy:repo
- npm run policy:quality
- npm run policy:checks
- npm run policy:forbid
- npm run policy:header
- npm run policy:approve -- --require-approval=false
- npm run policy:forbidrepo
- npm run policy:headerrepo
- npm run policy:trace

## Gate Summary
- PASS: npm ci (exit=0, duration=3.0s, no vulnerabilities)
- PASS: npm run check (exit=0, duration=0.3s, 62 files checked, no fixes applied)
- PASS: npm run test (exit=0, duration=1.1s, 18 test files, 151 tests passed)
- PASS: npm run test:coverage (exit=0, duration=1.4s, coverage reported)
- PASS: npm run validate:schema (exit=0, duration=0.3s, 5 schemas validated)
- PASS: npm run sbom (exit=0, duration=0.5s, SBOM generated)
- PASS: npm run ci (exit=0, duration=3.7s, full CI pipeline)
- PASS: npm run test:unit (exit=0, duration=1.1s, 16 test files, 148 tests passed)
- PASS: npm run test:integration (exit=0, duration=0.7s, 1 test file, 2 tests passed)
- PASS: npm run test:e2e (exit=0, duration=4.1s, 1 Playwright test passed)
- PASS: npm run test:audit (exit=0, duration=0.7s, 1 test passed)
- PASS: npm run check:forbidden (exit=0, duration=0.2s, 51 files scanned)
- **FAIL**: npm run policy -- --require-approval=false (exit=1, duration=4.2s, branch "ekaramet/review-fixes" does not follow required ticket format)
- **FAIL**: npm run policy:repo (exit=1, duration=0.5s, source header check failed for policy-utils.mjs and run-checks.mjs)
- PASS: npm run policy:quality (exit=0, duration=3.6s, project gate checks completed)
- **FAIL**: npm run policy:checks (exit=1, duration=0.2s, branch does not follow required ticket format)
- PASS: npm run policy:forbid (exit=0, duration=0.2s, 19 changed files scanned)
- **FAIL**: npm run policy:header (exit=1, duration=0.2s, source files below minimum comment ratio: policy-utils.mjs 1.1%, run-checks.mjs 1.2%)
- PASS: npm run policy:approve -- --require-approval=false (exit=0, duration=0.2s, approval check skipped by configuration)
- PASS: npm run policy:forbidrepo (exit=0, duration=0.2s, 51 files scanned)
- **FAIL**: npm run policy:headerrepo (exit=1, duration=0.2s, source files below minimum comment ratio: policy-utils.mjs 1.1%, run-checks.mjs 1.2%)
- PASS: npm run policy:trace (exit=0, duration=0.2s, repo checks completed)

## Boolean Check Results
- **FAIL**: Ticket identified from branch and commits (branch name "ekaramet/review-fixes" does not match pattern <owner>/<TRACK>-<NN>; commit messages contain ticket IDs from multiple tracks A, B, D -- no single-track ownership)
- **FAIL**: Ticket IDs belong to exactly one track (tickets A-03, B-01, D-01, D-02 span Tracks A, B, and D -- multi-track violation)
- **FAIL**: Ticket IDs exist in tracker (TB-01 found in commit messages is NOT a valid ticket ID per tracker canonical ranges A-D; valid IDs A-03, B-01, D-01, D-02 do exist)
- **FAIL**: Track identified (multiple tracks A, B, D detected; no single track can be assigned)
- **FAIL**: Ownership scope respected (multi-track changes without resolvable single ticket; branch name does not declare ticket ownership)
- PASS: Docs/process-only scope enforced when GENERAL_DOCS_PROCESS (**FAIL**: changed files include source code in src/ecs/components/, src/ecs/resources/, src/ecs/world/, src/game/, and tests/ -- these are product code changes, not docs-only)
- **FAIL**: Required automated command set passed (4 of 22 commands failed: policy, policy:checks, policy:header, policy:headerrepo)
- PASS: ECS DOM boundary respected (simulation systems avoid DOM APIs) (no changes to src/ecs/systems/ directory; no DOM API usage in changed simulation files)
- PASS: Adapter injection discipline respected (no direct adapter imports in systems) (no adapter imports found in changed system files)
- PASS: Forbidden tech absent (canvas/framework/WebGL/WebGPU) (check-forbidden scan passed; only comments/pattern definitions in check-forbidden.mjs reference these terms)
- PASS: Unsafe DOM sinks absent (innerHTML/outerHTML/insertAdjacentHTML/document.write) (no unsafe sinks found in diff)
- PASS: Code execution sinks absent (eval/new Function/string timers) (no execution sinks found in diff)
- PASS: Lockfile pairing valid when package.json changed (both package.json and package-lock.json changed together; npm ci succeeded)
- **FAIL**: PR checklist/template contract satisfied (PR body/commit messages do not include required PR template sections; no "process" marker for GENERAL_DOCS_PROCESS mode; branch naming violates checklist item "I verified my branch name follows <owner-or-scope>/<TRACK>-<NN>")
- **FAIL**: Workflow guide contract satisfied (checks do not all run -- policy:checks and policy:header fail; no audit IDs listed in commit messages; no evidence of human review requested)
- PASS: Audit matrix mapping resolved for affected behavior (traceability matrix exists; affected audit IDs covered by existing test infrastructure)
- N/A: Manual evidence present when F-19/F-20/F-21/B-06 are impacted (no gameplay-critical rendering changes in this branch; manual evidence not required)

## Requirements And Audit Coverage
- Affected REQ IDs: F-02, F-10, F-17, F-18 (game loop/rAF/pause), F-04, F-05 (no canvas/frameworks), B-02 (good practices)
- Affected AUDIT IDs: AUDIT-F-02, AUDIT-F-04, AUDIT-F-05, AUDIT-F-10, AUDIT-F-17, AUDIT-F-18, AUDIT-B-02
- PASS: Coverage evidence status per affected ID (all automated audit IDs covered by existing test infrastructure: tests/e2e/audit/audit.e2e.test.js, tests/e2e/game-loop.pause.spec.js, tests/integration/gameplay/a03-game-loop.test.js)
- N/A: Manual evidence status (F-19/F-20/F-21/B-06) (no paint/layer-promotion changes introduced; gameplay rendering infrastructure unchanged)

## Ticket Compliance
- Ticket deliverables (TICKET mode): N/A (AUDIT_MODE is GENERAL_DOCS_PROCESS, not TICKET)
- Verification gate items (TICKET mode): N/A
- **FAIL**: General docs/process scope compliance (branch name lacks "process" marker and commits lack "process" keyword; changed files include product code across src/ecs/, src/game/, and tests/ directories -- not docs/process-only)
- **FAIL**: Stability and no-breakage review (4 policy commands fail; source header checks fail for 2 files with comment ratios below 2% minimum)
- **FAIL**: Out-of-scope product-code changes without ticket (55 files changed spanning tracks A, B, and D without a single resolvable ticket ID; branch name does not declare ownership)
- Out-of-scope change findings:
  - src/ecs/components/actors.js, props.js, registry.js, spatial.js, stats.js, visual.js (Track B component files)
  - src/ecs/resources/constants.js (Track D resource)
  - src/ecs/world/query.js, world.js (Track A world files)
  - src/game/bootstrap.js, game-flow.js, level-loader.js (Track A game flow)
  - src/main.ecs.js (Track A entry point)
  - scripts/policy-gate/*.mjs (Track A policy scripts)
  - tests/ (Track A test files)
  - biome.json, package.json, package-lock.json (Track A tooling)
  - assets/maps/level-1.json, level-2.json, level-3.json (Track D map data)
  - docs/schemas/map.schema.json (Track D schema)
  - docs/implementation/*.md (documentation across all tracks)
  - .github/prompts/pr-audit-verification.prompt.md, .github/pull_request_template.md (governance)

## Findings (By Severity)
### Critical
1. Branch name "ekaramet/review-fixes" does not follow required naming convention `<owner>/<TRACK>-<NN>`. Policy gate `npm run policy:checks` fails with explicit error: "Branch does not follow the required ticket format."
2. Multi-track ownership violation: commits reference tickets from Tracks A (A-03), B (B-01), and D (D-01, D-02) simultaneously. Policy requires single-track branch ownership.
3. No "process" keyword found in branch name, commit messages, or PR body to trigger GENERAL_DOCS_PROCESS fallback mode legitimately.
4. 4 of 22 required automated commands fail: `npm run policy`, `npm run policy:checks`, `npm run policy:header`, `npm run policy:headerrepo`.

### High
1. Source header check fails: `scripts/policy-gate/lib/policy-utils.mjs` (1.1% comment ratio) and `scripts/policy-gate/run-checks.mjs` (1.2% comment ratio) are below the 2% minimum threshold.
2. PR checklist contract not satisfied: branch naming validation item in the PR template would fail; no audit IDs listed in commit messages; no evidence of human review.

### Medium
1. Changed files span 55 files across product code, tests, documentation, and governance -- unusually large scope for a branch named "review-fixes."
2. Commit history includes merge commits from other branches (asmyrogl/TB-01, medvall/D-02) introducing additional cross-track changes.
3. TB-01 appears in commit messages but is not a valid ticket ID per the canonical tracker (tracks A-D only).

### Low
1. vite version bumped from 8.0.3 to 8.0.6 and rolldown from 1.0.0-rc.12 to 1.0.0-rc.13 (dependency updates without explicit version bump commit).
2. New `policy:checks:local` script added to package.json (not documented in PR template as a local test command).

## Path To Green (Required if RED)
1. **Rename branch** to follow `<owner>/<TRACK>-<NN>` convention (e.g., `ekaramet/A-03` if primarily Track A work) OR add the word `process` to the branch name and ensure changed files are docs/process-only.
2. **Reduce scope** to a single track's ownership area, or split into separate branches per track (one for Track A changes, one for Track B, one for Track D).
3. **Fix source header comment ratios**: Add JSDoc and inline comments to `scripts/policy-gate/lib/policy-utils.mjs` and `scripts/policy-gate/run-checks.mjs` to exceed the 2% minimum comment ratio.
4. **Ensure PR checklist compliance**: Verify branch name follows convention, list affected audit IDs in PR body, and request human review.
5. **Re-run `npm run policy` and `npm run policy:checks`** and confirm all policy gates pass before merging.

## Optional Follow-Ups
1. Consider squashing merge commits from other branches (asmyrogl/TB-01, medvall/D-02) to keep branch history clean and single-purpose.
2. Document the new `policy:checks:local` script in the PR template's local test command reference section.
3. The SBOM script was updated to use `--package-lock-only --omit=optional` flags -- verify this matches CI policy expectations for dependency governance.
4. Consider updating the ticket tracker summary snapshot (Done: 6) to reflect that D-01 and D-02 are marked done but D-03 remains not started (D-01/D-02 are prerequisites for D-03).
