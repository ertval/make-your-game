# B-01 PR Audit Report

Date: 2026-04-07

## Report Metadata
- Output file path: docs/audit-reports/pr-audit-asmyrogl-TB-01.md
- Base branch: main
- Head branch: asmyrogl/TB-01

## Scope Reviewed
- Branch: asmyrogl/TB-01
- Ticket scope: B-01
- Track: B
- Audit mode: TICKET
- Base comparison: cbfcc65574f544d2f7b57188242a5b74127080e5..HEAD
- Files changed: 13

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
- npm ci: FAIL (exit=1, duration=0s) - lockfile mismatch (EUSAGE): package.json and package-lock.json are out of sync.
- npm run check: FAIL (exit=1, duration=1s) - Biome reported 8 errors (format/import ordering).
- npm run test: PASS (exit=0, duration=1s) - unit test suite command passed.
- npm run test:coverage: PASS (exit=0, duration=1s) - coverage run passed.
- npm run validate:schema: PASS (exit=0, duration=1s) - schema validation passed.
- npm run sbom: FAIL (exit=1, duration=0s) - npm ls failed with ELSPROBLEMS (invalid fsevents entry).
- npm run ci: FAIL (exit=1, duration=1s) - failed via npm run check (Biome errors).
- npm run test:unit: PASS (exit=0, duration=0s) - unit tests passed.
- npm run test:integration: PASS (exit=0, duration=1s) - integration tests passed.
- npm run test:e2e: PASS (exit=0, duration=2s) - e2e command passed.
- npm run test:audit: PASS (exit=0, duration=1s) - audit inventory tests passed.
- npm run check:forbidden: PASS (exit=0, duration=0s) - forbidden tech check passed.
- npm run policy -- --require-approval=false: FAIL (exit=1, duration=1s) - failed at quality gate due npm run check errors.
- npm run policy:repo: PASS (exit=0, duration=0s) - repo policy gate passed.
- npm run policy:quality: FAIL (exit=1, duration=1s) - project quality gate failed from npm run check errors.
- npm run policy:checks: FAIL (exit=1, duration=0s) - standalone invocation failed without prepared metadata.
- npm run policy:forbid: PASS (exit=0, duration=0s) - changed-file forbidden scan passed.
- npm run policy:header: PASS (exit=0, duration=0s) - changed-file source-header scan passed.
- npm run policy:approve -- --require-approval=false: PASS (exit=0, duration=0s) - approval gate intentionally skipped by configuration.
- npm run policy:forbidrepo: PASS (exit=0, duration=1s) - repo forbidden scan passed.
- npm run policy:headerrepo: PASS (exit=0, duration=0s) - repo header scan passed.
- npm run policy:trace: PASS (exit=0, duration=0s) - repo traceability/integrity checks passed.

## Boolean Check Results
- Ticket identified from branch and commits: true
- Ticket IDs belong to exactly one track: true
- Ticket IDs exist in tracker: true
- Track identified: true
- Ownership scope respected: false
- Docs/process-only scope enforced when GENERAL_DOCS_PROCESS: n/a
- Required automated command set passed: false
- ECS DOM boundary respected (simulation systems avoid DOM APIs): true
- Adapter injection discipline respected (no direct adapter imports in systems): true
- Forbidden tech absent (canvas/framework/WebGL/WebGPU): true
- Unsafe DOM sinks absent (innerHTML/outerHTML/insertAdjacentHTML/document.write): true
- Code execution sinks absent (eval/new Function/string timers): true
- Lockfile pairing valid when package.json changed: n/a
- PR checklist/template contract satisfied: false
- Workflow guide contract satisfied (checks run, audit IDs listed, human review requested): false
- Audit matrix mapping resolved for affected behavior: false
- Manual evidence present when F-19/F-20/F-21/B-06 are impacted: n/a

## Requirements And Audit Coverage
- Affected REQ IDs: REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, REQ-14
- Affected AUDIT IDs: AUDIT-F-11, AUDIT-F-12, AUDIT-F-13, AUDIT-F-14, AUDIT-F-15, AUDIT-F-16, AUDIT-B-03
- Coverage evidence status per affected ID:
  - AUDIT-F-11: FAIL (no behavior-level integration/e2e assertion added for player command obedience in this branch)
  - AUDIT-F-12: FAIL (no behavior-level integration/e2e assertion added for hold-to-move in this branch)
  - AUDIT-F-13: FAIL (no gameplay-loop behavior assertion added in this branch)
  - AUDIT-F-14: FAIL (timer behavior not asserted beyond foundational store shape/reset)
  - AUDIT-F-15: FAIL (score behavior not asserted beyond foundational store shape/reset)
  - AUDIT-F-16: FAIL (lives behavior not asserted beyond foundational store shape/reset)
  - AUDIT-B-03: FAIL (memory-reuse evidence for gameplay loops not attached; only typed-array foundation tests present)
- Manual evidence status (F-19/F-20/F-21/B-06): n/a

## Ticket Compliance
- Ticket deliverables (TICKET mode):
   - src/ecs/components/spatial.js implemented with position/velocity/collider stores: PASS
   - src/ecs/components/actors.js implemented with player/ghost/input-state stores: PASS
   - src/ecs/components/props.js implemented with bomb/fire/power-up/pellet stores: PASS
   - src/ecs/components/stats.js implemented with score/timer/health stores: PASS
   - src/ecs/components/visual.js implemented with renderable/visual-state stores: PASS
   - Component-mask registration present in src/ecs/components/registry.js: PASS
- Verification gate items (TICKET mode):
   - Unit tests added for registry and all B-01 component stores: PASS
   - Unit tests pass (npm run test:unit): PASS
   - Required quality/policy command gates pass: FAIL
   - Track ownership scope respected for B-01 branch: FAIL
- General docs/process scope compliance (GENERAL_DOCS_PROCESS mode): n/a
- Stability and no-breakage review (GENERAL_DOCS_PROCESS mode): n/a
- Out-of-scope change findings: tests/unit/components/* are out of Track B ownership per policy rules.

## Findings (By Severity)
### Critical
1. Required command suite is not green: npm ci, npm run check, npm run sbom, npm run ci, npm run policy, and npm run policy:quality failed.
2. Track ownership gate fails when policy checks are run with prepared metadata: B-01 branch modifies tests/unit/components/*, which are outside Track B allowed ownership.
3. PR checklist/workflow contract is incomplete in docs/pr-messages/b-01-ecs-components-pr.md (required checks not fully completed, audit IDs not explicitly listed by ID).

### High
1. Lint failures include changed files (actors.js and multiple tests) plus unrelated baseline test import-order failures; this blocks policy quality gate.
2. SBOM command fails due npm ls ELSPROBLEMS (invalid fsevents dependency state), preventing full CI gate compliance.

### Medium
1. Standalone npm run policy:checks fails without prepared metadata context, which can hide true policy failure cause unless npm run policy:prep is executed first in local debugging.

### Low
1. Branch naming uses TB-01 pattern; ticket detection works only because B-01 appears as a substring, which is less explicit than canonical track-ticket naming.

## Merge Verdict
- VERDICT: RED
- READY_FOR_MAIN: NO
- AUDIT_MODE: TICKET
- TICKET_SCOPE: B-01
- TRACK: B

## Path To Green (Required if RED)
1. Resolve lockfile/dependency state so npm ci passes and sbom generation is stable (fix package-lock.json/package graph consistency).
2. Fix all Biome errors (format and import ordering) so npm run check, npm run ci, npm run policy, and npm run policy:quality pass.
3. Resolve Track B ownership violations by moving tests/unit/components/* changes to the allowed ownership path strategy (or adjust policy-approved ownership for this ticket if intentionally shared).
4. Complete PR checklist contract with explicit affected AUDIT IDs and rerun required gates, then update evidence in PR description.

## Optional Follow-Ups
1. Add a small helper command/script that runs policy:prep before policy:checks locally to avoid metadata-context false starts.
2. Align branch naming convention to explicit ticket format for easier human triage and consistent tooling behavior.
