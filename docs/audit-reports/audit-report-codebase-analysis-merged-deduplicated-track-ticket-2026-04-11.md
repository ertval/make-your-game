# Codebase Analysis & Audit Report — Merged, Deduplicated, Track/Ticket-Focused

**Date:** 2026-04-11
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Merge Inputs:**
- docs/audit-reports/audit-report-codebase-analysis-2026-04-11.md
- docs/audit-reports/audit-report-codebase-analysis-consolidated.md

---

## Critical Notes

1. Existing source reports were not modified.
2. This file is a new merged artifact only.
3. No finding detail was removed from source material.
4. No solution code snippet was removed from source material.
5. Source-local IDs are **not globally equivalent** across both reports. For this reason, Track ownership and ticket context are indexed explicitly below, and full verbatim source sections are preserved.

---

## Deduplicated Master Index (Track Ownership + Tickets First)

### A) Ticket-Focused Index (from report: audit-report-codebase-analysis-consolidated.md)

| Finding ID (Report B) | Track + Tickets |
|---|---|
| BUG-01 | (Track A: A-03, A-08) |
| BUG-02 | (Track A: A-03) |
| BUG-03 | (Track A: A-03) |
| BUG-04 | (Track D: D-03) |
| BUG-05 | (Track D: D-03) |
| BUG-06 | (Track A: A-03) |
| BUG-07 | (Track D: D-01) |
| BUG-08 | (Track D: D-03) |
| BUG-09 | (Track D: D-01) |
| BUG-10 | (Track D: D-01) |
| BUG-11 | (Track A: A-03) |
| DEAD-01 | (Track A: A-01, A-07) |
| DEAD-02 | (Track A: A-03) |
| DEAD-03 | (Track A: A-03) |
| DEAD-04 | (Track A: A-02) |
| DEAD-05 | (Track A: A-03) |
| DEAD-06 | (Track D: D-01) |
| DEAD-07 | (Track A: A-01) |
| DEAD-08 | (Track A: A-01) |
| ARCH-01 | (Track A: A-02, A-03) |
| ARCH-02 | (Track A: A-02) |
| ARCH-03 | (Track A: A-02) |
| ARCH-04 | (Track A: A-02) |
| ARCH-05 | (Track A: A-02, A-03) |
| ARCH-06 | (Track A: A-03; Track B: B-02) |
| ARCH-07 | (Track D: D-09) |
| ARCH-08 | (Track A: A-02) |
| ARCH-09 | (Track D: D-01) |
| SEC-01 | (Track D: D-03) |
| SEC-02 | (Track A: A-03; Track D: D-03) |
| SEC-03 | (Track A: A-01, A-07) |
| SEC-04 | (Track A: A-01) |
| SEC-05 | (Track A: A-07) |
| SEC-06 | (Track A: A-02, A-03) |
| SEC-07 | (Track A: A-03) |
| SEC-08 | (Track A: A-03) |
| SEC-09 | (Track D: D-06) |
| CI-01 | (Track A: A-01) |
| CI-02 | (Track A: A-06) |
| CI-03 | (Track A: A-09) |
| CI-04 | (Track A: A-06) |
| CI-05 | (Track A: A-05) |
| CI-06 | (Track A: A-01) |
| CI-07 | (Track A: A-06) |
| CI-08 | (Track A: A-01) |
| CI-09 | (Track A: A-03) |
| CI-10 | (Track A: A-03) |
| CI-11 | (Track A: A-05, A-08) |

### B) Track Ownership Index (from report: audit-report-codebase-analysis-2026-04-11.md)

| Finding ID (Report A) | Track Ownership |
|---|---|
| BUG-01 | Track D (`src/ecs/resources/**`) |
| BUG-02 | Track A (`src/game/**`) |
| BUG-03 | Track A (`src/game/**`) |
| BUG-04 | Track D (`src/ecs/resources/**`) |
| BUG-05 | Track D (`src/ecs/resources/**`) |
| BUG-06 | Track A (`src/main.ecs.js`) |
| DEAD-01 | Track A (`scripts/policy-gate/**`) |
| DEAD-02 | Track A (`src/game/**`) |
| DEAD-03 | Track B (`src/ecs/components/**`), Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`) |
| DEAD-04 | Track A (`scripts/policy-gate/**`) |
| DEAD-05 | Track A (`coverage/**`, `biome.json`), Shared (`**/.gitkeep`) |
| DEAD-06 | Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`) |
| ARCH-01 | Track A (`src/main.ecs.js`, `src/game/**`), Track D (`src/ecs/render-intent.js`) |
| ARCH-02 | Track A (`src/game/**`), Track B (`src/ecs/systems/input-system.js`) |
| ARCH-03 | Track A (`src/game/**`, `src/ecs/world/**`) |
| ARCH-04 | Track D (`src/ecs/resources/**`), Track A (`src/game/**`) |
| ARCH-05 | Track A (`tests/**`, `package.json`, `playwright.config.js`) |
| ARCH-06 | Shared (`docs/**`), Track D (`src/ecs/render-intent.js`) |
| ARCH-07 | Shared (`docs/**`), Track A (`src/game/**`), Track D (`src/ecs/render-intent.js`) |
| ARCH-08 | Shared (`docs/**`), Track A (`scripts/policy-gate/**`) |
| SEC-01 | Track A (`index.html`, `vite.config.js`) |
| SEC-02 | Track A (`scripts/validate-schema.mjs`) |
| SEC-03 | Track A (`scripts/policy-gate/**`) |
| SEC-04 | Track A (`scripts/policy-gate/**`) |
| SEC-05 | Track A (`scripts/policy-gate/**`) |
| CI-01 | Track A (`.github/workflows/**`, `scripts/policy-gate/**`, `package.json`) |
| CI-02 | Track A (`tests/**`, `AGENTS.md`) |
| CI-03 | Track A (`vitest.config.js`, `scripts/policy-gate/**`) |
| CI-04 | Track A (`scripts/policy-gate/**`, `docs/implementation/pr-template.md`) |
| CI-05 | Track A (`.github/workflows/**`, `scripts/policy-gate/**`) |
| CI-06 | Track A (`tests/**`) |
| CI-07 | Shared (`docs/**`), Track A (`docs/implementation/ticket-tracker.md`) |

### C) Deduplication Approach

- Where findings clearly describe the same root issue, treat them as one merged concern with both contexts retained.
- Where overlap is partial, keep both findings and cross-reference them in implementation planning.
- Where findings are distinct, keep both independently.
- Use Track ownership and ticket metadata as primary planning coordinates.

---

## Full Merged Content (No Detail Removed)

The following two appendices are included verbatim so every detail is preserved, including all solution snippets.

---

## Appendix A — Verbatim Source Report

Source: docs/audit-reports/audit-report-codebase-analysis-2026-04-11.md

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

---

## Appendix B — Verbatim Source Report

Source: docs/audit-reports/audit-report-codebase-analysis-consolidated.md

# Codebase Analysis & Audit Report — Consolidated

**Date:** April 10, 2026 (consolidated April 11, 2026)
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — merged findings from two independent parallel audits
**Sources:** `audit-report-codebase-analysis-codex.md` (Codex), `audit-report-qwen.md` (Qwen)

---

## Methodology

Two independent audit runs were executed, each using five parallel analysis passes:
1. **Bugs & Logic Errors** — runtime failures, incorrect behavior, race conditions
2. **Dead Code & Unused References** — unused exports, unreachable code, stale imports
3. **Architecture & ECS Violations** — boundary violations, structural mutation, pattern violations
4. **Code Quality & Security** — unsafe patterns, missing validation, CSP issues
5. **Tests & CI Gaps** — missing coverage, flaky tests, configuration issues

Findings below are consolidated, deduplicated, and re-numbered with a unified severity scale. Each finding notes its original report ID(s) for traceability.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 1 |
| 🟠 High | 14 |
| 🟡 Medium | 11 |
| 🟢 Low / Info | 14 |

**Top risks:**
1. Structural ECS mutation and entity-store leakage in restart flow
2. Final-level completion path fails to reach VICTORY
3. CI can pass while required audit categories are effectively unverified
4. `startGame()` non-idempotent when already PLAYING — causes clock reset
5. Entity store exposes mutable internals and lacks boundary validation

---

## 1) Bugs & Logic Errors

### BUG-01: Final level completion does not transition to VICTORY ⬆ HIGH
**Origin:** Codex H-01, Qwen H-02 (Track A: A-03, A-08)
**Files:**
- `src/game/level-loader.js` (~L115)
- `src/game/game-flow.js` (~L82-89, ~L96, ~L104)
- `docs/game-description.md` (~L348)

**Problem:** When on the last level and achieving `LEVEL_COMPLETE`, `advanceLevel()` returns `null` (no next level exists), but the game transitions to `PLAYING` instead of `VICTORY`. The last level simply restarts instead of showing the victory screen.

**Impact:** Players completing the final level never see the victory screen — the game loops the last level.

**Fix:** In the `startGame()` LEVEL_COMPLETE flow, check the result of `advanceLevel()`; if `null`, transition to `VICTORY` instead of `PLAYING`.
```js
if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
  const nextLevel = levelLoader.advanceLevel({ reason: 'level-complete' });
  if (nextLevel === null) {
    return safeTransition(gameStatus, GAME_STATE.VICTORY);
  }
  applyPauseFromState(clock, gameStatus);
  return gameStatus.currentState === GAME_STATE.PLAYING;
}
```
**Tests to add:** Unit test in `tests/unit/game/game-flow.test.js`, integration test in `tests/integration/gameplay/game-flow.level-loader.test.js`, Playwright E2E for last-level → VICTORY transition.

---

### BUG-02: `startGame()` is non-idempotent when already PLAYING — clock reset ⬆ HIGH
**Origin:** Codex H-02, Qwen H-01 (Track A: A-03)
**Files:**
- `src/game/game-flow.js` (~L90-92, ~L109)
- `src/main.ecs.js` (~L156-160, ~L185-186)

**Problem:** When `startGame()` is called while the game is already in `PLAYING` state, it returns `true`. The caller in `main.ecs.js` uses this return value to decide whether to call `resyncTime(getNow())`, which resets the timing baseline mid-gameplay causing frame skips or stutters.

**Impact:** UI double-clicks or race conditions calling `startGame()` during active gameplay would reset the clock baseline, causing the next frame to see a very small delta and not advance simulation steps.

**Fix:**
```js
// In game-flow.js startGame():
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false; // Already playing, no action needed
}
```
**Tests to add:** Repeated-start no-op unit test, integration timing assertion.

---

### BUG-03: Game can enter PLAYING with invalid/null map resource ⬆ HIGH
**Origin:** Codex H-03 (Track A: A-03)
**Files:**
- `src/game/bootstrap.js` (~L70)
- `src/game/level-loader.js` (~L80, ~L95)
- `src/game/game-flow.js` (~L81)

**Problem:** No validation that the map resource is valid before transitioning to `PLAYING` state. Future gameplay systems may crash or behave unpredictably if the map resource is missing.

**Impact:** Runtime crash or undefined behavior path for systems that depend on a valid map.

**Fix:** Load and validate map before PLAYING transition; fail closed with user-visible error and preserve last known-good map.
**Tests to add:** Failed-load start path test and map preservation test.

---

### BUG-04: Out-of-bounds map access can be treated as passable ⬆ HIGH
**Origin:** Codex H-04, Qwen L-08 (Track D: D-03)
**Files:**
- `src/ecs/resources/map-resource.js` (~L393, ~L449, ~L468)

**Problem:** `isPassable()` and related wall queries do not perform strict bounds checking. Out-of-range row/col values can escape the grid and produce downstream logic corruption. Additionally, `dimensions.width/height` could disagree with `grid.length`, enabling out-of-bounds access.

**Impact:** Movement/pathing can escape grid and create downstream logic corruption.

**Fix:** Add strict bounds helper and short-circuit `false` for out-of-range in passability/wall queries. Add dimension-to-grid validation in `validateMapSemantic`.
**Tests to add:** Negative and overflow row/col tests in `tests/unit/resources/map-resource.test.js`, fuzz tests for malformed input.

---

### BUG-05: Semantic validator can throw TypeError on malformed map payloads ⬆ MEDIUM
**Origin:** Codex M-01 (Track D: D-03)
**Files:**
- `src/ecs/resources/map-resource.js` (~L157, ~L231, ~L232)

**Problem:** Hard crash path (TypeError) instead of deterministic validation error reporting when map payload is malformed.

**Fix:** Add structural and bounds guards before grid indexing; accumulate validation errors rather than throwing.

---

### BUG-06: `loadLevel` commits level index before successful map resolve ⬆ MEDIUM
**Origin:** Codex M-02 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L91, ~L95)

**Problem:** Failed load can desynchronize level index and world resource state.

**Fix:** Resolve into temporary variable first, commit index/resource only on success.

---

### BUG-07: `tickClock` maxDelta uses hardcoded multiplier instead of `maxStepsPerFrame` ⬆ MEDIUM
**Origin:** Qwen M-03 (Track D: D-01)
**Files:**
- `src/ecs/resources/clock.js` (~L68-71)

**Problem:** `maxDelta = fixedDtMs * 10` is hardcoded, but `maxStepsPerFrame` defaults to 5. This mismatch causes unnecessary accumulator accumulation that must later be clamped.

**Fix:**
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

---

### BUG-08: `isPassable` JSDoc documents non-existent `isGhost` parameter ⬆ MEDIUM
**Origin:** Qwen M-02 (Track D: D-03)
**Files:**
- `src/ecs/resources/map-resource.js` (JSDoc ~L26 vs implementation ~L449)

**Problem:** JSDoc claims `isPassable(map, row, col, isGhost)` but implementation is `isPassable(map, row, col)`. A separate `isPassableForGhost` function exists. Callers passing `isGhost=true` will get incorrect results silently.

**Fix:** Either add the `isGhost` parameter to `isPassable` or fix the JSDoc to remove the documented parameter.

---

### BUG-09: Event queue `orderCounter` never auto-reset between frames ⬆ MEDIUM
**Origin:** Qwen M-04 (Track D: D-01)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Counter grows monotonically during gameplay and is only reset on level restart. JSDoc claims it's "called once per fixed simulation step" but no such automatic call exists. Over very long play sessions, the counter could approach `Number.MAX_SAFE_INTEGER`.

**Fix:** Add automatic reset in `runFixedStep` world method, or document that systems must drain events each frame.

---

### BUG-10: `clock.js` `resyncTime` does not clamp accumulator to zero ⬆ LOW
**Origin:** Qwen L-10 (Track D: D-01)
**Files:**
- `src/ecs/resources/clock.js`

**Problem:** If accumulator has leftover time from before resync, it could cause a burst step on next tick.

**Fix:** Add `this.accumulator = 0` in `resyncTime`.

---

### BUG-11: `clampLevelIndex` redundant `Math.floor` after bounds check ⬆ LOW
**Origin:** Qwen L-02 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L12-19)

**Problem:** `Math.floor` could theoretically produce a value > maxLevel if input is a float just below an integer boundary.

**Fix:** Add final `Math.min(result, maxLevel)` guard.

---

## 2) Dead Code & Unused References

### DEAD-01: Unreachable `package.json` dependency-ban branch in policy checks ⬆ HIGH
**Origin:** Codex H-05 (Track A: A-01, A-07)
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L477, ~L515, ~L553)

**Problem:** Intended dependency-ban logic for `package.json` is effectively dead because it falls inside a source-only scan gate. Produces false confidence that dependencies are checked.

**Fix:** Move `package.json` checks outside source-only scan gate, or explicitly include `package.json` in scanned targets.

---

### DEAD-02: Dead conditional in `createSyncMapLoader` restart path ⬆ MEDIUM
**Origin:** Codex M-03, Qwen M-01 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L51-61)

**Problem:** The `if (options.restart)` check has identical code in both branches (`cloneMap(baseMap)`). Both branches do the same thing — misleads readers into thinking restart vs. non-restart loads behave differently.

**Fix:** Collapse to one return path, or implement truly different restart semantics.

---

### DEAD-03: Redundant `cachedMapResource` option plumbing ⬆ MEDIUM
**Origin:** Codex M-04 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L86, ~L100)
- `tests/unit/resources/map-resource.test.js` (~L489)

**Problem:** API surface grows without runtime usage.

**Fix:** Remove option until needed, or document as intentionally reserved.

---

### DEAD-04: `getSystemOrder` return value rarely consumed ⬆ LOW
**Origin:** Qwen (Dead Code table) (Track A: A-02)
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** External code rarely calls this, increasing API surface with minimal value.

**Fix:** Evaluate removal or document internal-only usage.

---

### DEAD-05: `advanceLevel` options object only uses `reason` property ⬆ LOW
**Origin:** Qwen L-06 (Track A: A-03)
**Files:**
- `src/game/level-loader.js`

**Problem:** Dead API surface — accepts options object but only uses `reason`.

**Fix:** Simplify to `advanceLevel(reason)` or document future extensibility.

---

### DEAD-06: `resetOrderCounter` JSDoc claim unimplemented ⬆ LOW
**Origin:** Qwen (Dead Code table) (Track D: D-01)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Documented as per-frame but never called automatically. See also BUG-09.

---

### DEAD-07: Duplicate npm scripts for same policy command ⬆ LOW
**Origin:** Codex L-01 (Track A: A-01)
**Files:**
- `package.json` (~L17, ~L35)

**Problem:** Script drift and maintenance overhead.

**Fix:** Keep one canonical script and deprecate alias.

---

### DEAD-08: Tracked `changed-files.txt` artifact appears stale ⬆ LOW
**Origin:** Codex L-02 (Track A: A-01)
**Files:**
- `changed-files.txt` (~L1)
- `.gitignore` (~L42)

**Problem:** Noise and confusion in repository state.

**Fix:** Remove tracked artifact from version control and regenerate only in CI/local gate runs.

---

## 3) Architecture & ECS Violations

### ARCH-01: Restart flow performs immediate structural mutation and breaks entity opacity ⬆ BLOCKING
**Origin:** Codex C-01 (Track A: A-02, A-03)
**Violated rule:** Structural deferral and opaque entities (AGENTS.md)
**Files:**
- `src/game/game-flow.js` (~L41-61)
- `src/ecs/world/world.js` (~L83, ~L103)

**Problem:** `destroyAllEntities` during restart performs immediate structural mutation that directly accesses `entityStore` internals. This violates the ECS requirement that structural changes (entity/component add/remove) must be deferred to controlled sync points. Additionally leaks the entity store reference outside the world boundary.

**Impact:** Order-sensitive bugs, determinism risk, and encapsulation leakage. Allocation during game restart via `getActiveIds()` creating new arrays every call.

**Fix:** Add world-level deferred teardown command at sync point; remove direct `entityStore` access from `game-flow`. Consider batch destroy API on entity store.

---

### ARCH-02: World API allows immediate structural mutation during dispatch ⬆ HIGH
**Origin:** Codex H-06 (Track A: A-02)
**Violated rule:** Structural changes must be deferred
**Files:**
- `src/ecs/world/world.js` (~L55, ~L61, ~L141)

**Problem:** Mid-dispatch mutation can create hidden nondeterminism and ordering bugs. The world's `addEntity`/`removeComponent`/etc. methods are callable during system dispatch without any guard.

**Fix:** Enforce dispatch guard that rejects immediate mutators during `runFixedStep`; require defer APIs for runtime/system paths.

---

### ARCH-03: ECS World exposes mutable internal state — `entityStore` and `systemOrder` ⬆ HIGH
**Origin:** Qwen H-03 (Track A: A-02)
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** `getEntityStore()` and `getSystemOrder()` return direct references to internal arrays/objects. External code can mutate these without going through the world API, breaking ECS encapsulation.

**Impact:** Any system or external code holding a reference to the entity store could corrupt entity tracking, causing crashes or silent data corruption.

**Fix:** Return immutable views or safe proxy objects:
```js
getEntityStore() {
  return {
    hasComponent: (entity, componentType) =>
      this.entityStore.hasComponent(entity, componentType),
    getComponent: (entity, componentType) =>
      this.entityStore.getComponent(entity, componentType),
    // ... expose only safe read methods
  };
}
```

---

### ARCH-04: `EntityStore` missing boundary validation in `hasComponent`/`getComponent` ⬆ HIGH
**Origin:** Qwen H-04 (Track A: A-02)
**Files:**
- `src/ecs/world/entity-store.js` (~L55-66)

**Problem:** No bounds checking on entity ID access. An invalid or stale entity ID can cause array out-of-bounds access or return garbage data. No stale-handle protection via generation checking.

**Impact:** Silent data corruption or crashes when systems query destroyed entities.

**Fix:**
```js
hasComponent(entityHandle, componentType) {
  const { id, generation } = entityHandle;
  if (id < 0 || id >= this.generations.length) return false;
  if (this.generations[id] !== generation) return false;
  const mask = this.componentMasks[id];
  return mask !== undefined && (mask & (1 << componentType)) !== 0;
}
```

---

### ARCH-05: Render phase coupled to fixed-step simulation loop ⬆ HIGH
**Origin:** Codex H-07 (Track A: A-02, A-03)
**Violated rule:** One dedicated DOM commit per frame with clear read/compute vs write boundaries
**Files:**
- `src/ecs/world/world.js` (~L16, ~L141)
- `src/game/bootstrap.js` (~L100)

**Problem:** During catch-up, render-related systems may run more than once per frame, increasing DOM pressure. Render should be decoupled from fixed-step simulation and run once per `requestAnimationFrame`.

**Fix:** Split simulation stepping and render commit; keep DOM commit once per `requestAnimationFrame`.

---

### ARCH-06: Input adapter contract leak via fallback field probing ⬆ MEDIUM
**Origin:** Codex M-05 (Track A: A-03; Track B: B-02)
**Files:**
- `src/main.ecs.js` (~L97, ~L107)
- `src/game/bootstrap.js` (~L125)

**Problem:** Tight coupling to adapter internals and brittle future adapter swaps. Systems probe for specific fields on the adapter object instead of using a formal interface.

**Fix:** Require explicit adapter interface methods and validate at registration.

---

### ARCH-07: `DOMPool` `release()` does not remove event listeners ⬆ MEDIUM
**Origin:** Qwen M-05 (Track D: D-09)
**Files:**
- `src/render/dom-pool.js` (~L48-54)

**Problem:** If any code adds event listeners to pooled elements, those listeners persist when elements are released and re-used. This causes listener accumulation and potential memory leaks or duplicate event firing.

**Fix:** Document that pooled elements must not have listeners, or implement a listener cleanup mechanism.

---

### ARCH-08: Systems can access resources without capability gating ⬆ MEDIUM
**Origin:** Qwen (Architecture table) (Track A: A-02)
**Files:**
- World design overall

**Problem:** Any system can access any resource through the world API with no capability restrictions. This weakens ECS isolation.

**Fix:** Consider resource access policies or at minimum document trusted access boundaries.

---

### ARCH-09: `EventQueue` `drain()` returns reference to internal array ⬆ LOW
**Origin:** Qwen L-09 (Track D: D-01)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Callers could mutate returned array or hold reference after drain, breaking encapsulation.

**Fix:** Return a copy or iterator.

---

## 4) Code Quality & Security

### SEC-01: Map validation path can hard-fail on malformed structures ⬆ HIGH
**Origin:** Codex H-08 (Track D: D-03)
**Files:**
- `src/ecs/resources/map-resource.js` (~L146, ~L175, ~L336)

**Problem:** Runtime crash risk from malformed map payloads instead of controlled rejection.

**Fix:** Add strict structural preflight and in-bounds guards before semantic traversal.

---

### SEC-02: Runtime map trust boundary is not strictly enforced ⬆ HIGH
**Origin:** Codex H-09 (Track A: A-03; Track D: D-03)
**Files:**
- `src/game/level-loader.js` (~L80, ~L95)
- `src/ecs/resources/map-resource.js` (~L334)

**Problem:** Untrusted or malformed loader outputs can enter world state without schema or semantic validation at the load boundary.

**Fix:** Enforce schema plus semantic validation at load boundary before `setResource`.

---

### SEC-03: Production CSP and Trusted Types enforcement is missing ⬆ MEDIUM
**Origin:** Codex M-06 (Track A: A-01, A-07)
**Files:**
- `index.html` (~L4)
- `vite.config.js` (~L3)
- `AGENTS.md` (~L151, ~L156)

**Problem:** Lower defense-in-depth against future sink regressions. AGENTS.md mandates strict CSP and Trusted Types for production builds.

**Fix:** Enforce strict production CSP and Trusted Types policy in deployment path and CI checks.

---

### SEC-04: Security scanning is primarily changed-file scoped ⬆ MEDIUM
**Origin:** Codex M-07 (Track A: A-01)
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L514, ~L579)
- `scripts/policy-gate/run-all.mjs` (~L200)

**Problem:** Existing risky patterns in untouched files may persist undetected. Policy gate only scans diff files for forbidden sinks.

**Fix:** Add full-repo security scan stage in CI (or nightly) using same sink checks.

---

### SEC-05: Schema validation script can fail-open on missing files ⬆ MEDIUM
**Origin:** Codex M-08 (Track A: A-07)
**Files:**
- `scripts/validate-schema.mjs` (~L62, ~L63)

**Problem:** Missing critical schema/input may pass with warnings instead of failing.

**Fix:** Fail closed for required schemas/manifests/maps and allowlist optional files explicitly.

---

### SEC-06: Repetitive runtime error loop risk without escalation budget ⬆ LOW
**Origin:** Codex L-03 (Track A: A-02, A-03)
**Files:**
- `src/main.ecs.js` (~L192, ~L209)
- `src/ecs/world/world.js` (~L144)

**Problem:** Persistent per-frame exceptions can degrade performance and observability without any circuit-breaker.

**Fix:** Add per-system error budget and temporary quarantine/escalation after threshold.

---

### SEC-07: `renderCriticalError` uses `textContent` — safe but limited formatting ⬆ LOW
**Origin:** Qwen L-03 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L87-92)

**Problem:** Safe from injection, but error messages with multiple issues are hard to read as plain text.

**Fix:** Consider structured error display with `<pre>` or `<code>` blocks.

---

### SEC-08: `UNHANDLED_REJECTION_HOOK_KEY` could conflict with other libraries ⬆ LOW
**Origin:** Qwen L-04 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L96)

**Problem:** Unlikely but possible collision if other code uses same window property string key.

**Fix:** Use `Symbol` instead of string key.

---

### SEC-09: `createDOMRenderer` accepts `hudQueries` but never validates query results ⬆ LOW
**Origin:** Qwen L-07 (Track D: D-06)
**Files:**
- `src/render/render-ecs.js`

**Problem:** If HUD elements are missing from DOM, renderer silently produces no HUD updates.

**Fix:** Add `console.warn` if expected elements are not found.

---

## 5) Tests & CI Gaps

### CI-01: CI can pass with effectively no browser verification ⬆ BLOCKING
**Origin:** Codex B-01 (Track A: A-01)
**Files:**
- `package.json` (~L21, ~L22)
- `scripts/policy-gate/run-project-gate.mjs` (~L19)
- `.github/workflows/policy-gate.yml` (~L51)

**Problem:** Audit-required browser and gameplay checks can be absent while pipeline is green. The gate has pass-with-no-tests behavior.

**Fix:** Remove pass-with-no-tests behavior and make policy gate execute and require E2E plus audit test suites.

---

### CI-02: Audit coverage test is inventory-only, not behavior verification ⬆ BLOCKING
**Origin:** Codex B-02 (Track A: A-06)
**Files:**
- `tests/e2e/audit/audit.e2e.test.js` (~L6)
- `tests/e2e/audit/audit-question-map.js` (~L3)

**Problem:** The audit test only checks that audit IDs are listed — it does not execute any behavior verification. False confidence that audit IDs are validated.

**Fix:** Add executable assertions per audit ID or enforce evidence validators for each mapped question.

---

### CI-03: Semi-automatable and manual evidence categories are not CI-enforced ⬆ HIGH
**Origin:** Codex B-03 (Track A: A-09)
**Files:**
- `docs/audit-reports/phase-testing-verification-report.md` (~L29, ~L30)
- `scripts/policy-gate/run-checks.mjs` (~L401)

**Problem:** Performance and trace-based acceptance criteria (F-17, F-18, B-05, F-19, F-20, F-21, B-06) can regress silently.

**Fix:** Add Performance API assertions for semi-automatable IDs and require a manual-evidence manifest with artifact paths in CI.

---

### CI-04: Functional E2E coverage is too narrow for documented scope ⬆ HIGH
**Origin:** Codex H-10, Qwen (Test & CI Gaps table) (Track A: A-06)
**Files:**
- `tests/e2e/game-loop.pause.spec.js`
- `tests/e2e/game-loop.unhandled-rejection.spec.js`
- `docs/audit.md` (~L26)

**Problem:** Many core gameplay and HUD behaviors remain unverified in real browser runs. Only pause and unhandled-rejection scenarios have E2E tests.

**Missing tests:**
- Pause continue/restart flow
- Timer/lives/score HUD changes
- Keyboard controls verification
- Level progression and last-level → VICTORY
- `startGame()` called during PLAYING state
- DOM pool listener leak integration test
- Event queue `orderCounter` growth stress test
- Fuzz testing for map resource with malformed input

**Fix:** Add scenario E2E tests for each of the above.

---

### CI-05: Adapter-boundary integration coverage is effectively empty ⬆ HIGH
**Origin:** Codex H-11 (Track A: A-05)
**Files:**
- `tests/integration/adapters/.gitkeep`
- `vitest.config.js` (~L6)
- `docs/audit-reports/phase-testing-verification-report.md` (~L16)

**Problem:** Adapter contracts can break unnoticed. The integration/adapters directory contains only a `.gitkeep`.

**Fix:** Add jsdom integration suite for adapter boundaries and ensure CI runs it as required.

---

### CI-06: Coverage gate is inflated by counting tests in coverage include ⬆ HIGH
**Origin:** Codex H-12 (Track A: A-01)
**Files:**
- `vitest.config.js` (~L11, ~L12)

**Problem:** Coverage percentage may overstate source confidence because test files are included in the coverage target.

**Fix:** Restrict coverage include to `src/` and keep `tests/` excluded.

---

### CI-07: Playwright flakiness risk from fixed sleep timing ⬆ MEDIUM
**Origin:** Codex M-09 (Track A: A-06)
**Files:**
- `tests/e2e/game-loop.pause.spec.js` (~L21, ~L29, ~L38)

**Problem:** Fixed `waitForTimeout` calls in Playwright tests cause nondeterministic CI failures under load variance.

**Fix:** Replace fixed waits with state-driven waits using `expect.poll` or `page.waitForFunction`.

---

### CI-08: Header policy check is warn-mode in CI ⬆ LOW
**Origin:** Codex L-04 (Track A: A-01)
**Files:**
- `.github/workflows/policy-gate.yml` (~L26)
- `scripts/policy-gate/check-source-headers.mjs` (~L22)

**Problem:** Non-blocking governance allows gradual quality drift.

**Fix:** Use fail mode in CI and keep warn mode only for local development.

---

### CI-09: `game-flow.js` exports both named and default — inconsistent with project style ⬆ LOW
**Origin:** Qwen L-05 (Track A: A-03)
**Files:**
- `src/game/game-flow.js`

**Problem:** Minor consistency issue vs ES module conventions used elsewhere.

**Fix:** Standardize on named exports only per ES module conventions.

---

### CI-10: `main.ecs.js` bootstrap auto-executes on import in browser ⬆ LOW
**Origin:** Qwen L-12 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L230-232)

**Problem:** Side effect on module import makes testing harder.

**Fix:** Export bootstrap function and let consumer call it explicitly.

---

### CI-11: Duplicate `advanceLevel` logic in test mock and implementation ⬆ LOW
**Origin:** Qwen L-11 (Track A: A-05, A-08)
**Files:**
- Various test files

**Problem:** Test mocks and real implementation diverge slightly.

**Fix:** Ensure test mocks stay synchronized with implementation.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Codex ID | Qwen ID | Description |
|----------------|----------|---------|-------------|
| BUG-01 | H-01 | H-02 | Last-level → VICTORY missing |
| BUG-02 | H-02 | H-01 | `startGame()` non-idempotent |
| BUG-03 | H-03 | — | PLAYING with null map |
| BUG-04 | H-04 | L-08 | Out-of-bounds map access |
| BUG-05 | M-01 | — | Semantic validator TypeError |
| BUG-06 | M-02 | — | `loadLevel` index commit order |
| BUG-07 | — | M-03 | `tickClock` maxDelta mismatch |
| BUG-08 | — | M-02 | `isPassable` JSDoc mismatch |
| BUG-09 | — | M-04 | Event queue counter no auto-reset |
| BUG-10 | — | L-10 | `resyncTime` accumulator not cleared |
| BUG-11 | — | L-02 | `clampLevelIndex` edge case |
| DEAD-01 | H-05 | — | Unreachable dependency-ban logic |
| DEAD-02 | M-03 | M-01 | Dead restart conditional |
| DEAD-03 | M-04 | — | Redundant `cachedMapResource` |
| DEAD-04 | — | Dead Code table | `getSystemOrder` rarely consumed |
| DEAD-05 | — | L-06 | `advanceLevel` options dead surface |
| DEAD-06 | — | Dead Code table | `resetOrderCounter` JSDoc unimplemented |
| DEAD-07 | L-01 | — | Duplicate npm scripts |
| DEAD-08 | L-02 | — | Stale `changed-files.txt` |
| ARCH-01 | C-01 | — | Restart structural mutation (BLOCKING) |
| ARCH-02 | H-06 | — | Immediate mutation during dispatch |
| ARCH-03 | — | H-03 | Mutable entity store exposure |
| ARCH-04 | — | H-04 | Entity store missing boundary validation |
| ARCH-05 | H-07 | — | Render coupled to fixed-step |
| ARCH-06 | M-05 | — | Input adapter contract leak |
| ARCH-07 | — | M-05 | DOMPool listener retention |
| ARCH-08 | — | Arch table | Resource access no capability gating |
| ARCH-09 | — | L-09 | EventQueue drain exposes internal array |
| SEC-01 | H-08 | — | Map validation hard-fail |
| SEC-02 | H-09 | — | Map trust boundary not enforced |
| SEC-03 | M-06 | — | CSP / Trusted Types missing |
| SEC-04 | M-07 | — | Changed-file-only security scanning |
| SEC-05 | M-08 | — | Schema validation fail-open |
| SEC-06 | L-03 | — | Runtime error loop, no budget |
| SEC-07 | — | L-03 | `renderCriticalError` limited formatting |
| SEC-08 | — | L-04 | Hook key collision risk |
| SEC-09 | — | L-07 | HUD queries not validated |
| CI-01 | B-01 | — | CI passes with no browser tests (BLOCKING) |
| CI-02 | B-02 | — | Audit test is inventory-only (BLOCKING) |
| CI-03 | B-03 | — | Semi/manual evidence not CI-enforced |
| CI-04 | H-10 | CI table | E2E coverage too narrow |
| CI-05 | H-11 | — | Adapter integration coverage empty |
| CI-06 | H-12 | — | Coverage gate inflated |
| CI-07 | M-09 | — | Playwright fixed sleep flakiness |
| CI-08 | L-04 | — | Header check warn-mode |
| CI-09 | — | L-05 | Mixed export style |
| CI-10 | — | L-12 | Bootstrap side effect on import |
| CI-11 | — | L-11 | Test mock divergence |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **ARCH-01**: Move restart teardown to deferred world API and remove `entityStore` leakage
2. **CI-01 + CI-02**: Enforce required E2E/audit test suites — remove pass-with-no-tests behavior
3. **BUG-01**: Fix final-level to VICTORY transition

### Phase 2 — High Severity (immediate follow-up)
4. **BUG-02**: Make `startGame()` idempotent during PLAYING and guard resync
5. **ARCH-02 + ARCH-03 + ARCH-04**: Harden World API — dispatch guards, immutable views, boundary validation
6. **BUG-03 + BUG-04 + SEC-01 + SEC-02**: Harden map trust boundary, bounds handling, and validation
7. **ARCH-05**: Decouple render from fixed-step simulation loop
8. **CI-03**: Enforce semi-automatable and manual evidence gates in CI
9. **CI-04 + CI-05**: Expand E2E and adapter integration coverage
10. **CI-06**: Fix inflated coverage gate — exclude tests from coverage include
11. **DEAD-01**: Fix unreachable dependency-ban in policy checks

### Phase 3 — Medium Severity
12. **BUG-05 + BUG-06**: Map validation and load-order hardening
13. **BUG-07**: Fix `tickClock` maxDelta mismatch
14. **BUG-08 + BUG-09**: JSDoc accuracy and event queue lifecycle
15. **ARCH-06 + ARCH-07**: Adapter interface formalization and DOMPool cleanup
16. **SEC-03 + SEC-04 + SEC-05**: CSP enforcement, full-repo scanning, schema fail-closed
17. **CI-07**: Replace Playwright fixed waits with state-driven waits
18. **DEAD-02 + DEAD-03**: Dead code cleanup

### Phase 4 — Low Severity (maintenance)
19. All remaining LOW/INFO items (BUG-10, BUG-11, DEAD-04–08, ARCH-08–09, SEC-06–09, CI-08–11)

---

## Notes

- No direct unsafe HTML injection sink was confirmed in runtime paths reviewed; current error rendering uses safe `textContent` writes in `src/main.ecs.js`.
- A few findings are currently latent due to staged implementation, but they remain high-priority because they are in core runtime/state and CI gate paths.
- Both reports independently identified BUG-01 and BUG-02 as top-priority issues, confirming high confidence in those findings.
- The Qwen report surfaced additional entity-store and DOMPool boundary issues not covered by Codex.
- The Codex report provided deeper CI/policy-gate analysis and identified the three blocking items.

---

*End of consolidated report.*

---

*End of merged track/ticket-focused report.*
