# Codebase Analysis and Audit Report

Date: 2026-04-10
Project: make-your-game
Scope: Full repository review using five parallel subagents

## Methodology

Five parallel analysis passes were executed across the codebase:
1. Bugs and Logic Errors
2. Dead Code and Unused References
3. Architecture and ECS Violations
4. Code Quality and Security
5. Tests and CI Gaps

Each pass was evidence-driven and read-only. Findings below include concrete file/line references and suggested remediations.

## Executive Summary

- Blocking: 3
- Critical: 1
- High: 10
- Medium: 9
- Low: 4

Top risks:
1. Structural ECS mutation and entity-store leakage in restart flow
2. Final-level completion path fails to reach VICTORY
3. CI can pass while required audit categories are effectively unverified

---

## 1) Bugs and Logic Errors

### H-01: Final level completion does not transition to VICTORY
- Evidence: [src/game/level-loader.js](src/game/level-loader.js#L115), [src/game/game-flow.js](src/game/game-flow.js#L96), [src/game/game-flow.js](src/game/game-flow.js#L104), [docs/game-description.md](docs/game-description.md#L348)
- Impact: Player can complete the final level and be forced back into gameplay loop instead of end-state victory.
- Suggested solution: In LEVEL_COMPLETE flow, check result of advanceLevel; if null, transition to VICTORY instead of PLAYING.
- Tests to add: unit test in [tests/unit/game/game-flow.test.js](tests/unit/game/game-flow.test.js), integration test in [tests/integration/gameplay/game-flow.level-loader.test.js](tests/integration/gameplay/game-flow.level-loader.test.js).

### H-02: startGame is non-idempotent when already PLAYING
- Evidence: [src/game/game-flow.js](src/game/game-flow.js#L109), [src/main.ecs.js](src/main.ecs.js#L185), [src/main.ecs.js](src/main.ecs.js#L186)
- Impact: Repeated start action can reset timing baseline mid-game and cause jitter or frame-step anomalies.
- Suggested solution: Return false when state is already PLAYING, or return a structured status differentiating no-op from true transition; call resyncTime only on true transitions.
- Tests to add: repeated-start no-op unit test and integration timing assertion.

### H-03: Game can enter PLAYING with invalid/null map resource
- Evidence: [src/game/bootstrap.js](src/game/bootstrap.js#L70), [src/game/level-loader.js](src/game/level-loader.js#L80), [src/game/level-loader.js](src/game/level-loader.js#L95), [src/game/game-flow.js](src/game/game-flow.js#L81)
- Impact: Future gameplay systems may crash or behave unpredictably if map resource is missing.
- Suggested solution: Load and validate map before PLAYING transition; fail closed with user-visible error and preserve last known-good map.
- Tests to add: failed-load start path test and map preservation test.

### H-04: Out-of-bounds map access can be treated as passable
- Evidence: [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L393), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L449), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L468)
- Impact: Movement/pathing can escape grid and create downstream logic corruption.
- Suggested solution: Add strict bounds helper and short-circuit false for out-of-range in passability/wall queries.
- Tests to add: negative and overflow row/col tests in [tests/unit/resources/map-resource.test.js](tests/unit/resources/map-resource.test.js).

### M-01: Semantic validator can throw TypeError on malformed map payloads
- Evidence: [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L157), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L231), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L232)
- Impact: Hard crash path instead of deterministic validation error reporting.
- Suggested solution: Add structural and bounds guards before grid indexing; accumulate validation errors rather than throwing.

### M-02: loadLevel commits level index before successful map resolve
- Evidence: [src/game/level-loader.js](src/game/level-loader.js#L91), [src/game/level-loader.js](src/game/level-loader.js#L95)
- Impact: Failed load can desynchronize level index and world resource state.
- Suggested solution: Resolve into temporary variable first, commit index/resource only on success.

---

## 2) Dead Code and Unused References

### H-05: Unreachable package.json dependency-ban branch in policy checks
- Evidence: [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L477), [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L515), [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L553)
- Impact: Intended dependency-ban logic is effectively dead and can produce false confidence.
- Suggested solution: Move package.json checks outside source-only scan gate, or explicitly include package.json in scanned targets.

### M-03: Dead conditional in createSyncMapLoader restart path
- Evidence: [src/game/level-loader.js](src/game/level-loader.js#L60), [src/game/level-loader.js](src/game/level-loader.js#L61), [src/game/level-loader.js](src/game/level-loader.js#L64)
- Impact: Misleading branch complexity with no behavior difference.
- Suggested solution: Collapse to one return path, or implement truly different restart semantics.

### M-04: Redundant cachedMapResource option plumbing
- Evidence: [src/game/level-loader.js](src/game/level-loader.js#L86), [src/game/level-loader.js](src/game/level-loader.js#L100), [tests/unit/resources/map-resource.test.js](tests/unit/resources/map-resource.test.js#L489)
- Impact: API surface grows without runtime usage.
- Suggested solution: Remove option until needed, or document as intentionally reserved.

### L-01: Duplicate npm scripts for same policy command
- Evidence: [package.json](package.json#L17), [package.json](package.json#L35)
- Impact: Script drift and maintenance overhead.
- Suggested solution: Keep one canonical script and deprecate alias.

### L-02: Tracked changed-files artifact appears stale
- Evidence: [changed-files.txt](changed-files.txt#L1), [.gitignore](.gitignore#L42)
- Impact: Noise and confusion in repository state.
- Suggested solution: Remove tracked artifact and regenerate only in CI/local gate runs.

---

## 3) Architecture and ECS Violations

### C-01: Restart flow performs immediate structural mutation and breaks entity opacity
- Violated rule: Structural deferral and opaque entities from [AGENTS.md](AGENTS.md)
- Evidence: [src/game/game-flow.js](src/game/game-flow.js#L49), [src/game/game-flow.js](src/game/game-flow.js#L54), [src/game/game-flow.js](src/game/game-flow.js#L56), [src/game/game-flow.js](src/game/game-flow.js#L61), [src/ecs/world/world.js](src/ecs/world/world.js#L83), [src/ecs/world/world.js](src/ecs/world/world.js#L103)
- Impact: Order-sensitive bugs, determinism risk, and encapsulation leakage.
- Suggested solution: Add world-level deferred teardown command at sync point; remove direct entityStore access from game-flow.

### H-06: World API allows immediate structural mutation during dispatch
- Violated rule: Structural changes must be deferred
- Evidence: [src/ecs/world/world.js](src/ecs/world/world.js#L55), [src/ecs/world/world.js](src/ecs/world/world.js#L61), [src/ecs/world/world.js](src/ecs/world/world.js#L141)
- Impact: Mid-dispatch mutation can create hidden nondeterminism and ordering bugs.
- Suggested solution: Enforce dispatch guard that rejects immediate mutators during runFixedStep; require defer APIs for runtime/system paths.

### H-07: Render phase coupled to fixed-step simulation loop
- Violated rule: One dedicated DOM commit per frame with clear read/compute versus write boundaries
- Evidence: [src/ecs/world/world.js](src/ecs/world/world.js#L16), [src/ecs/world/world.js](src/ecs/world/world.js#L141), [src/game/bootstrap.js](src/game/bootstrap.js#L100)
- Impact: During catch-up, render-related systems may run more than once per frame and increase DOM pressure.
- Suggested solution: Split simulation stepping and render commit; keep DOM commit once per requestAnimationFrame.

### M-05: Input adapter contract leak via fallback field probing
- Evidence: [src/main.ecs.js](src/main.ecs.js#L97), [src/main.ecs.js](src/main.ecs.js#L107), [src/game/bootstrap.js](src/game/bootstrap.js#L125)
- Impact: Tight coupling to adapter internals and brittle future adapter swaps.
- Suggested solution: Require explicit adapter interface methods and validate at registration.

---

## 4) Code Quality and Security

### H-08: Map validation path can hard-fail on malformed structures
- Evidence: [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L146), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L175), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L336)
- Impact: Runtime crash risk from malformed map payloads instead of controlled rejection.
- Suggested solution: Add strict structural preflight and in-bounds guards before semantic traversal.

### H-09: Runtime map trust boundary is not strictly enforced
- Evidence: [src/game/level-loader.js](src/game/level-loader.js#L80), [src/game/level-loader.js](src/game/level-loader.js#L95), [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js#L334)
- Impact: Untrusted or malformed loader outputs can enter world state.
- Suggested solution: Enforce schema plus semantic validation at load boundary before setResource.

### M-06: Production CSP and Trusted Types enforcement is missing
- Evidence: [index.html](index.html#L4), [vite.config.js](vite.config.js#L3), [AGENTS.md](AGENTS.md#L151), [AGENTS.md](AGENTS.md#L156)
- Impact: Lower defense-in-depth against future sink regressions.
- Suggested solution: Enforce strict production CSP and Trusted Types policy in deployment path and CI checks.

### M-07: Security scanning is primarily changed-file scoped
- Evidence: [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L514), [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L579), [scripts/policy-gate/run-all.mjs](scripts/policy-gate/run-all.mjs#L200)
- Impact: Existing risky patterns in untouched files may persist undetected.
- Suggested solution: Add full-repo security scan stage in CI (or nightly) using same sink checks.

### M-08: Schema validation script can fail-open on missing files
- Evidence: [scripts/validate-schema.mjs](scripts/validate-schema.mjs#L62), [scripts/validate-schema.mjs](scripts/validate-schema.mjs#L63)
- Impact: Missing critical schema/input may pass with warnings.
- Suggested solution: Fail closed for required schemas/manifests/maps and allowlist optional files explicitly.

### L-03: Repetitive runtime error loop risk without escalation budget
- Evidence: [src/main.ecs.js](src/main.ecs.js#L192), [src/main.ecs.js](src/main.ecs.js#L209), [src/ecs/world/world.js](src/ecs/world/world.js#L144)
- Impact: Persistent per-frame exceptions can degrade performance and observability.
- Suggested solution: Add per-system error budget and temporary quarantine/escalation after threshold.

---

## 5) Tests and CI Gaps

### B-01: CI can pass with effectively no browser verification
- Evidence: [package.json](package.json#L21), [package.json](package.json#L22), [scripts/policy-gate/run-project-gate.mjs](scripts/policy-gate/run-project-gate.mjs#L19), [.github/workflows/policy-gate.yml](.github/workflows/policy-gate.yml#L51)
- Impact: Audit-required browser and gameplay checks can be absent while pipeline is green.
- Suggested solution: Remove pass-with-no-tests behavior and make policy gate execute and require e2e plus audit test suites.

### B-02: Audit coverage test is inventory-only, not behavior verification
- Evidence: [tests/e2e/audit/audit.e2e.test.js](tests/e2e/audit/audit.e2e.test.js#L6), [tests/e2e/audit/audit-question-map.js](tests/e2e/audit/audit-question-map.js#L3)
- Impact: False confidence that audit IDs are validated.
- Suggested solution: Add executable assertions per audit ID or enforce evidence validators for each mapped question.

### B-03: Semi-automatable and manual evidence categories are not CI-enforced
- Evidence: [docs/audit-reports/phase-testing-verification-report.md](docs/audit-reports/phase-testing-verification-report.md#L29), [docs/audit-reports/phase-testing-verification-report.md](docs/audit-reports/phase-testing-verification-report.md#L30), [scripts/policy-gate/run-checks.mjs](scripts/policy-gate/run-checks.mjs#L401)
- Impact: Performance and trace-based acceptance criteria can regress silently.
- Suggested solution: Add Performance API assertions for required IDs and require a manual-evidence manifest with artifact paths in CI.

### H-10: Functional E2E coverage is too narrow for documented scope
- Evidence: [tests/e2e/game-loop.pause.spec.js](tests/e2e/game-loop.pause.spec.js), [tests/e2e/game-loop.unhandled-rejection.spec.js](tests/e2e/game-loop.unhandled-rejection.spec.js), [docs/audit.md](docs/audit.md#L26)
- Impact: Many core gameplay and HUD behaviors remain unverified in real browser runs.
- Suggested solution: Add scenario E2E tests for pause continue/restart, timer/lives/score changes, keyboard controls, and level progression.

### H-11: Adapter-boundary integration coverage is effectively empty
- Evidence: [tests/integration/adapters/.gitkeep](tests/integration/adapters/.gitkeep), [vitest.config.js](vitest.config.js#L6), [docs/audit-reports/phase-testing-verification-report.md](docs/audit-reports/phase-testing-verification-report.md#L16)
- Impact: Adapter contracts can break unnoticed.
- Suggested solution: Add jsdom integration suite for adapter boundaries and ensure CI runs it as required.

### H-12: Coverage gate is inflated by counting tests in coverage include
- Evidence: [vitest.config.js](vitest.config.js#L11), [vitest.config.js](vitest.config.js#L12)
- Impact: Coverage percentage may overstate source confidence.
- Suggested solution: Restrict coverage include to src and keep tests excluded.

### M-09: Playwright flakiness risk from fixed sleep timing
- Evidence: [tests/e2e/game-loop.pause.spec.js](tests/e2e/game-loop.pause.spec.js#L21), [tests/e2e/game-loop.pause.spec.js](tests/e2e/game-loop.pause.spec.js#L29), [tests/e2e/game-loop.pause.spec.js](tests/e2e/game-loop.pause.spec.js#L38)
- Impact: Nondeterministic CI failures under load variance.
- Suggested solution: Replace fixed waits with state-driven waits using expect.poll or waitForFunction.

### L-04: Header policy check is warn-mode in CI
- Evidence: [.github/workflows/policy-gate.yml](.github/workflows/policy-gate.yml#L26), [scripts/policy-gate/check-source-headers.mjs](scripts/policy-gate/check-source-headers.mjs#L22)
- Impact: Non-blocking governance allows gradual quality drift.
- Suggested solution: Use fail mode in CI and keep warn mode only for local development.

---

## Recommended Fix Order

1. C-01: Move restart teardown to deferred world API and remove entityStore leakage
2. H-01: Fix final-level to VICTORY transition
3. H-02: Make startGame idempotent during PLAYING and guard resync
4. B-01 and B-03: Enforce required e2e/perf/manual evidence gates in CI
5. H-03, H-04, H-08, H-09: Harden map trust boundary and bounds handling
6. H-10 and H-11: Expand E2E and adapter integration coverage
7. Dead-code cleanup items (H-05, M-03, M-04, L-01, L-02)

## Notes

- No direct unsafe HTML injection sink was confirmed in runtime paths reviewed; current error rendering uses safe textContent writes in [src/main.ecs.js](src/main.ecs.js#L117).
- A few findings are currently latent due to staged implementation, but they remain high-priority because they are in core runtime/state and CI gate paths.
