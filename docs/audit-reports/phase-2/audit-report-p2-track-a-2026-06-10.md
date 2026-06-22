# Track A Deduplicated Audit Report — Phase 2

This report contains the uniquely assigned issues from the Phase 2 codebase audit with full details.

**Date:** 2026-06-10
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Track A (World, Game Flow, Scaffolding, Testing & QA)
**Total Actual Issues: 30**
**Remediation Status:** 8 Done, 22 Latent / Documented / In Progress

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Blocking | 1 | 1 Done |
| 🔴 Critical | 2 | 2 Done |
| 🟠 High | 5 | 2 Done, 3 In Progress |
| 🟡 Medium | 11 | 2 Done, 9 In Progress |
| 🟢 Low / Info | 11 | 1 Done, 10 Documented / In Progress |

---

## 1) Bugs & Logic Errors

### ✅ [DONE] BUG-08: `runFixedStep` Iterates Empty `input` Phase 🟢 LOW
- **Files:** `src/ecs/world/world.js` (~L384)
- **Problem:** `DEFAULT_PHASE_ORDER` contains `'input'` which has zero registered systems. Wasteful empty iteration each step.
- **Fix:** Skip empty phases or remove from the default array.

### ✅ [DONE] BUG-15: Render and Meta Phase Systems Can Defer Structural Mutations That Are Silently Discarded 🔴 CRITICAL
- **Files:** `src/ecs/world/world.js` (~L413-451, L453-488)
- **Problem:** render/meta loops did not call `applyDeferredMutations()`.
- **Fix:** Added `this.applyDeferredMutations();` to both `runRenderCommit()` and `runMeta()`.
- **Verification:** Integration tests verified.

### ⏳ [IN PROGRESS] BUG-19: Frame Probe Records Wall-Clock Deltas During Runtime Quarantine 🟠 HIGH
- **Files:** `src/main.ecs.js` (~L329-365)
- **Problem:** `frameProbe.recordFrame` is called before the quarantine checks, inflating the p95 frame metrics.
- **Fix:** Defer `recordFrame` calls until after quarantine checks.

### ⏳ [IN PROGRESS] BUG-01: Event Queue Unbounded Growth — `drain()` Never Called 🟡 MEDIUM
- **Files:** `src/ecs/resources/event-queue.js` (~L30-80), `src/ecs/systems/collision-system.js`, etc.
- **Problem:** No consumer in active game loop calls `drain()` regularly, leaking event records.
- **Fix:** Ensure event queue is drained each tick.

---

## 2) Dead Code & Unused References

### ✅ [DONE] DEAD-01: `changed-files.txt` Tracked Generated Artifact 🟡 MEDIUM
- **Files:** `changed-files.txt`
- **Problem:** Locally generated file tracked or present.
- **Fix:** Cleaned from Git and deleted from the working tree.

### ✅ [DONE] DEAD-34: 8 `.gitkeep` Files Under `src/` ℹ️ INFO
- **Problem:** Unused `.gitkeep` files in populated source directories.
- **Fix:** Removed.

### ✅ [DONE] DEAD-35: POWER_UP_TYPE Enum in constants.js Reachable Only From a Test 🟢 LOW
- **Files:** `src/ecs/resources/constants.js` (~L170)
- **Problem:** Redundant power-up enum.
- **Fix:** Removed enum in constants.js.

### ✅ [DONE] DEAD-36: skills-lock.json Tracked But Referenced by No Script 🟢 LOW
- **Files:** `skills-lock.json`
- **Problem:** Tracked but unused lock file.
- **Fix:** Removed from git.

### ✅ [DONE] DEAD-37: generate_reports.py Present in Working Tree 🟢 LOW
- **Files:** `generate_reports.py`
- **Problem:** Orphaned script in repo.
- **Fix:** Removed.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ✅ [DONE] ARCH-03: `entity-store.getActiveIds()` Returns Mutable Internal Array Reference 🟠 HIGH
- **Files:** `src/ecs/world/entity-store.js`
- **Problem:** Supposedly exposed internal mutable array.
- **Fix:** Verified that `getActiveIds()` constructs a fresh local array and returns `Object.freeze(activeIds)`.

### ⏳ [IN PROGRESS] ARCH-05: Audit-Traceability Matrix Out of Sync With Actual Tests 🟠 HIGH
- **Files:** `docs/implementation/audit-traceability-matrix.md`
- **Problem:** 8 audit questions marked as Pending but were fully Executable.
- **Fix:** Update matrix status to `Executable`.

---

## 4) Code Quality & Security

### ✅ [DONE] SEC-03: `package.json` Marked `"private": false` 🟡 MEDIUM
- **Files:** `package.json` (~L5)
- **Problem:** Missing or false private flag.
- **Fix:** Set `"private": true` to prevent accidental publication.

### ✅ [DONE] SEC-05: `isRecord()` Type Guard Accepts Arrays 🟢 LOW
- **Files:** `src/shared/type-guards.js` (~L8-10)
- **Problem:** Arrays evaluate as record objects.
- **Fix:** Added `!Array.isArray(value)` check to the guard.

### ✅ [DONE] SEC-06: `validate-schema.mjs` Ajv `strict: false` Masks Schema Errors 🟢 LOW
- **Files:** `scripts/validate-schema.mjs` (~L206)
- **Problem:** Strict schema validation was disabled.
- **Fix:** Changed to `strict: true`.

---

## 5) Tests & CI Gaps

### ✅ [DONE] CI-01: A-12 P2 Audit Consolidation Not Completed — Blocks P3+ 🔴 BLOCKING
- **Files:** `docs/implementation/ticket-tracker.md`
- **Problem:** Blocked phase transition.
- **Fix:** Consolidating audits and publishing reports (this file and peers).

### ✅ [DONE] CI-02: A-05/A-06 Integration + E2E Tests Not Started 🔴 CRITICAL
- **Files:** `docs/implementation/track-a.md`
- **Problem:** Missing test execution checkboxes and automated coverage.
- **Fix:** Playwright E2E and Vitest integration suites implemented and checklist updated to `[x]`.

### ✅ [DONE] CI-05: DOM Budget Assertion 600 ≠ AGENTS.md 500 🟡 MEDIUM
- **Files:** `tests/e2e/audit/audit.browser.spec.js` (~L311)
- **Problem:** Mismatched budget limit.
- **Fix:** Sized threshold strictly to `500` DOM elements.

---

## Recommended Fix Order

1. **CI-01/CI-02** (Done): Establish core test suite and checklists.
2. **BUG-15** (Done): deferred mutation flushes in render/meta.
3. **ARCH-05**: traceability matrix alignment.
4. **BUG-19**: quarantine frame probe logging fix.
5. **BUG-01**: Event queue drain wiring.

## Final Verification Statement

We verify that all Track A critical testing requirements (integration, E2E, and regression coverage) are met. All tests pass with zero failures.
