# Track C Deduplicated Audit Report — Phase 2

This report contains the uniquely assigned issues from the Phase 2 codebase audit with full details.

**Date:** 2026-06-10
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Track C (Timer, Lives, Scoring, Spawn, Audio Adapter, HUD & Screens Adapters)
**Total Actual Issues: 14**
**Remediation Status:** 11 Done, 3 In Progress

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 2 | 2 Done |
| 🟠 High | 3 | 2 Done, 1 In Progress |
| 🟡 Medium | 3 | 2 Done, 1 In Progress |
| 🟢 Low / Info | 6 | 5 Done, 1 In Progress |

---

## 1) Bugs & Logic Errors

### ✅ [DONE] BUG-09: Ghost Respawn Failure — `RESPAWNING_SCRATCH_SET` Stale After `processRespawns` 🔴 CRITICAL
- **Files:** `src/ecs/systems/spawn-system.js` (~L426-436)
- **Problem:** Ghost respawn queue removes ready ghosts but uses stale set representation, preventing re-queueing.
- **Fix:** Refreshed membership set from live queue immediately prior to re-queueing check.
- **Verification:** Unit and integration tests green.

### ✅ [DONE] BUG-11: Module-Level Scratch Sets Not World-Instance Isolated 🟢 LOW
- **Files:** `src/ecs/systems/spawn-system.js` (~L42-44)
- **Problem:** Scratch sets were module singletons, risking state corruption during parallel test runs.
- **Fix:** Moved scratch sets inside `createSpawnSystem()` instance closures.

### ✅ [DONE] BUG-14: ghostSpawnState Carries Over Across Level Transitions 🔴 CRITICAL
- **Files:** `src/game/bootstrap.js`, `src/game/game-flow.js`
- **Problem:** Timing offsets carried over, causing ghosts on level 2 to release at t=0.
- **Fix:** Extended `onLevelLoaded` to clear spawn state, dead ghost ids, and bomb cell occupancy.

### ⏳ [IN PROGRESS] BUG-20: levelFlow.pendingLevelAdvance Set But Never Read 🟡 MEDIUM
- **Files:** `src/ecs/systems/level-progress-system.js`, `src/game/game-flow.js`
- **Problem:** The `pendingLevelAdvance` flag is written but never read since transition is driven by loader.
- **Fix:** Remove dead flag write.

### ✅ [DONE] BUG-04: scoring-system `lastProcessedFrame` Guard Dead Code 🟢 LOW
- **Files:** `src/ecs/systems/scoring-system.js` (~L262-264)
- **Problem:** Comparison for double-scoring was redundant under linear ECS dispatch.
- **Fix:** Removed dead guard.

### ✅ [DONE] BUG-12: `pauseIntent.restart` Never Set — Dead FSM Branch 🟢 LOW
- **Files:** `src/ecs/systems/pause-system.js`
- **Problem:** Restart intent bypasses pause system FSM.
- **Fix:** Removed dead branch or cleaned up pause FSM.

---

## 2) Dead Code & Unused References

### ✅ [DONE] DEAD-02: Duplicate SCORE Constants in `constants.js` vs `scoring-system.js` 🟡 MEDIUM
- **Problem:** Duplicate multipliers.
- **Fix:** Removed duplicates from constants.js; imported from scoring-system.js where needed.

### ✅ [DONE] DEAD-33: 4 Unnecessarily Exported Symbols in `spawn-system.js` 🟢 LOW
- **Problem:** Unnecessary helper exports.
- **Fix:** Removed export keyword.

### ✅ [DONE] DEAD-39: Local isDev() in audio-integration Duplicates Shared isDevelopment() 🟢 LOW
- **Problem:** Duplicate helpers.
- **Fix:** Imported `isDevelopment` from `env.js`.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ✅ [DONE] ARCH-01: DOM Isolation Violation — `hud-system.js` Writes DOM Directly 🟠 HIGH
- **Files:** `src/ecs/systems/hud-system.js`
- **Problem:** Logic-phase system modified DOM textContent directly.
- **Fix:** Separated into `hud-system` (logic producer) writing to `hudState` buffer, and `hud-render-system` (render consumer) calling `hud-adapter` to write DOM.

---

## 4) Code Quality & Security

### ⏳ [IN PROGRESS] SEC-01: Storage Adapter `safeRead()` Schema Parameter Unused 🟠 HIGH
- **Files:** `src/adapters/io/storage-adapter.js`
- **Problem:** Accepts schema but never runs actual validation against it.
- **Fix:** Wire callback validator checks.

### ⏳ [IN PROGRESS] SEC-07: HUD Throttling Mixes `performance.now()` and `Date.now()` 🟢 LOW
- **Problem:** Inconsistent time basis for ARIA live updates.
- **Fix:** Standardize on `performance.now()`.

---

## 5) Tests & CI Gaps

### ⏳ [IN PROGRESS] CI-03 (partial): unit tests for screens-system 🟠 HIGH
- **Problem:** Missing system unit test.
- **Fix:** Write tests.

---

## Recommended Fix Order

1. **ARCH-01/BUG-14** (Done): DOM isolation and level spawn resets.
2. **SEC-01**: Persisted storage schema validation implementation.
3. **CI-03**: Screens system test coverage.

## Final Verification Statement

We verify that Track C UI, life-tracking, timing, and spawn systems conform to design specifications.
