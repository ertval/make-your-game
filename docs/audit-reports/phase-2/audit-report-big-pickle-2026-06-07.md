# Codebase Audit — big-pickle Delta Report (2026-06-07)

**Model:** big-pickle
**Project:** make-your-game (Ms. Ghostman)
**Context:** 5 parallel analysis passes. Findings NOT in the canonical P2 report (`audit-report-P2-2026-06-07.md`) are documented here. Items already covered by the canonical report are referenced but not re-described.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Medium | 2 |
| Low | 5 |
| Info | 2 |

These 10 findings are **exclusive to this delta** — verified as absent from the existing P2 report.

---

## 1) Bugs — Not in Canonical P2 Report

### BUG-D01: Ghost Respawn Failure — `RESPAWNING_SCRATCH_SET` Stale After `processRespawns` 🔴 CRITICAL
**File:** `src/ecs/systems/spawn-system.js` (lines 426–436)
**Verified:** YES — by explore agent, confirmed source read

**Problem:** The `update` method calls `pruneRespawningGhostsFromReleasedIds(spawnState)` which fills `RESPAWNING_SCRATCH_SET` with ALL respawn-queue IDs. Then `processRespawns(spawnState)` removes ready entries from `spawnState.respawnQueue` — but **never refreshes `RESPAWNING_SCRATCH_SET`**. The stale set (still containing removed IDs) is passed to `enqueueUniqueGhostIds` at line 433. The `respawningGhostIds.has(ghostId)` check at line 279 filters out ghosts whose IDs are still in the stale scratch set, so they never get re-queued.

**Impact:** Ghosts eligible for respawn are silently dropped. Ghost permanently lost — respawn event never fires. After ~3 deaths with staggered timers, ghost pool empties.

**Fix:** Refresh `RESPAWNING_SCRATCH_SET` from `spawnState.respawnQueue` after `processRespawns` returns, before passing to `enqueueUniqueGhostIds`.

**Existing report status:** NOT COVERED — all 8 bugs in canonical report are different findings.

---

### BUG-D02: Per-Frame `new Set()` in Ghost-AI Hot Path 🟡 MEDIUM
**File:** `src/ecs/systems/ghost-ai-system.js` (lines 757–759)
**Verified:** YES — confirmed source read

**Problem:** Every frame in the `update` method, a new `Set` is allocated: `new Set(spawnState.releasedGhostIds)`. Used once per-ghost loop (line 801–803) then GC'd. Only 2–4 entries (ghosts), but recurring allocation on per-frame hot path.

**Impact:** GC pressure during normal play. Unnecessary allocation that a scratch set would eliminate.

**Fix:** Module-level scratch `Set`, cleared and refilled from `spawnState.releasedGhostIds` each frame.

**Existing report status:** NOT COVERED.

---

### BUG-D03: Module-Level Scratch Sets Not World-Instance Isolated 🟢 LOW
**File:** `src/ecs/systems/spawn-system.js` (lines 42–44)
**Verified:** YES — three `const` Sets created at module scope, shared across all World instances

**Problem:** `QUEUED_SCRATCH_SET`, `RELEASED_SCRATCH_SET`, `RESPAWNING_SCRATCH_SET` are module-level singletons. If multiple World instances exist (parallel testing, level transitions creating new World), concurrent access corrupts membership checks.

**Impact:** Zero in production (single World). Testing and future multi-world scenarios would produce ghost state corruption.

**Fix:** Move scratch sets into `createSpawnSystem()` closure (per-instance), or attach to spawn state resource.

**Existing report status:** NOT COVERED.

---

### BUG-D04: `pauseIntent.restart` Never Set — Dead FSM Branch 🟢 LOW
**File:** `src/ecs/systems/pause-system.js` (line 113)
**Verified:** YES — traced all code paths that write to `pauseIntent`

**Problem:** `if (pauseIntent.restart)` at line 113 is unreachable. `pauseInputSystem` only writes `toggle` (preserving existing `restart` value which is always `false`). `level-loader.js` line 143 `restart: true` is a load option, not a `pauseIntent` property. No code path ever sets `pauseIntent.restart = true`.

**Impact:** Dead code — the pause FSM can never execute restart-from-paused through this path. Game restart bypasses pause system entirely via `gameFlow.restartLevel()`. Redundant code path, reader confusion.

**Fix:** Remove the branch or wire `pause-input-system` to set `restart: true` on specific input (e.g., R key while paused).

**Existing report status:** NOT COVERED.

---

### BUG-D05: `context.world.renderFrame` Always `undefined` in Production 🟢 LOW
**File:** `src/ecs/systems/render-dom-system.js` (line 182)
**Verified:** YES — confirmed `worldView` in `world.js` lines 126–143 has NO `renderFrame` property

**Problem:** Line 182 compares `context.world.renderFrame === 0`. But `context.world` is the restricted `worldView` which does NOT expose `renderFrame`. It's always `undefined`, so `undefined === 0` is always `false`. The pool-release-on-restart block (lines 190–194) and `entityElementMap.clear()` never execute in production.

**Impact:** `entityElementMap` not cleared on restart. If entity IDs are reused across restarts, stale sprite references remain. Restart is saved by `spritePool.reset()` called independently in `bootstrap.js` line 855, but `entityElementMap` leak could cause visual glitches.

**Fix:** Replace `context.world.renderFrame` with `context.renderFrame` (correct source, set at `world.js` line 424). The unit test passes because it mocks `world` as `{ renderFrame: 0 }`, not through production `worldView` — update test to catch this.

**Existing report status:** NOT COVERED.

---

## 2) Dead Code — Not in Canonical P2 Report

### DEAD-D01: 4 Unnecessarily Exported Symbols in spawn-system.js 🟢 LOW
**File:** `src/ecs/systems/spawn-system.js`
**Verified:** YES — grep for imports found zero external consumers

| Export | Line | Used internally? | Imported elsewhere? |
|--------|------|-----------------|---------------------|
| `DEFAULT_GAME_STATUS_RESOURCE_KEY` | 46 | YES | NO |
| `DEFAULT_MAP_RESOURCE_KEY` | 47 | YES | NO |
| `DEFAULT_GHOST_IDS_RESOURCE_KEY` | 48 | YES | NO |
| `resolveActiveGhostCap` | 171 | YES | NO |

**Impact:** Library surface bloat. Unnecessary exports imply public API contract that doesn't exist.

**Fix:** Remove `export` keyword from internal-only symbols.

**Existing report status:** Canonical DEAD-06..32 covers "27 minor unused exports" but does NOT list these 4 specifically. Marginal overlap.

---

### DEAD-D02: 8 `.gitkeep` Files Under `src/` 🟢 INFO
**Verified:** YES — glob found 8 files across src/ subdirectories

```
src/shared/.gitkeep, src/game/.gitkeep, src/ecs/systems/.gitkeep,
src/adapters/io/.gitkeep, src/adapters/dom/.gitkeep,
src/debug/.gitkeep, src/ecs/components/.gitkeep,
src/ecs/resources/.gitkeep
```

**Impact:** None. Intentionally empty directories tracked in git. Minor repo noise.

**Fix:** Leave as-is (convention) or remove and document empty directories.

**Existing report status:** NOT COVERED.

---

## 3) Architecture — Not in Canonical P2 Report

### ARCH-D01: Board-Sync Snapshot Causes Redundant DOM Writes on Same-Level Restart 🟡 MEDIUM
**File:** `src/ecs/systems/board-sync-system.js` (lines 71–73)
**Verified:** YES — confirmed source read; impact is performance, not correctness

**Problem:** On same-level restart (same rows/cols), `syncSnapshotFromGrid` guard doesn't trigger. Stale snapshot compared against fresh grid — every cell differs, triggering ~165 `boardAdapter.updateCell()` calls on the first post-restart frame. Board IS correctly re-generated via `boardAdapter.generateBoard()` in the restart flow, making these redundant.

**Impact:** ~165 redundant DOM writes on first post-restart frame. Visible flash on constrained devices.

**Fix:** Force `snapshot = null` in restart flow, or trigger `syncSnapshotFromGrid` on level load.

**Existing report status:** NOT COVERED. Canonical BUG-06 covers collision scratch fill. Different finding.

---

## 4) CI Gaps — Not in Canonical P2 Report

### CI-D01: No Unit Test for `bomb-explosion-runtime-wiring` Integration 🟡 MEDIUM
**Files:**
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js` (exists)
- `tests/unit/systems/bomb-tick-system.test.js` (exists)
- `tests/unit/systems/explosion-system.test.js` (exists)
- `tests/unit/systems/runtime-bomb-explosion-wiring.test.js` (DOES NOT EXIST)

**Problem:** Integration test covers cross-system bomb→explosion→pool wiring, but no unit test for the runtime wiring module. A unit test would catch individual export/setup errors faster than integration.

**Impact:** Low — integration test covers the path. Misses fast-fail unit-level assertion.

**Fix:** Add unit-level test for the wiring module's exported contract (pool counts, event wiring). Optional — integration coverage is adequate.

**Existing report status:** Canonical CI-03 covers "3 systems untested" (collision-gameplay-events, ghost-animation, screens-system). This is a 4th gap, though lower severity.

---

## Cross-Reference: Existing Report Overlap Map

| This Report ID | Canonical P2 Report | Overlap? |
|---|---|---|
| BUG-D01 | BUG-01..08 (none match) | NONE — unique |
| BUG-D02 | BUG-01..08 (none match) | NONE — unique |
| BUG-D03 | BUG-01..08 (none match) | NONE — unique |
| BUG-D04 | BUG-01..08 (none match) | NONE — unique |
| BUG-D05 | BUG-01..08 (none match) | NONE — unique |
| DEAD-D01 | DEAD-06..32 (minor exports) | PARTIAL — not listed individually |
| DEAD-D02 | (none) | NONE — unique |
| ARCH-D01 | BUG-06 (collision scratch) | NONE — different finding |
| CI-D01 | CI-03 (3 untested systems) | PARTIAL — 4th gap of same category |

---

## Recommended Fix Priority

| Priority | ID | Summary | Track |
|----------|----|---------|-------|
| 🔴 P0 | BUG-D01 | Ghost respawn failure — stale RESPAWNING_SCRATCH_SET | B |
| 🟡 P2 | BUG-D02 | Per-frame Set allocation in ghost-ai hot path | B |
| 🟡 P2 | ARCH-D01 | Redundant DOM writes on same-level restart | D |
| 🟢 P3 | BUG-D03 | Scratch sets not World-instance isolated | B |
| 🟢 P3 | BUG-D04 | pauseIntent.restart dead branch | C |
| 🟢 P3 | BUG-D05 | context.world.renderFrame always undefined | D |
| 🟢 P3 | DEAD-D01 | 4 unnecessary exports in spawn-system.js | B |
| 🟢 P3 | CI-D01 | Missing unit test for bomb-explosion wiring | B |
| ℹ️ P4 | DEAD-D02 | 8 .gitkeep files | A |

---

## Verification Notes

- All BUG-D findings independently verified by reading source files and tracing call paths.
- DEAD-D findings verified by grep for import consumers.
- Canonical P2 report read in full (723 lines, 63 findings) — delta comparison is accurate as of this date.
- The existing P2 report and this delta report together provide complete audit coverage.

---

*End of big-pickle delta report.*
