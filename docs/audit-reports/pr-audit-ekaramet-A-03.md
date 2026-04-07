# A-03 PR Audit Report

Date: 2026-04-07

## Report Metadata
- Output file path: docs/audit-reports/pr-audit-ekaramet-A-03.md
- Base branch: main
- Head branch: ekaramet/A-03

## Scope Reviewed
- Branch: ekaramet/A-03
- Ticket scope: A-03
- Track: A
- Audit mode: TICKET
- Base comparison: merge-base(main, HEAD)..HEAD
- Files changed: 45

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
- npm ci: PASS (exit=0, duration=3s) - Dependencies installed cleanly.
- npm run check: PASS (exit=0, duration=0s) - Biome checks passed.
- npm run test: PASS (exit=0, duration=2s) - Vitest suite passed.
- npm run test:coverage: PASS (exit=0, duration=2s) - Coverage run passed.
- npm run validate:schema: PASS (exit=0, duration=0s) - Map/audio/visual schema validation passed.
- npm run sbom: PASS (exit=0, duration=1s) - SBOM generated.
- npm run ci: PASS (exit=0, duration=3s) - Composite CI script passed.
- npm run test:unit: PASS (exit=0, duration=2s) - Unit tests passed.
- npm run test:integration: PASS (exit=0, duration=0s) - Integration tests passed.
- npm run test:e2e: PASS (exit=0, duration=4s) - Playwright e2e tests passed.
- npm run test:audit: PASS (exit=0, duration=0s) - Audit inventory test passed.
- npm run check:forbidden: PASS (exit=0, duration=0s) - Forbidden-tech check passed.
- npm run policy -- --require-approval=false: FAIL (exit=1, duration=5s) - Failed because policy:checks reported Track A ownership violation.
- npm run policy:repo: PASS (exit=0, duration=1s) - Repo policy gate passed.
- npm run policy:quality: PASS (exit=0, duration=4s) - Quality gate passed.
- npm run policy:checks: FAIL (exit=1, duration=0s) - Track A ownership violation on out-of-scope component files.
- npm run policy:forbid: PASS (exit=0, duration=0s) - Changed-file forbidden scan passed.
- npm run policy:header: PASS (exit=0, duration=0s) - Changed-file source-header check passed.
- npm run policy:approve -- --require-approval=false: PASS (exit=0, duration=0s) - Approval check intentionally bypassed by flag.
- npm run policy:forbidrepo: PASS (exit=0, duration=0s) - Repo forbidden scan passed.
- npm run policy:headerrepo: PASS (exit=0, duration=0s) - Repo header check passed.
- npm run policy:trace: PASS (exit=0, duration=0s) - Repo traceability checks passed.

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
- Lockfile pairing valid when package.json changed: true
- PR checklist/template contract satisfied: false
- Workflow guide contract satisfied (checks run, audit IDs listed, human review requested): false
- Audit matrix mapping resolved for affected behavior: true
- Manual evidence present when F-19/F-20/F-21/B-06 are impacted: n/a

## Requirements And Audit Coverage
- Affected REQ IDs: REQ-02, REQ-09
- Affected AUDIT IDs: AUDIT-F-02, AUDIT-F-08, AUDIT-F-10
- Coverage evidence status per affected ID: AUDIT-F-02 PASS (runtime + tests), AUDIT-F-08 PASS (integration behavior), AUDIT-F-10 PASS (integration/e2e pause behavior)
- Manual evidence status (F-19/F-20/F-21/B-06): n/a

## Ticket Compliance
- Ticket deliverables (TICKET mode):
   - src/main.ecs.js app entry and rAF runtime bootstrap: PASS
   - src/game/bootstrap.js world assembly and fixed-step driver: PASS
   - src/game/game-flow.js FSM driver (MENU/PLAYING/PAUSED/GAME_OVER/VICTORY): PASS
   - src/game/level-loader.js level-load orchestration stub: PASS
   - Global unhandledrejection handling with visible overlay: PASS
   - Instrumentation hooks for frame-time/FPS probing: PASS
- Verification gate items (TICKET mode):
   - Integration tests prove pause invariants: PASS
   - Browser e2e proves rAF continues while simulation is frozen: PASS
- General docs/process scope compliance (GENERAL_DOCS_PROCESS mode): n/a
- Stability and no-breakage review (GENERAL_DOCS_PROCESS mode): n/a
- Out-of-scope change findings: Track A ownership violations remain in changed files: src/ecs/components/props.js, src/ecs/components/registry.js, src/ecs/components/spatial.js, src/ecs/components/stats.js, src/ecs/components/visual.js

## Findings (By Severity)
### Critical
1. Track ownership violation for ticket mode: branch includes files outside Track A ownership scope.

### High
1. PR checklist assertion "changed files stay within declared ticket ownership scope" is contradicted by actual diff evidence.

### Medium
1. None.

### Low
1. None.

## Merge Verdict
- VERDICT: RED
- READY_FOR_MAIN: NO
- AUDIT_MODE: TICKET
- TICKET_SCOPE: A-03
- TRACK: A

## Path To Green (Required if RED)
1. Re-scope the branch to Track A ownership only (remove/split out-of-scope component changes into appropriate track branch).
2. Re-run `npm run policy:checks` and `npm run policy -- --require-approval=false` after ownership cleanup.

## Optional Follow-Ups
1. Keep `policy:prep` in local flow before `policy:checks` to ensure branch-range changed-file context is always current.
2. Keep audit IDs in PR messages limited to directly evidenced IDs for the touched ticket scope.
