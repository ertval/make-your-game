# Phase 2 Consolidated Audit Report — Final (2026-06-07)

**Date:** 2026-06-07
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 2 (Playable MVP)
**Sources Consolidated:**
1. `audit-report-P2-2026-06-07-deep.md` — 5-pass deep analysis
2. `audit-report-flash-2026-06-07.md` — 5-pass flash analysis
3. `audit-report-big-pickle-2026-06-07.md` — delta report (findings unique to big-pickle model)

---

## Methodology

Five parallel analysis passes were executed across the codebase by multiple models, then merged and deduplicated:
1. **Bugs & Logic Errors** — Runtime bugs, race conditions, state machine errors, edge-case failures, memory leaks
2. **Dead Code & Unused References** — Unused exports, dead branches, stale config, orphaned code
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundary breaches, DOM isolation, adapter injection, policy drift, render-intent contracts
4. **Code Quality & Security** — Unsafe sinks, forbidden tech, CSP, validation gaps, error handling, trust boundaries
5. **Tests & CI Gaps** — Missing test coverage, CI config weaknesses, audit verification gaps, phase parity

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 1 |
| 🔴 Critical | 4 |
| 🟠 High | 11 |
| 🟡 Medium | 18 |
| 🟢 Low / Info | 29 |
| ✅ PASS | 6 |
| **Total Findings (sections)** | **63** |
| **Total Logical Findings** | **89** |
| **Total PASS Confirmations** | **6** |

> [!NOTE]
> DEAD-06 through DEAD-32 is consolidated as one section covering 27 individual unused exports. The "89 logical findings" count expands that block.

**Top risks:**
1. **CI-01 — A-12 P2 audit consolidation not completed** — Blocks 19 tickets in P3/P4, stalling all subsequent feature work.
2. **BUG-09 — Ghost Respawn Failure (stale RESPAWNING_SCRATCH_SET)** — Ghosts silently dropped after respawn, permanently lost from the pool.
3. **BUG-14 — ghostSpawnState carries over across level transitions** — Deterministic ghost stagger violated on every level transition after the first.
4. **BUG-15 — render/meta phase deferred mutations silently discarded** — Structural integrity violation of the ECS deferred mutation contract.
5. **CI-02 — A-05/A-06 integration + E2E tests not started** — 12 of 20 fully automatable audit questions lack browser validation.
6. **BUG-01 — Event queue unbounded growth** — ~216K events/hour leak without drain calls; eventual OOM.
7. **ARCH-01, ARCH-02 — DOM isolation violations** — ECS systems accessing DOM outside resource boundaries.

---

## 1) Bugs & Logic Errors

### BUG-01: Event Queue Unbounded Growth — `drain()` Never Called 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-03, A-11)
- `src/ecs/resources/event-queue.js` (~L30-80)
- `src/ecs/systems/collision-system.js` (~L200-220)
- `src/ecs/systems/bomb-tick-system.js` (~L90-110)
- `src/ecs/systems/explosion-system.js` (~L100-130)
- `src/ecs/systems/player-move-system.js` (~L60-80)
- `src/main.ecs.js` (bootstrap)

**Problem:** 5+ systems call `emitGameplayEvent()` each fixed step. No consumer in active game loop calls `drain()`. `audio-integration.js` consumer exists but not wired into bootstrap. Events accumulate unboundedly.

**Impact:** Memory leak — at 60 Hz simulation, ~216K events/hour accumulate. Eventually OOM.

**Fix:** Wire `drain(eventQueue)` at deterministic sync point (end of `runRenderCommit`) or register audio-cue-system that drains it.

**Tests to add:** Leak-check test: run 10K sim steps, assert `eventQueue.events.length` stays bounded.

---

### BUG-02: Map Level-3 Border Has Destructible Cells 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-02)
- `assets/maps/level-3.json` (~L21, col 0, col 14)

**Problem:** Cells `[5][0]` and `[5][14]` are DESTRUCTIBLE. Explosion destroys them → border hole. `isPassable` returns `true` for EMPTY cells at border. `getCell` clamps OOB to INDESTRUCTIBLE — movement blocked but visual desyncs.

**Impact:** Visual vs gameplay desync on border breach. Player sees hole but can't exit.

**Fix:** Change cells to INDESTRUCTIBLE(1). Add semantic validation forbidding destructible on outer perimeter.

**Tests to add:** Schema validation test for border cell integrity.

---

### BUG-03: `grid2D` Mirror Write Guard Masks Data Loss 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L507-509)

**Problem:** `setCell` writes flat grid unconditionally but guards 2D mirror with `if (map.grid2D[row])`. If `grid2D[row]` undefined, flat write succeeds but 2D mirror silently skipped.

**Impact:** Stale `grid2D` data silently consumed by debug renderers/tests.

**Fix:** Replace with `map.grid2D[row][col] = type` (remove `if` guard) or add dev-mode assertion.

**Tests to add:** Destroy cell, assert `grid2D[row][col]` matches flat `grid[index]`.

---

### BUG-04: `scoring-system` `lastProcessedFrame` Guard Dead Code 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/systems/scoring-system.js` (~L262-264)

**Problem:** Guard compares `frameIndex` vs `scoreState.lastProcessedFrame` to prevent double-scoring. System runs exactly once per step (linear dispatch). Guard unreachable — dead code.

**Impact:** None (correct behavior). Remove dead branch.

**Fix:** Remove dead guard.

**Tests to add:** None.

---

### BUG-05: `resolveExplosionTile` Per-Tile Object Allocation in Hot Loop 🟢 LOW
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L518-563, callers L625-646)

**Problem:** Each explosion tile creates new 15-field object literal. With 4 arms × radius 7 = 28 objects/bomb, plus chain reactions. Short-lived → GC pressure during chain explosions.

**Impact:** GC jank during multi-bomb chain reactions on constrained devices.

**Fix:** Use pooled scratch object repopulated per tile, or inline 6 positional parameters.

**Tests to add:** GC-pressure regression test in bomb-explosion-wiring suite.

---

### BUG-06: `resetCollisionScratch` Full Fill Every Step 🟢 LOW
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L149-157)

**Problem:** Every collision step fills 5 typed arrays with `.fill()`. On 15×11 map (165 cells): 825 writes. On hypothetical 100×100: 50K writes. No dirty tracking.

**Impact:** Acceptable for shipped map sizes (15×11). Performance concern for larger maps.

**Fix:** Track dirty cells, reset only used indices. Accept as non-critical for Phase 2.

**Tests to add:** None.

---

### BUG-07: Detonation Queue Coupled to Explosion System Only 🟢 LOW
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (pushes to `bombDetonationQueue`)
- `src/ecs/systems/explosion-system.js` (drains via `takeDetonationWorkQueue`)

**Problem:** Shared `bombDetonationQueue` is plain array. If explosion-system quarantined (fault budget exhausted), queue grows unchecked. On return from quarantine, processes all accumulated detonations in single burst.

**Impact:** Burst fire entity creation could starve fire pool or cause visible visual spike.

**Fix:** Cap detonations processed per tick. Add drain-to-waste fallback when explosion-system quarantined.

**Tests to add:** Quarantine explosion-system, verify queue stays bounded.

---

### BUG-08: `runFixedStep` Iterates Empty `input` Phase 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-03)
- `src/ecs/world/world.js` (~L384)

**Problem:** `DEFAULT_PHASE_ORDER` = `['meta', 'input', 'physics', 'logic', 'render']`. `runFixedStep` skips render/meta, iterates remaining. `input` phase has zero registered systems. Wasteful empty iteration each step.

**Impact:** Negligible. Remove dead phase slot.

**Fix:** Remove `'input'` from `DEFAULT_PHASE_ORDER` or add presence check.

**Tests to add:** None.

---

### BUG-09: Ghost Respawn Failure — `RESPAWNING_SCRATCH_SET` Stale After `processRespawns` 🔴 CRITICAL
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L426-436)
**Source reports:** big-pickle BUG-D01, flash BUG-09, deep BUG-09

**Problem:** `pruneRespawningGhostsFromReleasedIds` fills `RESPAWNING_SCRATCH_SET` with all respawning IDs. Then, `processRespawns` mutates `spawnState.respawnQueue` by removing ready ghosts, but **never updates `RESPAWNING_SCRATCH_SET`**. The stale set is passed to `enqueueUniqueGhostIds`. Because the ghosts that just finished respawning are still found in `RESPAWNING_SCRATCH_SET`, they are skipped during re-queueing.

**Impact:** Respawning ghosts are silently dropped and permanently lost, emptying the active ghost pool.

**Fix:** Refresh `RESPAWNING_SCRATCH_SET` from `spawnState.respawnQueue` immediately after `processRespawns` finishes and before calling `enqueueUniqueGhostIds`.

**Tests to add:** A test verifying ghosts that complete respawn are successfully queued back into the spawn state.

---

### BUG-10: Per-Frame `new Set()` in Ghost-AI Hot Path 🟡 MEDIUM
**Files:** Ownership: Track B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js` (~L757-759)
**Source reports:** big-pickle BUG-D02, flash BUG-10, deep BUG-10

**Problem:** Every single update frame, `new Set(spawnState.releasedGhostIds)` is allocated, used once, and garbage collected.

**Impact:** Increases garbage collection pressure in the main simulation loop.

**Fix:** Use a module-level scratch set, cleared and refilled every frame.

**Tests to add:** Monitor allocations in the ghost AI test suite.

---

### BUG-11: Module-Level Scratch Sets Not World-Instance Isolated 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L42-44)
**Source reports:** big-pickle BUG-D03, flash BUG-11, deep BUG-11

**Problem:** `QUEUED_SCRATCH_SET`, `RELEASED_SCRATCH_SET`, and `RESPAWNING_SCRATCH_SET` are module-level global Singletons.

**Impact:** If multiple World instances run concurrently (e.g., in parallel test runners or fast level loads), shared access will cause state corruption. Zero impact in production (single World).

**Fix:** Move scratch sets to the spawn state resource or local closures inside `createSpawnSystem()`.

**Tests to add:** Instantiate two parallel worlds and verify their spawn systems do not leak state to each other.

---

### BUG-12: `pauseIntent.restart` Never Set — Dead FSM Branch 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-04)
- `src/ecs/systems/pause-system.js` (~L113)
**Source reports:** big-pickle BUG-D04, flash BUG-12, deep BUG-12

**Problem:** `if (pauseIntent.restart)` is unreachable. No code path in `pause-input-system.js` or elsewhere ever sets `pauseIntent.restart` to `true`.

**Impact:** Dead code branch. Restarting levels bypasses the pause system and goes directly through `gameFlow.restartLevel()`.

**Fix:** Clean up the dead FSM branch or bind it to a developer key intent.

**Tests to add:** None.

---

### BUG-13: `context.world.renderFrame` Always `undefined` in Production 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L182)
**Source reports:** big-pickle BUG-D05, flash BUG-13, deep BUG-13

**Problem:** The condition checks `context.world.renderFrame === 0`, but `context.world` is the restricted `worldView` which does not expose `renderFrame`. The check evaluates to `undefined === 0` (always false).

**Impact:** `entityElementMap` is never cleared on restarts, leaking references. Re-using entity IDs across restarts may display stale sprites. Restart is saved by `spritePool.reset()` called independently in `bootstrap.js` line 855, but `entityElementMap` leak could cause visual glitches.

**Fix:** Change `context.world.renderFrame` to `context.renderFrame`. Also update the unit test mock to use the production `worldView` path instead of `{ renderFrame: 0 }`.

**Tests to add:** Add unit test verifying `entityElementMap` is cleared when `renderFrame` is `0`.

---

### BUG-14: ghostSpawnState Carries Over Across Level Transitions 🔴 CRITICAL
**Files:** Ownership: Track C/A (Tickets: C-03, A-12)
- `src/game/bootstrap.js:798-811` (onLevelLoaded callback)
- `src/game/game-flow.js:137-170` (LEVEL_COMPLETE path)

**Problem:** When the player clears level 1 and the game advances to level 2, the `ghostSpawnState` world resource is never reset. Its `releasedGhostIds`, `queuedGhostIds`, `respawnQueue`, and especially `elapsedMs` are carried over from level 1. Because `elapsedMs` is typically 60-180 seconds by the time level 1 is cleared, all four ghost release delays (0/5/10/15 s) are already past, so `enqueueNewlyEligibleInitialGhosts` immediately queues all four ghost IDs. The result is that on level 2 start, the first four ghosts are released at t=0 instead of the staggered 0/5/10/15 s the design specifies (game-description.md §5.4). REQ-15 (deterministic ghost stagger) and AUDIT-F-13 are violated on every level transition after the first.

**Impact:** Violation of deterministic ghost stagger timings on level transitions.

**Fix:** In `src/game/bootstrap.js`, extend the `onLevelLoaded` callback (lines 798-811) to reset spawn bookkeeping, mirroring what `onRestart` already does:
```js
onLevelLoaded: (mapResource) => {
  if (boardContainerElement) {
    boardAdapter.generateBoard(mapResource, boardContainerElement);
  }
  updateBoardCss(mapResource);
  syncPlayerEntityFromMap(world, mapResource, options);
  syncGhostEntitiesFromMap(world, mapResource, options);
  // Reset spawn state so level-2 ghosts are released on the documented
  // 0/5/10/15 s stagger, not whatever timing the previous level reached.
  world.setResource('ghostSpawnState', createInitialSpawnState());
  world.setResource('deadGhostIds', []);
  // bomb-cell occupancy is also per-map; clear so a stale level-1 cell
  // index never blocks a level-2 ghost.
  world.setResource('bombCellOccupancy', new Set());
  world.frame = 0;
  world.renderFrame = 0;
},
```

**Tests to add:**
- `tests/integration/gameplay/level-transition-spawn-reset.test.js`: drive a Playwright session to level 1 clear → level 2 start, then assert `getResource('ghostSpawnState').releasedGhostIds.length === 0` and `elapsedMs === 0` immediately after the transition.
- Extend `tests/unit/systems/spawn-system.test.js` with a 'level transition resets spawn state' case.
- `tests/e2e/audit/audit-question-map.js`: add a check under AUDIT-F-13 that verifies level-2 spawn timing matches level-1 timing.

---

### BUG-15: Render and Meta Phase Systems Can Defer Structural Mutations That Are Silently Discarded 🔴 CRITICAL
**Files:** Ownership: Track A (Tickets: A-04, A-12)
- `src/ecs/world/world.js:413-451` (runRenderCommit) and `src/ecs/world/world.js:453-488` (runMeta)

**Problem:** `runFixedStep` (line 373-411) calls `this.applyDeferredMutations()` at line 409, so any structural mutation queued by an input/physics/logic system is applied. `runRenderCommit` and `runMeta` both set `#isDispatching = true`, run their systems inside a try/finally, reset the flag, and then return WITHOUT calling `applyDeferredMutations`. Any structural mutation queued by a render- or meta-phase system sits in `#pendingStructuralOps` forever, leaking entity slots and causing the world's structural state to diverge from the simulation state. Today this is latent because no render/meta system defers, but the API is broken and the contract is violated.

**Impact:** Integrity violation of the deferred mutation design and structural desyncs if render or meta systems queue mutations.

**Fix:** Add the same `applyDeferredMutations()` call to both methods:
```js
// In runRenderCommit, after the try/finally and before renderFrame += 1
this.applyDeferredMutations();
this.renderFrame += 1;
```
```js
// In runMeta, after the try/finally closing brace
this.applyDeferredMutations();
```

**Tests to add:**
- `tests/unit/world/world.test.js`: 'runRenderCommit flushes deferred mutations' — register a render-phase system that calls `world.deferDestroyEntity(handle)`, assert entity removed.
- Same for `runMeta`.
- `tests/integration/world/deferred-mutation-phase-symmetry.test.js`: parity test across all three dispatch paths.

---

### BUG-16: eventQueue Not Cleared on Restart — Phantom SFX Replayed 🟠 HIGH
**Files:** Ownership: Track A/B (Tickets: B-09, A-12)
- `src/game/bootstrap.js:819-857` (onRestart callback)

**Problem:** The `onRestart` callback resets `scoreState`, `levelTimer`, `playerLife`, `ghostSpawnState`, `collisionIntents`, `deadGhostIds`, `pauseIntent`, and `levelFlow`. It does NOT reset the canonical `eventQueue` resource. Events left from the previous run (e.g., `BombDetonated`, `GhostDefeated`, `LevelCleared`) are replayed by the audio cue runner on the first post-restart tick, producing phantom sounds.

**Impact:** Phantom sounds and events replayed right after restarting the game.

**Fix:** Add `eventQueue` to the `onRestart` reset list:
```js
world.setResource(eventQueueResourceKey, createEventQueue());
```

**Tests to add:**
- `tests/integration/gameplay/restart-flow.test.js`: enqueue events, call `restartLevel()`, assert post-restart queue is empty.
- `tests/integration/adapters/audio-integration.test.js`: assert no stale cues fire on first post-restart tick.

---

### BUG-17: Ghost Stuck Motionless When `mapResource.ghostSpeed` is Missing or Non-Positive 🟠 HIGH
**Files:** Ownership: Track B (Tickets: B-08, A-12)
- `src/ecs/systems/ghost-ai-system.js:235-253` (resolveGhostSpeed) + `891-893` (movement guard)

**Problem:** `resolveGhostSpeed` returns 0 when both `ghostStore.speed[ghostId]` and `mapResource.ghostSpeed` are missing or non-positive. The movement guard skips `advanceGhostTowardTarget` entirely. The ghost freezes on its current tile permanently. The player-move-system has a `PLAYER_BASE_SPEED` constant fallback but ghost-ai does not.

**Impact:** Ghosts freeze permanently on their tile when map-based speed definitions are missing.

**Fix:** Add `GHOST_DEFAULT_SPEED = 4.5` to `src/ecs/resources/constants.js` and use it as the terminal fallback in `resolveGhostSpeed`.

**Tests to add:**
- `tests/unit/systems/ghost-ai-system.test.js`: 'fallback speed keeps ghost moving' case.
- Integration test: bootstrap partial world without `ghostSpeed`, run 60 steps, assert ghost position advances.

---

### BUG-18: ghostStore.timerMs Leaks Across Fire-Kill → Respawn 🟠 HIGH
**Files:** Ownership: Track B (Tickets: B-04, B-07, B-08)
- `src/ecs/systems/collision-system.js:827-829` (fire-kill state write)

**Problem:** When a ghost is killed by fire, `ghostStore.state[ghostId] = GHOST_STATE.DEAD` is set but `ghostStore.timerMs[ghostId]` is NOT cleared. If the ghost was previously STUNNED, the leftover timer value leaks across respawn. The system silently relies on `state` and `timerMs` being kept in sync, but the writers are independent — a cross-track contract violation.

**Impact:** Potential for ghost behavior corruption and premature revival to normal states after respawning.

**Fix:** Expand the fire-kill write to also clear the timer:
```js
if (ghostStore?.state) {
  ghostStore.state[ghostId] = GHOST_STATE.DEAD;
  if (ghostStore.timerMs) {
    ghostStore.timerMs[ghostId] = 0;
  }
}
```
Also verify `resetGhost()` zeros `timerMs`.

**Tests to add:**
- `tests/unit/systems/collision-system.test.js`: 'fire-kill clears stun timer' case.
- `tests/integration/gameplay/b-07-power-up-bomb-kill.test.js`: stun → bomb kill → assert `timerMs === 0`.
- `tests/unit/components/actors.test.js`: assert `resetGhost` zeros every field including `timerMs`.

---

### BUG-19: Frame Probe Records Wall-Clock Deltas During Runtime Quarantine 🟠 HIGH
**Files:** Ownership: Track A (Tickets: A-09, A-13)
- `src/main.ecs.js:329-365` (onAnimationFrame)

**Problem:** `frameProbe.recordFrame(safeNowMs)` is called at line 337 BEFORE the quarantine check at line 339-341. After a 1.5 s quarantine, the recorded delta is ~1.5 s, inflating the probe's p95. AUDIT-F-17/F-18 tests use `frameProbe.getStats()` — a single transient error event can fail the audit on healthy hardware.

**Impact:** Artificially inflated frame metrics (p95/p99) during performance audits when recovering from quarantine.

**Fix:** Defer `frameProbe.recordFrame` to AFTER the quarantine check. While in quarantine, use `setTimeout` at 50 ms instead of rAF.

**Tests to add:**
- `tests/integration/gameplay/a03-runtime-error-handling.test.js`: force quarantine, assert p95 stays below 20 ms.
- `tests/e2e/audit/audit.browser.spec.js`: extend F-17/F-18 to survive a transient fault.

---

### BUG-20: levelFlow.pendingLevelAdvance Set But Never Read 🟡 MEDIUM
**Files:** Ownership: Track C (Tickets: C-04, A-12)
- `src/ecs/systems/level-progress-system.js:77-88, 136`
- `src/game/game-flow.js:137-170`

**Problem:** When the level-progress-system detects LEVEL_COMPLETE on a non-final level, it sets `levelFlow.pendingLevelAdvance = true`. But the actual level advance is driven by `levelLoader.advanceLevel()` directly. No code reads `levelFlow.pendingLevelAdvance`. The flag is dead.

**Impact:** Dead path and code confusion regarding how level advancement is triggered.

**Fix:** Remove the dead path or wire it to a real consumer. Minimum-friction fix: remove `publishPendingLevelAdvance` function entirely.

**Tests to add:**
- `tests/unit/systems/level-progress-system.test.js`: assert the system does NOT write to `levelFlow`.

---

### BUG-21: Fallback HUD Path Silently Drops bomb/fire/level Fields 🟡 MEDIUM
**Files:** Ownership: Track D (Tickets: D-08, C-05)
- `src/ecs/systems/hud-system.js:65-105`

**Problem:** When a `hudAdapter` resource is registered, the system writes 6 fields (lives, score, timer, bombs, fire, level). When no adapter is registered, the fallback path writes only 3 fields (timer, score, lives) — silently dropping bombs, fire, and level number. REQ-17 is violated in this fallback path.

**Impact:** Silent UI omissions (bombs, fire, level) in scenarios where the adapter is bypassed.

**Fix:** Either remove the fallback path (preferred — adapter is always registered) or extend it to include all 6 fields.

**Tests to add:**
- `tests/unit/systems/hud-system.test.js`: 'no adapter is a no-op, not partial output' case.
- `tests/integration/adapters/hud-adapter.test.js`: assert adapter is always installed in default bootstrap.

---

### BUG-22: findBlinkyTile Returns {0,0} Fallback When BLINKY is Missing 🟡 MEDIUM
**Files:** Ownership: Track B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js:584-597`

**Problem:** If BLINKY is not in `activeGhostTypes`, `findBlinkyTile` falls through to `return { row: 0, col: 0 }`. Inky's target is computed using (0,0) as Blinky's tile, producing a target well off the playable area. The bug is silent — no log, no event.

**Impact:** Silent pathfinding/targeting issues for Inky when Blinky is absent.

**Fix:** Return `null` when BLINKY is missing. Have the caller skip Inky's targeting or fall back to Blinky-style chase.

**Tests to add:**
- `tests/unit/systems/ghost-ai-system.test.js`: 'no BLINKY → null blinkyTile' case.
- `tests/integration/gameplay/inky-without-blinky.test.js`: assert Inky stays near the player instead of patrolling to (0,0).

---

### BUG-23: levelLoader.loadLevel Calls onLevelLoaded Before Updating the World Resource 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-03, A-12)
- `src/game/level-loader.js:113-138`
- `src/game/bootstrap.js:798-811`

**Problem:** In `loadLevel`, the call order is: (1) `onLevelLoaded(mapResource)`, (2) `currentLevelIndex = nextLevelIndex`, (3) `world.setResource(mapResourceKey, mapResource)`. Any callback reading `world.getResource('mapResource')` during step (1) sees the OLD map. Current wiring passes `mapResource` explicitly, so it's safe today, but the contract is fragile.

**Impact:** Fragile event ordering that can trigger stale-state reads on level loads.

**Fix:** Reorder: set `currentLevelIndex` and `world.setResource` FIRST, then call `onLevelLoaded`.

**Tests to add:**
- `tests/unit/game/level-loader.test.js`: assert `world.getResource('mapResource')` equals new map inside `onLevelLoaded`.
- `tests/integration/gameplay/level-loader-ordering.test.js`: assert `getCurrentLevelIndex()` returns new index inside callback.

---

## 2) Dead Code & Unused References

### DEAD-01: `changed-files.txt` Tracked Generated Artifact 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-06, A-11)
- `changed-files.txt` (repo root)

**Problem:** Generated diff artifact tracked in git. Already in `.gitignore` but remains in history.
**Fix:** `git rm --cached changed-files.txt`.

---

### DEAD-02: Duplicate SCORE Constants in `constants.js` vs `scoring-system.js` 🟡 MEDIUM
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/resources/constants.js` (~L135-153)
- `src/ecs/systems/scoring-system.js` (~L44-62)

**Problem:** Scoring multipliers and pellet values duplicated with identical values. `constants.js` versions never imported.
**Fix:** Remove scoring constants from `constants.js`, import from `scoring-system.js` where needed.

---

### DEAD-03: Legacy `renderer-dom.js` Superseded But Still in Repo 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`

**Problem:** File header says "LEGACY — Superseded." Not called from game loop.
**Fix:** Remove file or move to `src/legacy/`.

---

### DEAD-04: `test:integration` Runs with `--passWithNoTests` 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L21)

**Problem:** Flag masks the gap that no gameplay-integration tests are run.
**Fix:** Remove `--passWithNoTests` once integration gameplay tests exist.

---

### DEAD-05: `coverage` Script Duplicates `test:coverage` 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L26-27)

**Problem:** `"coverage"` is a direct alias of `"test:coverage"`.
**Fix:** Remove `"coverage"` script.

---

### DEAD-06 through DEAD-32: 27 Unused/Minor Exports Across Tracks A/B/C/D 🟢 LOW

Consolidated minor findings — unused exports marked as `@internal` or test-only, never imported by production `src/`:

| ID | File | Symbol | Track |
|----|------|--------|-------|
| DEAD-06 | `constants.js:26` | `SIMULATION_HZ` (used only to derive FIXED_DT_MS) | A |
| DEAD-07 | `event-queue.js:114` | `peek()` | A |
| DEAD-08 | `event-queue.js:130` | `clear()` | A |
| DEAD-09 | `event-queue.js:145` | `resetOrderCounter()` (deprecated test-only) | A |
| DEAD-10 | `bootstrap.js:131` | Legacy `adapterResourceKey` fallback | A |
| DEAD-11 | `registry.js:59` | `ALL_COMPONENT_MASKS` (test-only) | B |
| DEAD-12 | `spatial.js:54`, `actors.js:51`, `props.js:52`, `stats.js:36` | `*_RUNTIME_STATUS` objects (4 files) | B |
| DEAD-13 | `actors.js:45` | `UNASSIGNED_GHOST_TYPE` (internal-only) | B |
| DEAD-14 | `props.js:135,160`, `stats.js:50,78,105` | Planned store factories (5 fns) | B |
| DEAD-15 | `props.js:85,119,148,173`, `spatial.js:145` | Reset functions (test-only) | B |
| DEAD-16 | `spatial.js:44-45` | `COLLIDER_TYPE.WALL/PELLET/POWER_UP` unused values | B |
| DEAD-17 | `props.js:41` | `PROP_POWER_UP_TYPE` (never imported) | B |
| DEAD-18 | `constants.js:101-113` | Ghost AI constants (CLYDE_DISTANCE_THRESHOLD, etc) | B |
| DEAD-19 | `constants.js:121,124` | `LEVEL_GHOST_SPEED`, `LEVEL_MAX_GHOSTS` | B |
| DEAD-20 | `hud-adapter.js:58,62,66` | formatLives/formatScore/formatTimer exports | C |
| DEAD-21 | `hud-adapter.js:25` | `ARIA_LIVE_THROTTLE_MS` export | C |
| DEAD-22 | `input-adapter.js:36,50,64,84` | INPUT_INTENT, KEYBOARD bindings, normalizeKeyboardIntent | B |
| DEAD-23 | `render-intent.js:61` | `RENDER_INTENT_VERSION` | D |
| DEAD-24 | `render-intent.js:152` | `appendRenderIntent()` (test-only) | D |
| DEAD-25 | `render-intent.js:217` | `getRenderIntentView()` (test-only) | D |
| DEAD-26 | `sprite-pool-adapter.js:22` | `SPRITE_TYPE` (test-only) | D |
| DEAD-27 | `storage-adapter.js:8,18,43` | HIGH_SCORE_STORAGE_KEY, safeRead/safeWrite exports | C |
| DEAD-28 | `constants.js:63,68,212` | MAX_FIRE_RADIUS, POOL_FIRE_PER_BOMB (indirect use) | D |
| DEAD-29 | `constants.js:159` | `POWER_UP_DROP_CHANCES` (never imported) | B |

**Impact:** Low — library surface bloat, no runtime effect.
**Fix:** Remove exports or annotate `@internal`/`@private`.

---

### DEAD-33: 4 Unnecessarily Exported Symbols in `spawn-system.js` 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L46-48, L171)
**Source reports:** big-pickle DEAD-D01

**Problem:** `DEFAULT_GAME_STATUS_RESOURCE_KEY`, `DEFAULT_MAP_RESOURCE_KEY`, `DEFAULT_GHOST_IDS_RESOURCE_KEY`, and `resolveActiveGhostCap` are exported but only consumed internally.
**Fix:** Remove `export` modifier.

---

### DEAD-34: 8 `.gitkeep` Files Under `src/` ℹ️ INFO
**Files:** Ownership: Track A (Tickets: A-01)
**Source reports:** big-pickle DEAD-D02

**Problem:** Empty directories contain `.gitkeep` files despite no longer being empty.
**Fix:** Remove files now that directories contain source code.

---

### DEAD-35: POWER_UP_TYPE Enum in constants.js Reachable Only From a Test 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L170)

**Problem:** `POWER_UP_TYPE` enum in `constants.js` is reachable only from `constants.test.js`. The production power-up system uses a local `POWER_UP_TYPE` object, and the typed-array storage uses `PROP_POWER_UP_TYPE` in `props.js`. Three enums exist for the same gameplay concept.
**Fix:** Consolidate power-up enums to use `PROP_POWER_UP_TYPE` as the single source of truth.

---

### DEAD-36: skills-lock.json Tracked But Referenced by No Script 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `skills-lock.json` (repo root)

**Problem:** Tracked in git but not referenced, ignored, or consumed by any script or config.
**Fix:** Remove via `git rm skills-lock.json`.

---

### DEAD-37: generate_reports.py Present in Working Tree 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `generate_reports.py` (repo root)

**Problem:** Python helper gitignored but still present. No reference from any active script.
**Fix:** Remove the file.

---

### DEAD-38: biome.json Excludes Drift From .gitignore for Runtime Artifacts 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-12)
- `biome.json` (~L23)
- `.gitignore` (~L37, L43, L51)

**Problem:** `biome.json` does not exclude `.audit-logs/`, `.policy-runtime/`, and `.tmp/` directories that are in `.gitignore`. Biome scans these, causing noise.
**Fix:** Extend `biome.json` excludes.

---

### DEAD-39: Local isDev() in audio-integration Duplicates Shared isDevelopment() 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/audio-integration.js` (~L139)
- `src/shared/env.js` (~L21)

**Problem:** `audio-integration.js` defines a private `isDev()` that duplicates the shared `isDevelopment()`.
**Fix:** Import `isDevelopment()` from `src/shared/env.js`.

---

### DEAD-40: Stale 'DEAD-06' JSDoc on Ghost-AI Constants That Are Actually Used 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L100, L104, L108)

**Problem:** Constants `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, and `INKY_REFERENCE_OFFSET` carry stale JSDoc stating "Reserved for the ghost-AI system (DEAD-06)" but are actively imported and used.
**Fix:** Remove or update the stale JSDoc comment.

---

### DEAD-41: LEVEL_MAX_GHOSTS and LEVEL_GHOST_SPEED Exported But Never Imported 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L121, L124)

**Problem:** Two per-level arrays declared and exported but never imported by any source or test file.
**Fix:** Either wire into ghost-spawn/AI config or delete.

---

### DEAD-42: GHOST_INTERSECTION_MIN_EXITS Reserved But Never Consumed 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L113)

**Problem:** Constant carries "Reserved for ghost-AI pathfinding" JSDoc but no import exists anywhere. Dangling TODO since file shipped.
**Fix:** Either wire into `ghost-ai-system.js` or delete.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: DOM Isolation Violation — `hud-system.js` Writes DOM Directly 🟠 HIGH
**Violated rule:** AGENTS.md § DOM Isolation: "Simulation systems MUST NOT call DOM APIs"
**Files:** Ownership: Track C (Tickets: C-05)
- `src/ecs/systems/hud-system.js` (writes `textContent` directly to HUD elements)

**Problem:** `hud-system.js` (a `logic`-phase ECS system) directly writes `textContent` to HUD DOM elements instead of delegating to the `hud-adapter` via world resources.

**Impact:** Breaks determinism guarantee. Simulation and rendering interleaved. Harder to test.

**Fix:** `hud-system.js` should write HUD data to a resource buffer. `hud-adapter.js` (render-phase) reads buffer and writes DOM.

---

### ARCH-02: Adapter Injection Violation — `board-sync-system.js` Receives Adapter as Closure Param 🟠 HIGH
**Violated rule:** AGENTS.md § Adapter Injection: "Adapters MUST be registered as World resources and accessed through the resource API."
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js`
- `src/game/bootstrap.js`

**Problem:** `board-sync-system.js` receives `boardAdapter` as a closure-injected parameter, not via `world.getResource('boardAdapter')`.

**Impact:** Inconsistent adapter access pattern. Systems outside resource API are harder to test and audit.

**Fix:** Register `boardAdapter` as a world resource, access via `context.world.getResource('boardAdapter')`.

---

### ARCH-03: `entity-store.getActiveIds()` Returns Mutable Internal Array Reference 🟠 HIGH
**Violated rule:** AGENTS.md § ECS Data: Encapsulation and structural deferral invariants
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js`

**Problem:** `getActiveIds()` returns direct, mutable reference to the internal `activeIds` array. Callers can mutate it, breaking entity tracking invariants.

**Impact:** Silent corruption of entity lifecycle — IDs could be added/removed without proper allocate/release.

**Fix:** Return copy `[...this.activeIds]` or a frozen representation.

---

### ARCH-04: `ghost-animation-system.js` Not Listed in Any Track Ownership 🟡 MEDIUM
**Files:** Ownership: Unassigned (Track D intended) (Tickets: D-10)
- `src/ecs/systems/ghost-animation-system.js`
- `scripts/policy-gate/lib/policy-utils.mjs`

**Problem:** `ghost-animation-system.js` exists but no track's ownership patterns cover it. Policy gate flags any PR touching this file.

**Fix:** Add `src/ecs/systems/ghost-animation-*.js` to Track D ownership patterns.

---

### ARCH-05: Audit-Traceability Matrix Out of Sync With Actual Tests 🟠 HIGH
**Files:** Ownership: Track A (Tickets: A-06, A-12)
- `docs/implementation/audit-traceability-matrix.md`
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** 8 audit rows marked `Pending` but actually `Executable`: F-03, F-04, F-05, F-06, F-19, F-20, F-21, B-06. Matrix not updated when tests were implemented.

**Fix:** Flip status from `Pending` to `Executable` for all 8 rows. Add evidence artifact links for manual items.

---

### ARCH-06: Board-Sync Snapshot Causes Redundant DOM Writes on Same-Level Restart 🟡 MEDIUM
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js` (~L71-73)
**Source reports:** big-pickle ARCH-D01

**Problem:** On same-level restart, the stale snapshot triggers cell-by-cell modifications because coordinates seem to differ from the fresh grid. The board is already re-drawn by `generateBoard()`, making these ~165 `boardAdapter.updateCell()` calls redundant.

**Impact:** ~165 redundant DOM writes on first post-restart frame. Visible flash on constrained devices.

**Fix:** Reset the grid snapshot to `null` during the restart cycle, or trigger `syncSnapshotFromGrid` on level load.

---

### ARCH-07: Asset Pipeline — WebP Format Deviation From SVG Preference 🟡 MEDIUM
**Files:** Ownership: Track A / Track D (Tickets: A-07, D-10, D-11)
- `assets/manifests/visual-manifest.json`
- `assets/generated/visuals/128px/characters/*.webp`

**Problem:** Player sprites are WebP (lossless, 128×128), not SVG as preferred per `assets-pipeline.md` §9.2. Source is raster sheet — deviation acknowledged but undocumented.

**Fix:** Document raster-to-WebP deviation in `assets-pipeline.md` §9.2 with explicit rationale.

---

### ARCH-08: Frame Pipeline — Render Commit Phase Correctly Separated ✅ PASS
**Verified:** `render-collect-system` (computes intents) → `render-dom-system` (batched DOM commit). Render runs once per rAF, not per fixed step. No interleaved layout reads/writes.

---

### ARCH-09: Input Contract — Keydown/Keyup Sets, Snapshot, Blur Clear ✅ PASS
**Verified:** `input-adapter.js` tracks via `keydown`/`keyup` sets, clears on `blur`/`visibilitychange`. `input-system.js` snapshots once per fixed step. No OS key-repeat dependency.

---

### ARCH-10: Pause Invariants — rAF Active, Simulation Frozen ✅ PASS
**Verified:** `pause-system.js` freezes simulation while rAF continues. `clock.js` skips time advancement. Timing baseline reset on unpause. `main.js` resets `lastFrameTime`.

---

### ARCH-11: DOM Pooling — Offscreen Transform Hiding ✅ PASS
**Verified:** `sprite-pool-adapter.js` hides with `transform: translate(-9999px, -9999px)`. Never `display:none`.

---

### ARCH-12: Structural Deferral — Entity/Component Mutations Deferred ✅ PASS
**Verified:** `world.js` defers structural mutations to sync point after system execution. Entity ID recycling with generation-based stale-handle protection in `entity-store.js`.

---

### ARCH-13: Render-Intent Contract — classBits Bitmask Correctly Encoded ✅ PASS
**Verified:** `render-intent.js` pre-allocates buffer with `new Array(MAX_RENDER_INTENTS)` once; `classBits` is integer bitmask (not string array); `MAX_RENDER_INTENTS` accommodates `MAX_ENTITIES` from `constants.js`.

---

## 4) Code Quality & Security


### SEC-01: Storage Adapter `safeRead()` Schema Parameter Unused 🟠 HIGH
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/storage-adapter.js` (~L18-41)

**Problem:** `safeRead(key, _schema, defaultValue)` accepts schema parameter but never validates against it. Shape validation only checks `parsedValue !== null && typeof parsedValue === 'object' && !Array.isArray(parsedValue)`. TODO on line 34 acknowledges this.

**Impact:** AGENTS.md mandates "MUST treat localStorage/sessionStorage data as untrusted input and validate on read." Current implementation is trivial.

**Fix:** Implement actual schema validation — replace `_schema` with `validate(value)` callback.

---

### SEC-02: Map Runtime Validation Lacks JSON Schema Enforcement 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-07, D-03)
- `src/ecs/resources/map-resource.js` (~L425-470)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** `createMapResource()` calls `validateMapSemantic()` for structural checks but NOT JSON Schema validation at runtime. Schema validation only runs in CI. Additionally, `validate-schema.mjs` uses `strict: false`.

**Impact:** Undefined behavior from out-of-range cell types at runtime.

**Fix:** Add runtime JSON Schema validation in `createMapResource()`. Use `strict: true` in CI.

---

### SEC-03: `package.json` Marked `"private": false` 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L5)

**Problem:** `"private": false` allows accidental `npm publish`. No `publishConfig` restriction.

**Impact:** Accidental exposure of GPL-3.0 code and internal config.

**Fix:** Set `"private": true`.

---

### SEC-04: Grid Cell Type Range Not Validated at Runtime 🟡 MEDIUM
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L320-334)

**Problem:** `validateMapSemantic()` doesn't validate that cell values are in valid `CELL_TYPE` range (0-9). Values > 9 silently truncated by `Uint8Array`. Out-of-range values treated as empty by fallback.

**Impact:** Map-based edge cases — cell type 255 stored as INDESTRUCTIBLE-like, breaking pellet counting/collision detection.

**Fix:** Add cell type range validation in `validateMapSemantic`.

---

### SEC-05: `isRecord()` Type Guard Accepts Arrays 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-01)
- `src/shared/type-guards.js` (~L8-10)
- `src/game/level-loader.js` (~L27-34)

**Problem:** `isRecord(value)` returns `true` for arrays (`typeof [] === 'object'`). Defense-in-depth erosion.

**Fix:** Add `!Array.isArray(value)` check.

---

### SEC-06: `validate-schema.mjs` Ajv `strict: false` Masks Schema Errors 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** `strict: false` disables warnings about unknown keywords/structural issues.

**Fix:** Change to `strict: true`.

---

### SEC-07: HUD Throttling Mixes `performance.now()` and `Date.now()` 🟢 LOW
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/dom/hud-adapter.js` (~L28-30, L152)

**Problem:** ARIA announcement throttling switches between `performance.now()` and `Date.now()`. Two different time bases could produce incorrect intervals.

**Impact:** Accessibility: status updates may be skipped or spam.

**Fix:** Standardize on `performance.now()`.

---

### SEC-08: `render-dom-system.js` Uses `className` Overwrite 🟢 LOW
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L224)

**Problem:** `el.className = 'sprite'` overwrites ALL classes. Future code adding classes outside render-dom-system gets silently clobbered.

**Fix:** Use `classList` manipulation instead of `className` overwrite.

---

## 5) Tests & CI Gaps

### CI-01: A-12 P2 Audit Consolidation Not Completed — Blocks P3+ 🔴 BLOCKING
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/implementation/ticket-tracker.md` (~L143)

**Problem:** A-12 (P2 consolidated audit + 4 deduplicated track fix reports) is Not Started. Blocks B-06..B-09, C-07, A-04..A-06, A-08 (12 P3 tickets) and C-08..C-10, D-10, D-11, A-09, A-14 (7 P4 tickets). Total: 19 blocked tickets.

**Impact:** Complete P3/P4 stall. Phase 2 cannot close without A-12.

**Fix:** Complete A-12: consolidate audits, publish 4 deduplicated track reports.

---

### CI-02: A-05/A-06 Integration + E2E Tests Not Started 🔴 CRITICAL
**Files:** Ownership: Track A (Tickets: A-05, A-06)
- `docs/implementation/track-a.md`

**Problem:** A-05 (integration tests — multi-system, adapter boundaries) and A-06 (E2E Playwright audit tests) both Not Started. Cross-system correctness unverified. 12 of 20 Fully Automatable audit questions lack automated browser coverage.

**Impact:** No automated verification for cross-system interaction. Audit gates F-01..F-16, B-01..B-04 lack Playwright coverage.

**Fix:** Implement A-05 integration tests and A-06 E2E audit tests.

---

### CI-03: 3 Systems Without Unit Tests 🟠 HIGH
**Files:** Ownership: Various
- `src/ecs/systems/collision-gameplay-events.js` (Track B, B-09)
- `src/ecs/systems/ghost-animation-system.js` (Track D, D-10)
- `src/ecs/systems/screens-system.js` (Track C, C-05)

**Problem:** 3 of 22 systems (14%) lack unit tests.

**Fix:** Add unit tests for each:
- `collision-gameplay-events.test.js`: event emission, one-shot guards, terminal state
- `ghost-animation-system.test.js`: sprite index calc, animation ticks, direction mapping
- `screens-system.test.js`: overlay class toggles, keyboard nav, screen transitions

---

### CI-04: CI Workflow Triggers on Both `pull_request` AND `pull_request_review_submitted` 🟠 HIGH
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** CI triggers on both events. Can fire twice on same commit. No separate lint/test:unit/validate:schema steps.

**Impact:** Double CI runs waste resources. No fast-fail before full policy gate.

**Fix:** Deduplicate triggers. Add separate lint, test:unit, validate:schema steps.

---

### CI-05: DOM Budget Assertion 600 ≠ AGENTS.md 500 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L311)

**Problem:** AGENTS.md: "≤ 500 total after level load." Test asserts: `toBeLessThanOrEqual(600)`. 100-element gap.

**Fix:** Change to `expect(domCount).toBeLessThanOrEqual(500)`.

---

### CI-06: Phase Testing Report References Blocking Tickets That Are Now Done 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/audit-reports/phase-testing-verification-report.md`

**Problem:** Report lists C-04, C-05, C-01, C-06 as blocking/pending. All now Done. Report stale.

**Fix:** Update P2 section to reflect current ticket status.

---

### CI-07: F-13 Genre Behavior E2E Coverage Only Partial 🟡 MEDIUM
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L197)

**Problem:** F-13 E2E checks only VICTORY progression contract. Ghost-house stagger, respawn timing (game-description.md §5.4) has unit tests but no runtime browser assertion.

**Fix:** Add Playwright step verifying ghost entities appear with correct stagger timing.

---

### CI-08: 3 E2E Tests Permanently Skipped Pending Runtime World Hook 🟢 LOW
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/render-desync-bugs.spec.js` (~L84, L85, L104)

**Problem:** 3 tests skipped pending "runtime test-hook that exposes the ECS world." Infrastructure dependency not tracked.

**Fix:** Track in A-06 ticket definition; unskip once hook available.

---

### CI-09: No Unit Test for `bomb-explosion-runtime-wiring` Integration Module 🟡 MEDIUM
**Files:** Ownership: Track B (Tickets: B-06)
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js` (exists)
- `tests/unit/systems/runtime-bomb-explosion-wiring.test.js` (DOES NOT EXIST)
**Source reports:** big-pickle CI-D01

**Problem:** Integration test covers cross-system bomb→explosion→pool wiring, but no unit test for the runtime wiring module itself.

**Impact:** Slow feedback loops for mapping errors.

**Fix:** Add unit tests mock-asserting pool allocations and event wiring. Optional — integration coverage is adequate.

---

## Cross-Reference: Source Report → Consolidated ID Mapping

| Consolidated ID | big-pickle | flash | deep | Track | Description |
|---|---|---|---|---|---|
| BUG-01 | — | BUG-01 | BUG-01 | A | Event queue unbounded growth |
| BUG-02 | — | BUG-02 | BUG-02 | D | Level-3 border destructible cells |
| BUG-03 | — | BUG-03 | BUG-03 | D | grid2D mirror write guard |
| BUG-04 | — | BUG-04 | BUG-04 | C | scoring-system dead guard |
| BUG-05 | — | BUG-05 | BUG-05 | B | Explosion tile per-tick allocation |
| BUG-06 | — | BUG-06 | BUG-06 | B | Collision scratch full fill |
| BUG-07 | — | BUG-07 | BUG-07 | B | Detonation queue coupling |
| BUG-08 | — | BUG-08 | BUG-08 | A | Empty input phase iteration |
| BUG-09 | BUG-D01 | BUG-09 | BUG-09 | C | Ghost respawn stale set failure |
| BUG-10 | BUG-D02 | BUG-10 | BUG-10 | B | Per-frame Set in ghost-ai |
| BUG-11 | BUG-D03 | BUG-11 | BUG-11 | C | Scratch sets World isolation |
| BUG-12 | BUG-D04 | BUG-12 | BUG-12 | C | Pause intent dead restart branch |
| BUG-13 | BUG-D05 | BUG-13 | BUG-13 | D | Production renderFrame undefined |
| BUG-14 | — | BUG-14 | BUG-14 | C/A | ghostSpawnState carries over across level transitions |
| BUG-15 | — | BUG-15 | BUG-15 | A | Deferred mutations in render/meta phases discarded |
| BUG-16 | — | BUG-16 | BUG-16 | A/B | eventQueue not cleared on restart |
| BUG-17 | — | BUG-17 | BUG-17 | B | Ghost stuck motionless when speed missing |
| BUG-18 | — | BUG-18 | BUG-18 | B | ghostStore.timerMs leaks across fire-kill → respawn |
| BUG-19 | — | BUG-19 | BUG-19 | A | Frame probe records quarantine deltas |
| BUG-20 | — | BUG-20 | BUG-20 | C | pendingLevelAdvance set but never read |
| BUG-21 | — | BUG-21 | BUG-21 | D | HUD fallback drops bomb/fire/level fields |
| BUG-22 | — | BUG-22 | BUG-22 | B | findBlinkyTile returns {0,0} when Blinky missing |
| BUG-23 | — | BUG-23 | BUG-23 | D | stale map read in loadLevel callback order |
| DEAD-01 | — | DEAD-01 | DEAD-01 | A | changed-files.txt tracked artifact |
| DEAD-02 | — | DEAD-02 | DEAD-02 | C | Duplicate SCORE constants |
| DEAD-03 | — | DEAD-03 | DEAD-03 | D | Legacy renderer-dom.js |
| DEAD-04 | — | DEAD-04 | DEAD-04 | A | test:integration --passWithNoTests |
| DEAD-05 | — | DEAD-05 | DEAD-05 | A | Duplicate coverage script |
| DEAD-06..32 | — | DEAD-06..32 | DEAD-06..32 | A/B/C/D | 27 minor unused exports |
| DEAD-33 | DEAD-D01 | DEAD-33 | DEAD-33 | C | 4 unnecessary exports in spawn-system |
| DEAD-34 | DEAD-D02 | DEAD-34 | DEAD-34 | A | 8 .gitkeep files in src/ |
| DEAD-35 | — | DEAD-35 | DEAD-35 | A | POWER_UP_TYPE enum unused |
| DEAD-36 | — | DEAD-36 | DEAD-36 | A | skills-lock.json tracked but unused |
| DEAD-37 | — | DEAD-37 | DEAD-37 | A | generate_reports.py present |
| DEAD-38 | — | DEAD-38 | DEAD-38 | A | biome.json excludes drift |
| DEAD-39 | — | DEAD-39 | DEAD-39 | C | Local isDev() duplicates shared |
| DEAD-40 | — | DEAD-40 | DEAD-40 | A | Stale JSDoc on active ghost AI constants |
| DEAD-41 | — | DEAD-41 | — | A | LEVEL_MAX_GHOSTS/LEVEL_GHOST_SPEED unused |
| DEAD-42 | — | DEAD-42 | — | A | GHOST_INTERSECTION_MIN_EXITS reserved |
| ARCH-01 | — | ARCH-01 | ARCH-01 | C | hud-system DOM violation |
| ARCH-02 | — | ARCH-02 | ARCH-02 | D | board-sync adapter injection |
| ARCH-03 | — | ARCH-03 | ARCH-03 | A | entity-store mutable ref leak |
| ARCH-04 | — | ARCH-04 | ARCH-04 | D | ghost-animation unowned |
| ARCH-05 | — | ARCH-05 | ARCH-05 | A | Audit matrix stale status |
| ARCH-06 | ARCH-D01 | ARCH-06 | — | D | Redundant restart DOM writes |
| ARCH-07 | — | ARCH-07 | ARCH-07 | A/D | Asset pipeline format deviation |
| ARCH-08..13 | — | ✅ PASS | ✅ PASS | — | 6 PASS confirmations |
| SEC-01 | — | SEC-01 | SEC-01 | C | Storage schema validation gap |
| SEC-02 | — | SEC-02 | SEC-02 | A | Map runtime JSON Schema missing |
| SEC-03 | — | SEC-03 | SEC-03 | A | package.json private: false |
| SEC-04 | — | SEC-04 | SEC-04 | D | Grid cell type range validation |
| SEC-05 | — | SEC-05 | SEC-05 | A | isRecord accepts arrays |
| SEC-06 | — | SEC-06 | SEC-06 | A | Ajv strict: false |
| SEC-07 | — | SEC-07 | SEC-07 | C | HUD clock source mixing |
| SEC-08 | — | SEC-08 | SEC-08 | D | className overwrite |
| CI-01 | — | CI-01 | CI-01 | A | A-12 not started ⬆ BLOCKING |
| CI-02 | — | CI-02 | CI-02 | A | A-05/A-06 not started |
| CI-03 | — | CI-03 | CI-03 | B/C/D | 3 systems untested |
| CI-04 | — | CI-04 | CI-04 | A | CI duplicate triggers |
| CI-05 | — | CI-05 | CI-05 | A | DOM budget 600≠500 |
| CI-06 | — | CI-06 | CI-06 | A | Phase report stale |
| CI-07 | — | CI-07 | CI-07 | A | F-13 partial E2E |
| CI-08 | — | CI-08 | CI-08 | A | 3 skipped E2E tests |
| CI-09 | CI-D01 | CI-09 | — | B | Missing wiring unit tests |

---

## Recommended Fix Order

### Priority 1 — Blocking & Critical (must fix before any merge)
1. **CI-01**: Complete A-12 P2 Audit Consolidation (Track A)
2. **CI-02**: Implement A-05 (integration) and A-06 (E2E) testing suites (Track A)
3. **BUG-09**: Fix `RESPAWNING_SCRATCH_SET` stale state failure in spawn-system (Track C)
4. **BUG-14**: Reset spawn bookkeeping on level transitions (Track C/A)
5. **BUG-15**: Flush deferred mutations in render/meta phases (Track A)

### Priority 2 — High Severity (immediate follow-up)
6. **ARCH-01**: Fix `hud-system.js` direct DOM mutations (Track C)
7. **ARCH-02**: Fix `board-sync-system.js` closure-passed adapter dependency (Track D)
8. **ARCH-03**: Return clones instead of mutable activeIds array in `entity-store.js` (Track A)
9. **ARCH-05**: Sync `audit-traceability-matrix.md` status with tests (Track A)
10. **SEC-01**: Hook validator callback checks in `storage-adapter.js` (Track C)
11. **CI-03**: Implement unit tests for animation, screen, and collision-event systems (Tracks B/C/D)
12. **CI-04**: Deduplicate triggers in `.github/workflows/policy-gate.yml` (Track A)
13. **BUG-16**: Reset eventQueue on restart to prevent phantom SFX (Track A/B)
14. **BUG-17**: Add fallback ghost speed when `mapResource.ghostSpeed` is missing (Track B)
15. **BUG-18**: Clear `ghostStore.timerMs` on fire-kill to prevent premature stun revival (Track B)
16. **BUG-19**: Defer frame probe logging until after quarantine checks (Track A)

### Priority 3 — Medium Severity
17. **BUG-01**: Register and run the event queue drain consumer (Track A)
18. **BUG-10**: Pool the `Set` in ghost AI to reduce allocations (Track B)
19. **DEAD-01**: Remove cached `changed-files.txt` from Git (Track A)
20. **DEAD-02**: Remove duplicated SCORE constants from `constants.js` (Track C)
21. **ARCH-04**: Register `ghost-animation-system` patterns under Track D ownership (Track D)
22. **ARCH-06**: Clear snapshots on board restart to stop redundant updates (Track D)
23. **ARCH-07**: Document raster-to-WebP asset deviation in docs (Track A/D)
24. **SEC-02**: Implement JSON Schema validation inside `createMapResource` (Track A)
25. **SEC-03**: Set private status to `true` in `package.json` (Track A)
26. **SEC-04**: Add cell type range check inside `validateMapSemantic` (Track D)
27. **CI-05**: Constrain Playwright budget test assertion to 500 DOM elements (Track A)
28. **CI-06**: Align Phase testing report with current ticket states (Track A)
29. **CI-07**: Expand E2E check to assert stagger release timings (Track A)
30. **CI-09**: Write unit test coverages for `bomb-explosion-runtime-wiring.js` (Track B)
31. **BUG-20**: Remove dead `pendingLevelAdvance` flag writes (Track C)
32. **BUG-21**: Add bomb/fire/level writes to HUD fallback system (Track D)
33. **BUG-22**: Return null targeting when Blinky missing (Track B)
34. **DEAD-38**: Exclude `.audit-logs/`, `.policy-runtime/`, and `.tmp/` in `biome.json` (Track A)

### Priority 4 — Low Severity & Info (maintenance)
35. **BUG-02..08, BUG-11..13, BUG-23**: Fix minor logic bugs, module-level sets, loadLevel callback ordering (Tracks A/B/C/D)
36. **DEAD-03..05, DEAD-06..32, DEAD-33..37, DEAD-39..42**: Deduplicate legacy adapter files, remove unused exports, skills-lock.json, generate_reports.py, local `isDev`, stale JSDoc, dead LEVEL_MAX_GHOSTS/LEVEL_GHOST_SPEED/GHOST_INTERSECTION_MIN_EXITS constants (Tracks A/B/C/D)
37. **SEC-05..08**: Refactor type guards, enable strict schema compiler flags, clean classNames (Tracks A/D)
38. **CI-08**: Wire test runtime hooks and enable skipped Playwright specs (Track A)
39. **DEAD-34**: Remove 8 `.gitkeep` files from populated `src/` directories (Track A)

---

## Summary by Track Ownership

| Track | Blocking/Critical | High | Medium | Low/Info | Total |
|-------|-------------------|------|--------|----------|-------|
| **Track A** | CI-01, CI-02, BUG-15 | ARCH-03, ARCH-05, CI-04, BUG-19 | BUG-01, BUG-08, SEC-02, SEC-03, CI-05, CI-06, CI-07, DEAD-01, DEAD-38 | DEAD-04, DEAD-05, DEAD-34..37, DEAD-40..42, SEC-05, SEC-06, CI-08 + share of DEAD-06..32 | ~30 |
| **Track B** | — | BUG-17, BUG-18, CI-03 (partial) | BUG-10, BUG-22, CI-09 | BUG-05, BUG-06, BUG-07 + share of DEAD-06..32 | ~12 |
| **Track C** | BUG-09, BUG-14 | ARCH-01, SEC-01, CI-03 (partial) | BUG-20, DEAD-02, DEAD-33 | BUG-04, BUG-11, BUG-12, DEAD-39, SEC-07 + share of DEAD-06..32 | ~14 |
| **Track D** | — | ARCH-02, CI-03 (partial) | ARCH-04, ARCH-06, ARCH-07, BUG-21, SEC-04 | BUG-02, BUG-03, BUG-13, BUG-23, DEAD-03, SEC-08 + share of DEAD-06..32 | ~14 |

---

## PASS Confirmations

The following architectural invariants were verified as correctly implemented:

1. **ARCH-08**: Frame Pipeline — render collect → DOM commit separation ✅
2. **ARCH-09**: Input Contract — keydown/keyup + snapshot + blur clear ✅
3. **ARCH-10**: Pause Invariants — rAF active, sim frozen, timing reset ✅
4. **ARCH-11**: DOM Pooling — offscreen transform hiding, not display:none ✅
5. **ARCH-12**: Structural Deferral — sync point after system dispatch ✅
6. **ARCH-13**: Render-Intent Contract — classBits Bitmask Correctly Encoded ✅

---

## Notes

- **Duplicate SCORE constants**: C-01 scoring-system owns canonical scores; constants.js copies should be removed to prevent drift.
- **Bugfix branch bypass**: ARCH-04 (unowned ghost-animation-system) can be modified on a bugfix branch until ownership pattern is updated.
- **DEAD-41 and DEAD-42**: Only found in flash report. Deep report's DEAD-06..32 table covers DEAD-18/DEAD-19 which partially overlap but DEAD-41/DEAD-42 are distinctly separate findings about the exported-but-never-imported constants.

---

*End of Phase 2 Consolidated Final Audit Report.*
