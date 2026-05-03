# Codebase Analysis & Audit Report - Phase 1

**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 1 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Identification of runtime bugs, incorrect transitions, and edge-case failures.
2. **Dead Code & Unused References** — Identification of dead code, unused parameters/exports, and redundant APIs.
3. **Architecture, ECS Violations & Guideline Drift** — Validating ECS rules, DOM isolation boundaries, and canonical drift.
4. **Code Quality & Security** — Checking secure sink compliance, CSP headers, and input/state validation.
5. **Tests & CI Gaps** — Evaluating unit, integration, and E2E test coverage and CI policy gates.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 1 |
| 🟢 Low / Info | 2 |

**Top risks:**
1. Potential crash in dynamic sprite acquisition if element creation falls through.
2. Minor dead code in the Level Loader module from previous iterations.
3. Minor dead code in the deterministic Event Queue monotonic counter reset.

---

## 1) Bugs & Logic Errors

### BUG-01: Sprite Pool Adapter Recycles Empty Active Pool ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (~L100)

**Problem:** When idle elements are exhausted and the active pool is also empty, `activePool.shift()` returns `undefined`. Attempting to read `.style.transform` crashes the runtime.
**Impact:** Occurs when acquiring sprite elements for entities without a proper warm-up or after resetting sprite pools.

**Fix:** Add an existence guard for the recycled element. If undefined, create a new sprite element dynamically:
```javascript
const recycled = activePool.shift();
if (!recycled) {
  const el = createElement(type);
  activePool.push(el);
  return el;
}
recycled.style.transform = OFFSCREEN_TRANSFORM;
```

**Tests to add:** Direct test of `acquire()` on an un-warmed sprite pool.

---

## 2) Dead Code & Unused References

### DEAD-01: Event Queue mononotic reset unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L133)

**Problem:** `resetOrderCounter(queue)` is exported but not invoked anywhere within the primary game loop or bootstrap.
**Impact:** Minor dead code.

**Fix:** Safely remove the `resetOrderCounter` function and its export since deterministic events are correctly cleared and counted via `drain()`.

---

### DEAD-02: Level loader sync loader unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/level-loader.js` (~L79)

**Problem:** `createSyncMapLoader(preloadMaps)` is an unused export and has no callers in the active game-flow or bootstrap process.
**Impact:** Minor dead code.

**Fix:** Remove the unused export to keep the level loader clean.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Event queue monotonic reset violates synchronization sync point ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Events are drained once per frame at a defined sync point so that consumers always see a stable snapshot"
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L126-L135)

**Problem:** The existence of a manual `resetOrderCounter` poses a theoretical risk of resetting event ordering indexes before a consumer has had a chance to `drain()` or `peek()` them.
**Impact on determinism:** High risk of collision in insertion orders if manually invoked at an ad-hoc sync point.

**Fix:** Deprecate or remove `resetOrderCounter(queue)` to rely exclusively on `drain()`.

---

## 4) Code Quality & Security

*No security or critical code quality issues found. Sinks, CSP compliance, and Trusted Types adhere perfectly to requirements.*

---

## 5) Tests & CI Gaps

### CI-01: Add tests for Sprite Pool recycling fallback ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A / Track D (Tickets: A-04, D-09)
- `tests/integration/adapters/sprite-pool-adapter.test.js` (~L1)

**Problem:** The test suite does not directly verify what happens when the sprite pool falls through to recycle/create on a completely empty pool.
**Impact:** Undetected regressions in fallback creation.

**Fix:** Add a unit test specifically for un-warmed pool acquisition behavior.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | Track D | Empty active pool fallback crash |
| DEAD-01 | — | DEAD-01 | — | — | — | Track D | Redundant event counter reset |
| DEAD-02 | — | DEAD-02 | — | — | — | Track A | Sync map loader unused export |
| ARCH-01 | — | — | ARCH-01 | — | — | Track D | Event queue counter reset risk |
| CI-01 | — | — | — | — | CI-01 | Track D | Missing sprite pool recycling tests |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
*No blocking or critical issues.*

### Phase 2 — High Severity (immediate follow-up)
1. **BUG-01**: Fix `activePool.shift()` fallback guard in sprite pool adapter (Track D).
2. **CI-01**: Add test for un-warmed sprite pool acquisition (Track D).

### Phase 3 — Medium Severity
3. **ARCH-01**: Remove ad-hoc counter reset in event queue to guarantee sync boundaries (Track D).

### Phase 4 — Low Severity (maintenance)
4. **DEAD-01**: Remove unused `resetOrderCounter` (Track D).
5. **DEAD-02**: Remove unused sync map loader (Track A).

---

## Notes

- Excellent code patterns overall: the architecture adheres to pure data-driven ECS patterns and strict DOM isolation boundaries.

---

*End of report.*
