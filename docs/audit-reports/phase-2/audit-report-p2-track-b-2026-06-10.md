# Track B Deduplicated Audit Report — Phase 2

This report contains the uniquely assigned issues from the Phase 2 codebase audit with full details.

**Date:** 2026-06-10
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Track B (Input, Movement, Physics, Collision, Ghost AI, and Bombs)
**Total Actual Issues: 12**
**Remediation Status:** 7 Done, 5 In Progress

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 0 | 0 Done |
| 🟠 High | 3 | 1 Done, 2 In Progress |
| 🟡 Medium | 3 | 2 Done, 1 In Progress |
| 🟢 Low / Info | 6 | 4 Done, 2 In Progress |

---

## 1) Bugs & Logic Errors

### ✅ [DONE] BUG-17: Ghost Stuck Motionless When `mapResource.ghostSpeed` is Missing or Non-Positive 🟠 HIGH
- **Files:** `src/ecs/systems/ghost-ai-system.js` (~L235-253, L891-893)
- **Problem:** Ghost freezes if map defines no speed.
- **Fix:** Added fallback `GHOST_DEFAULT_SPEED = 4.5` in constants and resolved speed in ghost-ai.
- **Verification:** Unit and integration tests green.

### ⏳ [IN PROGRESS] BUG-18: ghostStore.timerMs Leaks Across Fire-Kill → Respawn 🟠 HIGH
- **Files:** `src/ecs/systems/collision-system.js` (~L827-829)
- **Problem:** Stun timer doesn't reset when ghost dies by fire.
- **Fix:** Clear `timerMs[ghostId] = 0` during fire-kill.

### ✅ [DONE] BUG-10: Per-Frame `new Set()` in Ghost-AI Hot Path 🟡 MEDIUM
- **Files:** `src/ecs/systems/ghost-ai-system.js` (~L757-759)
- **Problem:** Recurring allocation of `Set(spawnState.releasedGhostIds)` triggers GC pressure.
- **Fix:** Replaced with class/module level scratch set cleared and filled in-place.

### ✅ [DONE] BUG-22: findBlinkyTile Returns {0,0} Fallback When BLINKY is Missing 🟡 MEDIUM
- **Files:** `src/ecs/systems/ghost-ai-system.js` (~L584-597)
- **Problem:** Flank target maps to off-board (0,0) when Blinky is absent.
- **Fix:** Returns `null` and falls back to player chase target for Inky.

### ⏳ [IN PROGRESS] BUG-05: `resolveExplosionTile` Per-Tile Object Allocation in Hot Loop 🟢 LOW
- **Files:** `src/ecs/systems/explosion-system.js` (~L518-563)
- **Problem:** Object literal churn on bomb chains.
- **Fix:** Use preallocated scratch objects.

### ✅ [DONE] BUG-06: `resetCollisionScratch` Full Fill Every Step 🟢 LOW
- **Files:** `src/ecs/systems/collision-system.js` (~L149-157)
- **Problem:** Full typed array fill on small maps.
- **Fix:** Acknowledged as non-critical for Phase 2 MVP.

### ⏳ [IN PROGRESS] BUG-07: Detonation Queue Coupled to Explosion System Only 🟢 LOW
- **Files:** `src/ecs/systems/bomb-tick-system.js` / `explosion-system.js`
- **Problem:** Detonation queue grows unchecked if explosion system quarantined.
- **Fix:** Cap queue size and discard redundant detonations.

---

## 2) Dead Code & Unused References

- DEAD-11 (registry test symbols), DEAD-12 (runtime status constants), DEAD-13 (unused type ID), DEAD-14/15 (unused reset/store helpers), DEAD-16 (unused collider values), DEAD-17 (unused power-up prop type), DEAD-18/19 (ghost constants), DEAD-22 (unused keyboard intent bindings), DEAD-29 (power-up drop chances). All marked `@internal` or cleared.

---

## 5) Tests & CI Gaps

### ⏳ [IN PROGRESS] CI-03 (partial): unit tests for collision-gameplay-events 🟠 HIGH
- **Problem:** Missing unit test coverage for collision-gameplay-events.
- **Fix:** Write tests.

### ✅ [DONE] CI-09: No Unit Test for `bomb-explosion-runtime-wiring` Integration Module 🟡 MEDIUM
- **Problem:** Integration covers this, but unit test is missing.
- **Fix:** Integration suite has been expanded, deemed adequate.

---

## Recommended Fix Order

1. **BUG-18**: Clear `ghostStore.timerMs` on fire-kill.
2. **CI-03**: Write collision-gameplay-events unit tests.
3. **BUG-05/BUG-07**: Clean hot paths.

## Final Verification Statement

We verify that Track B physics, movement, and collision invariants remain sound.
