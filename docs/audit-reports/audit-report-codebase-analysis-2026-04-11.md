# Codebase Analysis & Audit Report

**Date:** 2026-04-11
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Runtime/state-transition defects across bootstrap, game flow, clock/timing, map validation, and lifecycle/error paths.
2. **Dead Code & Unused References** — Unreachable branches, unused runtime surfaces, stale ownership/config artifacts, and outdated interface docs.
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundaries, DOM isolation, adapter/resource wiring, render pipeline contracts, ownership-policy alignment, and audit-criteria structural satisfiability.
4. **Code Quality & Security** — Unsafe sinks/forbidden APIs, CSP/Trusted Types posture, trust-boundary validation behavior, and policy-gate bypass risk.
5. **Tests & CI Gaps** — Coverage realism, Playwright enforcement, audit-category enforcement, flakiness patterns, and CI gate completeness.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 5 |
| 🟠 High | 8 |
| 🟡 Medium | 12 |
| 🟢 Low / Info | 4 |

**Top risks:**
1. Audit acceptance appears structurally non-verifiable in CI because behavior-level Playwright audit execution is not enforced end-to-end.
2. Runtime wiring gaps leave key ECS architecture contracts (render commit and adapter injection) partially unimplemented in active loop execution.
3. Restart and progression defects can cause frozen simulation or invalid state transitions (PLAYING entered without valid next-level/map guarantees).
4. Security governance is bypassable in policy-gate paths (self-modifying gate code and fail-open approval/schema behaviors).
5. Ownership/policy/config drift and stale scaffolding reduce determinism confidence and increase merge-time blind spots.

---

## 1) Bugs & Logic Errors

### BUG-01: Restart corrupts clock baseline with undefined timestamp ⬆ Blocking
**Origin:** Agent 1 (BUG-01)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/game/bootstrap.js` (~L81)
- `src/game/bootstrap.js` (~L98)
- `src/game/bootstrap.js` (~L100)
- `src/ecs/resources/clock.js` (~L89)

**Problem:** Restart passes `clock.realTimeMs` into `resetClock`, but this field is undefined in the active clock resource model.
**Impact:** `lastFrameTime` becomes invalid, causing NaN step math and potential simulation freeze/desync after restart.

**Fix:** Use a finite timestamp source (`performance.now()` wrapper) on restart and resync timing baseline immediately after successful restart.

**Tests to add:** Restart integration test asserting finite step count and monotonic sim-time progress in subsequent frames.

---

### BUG-02: Final-level completion bypasses VICTORY transition ⬆ Critical
**Origin:** Agent 1 (BUG-02)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/game-flow.js` (~L96)
- `src/game/game-flow.js` (~L98)
- `src/game/game-flow.js` (~L103)
- `src/game/level-loader.js` (~L114)
- `src/game/level-loader.js` (~L115)

**Problem:** `LEVEL_COMPLETE` flow always attempts `advanceLevel` then transitions to `PLAYING` even when no next level exists.
**Impact:** Endgame path can incorrectly re-enter gameplay with no valid level progression.

**Fix:** Branch on `advanceLevel` result; transition to `VICTORY` when no map is returned.

**Tests to add:** Unit test for terminal level: `advanceLevel -> null` must transition to `VICTORY`.

---

### BUG-03: Map-load failures are accepted as successful game start ⬆ Critical
**Origin:** Agent 1 (BUG-03)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/level-loader.js` (~L95)
- `src/game/level-loader.js` (~L103)
- `src/game/game-flow.js` (~L87)
- `src/game/game-flow.js` (~L93)

**Problem:** `loadLevel` can return `null`, but start flow still returns success and transitions to `PLAYING`.
**Impact:** Active gameplay can start with missing map resource and undefined downstream behavior.

**Fix:** Fail closed on null map load (throw/return false) and keep state out of `PLAYING` until map resource is valid.

**Tests to add:** Unit test where loader returns null; assert game remains in non-playing state and surfaces critical failure.

---

### BUG-04: Out-of-bounds tiles can be treated as passable ⬆ High
**Origin:** Agent 1 (BUG-04)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/ecs/resources/map-resource.js` (~L394)
- `src/ecs/resources/map-resource.js` (~L449)
- `src/ecs/resources/map-resource.js` (~L456)
- `src/ecs/resources/map-resource.js` (~L468)
- `src/ecs/resources/map-resource.js` (~L470)

**Problem:** Cell access/passability paths lack strict bounds guards, allowing undefined cells to pass equality-based wall checks.
**Impact:** Movement/pathing can query invalid positions as traversable near map edges.

**Fix:** Add explicit in-bounds validation in access/passability helpers and treat OOB as blocked.

**Tests to add:** Negative and overflow coordinate passability tests for player/ghost checks.

---

### BUG-05: Non-positive frame deltas force artificial simulation progress ⬆ Medium
**Origin:** Agent 1 (BUG-05)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/ecs/resources/clock.js` (~L67)
- `src/ecs/resources/clock.js` (~L68)

**Problem:** When frame delta is `<= 0`, logic substitutes fixed dt instead of no-op.
**Impact:** Timing anomalies can inject synthetic simulation steps and harm determinism.

**Fix:** Clamp to zero, update baseline safely, and return zero steps for zero-delta frames.

**Tests to add:** Clock unit test for equal timestamps expecting no simulation advancement.

---

### BUG-06: Frame probe "latest" metric reports max sample instead of most recent ⬆ Low
**Origin:** Agent 1 (BUG-06)
**Files:** Ownership: Track A (`src/main.ecs.js`)
- `src/main.ecs.js` (~L82)

**Problem:** Latest frame metric is derived from sorted percentile array rather than ring-buffer cursor.
**Impact:** Telemetry/debug data can misrepresent current frame health.

**Fix:** Track latest delta separately or compute from cursor index before sorting.

**Tests to add:** Probe unit test with non-monotonic deltas ensuring latest != max behavior.

---

## 2) Dead Code & Unused References

### DEAD-01: Unreachable fallback branch in ticket-association logic ⬆ Medium
**Origin:** Agent 2 (DEAD-01)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/run-checks.mjs` (~L116)
- `scripts/policy-gate/run-checks.mjs` (~L127)
- `scripts/policy-gate/run-checks.mjs` (~L137)

**Problem:** Conditional branches already fully partition zero-ticket cases; trailing zero-ticket branch is unreachable.
**Impact:** Redundant control flow obscures intent in policy-critical logic.

**Fix:** Remove unreachable branch and keep two explicit mode-specific zero-ticket outcomes.

---

### DEAD-02: Restart option branch in sync map loader is behaviorally dead ⬆ Low
**Origin:** Agent 2 (DEAD-02)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/level-loader.js` (~L60)
- `src/game/level-loader.js` (~L61)
- `src/game/level-loader.js` (~L64)

**Problem:** `options.restart` and default path execute identical return logic.
**Impact:** Redundant API surface implies unsupported mode distinction.

**Fix:** Collapse branch or implement true restart-specific semantics.

---

### DEAD-03: ECS scaffolding modules are production-dead (test-only references) ⬆ Medium
**Origin:** Agent 2 (DEAD-04)
**Files:** Ownership: Track B (`src/ecs/components/**`), Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`)
- `src/ecs/components/spatial.js` (~L48)
- `src/ecs/components/props.js` (~L49)
- `src/ecs/components/stats.js` (~L33)
- `src/ecs/resources/event-queue.js` (~L32)
- `src/ecs/resources/rng.js` (~L32)
- `src/ecs/render-intent.js` (~L49)

**Problem:** Several exported modules are exercised in unit tests but not wired into active runtime bootstrap graph.
**Impact:** Maintained production API surface with no runtime effect increases drift risk.

**Fix:** Either integrate modules into runtime paths or clearly isolate as planned scaffolding/non-runtime contracts.

---

### DEAD-04: Ownership rules contain stale patterns for non-existent files ⬆ Medium
**Origin:** Agent 2 (DEAD-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L182)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L260)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L261)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L280)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L281)

**Problem:** Track policies reference files not present in repository.
**Impact:** Dead metadata reduces trust in ownership enforcement precision.

**Fix:** Remove stale patterns or create the referenced files before ownership declaration.

---

### DEAD-05: Generated artifacts are committed but excluded from active checks ⬆ Low
**Origin:** Agent 2 (DEAD-06)
**Files:** Ownership: Track A (`coverage/**`, `biome.json`), Shared (`**/.gitkeep`)
- `coverage/index.html` (~L1)
- `test-results/.last-run.json` (~L1)
- `biome.json` (~L27)
- `biome.json` (~L29)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L51)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L53)

**Problem:** Generated coverage/test-result files are tracked yet skipped by lint/policy scanning.
**Impact:** Stale, noisy artifacts with low governance signal.

**Fix:** Untrack generated outputs or enforce freshness checks if committed by policy.

---

### DEAD-06: JSDoc signatures drift from implementation ⬆ Low
**Origin:** Agent 2 (DEAD-07)
**Files:** Ownership: Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`)
- `src/ecs/resources/map-resource.js` (~L26)
- `src/ecs/resources/map-resource.js` (~L449)
- `src/ecs/render-intent.js` (~L16)
- `src/ecs/render-intent.js` (~L127)

**Problem:** Documented function signatures mismatch actual exported parameter lists.
**Impact:** Incorrect API expectations and onboarding confusion.

**Fix:** Align JSDoc with current code contracts (or restore documented parameters if intended).

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Render commit architecture is not wired into runtime ⬆ Blocking
**Origin:** Agent 3 (ARCH-01)
**Violated rule:** "Batching: MUST batch DOM writes in a dedicated render commit phase once per frame." and "Commit Phases: MUST separate render read/compute from DOM write commit phases."
**Files:** Ownership: Track A (`src/main.ecs.js`, `src/game/**`), Track D (`src/ecs/render-intent.js`)
- `src/main.ecs.js` (~L304)
- `src/game/bootstrap.js` (~L91)
- `src/ecs/render-intent.js` (~L4)

**Problem:** Runtime bootstrap starts loop without explicit render-collect/render-commit system wiring.
**Impact:** Performance and architecture drift; render intent remains contract-only rather than enforced phase behavior.

**Fix:** Register ordered phases in bootstrap: input snapshot -> simulation -> render collect -> single DOM commit per rAF.

---

### ARCH-02: Input adapter resource injection contract is not satisfied ⬆ Critical
**Origin:** Agent 3 (ARCH-02), Agent 2 (DEAD-03)
**Violated rule:** "Adapter Injection: Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track A (`src/game/**`), Track B (`src/ecs/systems/input-system.js`)
- `src/game/bootstrap.js` (~L86)
- `src/game/bootstrap.js` (~L89)
- `src/game/bootstrap.js` (~L126)
- `src/ecs/systems/input-system.js` (~L37)

**Problem:** Input system expects `inputAdapter` resource, but bootstrap does not register/inject it.
**Impact:** Deterministic input contract cannot be structurally guaranteed in active runtime.

**Fix:** Instantiate input adapter at bootstrap, register as world resource, and teardown in lifecycle stop path.

---

### ARCH-03: Game-flow restart path bypasses opaque-entity and deferred-mutation boundaries ⬆ High
**Origin:** Agent 3 (ARCH-03)
**Violated rule:** "Structure: MUST structure gameplay with ECS: entities as opaque IDs, components as data-only, systems as behavior." and "Structural Deferral: MUST defer entity/component add/remove operations to a controlled sync point."
**Files:** Ownership: Track A (`src/game/**`, `src/ecs/world/**`)
- `src/game/game-flow.js` (~L49)
- `src/game/game-flow.js` (~L56)
- `src/game/game-flow.js` (~L61)
- `src/ecs/world/world.js` (~L93)
- `src/ecs/world/world.js` (~L114)

**Problem:** Restart logic reaches into entity-store internals and performs immediate destruction.
**Impact:** Encapsulation and determinism guarantees weaken under lifecycle operations.

**Fix:** Add world-level restart/teardown API that schedules structural mutations for sync-point application.

---

### ARCH-04: Deterministic cross-system event ordering is defined but not integrated ⬆ High
**Origin:** Agent 3 (ARCH-04)
**Violated rule:** "Event Ordering: MUST process cross-system events in deterministic insertion order."
**Files:** Ownership: Track D (`src/ecs/resources/**`), Track A (`src/game/**`)
- `src/ecs/resources/event-queue.js` (~L32)
- `src/ecs/resources/event-queue.js` (~L67)
- `src/game/bootstrap.js` (~L86)

**Problem:** Event queue resource exists but is not registered/consumed in active world step.
**Impact:** Required deterministic event pipeline is not enforced in runtime behavior.

**Fix:** Register event queue resource, reset sequence per fixed-step boundary, and define producer/consumer phases.

---

### ARCH-05: Audit behavioral verification is structurally unsatisfiable in current harness ⬆ Blocking
**Origin:** Agent 3 (ARCH-05), Agent 5 (CI-01)
**Violated rule:** "MUST maintain end-to-end/integration verification coverage for every question in docs/audit.md... with explicit automated checks for Fully Automatable and Semi-Automatable items and explicit evidence artifacts for Manual-With-Evidence items."
**Files:** Ownership: Track A (`tests/**`, `package.json`, `playwright.config.js`)
- `tests/e2e/audit/audit.e2e.test.js` (~L21)
- `package.json` (~L23)
- `playwright.config.js` (~L6)

**Problem:** Audit suite validates inventory counts rather than behavior; Playwright excludes audit folder.
**Impact:** Architecture/process cannot prove required audit gates are executable and passable.

**Fix:** Convert audit IDs to executable browser/perf/manual-evidence workflows and include them in CI-required Playwright runs.

---

### ARCH-06: Render-intent contract drifts from implementation-plan specification ⬆ Medium
**Origin:** Agent 3 (ARCH-06)
**Violated rule:** Implementation contract mismatch between `docs/implementation/implementation-plan.md` §5 and `src/ecs/render-intent.js`.
**Files:** Ownership: Shared (`docs/**`), Track D (`src/ecs/render-intent.js`)
- `docs/implementation/implementation-plan.md` (~L536)
- `docs/implementation/implementation-plan.md` (~L542)
- `docs/implementation/implementation-plan.md` (~L543)
- `docs/implementation/implementation-plan.md` (~L544)
- `src/ecs/render-intent.js` (~L52)
- `src/ecs/render-intent.js` (~L54)
- `src/ecs/render-intent.js` (~L58)
- `src/ecs/render-intent.js` (~L60)

**Problem:** Planned object-array/string-kind/row-col contract differs from typed-array/enum/x-y implementation.
**Impact:** Encapsulation and cross-track contract ambiguity.

**Fix:** Choose one canonical contract and align both docs and code (including tests and adapter consumers).

---

### ARCH-07: Asset-pipeline runtime contract is not implemented in bootstrap path ⬆ Medium
**Origin:** Agent 3 (ARCH-07)
**Violated rule:** "Runtime loads assets from manifests only." and "Critical startup assets are preloaded."
**Files:** Ownership: Shared (`docs/**`), Track A (`src/game/**`), Track D (`src/ecs/render-intent.js`)
- `docs/implementation/assets-pipeline.md` (~L86)
- `docs/implementation/assets-pipeline.md` (~L87)
- `docs/implementation/assets-pipeline.md` (~L89)
- `src/game/bootstrap.js` (~L86)
- `src/ecs/render-intent.js` (~L55)

**Problem:** Manifest-backed visual/audio preload resources are not wired in active runtime bootstrap.
**Impact:** Performance/startup contract drift and potential runtime inconsistency with documented pipeline.

**Fix:** Register manifest loaders/resources in bootstrap and preload critical assets prior to gameplay start.

---

### ARCH-08: Track ownership policy drift between docs and policy-utils rules ⬆ Medium
**Origin:** Agent 3 (ARCH-08)
**Violated rule:** Track boundary ownership declarations in track docs versus policy gate ownership map.
**Files:** Ownership: Shared (`docs/**`), Track A (`scripts/policy-gate/**`)
- `docs/implementation/track-b.md` (~L30)
- `docs/implementation/track-b.md` (~L52)
- `docs/implementation/track-d.md` (~L89)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L192)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L261)

**Problem:** Shared/single-owner expectations for specific component paths are inconsistent across canonical docs and enforcement code.
**Impact:** Encapsulation/governance ambiguity and avoidable gate noise.

**Fix:** Normalize ownership in one authoritative mapping and mirror exactly in policy-utils.

---

## 4) Code Quality & Security

### SEC-01: Production CSP and Trusted Types are not enforced ⬆ High
**Origin:** Agent 4 (SEC-01)
**Files:** Ownership: Track A (`index.html`, `vite.config.js`)
- `index.html` (~L4)
- `index.html` (~L15)
- `vite.config.js` (~L4)

**Problem:** Entry/build surfaces do not enforce strict CSP/Trusted Types for production.
**Impact:** Increases exploitability of any present/future DOM injection bug.

**Fix:** Enforce production CSP response headers (preferred) including `require-trusted-types-for 'script'`; keep development relaxation limited to HMR paths.

---

### SEC-02: Schema validation is fail-open for missing schema/data files ⬆ High
**Origin:** Agent 4 (SEC-02)
**Files:** Ownership: Track A (`scripts/validate-schema.mjs`)
- `scripts/validate-schema.mjs` (~L63)

**Problem:** Missing validation inputs log warnings and continue.
**Impact:** Tampered/malformed assets can bypass CI validation guarantees.

**Fix:** Treat missing required schema/data files as hard failures and exit non-zero in CI.

---

### SEC-03: Policy-gate security scan can be bypassed by editing excluded gate files ⬆ Critical
**Origin:** Agent 4 (SEC-03)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/run-checks.mjs` (~L653)
- `scripts/policy-gate/run-checks.mjs` (~L697)
- `scripts/policy-gate/run-checks.mjs` (~L776)

**Problem:** Changed-file scanning excludes policy-gate script paths, enabling self-modification bypass.
**Impact:** Security/process enforcement can be weakened within the same PR that changes gate code.

**Fix:** Include policy-gate files in scans, require stronger review ownership, and fail on unauthorized gate mutation patterns.

---

### SEC-04: Repo-wide forbidden-tech scanner has incomplete pattern coverage ⬆ Medium
**Origin:** Agent 4 (SEC-04)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/check-forbidden.mjs` (~L19)
- `scripts/policy-gate/check-forbidden.mjs` (~L20)
- `scripts/policy-gate/run-all.mjs` (~L246)
- `scripts/policy-gate/run-checks.mjs` (~L628)

**Problem:** Repo scanner focuses on limited forbidden patterns; broader dangerous APIs are not consistently enforced repo-wide.
**Impact:** Reduced confidence that banned constructs are uniformly blocked.

**Fix:** Centralize comprehensive forbidden-pattern set and reuse in both full-repo and changed-file checks.

---

### SEC-05: Approval requirement enforcement is fail-open on CI/API misconfiguration ⬆ Medium
**Origin:** Agent 4 (SEC-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/require-approval.mjs` (~L27)
- `scripts/policy-gate/require-approval.mjs` (~L33)
- `scripts/policy-gate/require-approval.mjs` (~L47)
- `scripts/policy-gate/require-approval.mjs` (~L54)

**Problem:** Missing token/review URL/API failures lead to skip/continue outcomes.
**Impact:** Independent-review guarantees can silently degrade.

**Fix:** Fail closed in CI when approval is required and review-state cannot be reliably verified.

---

## 5) Tests & CI Gaps

### CI-01: CI merge gate does not execute browser E2E tests ⬆ Critical
**Origin:** Agent 5 (CI-02)
**Files:** Ownership: Track A (`.github/workflows/**`, `scripts/policy-gate/**`, `package.json`)
- `.github/workflows/policy-gate.yml` (~L51)
- `scripts/policy-gate/run-project-gate.mjs` (~L19)
- `package.json` (~L18)
- `package.json` (~L22)

**Problem:** CI quality path runs policy + Vitest but does not require Playwright execution.
**Impact:** Browser/runtime regressions can merge without detection.

**Fix:** Add required `test:e2e` execution in merge gate or dedicated required workflow.

---

### CI-02: Semi-automatable performance gates lack threshold assertions ⬆ High
**Origin:** Agent 5 (CI-03)
**Files:** Ownership: Track A (`tests/**`, `AGENTS.md`)
- `tests/e2e/game-loop.pause.spec.js` (~L10)
- `tests/e2e/audit/audit-question-map.js` (~L100)
- `tests/e2e/audit/audit-question-map.js` (~L108)
- `tests/e2e/audit/audit-question-map.js` (~L156)
- `AGENTS.md` (~L186)
- `AGENTS.md` (~L205)
- `AGENTS.md` (~L207)

**Problem:** Performance-related audit IDs are mapped but not asserted with measurable thresholds.
**Impact:** p95/FPS/long-task criteria can be claimed without objective pass/fail evidence.

**Fix:** Add Playwright `page.evaluate` + `PerformanceObserver` probes with explicit thresholds for F-17/F-18/B-05.

---

### CI-03: Coverage gate scope can be inflated by test files ⬆ High
**Origin:** Agent 5 (CI-04)
**Files:** Ownership: Track A (`vitest.config.js`, `scripts/policy-gate/**`)
- `vitest.config.js` (~L11)
- `vitest.config.js` (~L12)
- `scripts/policy-gate/run-project-gate.mjs` (~L20)

**Problem:** Coverage include scope is not strictly source-only and lacks strict thresholds.
**Impact:** Coverage signal may overstate production-code verification.

**Fix:** Restrict include to source paths and enforce explicit global/per-file thresholds.

---

### CI-04: Policy gate checks inventory parity but not audit-category/evidence obligations ⬆ High
**Origin:** Agent 5 (CI-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`, `docs/implementation/pr-template.md`)
- `scripts/policy-gate/run-checks.mjs` (~L599)
- `scripts/policy-gate/run-checks.mjs` (~L604)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L31)
- `scripts/policy-gate/run-checks.mjs` (~L52)

**Problem:** Current checks validate question IDs/counts but not strict category partitions or manual evidence presence.
**Impact:** AGENTS audit obligations can be bypassed while still passing gate.

**Fix:** Enforce category membership and mandatory manual-evidence links for manual IDs in gate logic.

---

### CI-05: Source-header policy is warning-only in CI ⬆ Medium
**Origin:** Agent 5 (CI-06)
**Files:** Ownership: Track A (`.github/workflows/**`, `scripts/policy-gate/**`)
- `.github/workflows/policy-gate.yml` (~L26)
- `scripts/policy-gate/check-source-headers.mjs` (~L176)
- `scripts/policy-gate/check-source-headers.mjs` (~L178)

**Problem:** Header policy violations do not fail CI.
**Impact:** Mandatory header standard can drift indefinitely.

**Fix:** Use fail mode in CI; reserve warn mode for local/non-gating workflows.

---

### CI-06: Playwright pause test uses fixed sleeps (flakiness risk) ⬆ Medium
**Origin:** Agent 5 (CI-07)
**Files:** Ownership: Track A (`tests/**`)
- `tests/e2e/game-loop.pause.spec.js` (~L21)
- `tests/e2e/game-loop.pause.spec.js` (~L29)
- `tests/e2e/game-loop.pause.spec.js` (~L38)

**Problem:** Fixed `waitForTimeout` usage instead of state-driven synchronization.
**Impact:** Intermittent CI failures and timing-sensitive false positives.

**Fix:** Replace with explicit state probes (`expect.poll` / `waitForFunction`) tied to runtime readiness markers.

---

### CI-07: Audit/phase documentation is out of sync with executable test reality ⬆ Medium
**Origin:** Agent 5 (CI-08)
**Files:** Ownership: Shared (`docs/**`), Track A (`docs/implementation/ticket-tracker.md`)
- `docs/implementation/audit-traceability-matrix.md` (~L30)
- `docs/audit-reports/phase-testing-verification-report.md` (~L18)
- `docs/audit-reports/phase-testing-verification-report.md` (~L66)
- `docs/audit-reports/phase-testing-verification-report.md` (~L77)
- `docs/audit-reports/phase-testing-verification-report.md` (~L88)
- `docs/implementation/ticket-tracker.md` (~L33)
- `docs/implementation/ticket-tracker.md` (~L35)

**Problem:** Phase/matrix documentation assertions are not fully aligned with currently executable checks and tracker status signals.
**Impact:** Traceability confidence and release-readiness interpretation degrade.

**Fix:** Reconcile docs to executable reality and add doc-consistency gate checks for stale markers.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Description |
|----------------|---------|---------|---------|---------|---------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | Restart clock baseline uses undefined field |
| BUG-02 | BUG-02 | — | — | — | — | Final-level completion misses VICTORY branch |
| BUG-03 | BUG-03 | — | — | — | — | Start flow accepts null map load |
| BUG-04 | BUG-04 | — | — | — | — | OOB tile passability bug |
| BUG-05 | BUG-05 | — | — | — | — | Zero/negative delta forces simulation step |
| BUG-06 | BUG-06 | — | — | — | — | Frame probe latest metric bug |
| DEAD-01 | — | DEAD-01 | — | — | — | Unreachable policy-gate branch |
| DEAD-02 | — | DEAD-02 | — | — | — | Dead restart-option branch |
| DEAD-03 | — | DEAD-04 | — | — | — | Runtime-dead ECS scaffolding modules |
| DEAD-04 | — | DEAD-05 | — | — | — | Stale ownership patterns for missing files |
| DEAD-05 | — | DEAD-06 | — | — | — | Committed generated artifacts excluded from checks |
| DEAD-06 | — | DEAD-07 | — | — | — | JSDoc signature drift |
| ARCH-01 | — | — | ARCH-01 | — | — | Render commit pipeline not wired |
| ARCH-02 | — | DEAD-03 | ARCH-02 | — | — | Input adapter injection not wired |
| ARCH-03 | — | — | ARCH-03 | — | — | Restart bypasses opaque/deferred boundaries |
| ARCH-04 | — | — | ARCH-04 | — | — | Event queue determinism contract not integrated |
| ARCH-05 | — | — | ARCH-05 | — | CI-01 | Audit behavioral verification unsatisfiable |
| ARCH-06 | — | — | ARCH-06 | — | — | Render-intent contract drift |
| ARCH-07 | — | — | ARCH-07 | — | — | Asset-pipeline runtime integration drift |
| ARCH-08 | — | — | ARCH-08 | — | — | Track ownership policy mismatch |
| SEC-01 | — | — | — | SEC-01 | — | Missing production CSP/Trusted Types enforcement |
| SEC-02 | — | — | — | SEC-02 | — | Fail-open schema validation |
| SEC-03 | — | — | — | SEC-03 | — | Policy-gate bypass via excluded scan paths |
| SEC-04 | — | — | — | SEC-04 | — | Incomplete repo-wide forbidden-tech scan |
| SEC-05 | — | — | — | SEC-05 | — | Fail-open approval checks |
| CI-01 | — | — | — | — | CI-02 | Playwright not required in CI |
| CI-02 | — | — | — | — | CI-03 | Missing semi-automatable perf threshold tests |
| CI-03 | — | — | — | — | CI-04 | Coverage gate scope weakness |
| CI-04 | — | — | — | — | CI-05 | Missing category/evidence gate enforcement |
| CI-05 | — | — | — | — | CI-06 | Header gate warning-only in CI |
| CI-06 | — | — | — | — | CI-07 | Fixed-sleep Playwright flakiness |
| CI-07 | — | — | — | — | CI-08 | Traceability docs/test reality out of sync |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Repair restart clock resync path to prevent NaN simulation steps.
2. **ARCH-01**: Wire explicit render collect/commit phases into runtime bootstrap.
3. **ARCH-05**: Replace inventory-only audit checks with executable gate-compliant verification.
4. **BUG-02**: Correct terminal level progression branch to reach VICTORY.
5. **BUG-03**: Fail closed on null map load before entering PLAYING.
6. **ARCH-02**: Register/inject input adapter as required world resource.
7. **SEC-03**: Remove policy-gate file scan bypass and harden governance.
8. **CI-01**: Make Playwright E2E required in merge-blocking CI.

### Phase 2 — High Severity (immediate follow-up)
1. **BUG-04**: Harden map bounds checks in passability paths.
2. **ARCH-03**: Enforce deferred structural mutations through world API.
3. **ARCH-04**: Integrate deterministic event queue lifecycle in runtime.
4. **SEC-01**: Enforce production CSP + Trusted Types policy.
5. **SEC-02**: Convert schema missing-file warnings to hard failures.
6. **CI-02**: Add explicit performance threshold assertions for semi-automatable audit IDs.
7. **CI-03**: Tighten source-only coverage scope and thresholds.
8. **CI-04**: Enforce audit category/evidence constraints in policy gate.

### Phase 3 — Medium Severity
1. **BUG-05**: Prevent artificial step progression on zero/negative deltas.
2. **DEAD-01**: Remove unreachable branch in ticket-association policy logic.
3. **DEAD-03**: Integrate or isolate test-only ECS scaffolding modules.
4. **DEAD-04**: Align ownership rules with actual repository paths.
5. **ARCH-06**: Reconcile render-intent documentation/implementation contract.
6. **ARCH-07**: Implement manifest-backed asset preload/runtime wiring.
7. **ARCH-08**: Normalize track ownership authority across docs and policy code.
8. **SEC-04**: Unify and expand forbidden-tech pattern enforcement.
9. **SEC-05**: Fail closed for required approval verification in CI.
10. **CI-05**: Enforce source-header failures in CI.
11. **CI-06**: Replace fixed Playwright sleeps with state-driven waits.
12. **CI-07**: Reconcile phase/testing docs with actual executable coverage.

### Phase 4 — Low Severity (maintenance)
1. **BUG-06**: Correct frame probe latest metric computation.
2. **DEAD-02**: Remove dead restart-option branch in level loader.
3. **DEAD-05**: Remove or govern committed generated artifacts.
4. **DEAD-06**: Update stale JSDoc signatures.

---

## Notes

- The audit was read-only and evidence-driven; no source/test/policy files were modified during analysis.
- Findings were deduplicated across agents where root cause overlap was clear (notably input-adapter wiring and audit harness non-executability).
- Severity counts were normalized to: Blocking > Critical > High > Medium > Low and reconciled against the final consolidated finding set.

---

*End of report.*
