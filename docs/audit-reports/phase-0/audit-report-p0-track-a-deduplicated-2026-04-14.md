# Codebase Analysis & Audit Report - Track A (P0 Deduplicated)

**Date:** 2026-04-14
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Consolidated deduplicated Phase-0 issues owned by Track A from 4 full audit reports
**Total Issues Counted:** 29

---

## Methodology

The following source reports were fully read and merged with deduplication by root cause:

- `docs/audit-reports/phase-0/audit-report-codebase-analysis-merged-deduplicated-track-ticket-2026-04-11.md`
- `docs/audit-reports/phase-0/asmyrogl-audit-report-P0.md`
- `docs/audit-reports/phase-0/audit-report-medvall-P0.md`
- `docs/audit-reports/phase-0/pr-audit-chbaikas-audit-P0.md`

Deduplication rule: when multiple reports described the same underlying issue, one canonical issue was kept with merged detail. Primary ownership was assigned to Track A when the fix is mainly in Track A files, policy gates, CI, or Track A-owned docs/process contracts.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 1 |
| 🔴 Critical | 4 |
| 🟠 High | 11 |
| 🟡 Medium | 10 |
| 🟢 Low / Info | 3 |

**Top risks:**
1. Audit verification remains inventory-only and does not prove behavioral acceptance.
2. Start/progression state paths can still enter invalid gameplay flows (`PLAYING` without valid map, no last-level `VICTORY`).
3. CI/policy governance can drift (workflow parity mismatch, changed-file-only scan limits, missing evidence-category enforcement).
4. ECS/world boundary risks remain in restart/mutation surfaces.

---

## 1) Bugs & Logic Errors

### BUG-02: Final level completion does not transition to VICTORY ⬆ Critical
**Origin:** MRG `BUG-02`, MED `BUG-02`, CHB `BUG-02`
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/level-loader.js` (~L114, ~L115)
- `src/game/game-flow.js` (~L82-89, ~L96-L105)
- `docs/game-description.md` (~L348)

**Problem:** At last level completion, `advanceLevel()` returns `null`, but flow transitions back to `PLAYING` instead of `VICTORY`.
**Impact:** Endgame loops incorrectly and player never reaches victory outcome.

**Fix:**
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

**Tests to add:** Unit + integration for final-level clear -> `VICTORY`; Playwright E2E once browser suite is wired.

---

### BUG-03: Map-load failure can still enter PLAYING (fail-open startup) ⬆ Critical
**Origin:** MRG `BUG-03`, MED `BUG-03`, CHB `BUG-03`
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/bootstrap.js` (~L70)
- `src/game/level-loader.js` (~L80, ~L95, ~L103)
- `src/game/game-flow.js` (~L81, ~L87, ~L93)

**Problem:** `loadLevel()` can return `null`, but start flow can still report success and keep `PLAYING`.
**Impact:** Runtime may run with missing/invalid map resource and crash downstream systems.

**Fix:** Validate map load before final `PLAYING` state; fail closed and preserve last known-good state.

**Tests to add:** Failed-load start-path tests and map preservation assertions.

---

### BUG-04: `startGame()` non-idempotent while already PLAYING ⬆ High
**Origin:** MRG `BUG-04`, MED `BUG-04`
**Files:** Ownership: Track A (`src/game/game-flow.js`, `src/main.ecs.js`)

**Problem:** Repeated `startGame()` returns `true` while already `PLAYING`, triggering unnecessary `resyncTime()`.
**Impact:** Timing baseline can reset mid-game and cause stutter/skipped progression.

**Fix:**
```js
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false;
}
```

---

### BUG-08: `loadLevel` commits level index before successful resolve ⬆ Medium
**Origin:** MRG `BUG-08`, MED `BUG-08`, CHB `BUG-04`
**Files:** Ownership: Track A (`src/game/level-loader.js`)

**Problem:** `currentLevelIndex` can advance before map is confirmed valid.
**Impact:** Loader/world state divergence after failed load.

**Fix:** Resolve map into temporary state, then commit both index and resource only on success.

---

### BUG-11: Frame probe "latest" metric reports max sample ⬆ Low
**Origin:** MRG `BUG-11`, CHB `BUG-06`
**Files:** Ownership: Track A (`src/main.ecs.js`)

**Problem:** `latestFrameTime` is derived from sorted sample max, not actual newest frame.
**Impact:** Misleading perf telemetry.

**Fix:** Track newest sample separately from percentile sorting.

---

### BUG-X02: Percentile computation uses `Math.ceil` bias ⬆ Medium
**Origin:** ASM `BUG-03`
**Files:** Ownership: Track A (`src/main.ecs.js`)

**Problem:** `Math.ceil((p/100) * n) - 1` biases percentile selection.
**Impact:** Distorts p50/p95 evidence used by audit performance gates.

**Fix:** Use floor-based percentile indexing with bounds clamping.

---

### BUG-X04: `nowProvider` finite-value guard missing at frame boundary ⬆ Medium
**Origin:** ASM `BUG-05`
**Files:** Ownership: Track A (`src/main.ecs.js`)

**Problem:** Invalid `frameNowMs` (NaN/Infinity) can poison accumulator math.
**Impact:** Runtime freeze or synthetic progression on invalid timestamp input.

**Fix:** Normalize non-finite timestamps to a safe `getNow()` source before ticking.

---

## 2) Dead Code & Unused References

### DEAD-01: Dependency-ban branch for `package.json` effectively unreachable ⬆ High
**Origin:** MRG `DEAD-01`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`)

**Problem:** Dependency-ban path is scoped under source-only gate and can miss `package.json` checks.
**Impact:** False confidence in dependency policy enforcement.

**Fix:** Move `package.json` checks outside source-only filtering.

---

### DEAD-02: Unreachable fallback in ticket-association logic ⬆ Medium
**Origin:** MRG `DEAD-02`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`)

**Problem:** Trailing zero-ticket branch is unreachable due prior partitioning.
**Impact:** Policy logic complexity and maintenance drift.

**Fix:** Remove unreachable branch and keep explicit mode-based outcomes.

---

### DEAD-03: `createSyncMapLoader` restart branch is redundant ⬆ Medium
**Origin:** MRG `DEAD-03`, ASM `DEAD-01`, MED `DEAD-01`, CHB `DEAD-01`
**Files:** Ownership: Track A (`src/game/level-loader.js`)

**Problem:** `options.restart` and default paths return identical `cloneMap(baseMap)`.
**Impact:** Misleading API surface.

**Fix:** Collapse to one path or implement truly distinct restart semantics.

---

### DEAD-05: Ownership map has stale patterns for absent files ⬆ Medium
**Origin:** MRG `DEAD-05`
**Files:** Ownership: Track A (`scripts/policy-gate/lib/policy-utils.mjs`)

**Problem:** Ownership patterns reference non-existent paths.
**Impact:** Reduced trust in ownership enforcement precision.

---

### DEAD-06: `cachedMapResource` option plumbing unused ⬆ Medium
**Origin:** MRG `DEAD-06`, MED `DEAD-02`
**Files:** Ownership: Track A (`src/game/level-loader.js`)

**Problem:** Option propagates without runtime usage.
**Impact:** Unnecessary API complexity and drift.

---

### DEAD-X05: `normalizeSystemRegistration` dead override path ⬆ Medium
**Origin:** MED `DEAD-06`
**Files:** Ownership: Track A (`src/game/bootstrap.js`)

**Problem:** Error path throws before fallback override is ever useful.
**Impact:** Dead branch in bootstrap registration logic.

---

### DEAD-11: Overlapping npm policy scripts create script sprawl ⬆ Low
**Origin:** MRG `DEAD-11`, MED `DEAD-05`
**Files:** Ownership: Track A (`package.json`)

**Problem:** Multiple near-duplicate policy script entries increase maintenance burden.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-02: Restart flow bypasses structural deferral and leaks entity-store boundary ⬆ Blocking
**Origin:** MRG `ARCH-02`, MED `ARCH-02`
**Violated rule:** Structural deferral and entity opacity constraints in `AGENTS.md`
**Files:** Ownership: Track A (`src/game/game-flow.js`, `src/ecs/world/world.js`)

**Problem:** Restart teardown reaches into `entityStore` internals and applies immediate structural mutation.
**Impact:** Determinism and encapsulation risk in restart flows.

**Fix:** Introduce world-level deferred batch teardown API and remove direct store access from game-flow.

---

### ARCH-05: Immediate structural mutation remains callable during dispatch ⬆ High
**Origin:** MRG `ARCH-05`
**Files:** Ownership: Track A (`src/ecs/world/world.js`)

**Problem:** Mutator APIs can be called in-dispatch without guard.
**Impact:** Hidden nondeterminism and order-sensitive bugs.

**Fix:** Enforce dispatch guards and defer-only mutators during `runFixedStep`.

---

### ARCH-06: ECS world exposes mutable internals (`entityStore`, `systemOrder`) ⬆ High
**Origin:** MRG `ARCH-06`
**Files:** Ownership: Track A (`src/ecs/world/create-world.js`)

**Problem:** Direct internal references are returned externally.
**Impact:** External mutation can corrupt world invariants.

**Fix:** Return immutable/safe views only.

---

### ARCH-07: `EntityStore` boundary and stale-handle checks incomplete ⬆ High
**Origin:** MRG `ARCH-07`
**Files:** Ownership: Track A (`src/ecs/world/entity-store.js`)

**Problem:** Incomplete validation on component lookups for invalid/stale handles.
**Impact:** Silent corruption/crash risk with stale entity access.

---

### ARCH-08: Render path coupling and single-rAF commit invariants at risk ⬆ High
**Origin:** MRG `ARCH-08`
**Files:** Ownership: Track A (`src/ecs/world/world.js`, `src/game/bootstrap.js`)

**Problem:** Catch-up stepping can blur simulation/render boundaries if not enforced.
**Impact:** DOM pressure, perf instability, and architecture drift.

---

### ARCH-10: Asset-pipeline runtime contract not fully wired in bootstrap ⬆ Medium
**Origin:** MRG `ARCH-10`
**Files:** Ownership: Track A + Shared (`docs/implementation/assets-pipeline.md`, `src/game/bootstrap.js`)

**Problem:** Manifest-backed preload/resource contract not consistently wired.
**Impact:** Startup/perf contract drift from docs.

---

### ARCH-11: Ownership policy drift between docs and policy enforcement map ⬆ Medium
**Origin:** MRG `ARCH-11`
**Files:** Ownership: Track A + Shared (`docs/implementation/track-*.md`, `scripts/policy-gate/lib/policy-utils.mjs`)

**Problem:** Doc ownership and policy ownership maps diverge on selected paths.
**Impact:** Governance ambiguity and noisy gates.

---

## 4) Code Quality & Security

### SEC-01: Policy-gate scan bypass when gate files are excluded from scan scope ⬆ Critical
**Origin:** MRG `SEC-01`, MED `SEC-03`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`)

**Problem:** Security scan excludes policy-gate paths, enabling self-modification bypass risk.
**Impact:** Governance hardening can be weakened by same-PR gate edits.

---

### SEC-02: Production CSP/Trusted Types enforcement missing ⬆ High
**Origin:** MRG `SEC-02`, ASM `SEC-01/SEC-02`, MED `SEC-01`, CHB `SEC-01`
**Files:** Ownership: Track A (`index.html`, `vite.config.js`)

**Problem:** Strict production CSP/Trusted Types policy not enforced at entry/deploy surfaces.
**Impact:** Reduced browser-level defense-in-depth.

---

### SEC-03: Schema validation can fail-open on missing required inputs ⬆ High
**Origin:** MRG `SEC-03`, MED `SEC-02`
**Files:** Ownership: Track A (`scripts/validate-schema.mjs`)

**Problem:** Missing schema/data may warn and continue.
**Impact:** CI may pass without actual schema enforcement.

---

### SEC-X06: GitHub/Gitea policy workflow parity drift ⬆ High
**Origin:** CHB `SEC-02`
**Files:** Ownership: Track A (`.github/workflows/policy-gate.yml`, `.gitea/workflows/policy-gate.yml`)

**Problem:** Approval-mode arguments diverge across platforms.
**Impact:** CI behavior inconsistency across required parity surfaces.

---

### SEC-05: Forbidden-tech scanner pattern set incomplete repo-wide ⬆ Medium
**Origin:** MRG `SEC-05`
**Files:** Ownership: Track A (`scripts/policy-gate/check-forbidden.mjs`, `run-checks.mjs`, `run-all.mjs`)

### SEC-06: Security scanning largely changed-file scoped ⬆ Medium
**Origin:** MRG `SEC-06`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`, `run-all.mjs`)

### SEC-07: Approval enforcement can fail-open on CI/API failures ⬆ Medium
**Origin:** MRG `SEC-07`
**Files:** Ownership: Track A (`scripts/policy-gate/require-approval.mjs`)

---

## 5) Tests & CI Gaps

### CI-02: Audit verification is inventory-only and behavior coverage is structurally unsatisfied ⬆ Blocking
**Origin:** MRG `CI-02`, ASM `CI-01`, MED `CI-01`, CHB `CI-01`
**Violated rule:** End-to-end/integration verification coverage for all `docs/audit.md` questions
**Files:** Ownership: Track A (`tests/e2e/audit/*`, `playwright.config.js`, `package.json`)

**Problem:** Audit suite validates ID inventory/counts rather than runtime behavior assertions.
**Impact:** Green tests can overstate audit readiness.

**Fix:** Convert audit IDs into executable behavior/perf/manual-evidence validation workflows and include them in required CI.

---

### CI-01: Merge gate does not require browser E2E as hard requirement ⬆ Critical
**Origin:** MRG `CI-01`, MED `CI-02`
**Files:** Ownership: Track A (`.github/workflows/policy-gate.yml`, `scripts/policy-gate/run-project-gate.mjs`)

### CI-X01: Playwright browsers not provisioned in clean checkout ⬆ Critical
**Origin:** CHB `CI-02`
**Files:** Ownership: Track A (`package.json`, `playwright.config.js`)

**Problem:** Clean environments fail `test:e2e` without explicit browser install.
**Impact:** Browser verification effectively absent by default.

---

### CI-03: Semi/manual evidence categories not threshold-enforced ⬆ High
**Origin:** MRG `CI-03`, ASM `CI-03/CI-04/CI-11`, MED `CI-09`
**Files:** Ownership: Track A (`tests/e2e/audit/*`, `docs/audit-reports/phase-testing-verification-report.md`, policy scripts)

### CI-04: Coverage scope can be inflated by test-file inclusion / loose thresholds ⬆ High
**Origin:** MRG `CI-04`, ASM `CI-07`, MED `CI-03`
**Files:** Ownership: Track A (`vitest.config.js`, `scripts/policy-gate/run-project-gate.mjs`)

### CI-05: Policy gate checks IDs/counts but not full category/evidence obligations ⬆ High
**Origin:** MRG `CI-05`, ASM `CI-05`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`)

### CI-06: Functional E2E scope too narrow for documented audit surface ⬆ High
**Origin:** MRG `CI-06`, MED `CI-04`
**Files:** Ownership: Track A (`tests/e2e/*`, `docs/audit.md`)

### CI-07: Adapter-boundary integration coverage is effectively empty ⬆ High
**Origin:** MRG `CI-07`, MED `CI-05`
**Files:** Ownership: Track A (`tests/integration/adapters/.gitkeep`)

---

### CI-08: Playwright fixed sleeps (`waitForTimeout`) create flakiness risk ⬆ Medium
**Origin:** MRG `CI-08`, ASM `CI-06`, CHB `CI-03`
**Files:** Ownership: Track A (`tests/e2e/game-loop.pause.spec.js`)

### CI-09: Source-header policy is warn-only in CI ⬆ Medium
**Origin:** MRG `CI-09`, MED `CI-07`
**Files:** Ownership: Track A (`.github/workflows/policy-gate.yml`, `check-source-headers.mjs`)

### CI-10: Audit/phase docs are out of sync with executable verification reality ⬆ Medium
**Origin:** MRG `CI-10`, ASM `CI-08/CI-09`, MED `CI-10`
**Files:** Ownership: Track A + Shared (`docs/implementation/audit-traceability-matrix.md`, `docs/audit-reports/phase-testing-verification-report.md`, `docs/implementation/ticket-tracker.md`)

### CI-X02: `policy:checks` dependency on PR metadata files degrades non-PR robustness ⬆ Medium
**Origin:** MED `CI-08`
**Files:** Ownership: Track A (`scripts/policy-gate/run-checks.mjs`)

### CI-X03: `test:e2e` / `test:audit` naming overstates current verification depth ⬆ Medium
**Origin:** CHB `CI-04`
**Files:** Ownership: Track A (`package.json`, `tests/e2e/audit/audit.e2e.test.js`, matrix docs)

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical
1. `CI-02` — replace inventory-only audit checks with executable behavior/perf/evidence coverage.
2. `SEC-01` — remove policy-gate self-scan bypass risk.
3. `BUG-02` / `BUG-03` — fix invalid progression/startup state transitions.
4. `CI-01` / `CI-X01` — require/provision browser E2E in CI.

### Phase 2 — High
1. `ARCH-02` / `ARCH-05` / `ARCH-06` / `ARCH-07` — harden world boundary + mutation discipline.
2. `SEC-02` / `SEC-03` / `SEC-X06` — enforce CSP/schema/workflow parity contracts.
3. `CI-03`..`CI-07` — enforce category thresholds, coverage integrity, and adapter/e2e depth.

### Phase 3 — Medium/Low
1. `BUG-X02` / `BUG-X04` / `BUG-08` / `CI-08` / `CI-09` / `CI-10` / `CI-X02` / `CI-X03`.
2. Dead-code cleanups (`DEAD-*`) and telemetry correctness (`BUG-11`).

## Final Verification
**Verify Check:** All Track A-owned root issues from the 4 source reports are represented exactly once in this track report (deduplicated by root cause).