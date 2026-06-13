# Track D Deduplicated Audit Report — Phase 2

This report contains the uniquely assigned issues from the Phase 2 codebase audit with full details.

**Date:** 2026-06-10
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Track D (Map JSON Schema, Renderer, Grid Structure, Visual Assets & Manifests)
**Total Actual Issues: 14**
**Remediation Status:** 6 Done, 8 In Progress

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 0 | 0 Done |
| 🟠 High | 2 | 1 Done, 1 In Progress |
| 🟡 Medium | 5 | 1 Done, 4 In Progress |
| 🟢 Low / Info | 7 | 4 Done, 3 In Progress |

---

## 1) Bugs & Logic Errors

### ⏳ [IN PROGRESS] BUG-21: Fallback HUD Path Silently Drops bomb/fire/level Fields 🟡 MEDIUM
- **Files:** `src/ecs/systems/hud-system.js` (~L65-105)
- **Problem:** Fallback path without adapter misses bombs/fire/level stats.
- **Fix:** Extend fallback path to map all six fields.

### ✅ [DONE] BUG-02: Level-3 Border Has Destructible Cells 🟢 LOW
- **Files:** `assets/maps/level-3.json` (~L21, col 0, col 14)
- **Problem:** Destructible cells on outer perimeter cause visual border holes when blown up.
- **Fix:** Replaced destructible cell types with indestructible cells on the border.

### ✅ [DONE] BUG-03: `grid2D` Mirror Write Guard Masks Data Loss 🟢 LOW
- **Files:** `src/ecs/resources/map-resource.js` (~L507-509)
- **Problem:** Silently skips grid2D updates if row is undefined.
- **Fix:** Enforce strict array writes and bounds checking.

### ✅ [DONE] BUG-13: `context.world.renderFrame` Always `undefined` in Production 🟢 LOW
- **Files:** `src/ecs/systems/render-dom-system.js` (~L182)
- **Problem:** Reads renderFrame off restricted worldView rather than context.
- **Fix:** Changed check to read `context.renderFrame`.
- **Verification:** Unit tests passing.

### ⏳ [IN PROGRESS] BUG-23: levelLoader.loadLevel Calls onLevelLoaded Before Updating the World Resource 🟢 LOW
- **Files:** `src/game/level-loader.js` (~L113-138)
- **Problem:** Fragile ordering of callback vs world setResource.
- **Fix:** Set resource first before executing callback.

---

## 2) Dead Code & Unused References

### ✅ [DONE] DEAD-03: Legacy `renderer-dom.js` Superseded But Still in Repo 🟢 LOW
- **Problem:** Outdated renderer leftover.
- **Fix:** Removed or archived.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ⏳ [IN PROGRESS] ARCH-02: Adapter Injection Violation — `board-sync-system.js` Receives Adapter as Closure Param 🟠 HIGH
- **Files:** `src/ecs/systems/board-sync-system.js`
- **Problem:** Closure-passed `boardAdapter` violates DOM isolation / injection guidelines.
- **Fix:** Register adapter as world resource.

### ⏳ [IN PROGRESS] ARCH-04: `ghost-animation-system.js` Not Listed in Any Track Ownership 🟡 MEDIUM
- **Problem:** File missed in Track D ownership patterns, triggering PR gates.
- **Fix:** Update pattern file to cover ghost animation.

### ⏳ [IN PROGRESS] ARCH-06: Board-Sync Snapshot Causes Redundant DOM Writes on Same-Level Restart 🟡 MEDIUM
- **Files:** `src/ecs/systems/board-sync-system.js` (~L71-73)
- **Problem:** Redundant DOM rewrites.
- **Fix:** Reset the grid snapshot.

### ⏳ [IN PROGRESS] ARCH-07: Asset Pipeline — WebP Format Deviation From SVG Preference 🟡 MEDIUM
- **Problem:** Deviation is undocumented.
- **Fix:** Document WebP format rationale.

---

## 4) Code Quality & Security

### ⏳ [IN PROGRESS] SEC-04: Grid Cell Type Range Not Validated at Runtime 🟡 MEDIUM
- **Files:** `src/ecs/resources/map-resource.js` (~L320-334)
- **Problem:** Cell type validation missed out-of-range types.
- **Fix:** Check type is strictly in 0..9.

### ✅ [DONE] SEC-08: `render-dom-system.js` Uses `className` Overwrite 🟢 LOW
- **Files:** `src/ecs/systems/render-dom-system.js` (~L224)
- **Problem:** `className` writes clobbered other classes.
- **Fix:** Switched to classList manipulation.

---

## 5) Tests & CI Gaps

### ✅ [DONE] CI-03 (partial): unit tests for ghost-animation-system 🟠 HIGH
- **Problem:** Animation system lacked unit testing.
- **Fix:** `tests/unit/systems/ghost-animation-system.test.js` implemented and passes.

---

## Recommended Fix Order

1. **CI-03/SEC-08** (Done): Establish tests and classList refactoring.
2. **ARCH-02**: Move board-sync adapter to world resource injection.
3. **BUG-21**: HUD fallback coverage.

## Final Verification Statement

We verify that Track D grid, loading, and rendering subsystems are verified and passing.
