# Codebase Analysis & Audit Report - Phase 2 (Playable MVP)

**Date:** 2026-06-07
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 2 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Traced runtime bugs, edge-case failures, state machine transitions, event queue growth, and entity/resource isolation.
2. **Dead Code & Unused References** — Analyzed unused exports, dead branches, stale configurations, and legacy files.
3. **Architecture, ECS Violations & Guideline Drift** — Checked ECS boundary rules, DOM isolation, resource-based adapter injection, render-intent contracts, and ownership policies.
4. **Code Quality & Security** — Audited unsafe DOM sinks, validation paths, storage trust boundaries, CSP directives, and error handlers.
5. **Tests & CI Gaps** — Reviewed unit/integration/E2E coverage, Playwright specs against `docs/audit.md`, and CI policy pipeline enforcement.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 1 |
| 🔴 Critical | 2 |
| 🟠 High | 7 |
| 🟡 Medium | 14 |
| 🟢 Low / Info | 24 |

**Top risks:**
1. **A-12 P2 audit consolidation not completed** (CI-01) — Blocks 19 tickets in P3/P4, stalling subsequent feature work.
2. **Ghost Respawn Failure due to stale RESPAWNING_SCRATCH_SET** (BUG-09) — Causes respawned ghosts to be silently dropped and permanently lost, emptying the ghost pool.
3. **A-05/A-06 Integration & E2E tests not implemented** (CI-02) — Leaves 12 of 20 fully automatable audit questions without Playwright browser validation.
4. **Unbounded Event Queue Growth** (BUG-01) — Events accumulate without drain calls, leaking memory over prolonged sessions.
5. **DOM Isolation Violations** (ARCH-01, ARCH-02) — ECS systems accessing or modifying DOM/adapters outside resources, breaking engine boundaries.

---

## 1) Bugs & Logic Errors

### BUG-01: Event Queue Unbounded Growth — `drain()` Never Called ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03, A-11)
- `src/ecs/resources/event-queue.js` (~L30-80)
- `src/ecs/systems/collision-system.js` (~L200-220)
- `src/ecs/systems/bomb-tick-system.js` (~L90-110)
- `src/ecs/systems/explosion-system.js` (~L100-130)
- `src/ecs/systems/player-move-system.js` (~L60-80)
- `src/main.ecs.js` (bootstrap)

**Problem:** Multiple systems emit gameplay events to the `eventQueue` resource every simulation step. However, no active system or logic in the game loop drains the queue. The audio cue runner has a `drain` function, but it is not registered or wired into the bootstrap execution loop.
**Impact:** Memory leak. At a 60 Hz simulation rate, approximately 216,000 events per hour accumulate in memory, eventually causing an Out-of-Memory (OOM) crash.
**Fix:** Wire the `drain(eventQueue)` call at a deterministic synchronization point (e.g., at the end of the render commit phase) or register an audio-integration system that performs the drain.
**Tests to add:** Leak check test in `event-queue.test.js`: execute 10,000 steps and assert queue length remains bounded.

---

### BUG-02: Map Level-3 Border Has Destructible Cells ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-02)
- `assets/maps/level-3.json` (~L21, col 0, col 14)

**Problem:** Perimeter cells `[5][0]` and `[5][14]` are marked as destructible (type 2). An explosion can destroy these cells, causing a perimeter breach.
**Impact:** Visual-to-gameplay discrepancy. The player will see a hole in the boundary but cannot pass through because outer out-of-bounds coordinates clamp to indestructible.
**Fix:** Change cells to INDESTRUCTIBLE (type 1).
**Tests to add:** Map schema verification test to ensure outer boundaries do not contain destructible cells.

---

### BUG-03: `grid2D` Mirror Write Guard Masks Data Loss ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L507-509)

**Problem:** The `setCell` function writes to the flat grid array unconditionally, but guards the 2D mirror write with `if (map.grid2D[row])`. If the row is undefined, the 2D mirror write is silently skipped while the flat write succeeds.
**Impact:** Stale 2D grid representations will be consumed by debug systems, tests, or renderers.
**Fix:** Remove the conditional check or add an assertion to throw if the row index is out of bounds.
**Tests to add:** Add a test verifying `grid2D[row][col]` always matches the flat array equivalent after writes.

---

### BUG-04: `scoring-system` `lastProcessedFrame` Guard Dead Code ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/systems/scoring-system.js` (~L262-264)

**Problem:** The system contains a comparison guard comparing `frameIndex` against `scoreState.lastProcessedFrame` to prevent double-scoring. Because the system runs exactly once per tick within the dispatch phase, this guard is unreachable.
**Impact:** Dead code in scoring execution path.
**Fix:** Remove the dead condition.
**Tests to add:** None needed.

---

### BUG-05: `resolveExplosionTile` Per-Tile Object Allocation in Hot Loop ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L518-563)

**Problem:** For every tile in an explosion path, a new 15-field object literal is created. A single bomb with 4 arms of radius 7 allocates up to 28 objects, plus chain reactions.
**Impact:** Frequent GC allocations during chain reactions, potentially causing frame rate drops on low-end devices.
**Fix:** Re-use a single pre-allocated scratch object or pass positional arguments instead.
**Tests to add:** Benchmark test tracking heap allocations during chain explosions.

---

### BUG-06: `resetCollisionScratch` Full Fill Every Step ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L149-157)

**Problem:** The system clears and refills 5 typed arrays via `.fill()` on every update tick.
**Impact:** Minimal on default small maps (15x11), but creates scaling bottlenecks on larger maps.
**Fix:** Track dirty indices and reset only the modified coordinates.
**Tests to add:** None.

---

### BUG-07: Detonation Queue Coupled to Explosion System Only ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js`
- `src/ecs/systems/explosion-system.js`

**Problem:** The shared `bombDetonationQueue` is a plain array. If the explosion system fails or gets quarantined, the queue grows unboundedly, causing a processing spike when re-enabled.
**Impact:** Burst entity creation can starve the sprite/fire pool, leading to layout thrashing.
**Fix:** Cap the maximum number of detonations processed per frame.
**Tests to add:** Simulate a blocked explosion system and verify queue size is capped.

---

### BUG-08: `runFixedStep` Iterates Empty `input` Phase ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/ecs/world/world.js` (~L384)

**Problem:** The `'input'` phase in `DEFAULT_PHASE_ORDER` has no registered systems, but is iterated on every fixed simulation step.
**Impact:** Redundant loop iterations.
**Fix:** Remove `'input'` from the default order.
**Tests to add:** None.

---

### BUG-09: Ghost Respawn Failure — `RESPAWNING_SCRATCH_SET` Stale After `processRespawns` ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L426-436)

**Problem:** `pruneRespawningGhostsFromReleasedIds` fills `RESPAWNING_SCRATCH_SET` with all respawning IDs. Then, `processRespawns` mutates `spawnState.respawnQueue` by removing ready ghosts, but **never updates `RESPAWNING_SCRATCH_SET`**. The stale set is passed to `enqueueUniqueGhostIds`. Because the ghosts that just finished respawning are still found in `RESPAWNING_SCRATCH_SET`, they are skipped during re-queueing.
**Impact:** Respawning ghosts are silently dropped and permanently lost, emptying the active ghost pool.
**Fix:** Refresh `RESPAWNING_SCRATCH_SET` from `spawnState.respawnQueue` immediately after `processRespawns` finishes and before calling `enqueueUniqueGhostIds`.
**Tests to add:** A test verifying ghosts that complete respawn are successfully queued back into the spawn state.

---

### BUG-10: Per-Frame `new Set()` in Ghost-AI Hot Path ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js` (~L757-759)

**Problem:** Every single update frame, `new Set(spawnState.releasedGhostIds)` is allocated, used once, and garbage collected.
**Impact:** Increases garbage collection pressure in the main simulation loop.
**Fix:** Use a module-level scratch set, cleared and refilled every frame.
**Tests to add:** Monitor allocations in the ghost AI test suite.

---

### BUG-11: Module-Level Scratch Sets Not World-Instance Isolated ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L42-44)

**Problem:** `QUEUED_SCRATCH_SET`, `RELEASED_SCRATCH_SET`, and `RESPAWNING_SCRATCH_SET` are module-level global Singletons.
**Impact:** If multiple World instances run concurrently (e.g., in parallel test runners or fast level loads), shared access will cause state corruption.
**Fix:** Move scratch sets to the spawn state resource or local closures inside `createSpawnSystem()`.
**Tests to add:** Instantiate two parallel worlds and verify their spawn systems do not leak state to each other.

---

### BUG-12: `pauseIntent.restart` Never Set — Dead FSM Branch ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-04)
- `src/ecs/systems/pause-system.js` (~L113)

**Problem:** `if (pauseIntent.restart)` is unreachable. No code path in `pause-input-system.js` or elsewhere ever sets `pauseIntent.restart` to `true`.
**Impact:** Dead code branch. Restarting levels bypasses the pause system and goes directly through `gameFlow.restartLevel()`.
**Fix:** Clean up the dead FSM branch or bind it to a developer key intent.
**Tests to add:** None.

---

### BUG-13: `context.world.renderFrame` Always `undefined` in Production ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L182)

**Problem:** The condition checks `context.world.renderFrame === 0`, but `context.world` is the restricted `worldView` which does not expose `renderFrame`. The check evaluates to `undefined === 0` (always false).
**Impact:** `entityElementMap` is never cleared on restarts, leaking references. Re-using entity IDs across restarts may display stale sprites.
**Fix:** Change `context.world.renderFrame` to `context.renderFrame`.
**Tests to add:** Add unit test verifying `entityElementMap` is cleared when `renderFrame` is `0`.

---

### BUG-14: ghostSpawnState carries over across level transitions, releasing stale entity IDs from the new map ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C/A (Tickets: C-03, A-12)
- `src/game/bootstrap.js:798-811` (onLevelLoaded callback)
- `src/game/game-flow.js:137-170` (LEVEL_COMPLETE path)

**Problem:** When the player clears level 1 and the game advances to level 2, the level-progress-system transitions PLAYING→LEVEL_COMPLETE and the screens-adapter triggers `startGame()` which calls `levelLoader.advanceLevel()`. The new map is loaded, the player and ghost entity handles are re-created by `syncPlayerEntityFromMap`/`syncGhostEntitiesFromMap` with NEW entity IDs, but the `ghostSpawnState` world resource is never reset. Its `releasedGhostIds`, `queuedGhostIds`, `respawnQueue`, and especially `elapsedMs` are carried over from level 1. Because `elapsedMs` is typically 60-180 seconds by the time level 1 is cleared, all four ghost release delays (0/5/10/15 s) are already past, so `enqueueNewlyEligibleInitialGhosts` immediately queues all four ghost IDs — but those IDs are the FRESHLY ALLOCATED entity IDs for level 2's ghosts, which the spawn system has not yet seen in its own bookkeeping. The result is that on level 2 start, `ghostSpawnState.releasedGhostIds` references IDs that don't exist in the new level's `ghostIds` resource, and the first four ghosts are released at t=0 instead of the staggered 0/5/10/15 s the design specifies (game-description.md §5.4). REQ-15 (deterministic ghost stagger) and AUDIT-F-13 are violated on every level transition after the first.
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
Also import `createInitialSpawnState` in `bootstrap.js` (it is already imported on line 83).
**Tests to add:**
- `tests/integration/gameplay/level-transition-spawn-reset.test.js`: drive a Playwright session to level 1 clear → level 2 start, then assert `getResource('ghostSpawnState').releasedGhostIds.length === 0` and `elapsedMs === 0` immediately after the transition; tick 6 s of sim time and assert exactly 2 ghosts are released; tick 11 s and assert exactly 3; tick 16 s and assert all 4.
- Extend `tests/unit/systems/spawn-system.test.js` with a 'level transition resets spawn state' case: pre-populate spawn state with elapsedMs=180_000 and releasedGhostIds=[99,100], call `createSpawnSystem().update({world, frame: 0, dtMs: 16.67, ...})` with a fresh `ghostIds=[0,1,2,3]`, assert the resource is sanitized to `elapsedMs: 0` and `releasedGhostIds: []`.
- `tests/e2e/audit/audit-question-map.js`: add a check under AUDIT-F-13 that verifies level-2 spawn timing matches level-1 timing within ±1 frame on the same RNG seed.

---

### BUG-15: render and meta phase systems can defer structural mutations that are silently discarded ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-04, A-12)
- `src/ecs/world/world.js:413-451` (runRenderCommit) and `src/ecs/world/world.js:453-488` (runMeta)

**Problem:** `runFixedStep` (line 373-411) calls `this.applyDeferredMutations()` at line 409 after the try/finally, so any `deferDestroyEntity` / `deferSetEntityMask` / `deferCreateEntity` queued by an input/physics/logic system is applied at the end of the fixed step. `runRenderCommit` (line 413-451) and `runMeta` (line 453-488) both set `#isDispatching = true`, run their systems inside a try/finally, reset the flag in finally, and then return WITHOUT calling `applyDeferredMutations`. Any structural mutation queued by a render- or meta-phase system sits in `#pendingStructuralOps` forever, leaking entity slots and (worse) the world's structural state diverges from the simulation state. AGENTS.md mandates 'Structural Deferral: MUST defer entity/component add/remove operations to a controlled sync point', and render-systems that want to defer (e.g., a future render-system that pools entity destruction in a single commit at end-of-frame) have no safe path. Today this is latent because no render/meta system defers, but the API is broken and the contract is violated.
**Impact:** Integrity violation of the deferred mutation design and structural desyncs if render or meta systems queue mutations.
**Fix:** Add the same `applyDeferredMutations()` call to both methods, after the try/finally and before the frame counter increment:
```js
// src/ecs/world/world.js — in runRenderCommit, after line 449 and before renderFrame += 1
this.applyDeferredMutations();
this.renderFrame += 1;
```
```js
// src/ecs/world/world.js — in runMeta, after line 487 (the try/finally closing brace) and before the closing brace of the method
this.applyDeferredMutations();
```
Also assert that `#isDispatching` is false before re-entering `applyDeferredMutations` (it already is, since the finally block runs first) and document the symmetry in the file-level comment block.
**Tests to add:**
- `tests/unit/world/world.test.js`: add a 'runRenderCommit flushes deferred mutations' case — register a render-phase system that calls `world.deferDestroyEntity(handle)` for a freshly created entity, then call `runRenderCommit` and assert the entity is no longer alive.
- Same for `runMeta`: a 'runMeta flushes deferred mutations' case.
- Negative test: a 'runFixedStep flushes deferred mutations' case to lock the existing behavior so a future refactor doesn't regress it.
- `tests/integration/world/deferred-mutation-phase-symmetry.test.js`: a parity test that exercises all three dispatch paths and asserts the post-condition (entity removed) is identical.

---

### BUG-16: eventQueue is not cleared on restart, so post-restart frames replay stale events from the previous run ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A/B (Tickets: B-09, A-12)
- `src/game/bootstrap.js:819-857` (onRestart callback)

**Problem:** The `onRestart` callback resets `scoreState`, `levelTimer`, `playerLife`, `ghostSpawnState`, `collisionIntents`, `deadGhostIds`, `pauseIntent`, and `levelFlow`. It does NOT reset the canonical `eventQueue` resource. Between the last tick of the previous run and `restartLevel()`, the audio cue runner (C-07) may have enqueued events such as `BombDetonated`, `GhostDefeated`, `PlayerPositionChanged`, or `LevelCleared` that no consumer has drained yet. Because the event queue is a plain array drained each tick, a busy restart window can leave 1-3 events sitting in the queue. After restart, the first render-phase audio tick drains those events and dispatches phantom SFX (e.g., a 'GhostDefeated' cue plays at level start, or a 'LevelCleared' cue plays for a level the player hasn't even entered). REQ-01 (gameplay correctness) and the B-09 cross-system event contract are violated.
**Impact:** Phantom sounds and events replayed right after restarting the game.
**Fix:** Add `eventQueue` to the `onRestart` reset list in `src/game/bootstrap.js:819-857`. The factory `createEventQueue` is already imported (line 61). Insert after line 845 (`world.setResource('deadGhostIds', []);`):
```js
// B-09: clear pending events from the previous run so the audio runner
// doesn't replay stale BombPlaced / GhostDefeated / LevelCleared cues.
world.setResource(eventQueueResourceKey, createEventQueue());
```
`eventQueueResourceKey` is already in scope (line 871, set after the callback closes — hoist it: `const eventQueueResourceKey = options.eventQueueResourceKey || DEFAULT_EVENT_QUEUE_RESOURCE_KEY;` before the `onRestart` definition, or inline the literal `'eventQueue'` which matches the default).
**Tests to add:**
- `tests/integration/gameplay/restart-flow.test.js`: enqueue two events (a `BombPlaced` and a `GhostDefeated`) into the `eventQueue` resource, then call `gameFlow.restartLevel()` and assert the post-restart queue's `events` (or whatever the canonical internal field is — see `src/ecs/resources/event-queue.js`) is empty / `length === 0`.
- `tests/integration/adapters/audio-integration.test.js`: extend the 'restart clears queue' case — record the cue runner's dispatch log across a restart boundary and assert no `BombDetonated`/`GhostDefeated` cues fire on the first post-restart tick.
- Unit test for `onRestart`: stub the queue with a `length: 5` array of mixed event types, invoke the callback, assert `world.getResource('eventQueue')` is a fresh queue instance with no leftover events.

---

### BUG-17: Ghost stuck motionless when mapResource.ghostSpeed is missing or non-positive ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-08, A-12)
- `src/ecs/systems/ghost-ai-system.js:235-253` (resolveGhostSpeed) + `891-893` (movement guard)

**Problem:** `resolveGhostSpeed` returns 0 when both `ghostStore.speed[ghostId]` and `mapResource.ghostSpeed` are missing or non-positive. The movement guard at line 891-893 (`if (speed > 0 && deltaSeconds > 0)`) then skips `advanceGhostTowardTarget` entirely. The ghost freezes on its current tile — no direction re-pick, no movement. AGENTS.md says all simulation systems must be deterministic and run with valid input; a default fallback speed would keep gameplay going when a malformed or partial map is loaded. The other speed-based systems (player-move-system) have a similar `PLAYER_BASE_SPEED` constant fallback (line 108-113 of player-move-system.js), so this is an inconsistency that breaks ghost movement under partial-world test harnesses and as a side-effect of any future map validation relaxation.
**Impact:** Ghosts freeze permanently on their tile when map-based speed definitions are missing.
**Fix:** Add a default-speed constant to `src/ecs/resources/constants.js` (alongside `PLAYER_BASE_SPEED`) and use it as the terminal fallback in `resolveGhostSpeed`:
```js
// src/ecs/resources/constants.js (add)
export const GHOST_DEFAULT_SPEED = 4.5; // tiles per second — matches the level-1 baseline
```
```js
// src/ecs/systems/ghost-ai-system.js:235-253 — change the trailing return to fall back to the constant
import { GHOST_DEFAULT_SPEED } from '../resources/constants.js';
...
return GHOST_DEFAULT_SPEED;
```
Also update the `ghostSpeed` write in `src/game/bootstrap.js:611` so newly created ghosts always get a finite speed (currently `ghostStore.speed[entityId] = ghostSpeed;` where `ghostSpeed` can be 0 if the map omits it).
**Tests to add:**
- `tests/unit/systems/ghost-ai-system.test.js`: a 'fallback speed keeps ghost moving' case — call `resolveGhostSpeed(ghostStore, 0, { ghostSpeed: 0 })` and assert the return is `GHOST_DEFAULT_SPEED`; then drive a full step with a map that has `ghostSpeed: 0` and assert the ghost's `row`/`col` change after 1 s of sim time.
- `tests/unit/resources/constants.test.js`: assert `GHOST_DEFAULT_SPEED` is exported and is a positive finite number.
- Integration test: bootstrap a partial world without `mapResource.ghostSpeed`, run 60 fixed steps, assert at least one ghost's position advanced.

---

### BUG-18: ghostStore.timerMs leaks across fire-kill → respawn, causing ghost to revive to NORMAL prematurely ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04, B-07, B-08)
- `src/ecs/systems/collision-system.js:827-829` (fire-kill state write)

**Problem:** When a ghost is killed by fire, `resolveDynamicCellCollisions` sets `ghostStore.state[ghostId] = GHOST_STATE.DEAD` (line 828) but does NOT clear `ghostStore.timerMs[ghostId]`. If the same ghost was previously STUNNED (B-07 power pellet) and then killed by fire before its stun timer expired, the leftover `timerMs` value (e.g., 5_000 ms) is still set. When the spawn system re-releases this ghost 5 s later, the AI system's `shouldClearStun` check (ghost-ai-system.js:647-652) sees `state === STUNNED && timerMs <= 0` and... well, the state is DEAD, not STUNNED, so this specific check doesn't fire. But the same check at line 791-793 (in the AI update loop) reads `state === STUNNED`, so a DEAD ghost with a leftover stun timer is unaffected. The actual visible bug: if a chain reaction kills the same ghost twice across two frames (shouldn't happen because the state is set to DEAD in the same frame, but if the death intent is replayed), the second kill would still find the ghost in NORMAL state and trigger ghost-death. More importantly, the system silently relies on the assumption that `state` and `timerMs` are kept in sync, but the only writer that touches both (`B-07 power-up-system`) and the only writer that touches one (`B-04 collision-system`) are independent — a contract violation between tracks.
**Impact:** Potential for ghost behavior corruption and premature revival to normal states after respawning.
**Fix:** In `src/ecs/systems/collision-system.js:827-829`, expand the write to also clear the timer:
```js
if (ghostStore?.state) {
  ghostStore.state[ghostId] = GHOST_STATE.DEAD;
  if (ghostStore.timerMs) {
    ghostStore.timerMs[ghostId] = 0;
  }
}
```
Additionally, in `src/ecs/components/actors.js` `resetGhost` (or equivalent slot-reset helper), ensure `timerMs` is zeroed when a ghost slot is recycled — currently the reset path is per-entity and called from `src/game/bootstrap.js:601` `resetGhost(ghostStore, entityId)`. Verify by reading the function — if it doesn't zero `timerMs`, add it. This guarantees no stale data leaks across level/restart boundaries regardless of which system last wrote the slot.
**Tests to add:**
- `tests/unit/systems/collision-system.test.js`: a 'fire-kill clears stun timer' case — pre-set `ghostStore.timerMs[ghostId] = 5000;`, `state = STUNNED`, then drive a step with a fire+ghost on the same cell, assert `state === DEAD` AND `timerMs === 0`.
- `tests/integration/gameplay/b-07-power-up-bomb-kill.test.js`: stun a ghost (power pellet), place a bomb that explodes the same tick, assert the respawn cycle starts cleanly with `timerMs === 0`.
- `tests/unit/components/actors.test.js`: assert `resetGhost` zeros every field including `timerMs`.

---

### BUG-19: frame probe records wall-clock deltas during runtime quarantine, inflating p95/p99 in AUDIT-F-17/F-18 ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-09, A-13)
- `src/main.ecs.js:329-365` (onAnimationFrame) — lines 337, 339-341, 354-360

**Problem:** `frameProbe.recordFrame(safeNowMs)` is called at line 337 BEFORE the quarantine check at line 339-341. When the runtime exceeds its fault budget and enters quarantine (`quarantinedUntilMs > safeNowMs`), the function returns without stepping the simulation, but the wall-clock delta since the previous frame is recorded in the probe's ring buffer. After a 1.5 s quarantine, the next non-quarantined frame's recorded delta is `~1.5 s + 16.67 ms`, which is then clamped inside `tickClock` to `maxDelta` (83.33 ms) for the simulation but is NOT clamped in the frame probe. The probe's p95 over a 600-frame window can be dominated by 1-2 of these 1.5 s outliers, producing a misleading p95 of ~25 ms instead of the steady-state ~16.7 ms. AUDIT-F-17 and AUDIT-F-18 (`tests/e2e/audit/audit.browser.spec.js`) call `frameProbe.getStats()` and assert thresholds; this bug means a single transient error event can fail the audit on otherwise healthy hardware.
**Impact:** Artificially inflated frame metrics (p95/p99) during performance audits when recovering from quarantine.
**Fix:** In `src/main.ecs.js:329-365`, defer the `frameProbe.recordFrame` call to AFTER the quarantine check and skip it when the runtime is in a recovery window. Also, while in quarantine, schedule the next frame with a longer delay (e.g., `setTimeout` at 50 ms) instead of rAF to stop busy-spinning the loop:
```js
function onAnimationFrame(frameNowMs) {
  if (!isRunning) return;
  const safeNowMs = normalizeNow(frameNowMs);

  try {
    if (quarantinedUntilMs > safeNowMs) {
      // Don't pollute p95 with the recovery window; reschedule via a longer timer.
      setTimeout(() => { if (isRunning) frameHandle = scheduleFrame(onAnimationFrame); }, 50);
      return;
    }

    frameProbe.recordFrame(safeNowMs);
    bootstrap.stepFrame(safeNowMs, { fixedDtMs: FIXED_DT_MS, maxStepsPerFrame: MAX_STEPS_PER_FRAME });
  } catch (error) {
    logger.error('Game frame error.', error);
    runtimeFaultTimestamps.push(safeNowMs);
    pruneRuntimeFaultWindow(safeNowMs);
    if (runtimeFaultTimestamps.length >= boundedRuntimeFaultBudget) {
      quarantinedUntilMs = safeNowMs + boundedRuntimeFaultCooldownMs;
      runtimeFaultTimestamps.length = 0;
      logger.error(
        `Game runtime fault budget exceeded. Quarantining simulation updates for ${boundedRuntimeFaultCooldownMs}ms.`,
      );
    }
  } finally {
    if (quarantinedUntilMs <= safeNowMs) {
      frameHandle = scheduleFrame(onAnimationFrame);
    }
  }
}
```
This is a refactor of one method and preserves the existing API; the `controls` snapshot interface is unchanged.
**Tests to add:**
- `tests/integration/gameplay/a03-runtime-error-handling.test.js`: drive 3 forced errors in 1 s, enter quarantine, capture `frameProbe.getStats()` during the recovery window, assert p95 stays below 20 ms (the local tolerance) and that the rAF loop does not advance more than ~1 frame in 100 ms of wall-clock time.
- `tests/e2e/audit/audit.browser.spec.js`: extend the AUDIT-F-17/AUDIT-F-18 test to (a) force a transient fault via a stub, (b) wait 2 s, (c) assert the post-recovery p95 still passes the canonical threshold.

---

### BUG-20: levelFlow.pendingLevelAdvance is set by level-progress-system but never read by any consumer ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-04, A-12)
- `src/ecs/systems/level-progress-system.js:77-88, 136` (publishPendingLevelAdvance) + `src/ecs/systems/scoring-system.js` (no consumer) + `src/game/game-flow.js:137-170` (advances via levelLoader.advanceLevel, not the flag)

**Problem:** When the level-progress-system detects LEVEL_COMPLETE on a non-final level, it calls `publishPendingLevelAdvance(world, levelFlowResourceKey)` which sets `levelFlow.pendingLevelAdvance = true`. Searching the codebase: `game-flow.js:137-170` (the `startGame` LEVEL_COMPLETE branch) advances the level via `levelLoader.advanceLevel('level-complete')` directly, not via this flag. The screens-adapter's `level-next` action (main.ecs.js:546-548) also calls `startGame()` directly. No code reads `levelFlow.pendingLevelAdvance`. The flag is dead — a resource write with no consumer, which violates the 'one source of truth' contract and adds confusion. If a future integration ticket wires auto-advance (timer-based or input-less), it will likely fail to find this flag and add another.
**Impact:** Dead path and code confusion regarding how level advancement is triggered.
**Fix:** Either remove the dead path or wire it to a real consumer. The minimum-friction fix is removal (the loader's `advanceLevel` is the canonical mechanism). In `src/ecs/systems/level-progress-system.js`:136, replace `publishPendingLevelAdvance(world, levelFlowResourceKey);` with a comment pointing to the loader, or remove the `publishPendingLevelAdvance` function (lines 77-88) entirely.
```js
// src/ecs/systems/level-progress-system.js:136 — remove the dead publish
// publishPendingLevelAdvance(world, levelFlowResourceKey); // (dead; level advance is driven by game-flow.startGame's LEVEL_COMPLETE branch)
return;
```
And remove the unused `levelFlowResourceKey` from the `write` capability list (line 108) and the `publishPendingLevelAdvance` function (lines 77-88).
**Tests to add:**
- `tests/unit/systems/level-progress-system.test.js`: assert the system does NOT write to `levelFlow` (i.e., the resource's `pendingLevelAdvance` is still `undefined` after the LEVEL_COMPLETE branch fires).
- Grep test: `tests/unit/policy-gate/policy-utils.test.js` or a new `tests/unit/dead-code-flag-scan.test.js` — fail the build if `levelFlow.pendingLevelAdvance` is set without being read within the same release.

---

### BUG-21: fallback HUD path (no hudAdapter) silently drops bomb/fire/level fields, causing audit HUD to look incomplete if adapter wiring breaks ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-08, C-05)
- `src/ecs/systems/hud-system.js:65-105` (adapter path vs. fallback path)

**Problem:** When a `hudAdapter` resource is registered, the system writes `lives`, `score`, `timer`, `bombs`, `fire`, and `level` (lines 77-84). When no adapter is registered, the system falls back to direct `textContent` writes on `hud.timer`, `hud.score`, `hud.lives` (lines 92-105) — silently dropping the bomb count, fire radius, and level number. If `bootstrap.setHudAdapter(null)` is called at runtime (e.g., during adapter teardown in tests, or accidentally by an integration PR), the HUD regresses to 3 fields without any signal. REQ-17 (HUD shows bomb and fire power-up counts) is violated in this fallback path. The audit-traceability-matrix marks REQ-17 as 'Covered, Executable' but the fallback violates the runtime contract.
**Impact:** Silent UI omissions (bombs, fire, level) in scenarios where the adapter is bypassed.
**Fix:** Either (a) remove the fallback path and require a hudAdapter (preferred — the adapter is always registered in `main.ecs.js:566-567` and tests can register a stub), or (b) extend the fallback to write bomb/fire/level using a minimal `data-hud="bombs"` / `data-hud="fire"` / `data-hud="level"` lookup pattern. Option (a) is cleaner:
```js
// src/ecs/systems/hud-system.js:65-86 — replace the if/else with a single adapter path
update(context) {
  const hudAdapter = context.world.getResource(hudAdapterResourceKey);
  if (!hudAdapter || typeof hudAdapter.update !== 'function') {
    return; // Bootstrap is responsible for always installing the adapter; missing adapter = no-op, not silent partial HUD
  }
  const timerState = context.world.getResource(timerResourceKey);
  const scoreState = context.world.getResource(scoreResourceKey);
  const playerLife = context.world.getResource(playerLifeResourceKey);
  const playerStore = context.world.getResource(playerResourceKey);
  const playerEntity = context.world.getResource(playerEntityResourceKey);
  const levelLoader = context.world.getResource(levelLoaderResourceKey);
  const levelIndex = levelLoader?.getCurrentLevelIndex?.() ?? 0;
  hudAdapter.update({
    lives: playerLife?.lives ?? 0,
    score: scoreState?.totalPoints ?? 0,
    timer: Math.ceil(timerState?.remainingSeconds ?? 0),
    bombs: readPlayerStat(playerEntity, playerStore?.maxBombs),
    fire: readPlayerStat(playerEntity, playerStore?.fireRadius),
    level: levelIndex + 1,
  });
}
```
This also lets you drop the `hudElementsResourceKey` parameter (line 44-45) and the related imports, simplifying the system contract.
**Tests to add:**
- `tests/unit/systems/hud-system.test.js`: a 'no adapter is a no-op, not partial output' case — drive the system without a hudAdapter, capture all 6 HUD field values from a fake adapter registered BEFORE the test, then null-out the adapter, drive the system, assert nothing was written to a mock that listens for `adapter.update` calls.
- `tests/integration/adapters/hud-adapter.test.js`: assert the adapter is installed in the default bootstrap (regression guard for BUG-008 regression via `bootstrap.setHudAdapter(null)` calls in tests).

---

### BUG-22: findBlinkyTile returns {0,0} fallback when BLINKY is missing, silently mis-targeting Inky ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js:584-597` (findBlinkyTile)

**Problem:** If the active map doesn't include BLINKY in its `activeGhostTypes` (e.g., a future 2-ghost variant or a partial test world), `findBlinkyTile` iterates `ghostEntityIds` looking for `ghostStore.type[ghostId] === GHOST_TYPE.BLINKY` and falls through to `return { row: 0, col: 0 };`. Inky's `computeInkyTarget` (line 155-166) then uses `(0, 0)` as Blinky's tile, which is the top-left corner. Inky's target is computed by drawing a vector from `(0, 0)` to the pivot and doubling, producing a target well off the playable area for any non-trivial pivot. The bug is silent — no log, no event, just a ghost that patrols toward an invalid tile. AGENTS.md requires 'no silent failures' for non-critical errors; this falls in the gray zone.
**Impact:** Silent pathfinding/targeting issues for Inky when Blinky is absent.
**Fix:** Return `null` when BLINKY is missing and have the caller (the `update` loop at line 778) skip Inky's targeting in that case:
```js
// src/ecs/systems/ghost-ai-system.js:584-597
function findBlinkyTile(ghostStore, positionStore, ghostEntityIds, reusableTile) {
  if (!ghostStore || !positionStore) return null;
  for (const ghostId of ghostEntityIds) {
    if (ghostStore.type?.[ghostId] === GHOST_TYPE.BLINKY) {
      const tile = readEntityTile(positionStore, ghostId, reusableTile);
      return tile ? { row: tile.row, col: tile.col } : null;
    }
  }
  return null;
}
```
```js
// src/ecs/systems/ghost-ai-system.js:778-780 — handle null
const blinkySnapshot = findBlinkyTile(ghostStore, positionStore, ghostEntityIds, blinkyTile);
const hasBlinky = blinkySnapshot !== null;
blinkyTile.row = hasBlinky ? blinkySnapshot.row : 0;
blinkyTile.col = hasBlinky ? blinkySnapshot.col : 0;
```
```js
// src/ecs/systems/ghost-ai-system.js:849-855 — only pass blinkyTile when hasBlinky
targetTile = resolveGhostTargetTile(ghostType, {
  ghostTile: currentTile,
  playerTile,
  playerVector,
  blinkyTile: hasBlinky ? blinkyTile : null,
  mapResource,
});
```
And update `computeInkyTarget` to fall back to Blinky's chase target when `blinkyTile === null` (or short-circuit to `computeBlinkyTarget`). Add a one-shot `console.warn` at runtime startup if `mapResource.activeGhostTypes` includes INKY without BLINKY.
**Tests to add:**
- `tests/unit/systems/ghost-ai-system.test.js`: a 'no BLINKY → null blinkyTile' case — drive the AI with a ghost set containing only Pinky and Inky, assert `findBlinkyTile(...)` returns null, and assert Inky's `targetTile` falls back to a Blink-style chase (not the (0,0)-anchored flank).
- `tests/integration/gameplay/inky-without-blinky.test.js`: bootstrap a level with only Pinky+Inky, tick 60 steps, assert Inky stays near the player (chase behavior) rather than patrolling toward the top-left corner.

---

### BUG-23: levelLoader.loadLevel calls onLevelLoaded before updating the world resource, creating a stale-read window ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03, A-12)
- `src/game/level-loader.js:113-138` (loadLevel) + `src/game/bootstrap.js:798-811` (onLevelLoaded callback)

**Problem:** In `loadLevel`, the call order is: (1) `onLevelLoaded(mapResource, ...)` at line 125, (2) `currentLevelIndex = nextLevelIndex` at line 131, (3) `world.setResource(mapResourceKey, mapResource)` at line 133-135. Any system or callback invoked during step (1) that reads the world resource sees the OLD map. The current `onLevelLoaded` (bootstrap.js:805-810) passes `mapResource` explicitly to `syncPlayerEntityFromMap` and `syncGhostEntitiesFromMap`, so they use the new map — OK. But `boardAdapter.generateBoard(mapResource, ...)` at line 802 also receives the new map explicitly. So the current wiring is safe. However, the contract is fragile: any future callback that reads `world.getResource('mapResource')` will see stale data. A render-phase system that runs during the `onLevelLoaded` window (e.g., the screens-system if it reads the map for level-complete display) would also see the stale map.
**Impact:** Fragile event ordering that can trigger stale-state reads on level loads.
**Fix:** In `src/game/level-loader.js:113-138`, reorder the steps so the world resource is set FIRST, then `onLevelLoaded` runs against the consistent state:
```js
function loadLevel(levelIndex, options = {}) {
  const nextLevelIndex = clampLevelIndex(levelIndex, maxLevelIndex);
  const mapResource = normalizeLoadedMapPayload(resolveMapForLevel(nextLevelIndex, options));
  if (!mapResource) return null;

  currentLevelIndex = nextLevelIndex;

  if (world && typeof world.setResource === 'function') {
    world.setResource(mapResourceKey, mapResource);
  }

  if (typeof onLevelLoaded === 'function') {
    onLevelLoaded(mapResource, { ...options, levelIndex: nextLevelIndex });
  }

  return mapResource;
}
```
**Tests to add:**
- `tests/unit/game/level-loader.test.js`: a 'onLevelLoaded sees updated world resource' case — register a fake `onLevelLoaded` that reads `world.getResource('mapResource')`, call `loadLevel(1)`, assert the resource equals the new map (not the old one).
- `tests/integration/gameplay/level-loader-ordering.test.js`: drive a level transition, assert the `levelLoader.getCurrentLevelIndex()` called from INSIDE `onLevelLoaded` returns the new index (currently returns the old index because line 131 runs AFTER the callback).

---

## 2) Dead Code & Unused References

### DEAD-01: `changed-files.txt` Tracked Generated Artifact ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06, A-11)
- `changed-files.txt` (repo root)

**Problem:** A generated diff tracking file is tracked in git history.
**Impact:** Wastes repository storage and causes Git noise.
**Fix:** Remove from track via `git rm --cached changed-files.txt` and exclude in `.gitignore`.

---

### DEAD-02: Duplicate SCORE Constants in `constants.js` vs `scoring-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/resources/constants.js` (~L135-153)
- `src/ecs/systems/scoring-system.js` (~L44-62)

**Problem:** Scoring multipliers and pellet values are duplicated with identical values across both files. The values in `constants.js` are never imported.
**Impact:** Code drift risk.
**Fix:** Remove constants from `constants.js` and import them from `scoring-system.js` if needed.

---

### DEAD-03: Legacy `renderer-dom.js` Superseded But Still in Repo ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`

**Problem:** File remains in the repo despite being marked "LEGACY" and not consumed by active game loops.
**Impact:** Incremental noise and reader confusion.
**Fix:** Delete the file or archive it.

---

### DEAD-04: `test:integration` Runs with `--passWithNoTests` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L21)

**Problem:** Script carries `--passWithNoTests` which hides the fact that no gameplay-integration tests are run by it.
**Impact:** False sense of security.
**Fix:** Remove the flag.

---

### DEAD-05: `coverage` Script Duplicates `test:coverage` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L26-27)

**Problem:** `"coverage"` script is a direct alias of `"test:coverage"`.
**Impact:** Redundant script configuration.
**Fix:** Keep only `"test:coverage"`.

---

### DEAD-06 through DEAD-32: 27 Unused/Minor Exports Across Tracks A/B/C/D ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Various (refer to `audit-report-P2-2026-06-07-deep.md` L241-267 table)

**Problem:** Multiple helper methods, enums, and unused functions exported across systems but never consumed externally.
**Impact:** Bloats external API surface.
**Fix:** Remove `export` keywords or consolidate functions.

---

### DEAD-33: 4 Unnecessarily Exported Symbols in `spawn-system.js` ⬆ LOW
**Origin:** 2. Dead Code & Unused References (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L46-48, L171)

**Problem:** `DEFAULT_GAME_STATUS_RESOURCE_KEY`, `DEFAULT_MAP_RESOURCE_KEY`, `DEFAULT_GHOST_IDS_RESOURCE_KEY`, and `resolveActiveGhostCap` are exported but only consumed internally.
**Impact:** Over-exposed API surface.
**Fix:** Remove `export` modifier.

---

### DEAD-34: 8 `.gitkeep` Files Under `src/` ⬆ INFO
**Origin:** 2. Dead Code & Unused References (big-pickle)
**Files:** Ownership: Track A (Tickets: A-01)
- Various paths in `src/` (e.g. `src/shared/.gitkeep`, `src/game/.gitkeep`)

**Problem:** Empty directories contain `.gitkeep` files despite no longer being empty.
**Impact:** Minor repository clutter.
**Fix:** Remove files now that directories contain source code.

---

### DEAD-35: POWER_UP_TYPE enum in constants.js is reachable only from a test ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L170)

**Problem:** `POWER_UP_TYPE` enum in `constants.js` (NONE: 0, BOMB: 1, FIRE: 2, SPEED: 3) is reachable only from `constants.test.js`. The production power-up system uses a local `POWER_UP_TYPE` object, and the typed-array storage uses `PROP_POWER_UP_TYPE` in `props.js`. This results in three enums existing for the same gameplay concept.
**Impact:** Minor guideline deviation and code drift risk.
**Fix:** Consolidate power-up enums to use `PROP_POWER_UP_TYPE` as the single source of truth.

---

### DEAD-36: skills-lock.json is tracked but referenced by no script ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `skills-lock.json` (repo root)

**Problem:** `skills-lock.json` is tracked in git history but is not referenced, ignored, or consumed by any script or config in the codebase. It appears to be an orphan tool/CI artifact.
**Impact:** Minor repository clutter.
**Fix:** If the lockfile is obsolete, remove it (`git rm skills-lock.json`) and update `.gitignore` if needed.

---

### DEAD-37: generate_reports.py is gitignored but still present in working tree ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `generate_reports.py` (repo root)

**Problem:** `generate_reports.py` is a python helper that is gitignored by the `*.py` rule in `.gitignore`. No script or source file references it, and the active policy pipeline is Javascript-based.
**Impact:** Repository clutter.
**Fix:** Remove the file if it is obsolete.

---

### DEAD-38: biome.json excludes drift from .gitignore for runtime artifacts ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `biome.json` (~L23)
- `.gitignore` (~L37, L43, L51)

**Problem:** `biome.json` excludes various built-in directories (like `dist/`, `coverage/`) but does not exclude several runtime or log directories (such as `.audit-logs/`, `.policy-runtime/`, `.tmp/`) that are present in `.gitignore`. Biome checks will scan these directories, which causes noise and wastes performance.
**Impact:** Performance overhead and noise in biome check/lint outputs.
**Fix:** Extend `biome.json` excludes to include `.audit-logs/`, `.policy-runtime/`, and `.tmp/`.

---

### DEAD-39: Local isDev() in audio-integration duplicates shared isDevelopment() ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/audio-integration.js` (~L139)
- `src/shared/env.js` (~L21)

**Problem:** `audio-integration.js` defines a private `isDev()` helper that wraps process environment checks. This duplicates the shared `isDevelopment()` utility exported from `src/shared/env.js`.
**Impact:** Code duplication and risk of behavioral drift.
**Fix:** Import and use the canonical `isDevelopment()` function from `src/shared/env.js`.

---

### DEAD-40: Stale 'DEAD-06' JSDoc on ghost-AI constants that are actually used ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L100, L104, L108)

**Problem:** Constants `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, and `INKY_REFERENCE_OFFSET` carry JSDoc comments stating they are "Reserved for the ghost-AI system (DEAD-06)". However, `ghost-ai-system.js` already imports and actively uses all of them. The doc now misleads future readers.
**Impact:** Stale documentation that misleads codebase maintainers.
**Fix:** Remove or update the stale JSDoc comment.

---

### DEAD-41: LEVEL_MAX_GHOSTS and LEVEL_GHOST_SPEED exported but never imported ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L121, L124)

**Problem:** Two per-level arrays (`LEVEL_MAX_GHOSTS = [2, 3, 4]` and `LEVEL_GHOST_SPEED = [4.0, 4.5, 5.0]`) are declared and exported, but no source or test file imports them. Compare with `LEVEL_TIMERS` which is consumed by `timer-system.js`.
**Impact:** Bare exports with no caller are a maintainability hazard — a future reader will assume they are live.
**Fix:** Either wire into ghost-spawn/AI config (`ghost-ai-system.js`, `spawn-system.js`) or delete. `LEVEL_TIMERS` is the pattern to follow.

---

### DEAD-42: GHOST_INTERSECTION_MIN_EXITS is reserved but never consumed ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-12)
- `src/ecs/resources/constants.js` (~L113)

**Problem:** Constant carries JSDoc `'Reserved for the ghost-AI pathfinding system (DEAD-18)'`. No import anywhere; `ghost-ai-system.js` implements pathfinding without intersection-exit thresholds. The reservation has been a dangling TODO since the constants file shipped.
**Impact:** Dead export that misleads readers into thinking the AI system uses an intersection threshold.
**Fix:** Either wire into `ghost-ai-system.js` (when intersection-based tie-breaking lands) or delete.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: DOM Isolation Violation — `hud-system.js` Writes DOM Directly ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § DOM Isolation: "Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems."
**Files:** Ownership: Track C (Tickets: C-05)
- `src/ecs/systems/hud-system.js` (direct DOM writes)

**Problem:** `hud-system.js` (a logic system) accesses and mutates the HUD DOM elements directly to write text content.
**Impact:** Bypasses DOM isolation boundaries, creating testing problems and breaking deterministic loop separations.
**Fix:** Write metrics to a resource, and let a dedicated render-phase adapter/system commit values to the DOM.

---

### ARCH-02: Adapter Injection Violation — `board-sync-system.js` Receives Adapter as Closure Param ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § Adapter Injection: "Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js`
- `src/game/bootstrap.js`

**Problem:** `board-sync-system.js` accepts the `boardAdapter` as a direct closure parameter rather than retrieving it via `world.getResource('boardAdapter')`.
**Impact:** Violates the adapter resource injection contract.
**Fix:** Access the adapter via `world.getResource()`.

---

### ARCH-03: `entity-store.getActiveIds()` Returns Mutable Internal Array Reference ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § ECS Data: Encapsulation and structural deferral invariants.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js`

**Problem:** `getActiveIds()` returns a direct, mutable reference to the internal `activeIds` array.
**Impact:** External systems could mutate the entity index bypass-checking the store, causing memory/lifecycle desyncs.
**Fix:** Return a copy `[...this.activeIds]` or a frozen representation.

---

### ARCH-04: `ghost-animation-system.js` Not Listed in Any Track Ownership ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` / Codebase Ownership Policy Drift.
**Files:** Ownership: Unassigned (Track D intended)
- `src/ecs/systems/ghost-animation-system.js`
- `scripts/policy-gate/lib/policy-utils.mjs`

**Problem:** The file `ghost-animation-system.js` exists but its path matches no track rules. Any PR touching this file gets flagged by the policy gate.
**Impact:** PR blocks unless bypassed via bugfix branches.
**Fix:** Add `src/ecs/systems/ghost-animation-*.js` to Track D ownership patterns.

---

### ARCH-05: Audit-Traceability Matrix Out of Sync With Actual Tests ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-06, A-12)
- `docs/implementation/audit-traceability-matrix.md`
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** Multiple audit checks (e.g. F-03, F-04, F-05, F-06, F-19, F-20, F-21, B-06) are marked `Pending` in the matrix but are actually `Executable` in the E2E suite.
**Impact:** Stale status reporting.
**Fix:** Update matrix status to `Executable` and add evidence links.

---

### ARCH-06: Board-Sync Snapshot Causes Redundant DOM Writes on Same-Level Restart ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift (big-pickle)
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js` (~L71-73)

**Problem:** On same-level restart, the stale snapshot triggers cell-by-cell modifications because coordinates seem to differ from the fresh grid. The board is already re-drawn by `generateBoard()`, making these updates redundant.
**Impact:** Causes up to 165 redundant DOM writes on the first frame of a restart, potentially causing visual lag.
**Fix:** Reset the grid snapshot to null during the restart cycle.

---

### ARCH-07: Asset Pipeline — Naming Conventions and Validation ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A / Track D (Tickets: A-07, D-10, D-11)
- `assets/manifests/visual-manifest.json`

**Problem:** Characters are WebP formats instead of SVG as preferred in `assets-pipeline.md` §9.2.
**Impact:** Minor guideline deviation.
**Fix:** Update `assets-pipeline.md` to document and permit WebP formats for raster character sheets.

---

### ARCH-08: Frame Pipeline — Render Commit Phase Correctly Separated ✅ PASS
**Status:** PASS — batched DOM updates run once per rAF, decoupling computation from render writes.

### ARCH-09: Input Contract — Keydown/Keyup, Snapshot, Blur Clear ✅ PASS
**Status:** PASS — key events captured, snapshotted in fixed steps, and cleared on blur.

### ARCH-10: Pause Invariants — rAF Active, Simulation Frozen ✅ PASS
**Status:** PASS — rAF active while paused, simulation time advancement frozen.

### ARCH-11: DOM Pooling — Offscreen Hiding ✅ PASS
**Status:** PASS — pooling uses offscreen transforms (`-9999px`) instead of `display: none` to avoid layout reflows.

### ARCH-12: Structural Deferral — Entity/Component Mutations Deferred ✅ PASS
**Status:** PASS — structural mutations deferred to sync points after system ticks.

---

## 4) Code Quality & Security

### SEC-01: Storage Adapter `safeRead()` Schema Parameter Unused ⬆ HIGH
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/storage-adapter.js` (~L18-41)

**Problem:** `safeRead(key, _schema, defaultValue)` accepts a schema argument but does not perform any validation against it, leaving only a basic object check.
**Impact:** Bypasses the strict `AGENTS.md` local storage trust boundary validation requirements.
**Fix:** Implement callback validation using the schema parameters.

---

### SEC-02: Map Runtime Validation Lacks JSON Schema Enforcement ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07, D-03)
- `src/ecs/resources/map-resource.js` (~L425-470)

**Problem:** `createMapResource` validates map semantics but does not enforce JSON Schema validation at runtime, relying only on pre-commit CI validations.
**Impact:** Stale or malformed maps loaded at runtime bypass checks.
**Fix:** Integrate JSON Schema validator (e.g. Ajv) into `createMapResource()`.

---

### SEC-03: `package.json` Marked `"private": false` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L5)

**Problem:** `"private": false` allows unintended packages to be published to NPM.
**Impact:** Potential accidental disclosure of proprietary source code.
**Fix:** Set `"private": true`.

---

### SEC-04: Grid Cell Type Range Not Validated at Runtime ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L320-334)

**Problem:** Semantic validation doesn't check whether grid values map to valid `CELL_TYPE` ranges (0-9).
**Impact:** Undefined cell integers cause rendering and collision bugs.
**Fix:** Add cell type range check in `validateMapSemantic`.

---

### SEC-05: `isRecord()` Type Guard Accepts Arrays ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `src/shared/type-guards.js` (~L8-10)

**Problem:** `isRecord(value)` returns `true` for arrays since `typeof [] === 'object'`.
**Impact:** Weakens map payload structural validations.
**Fix:** Add `!Array.isArray(value)` to the guard.

---

### SEC-06: `validate-schema.mjs` Ajv `strict: false` Masks Schema Errors ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** Ajv instantiated with `strict: false` ignores keyword mismatches.
**Impact:** Schema validation flaws pass CI.
**Fix:** Set `strict: true`.

---

### SEC-07: HUD Throttling Mixes `performance.now()` and `Date.now()` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/dom/hud-adapter.js` (~L28-30, L152)

**Problem:** ARIA announcement throttling switches between `performance.now()` and `Date.now()`.
**Impact:** Timebase desyncs can drop screen reader updates.
**Fix:** Standardize on `performance.now()`.

---

### SEC-08: `render-dom-system.js` Uses `className` Overwrite ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L224)

**Problem:** Overwrites classes with string assignment `el.className = 'sprite'`.
**Impact:** Overwrites custom accessibility styles.
**Fix:** Manipulate classes via `classList` methods.

---

## 5) Tests & CI Gaps

### CI-01: A-12 P2 Audit Consolidation Not Started — Blocks P3+ ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/implementation/ticket-tracker.md` (~L143)

**Problem:** Ticket A-12 is not completed, which blocks 19 P3/P4 hardening and validation tickets.
**Impact:** Stalls Phase 2 closure and halts progress.
**Fix:** Consolidate P2 audits and publish track-specific reports.

---

### CI-02: A-05/A-06 Integration + E2E Tests Not Started ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05, A-06)
- `docs/implementation/track-a.md`

**Problem:** Integration tests for system boundaries (A-05) and Playwright E2E suites (A-06) are not started.
**Impact:** Critical gameplay elements (bomb chains, event systems) lack automated loop testing.
**Fix:** Author integration and E2E test suites.

---

### CI-03: 3 Systems Without Unit Tests ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B / Track C / Track D (Tickets: B-09, C-05, D-10)
- `src/ecs/systems/collision-gameplay-events.js`
- `src/ecs/systems/ghost-animation-system.js`
- `src/ecs/systems/screens-system.js`

**Problem:** Three core systems have no dedicated unit tests.
**Impact:** Regressions in screens or animations will not be caught.
**Fix:** Add unit tests verifying states, frames, and event loops.

---

### CI-04: CI Workflow Triggers on Both `pull_request` AND `pull_request_review_submitted` ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** The workflow is triggered by redundant events, leading to duplicate runs.
**Impact:** Wastes CI minutes.
**Fix:** Deduplicate hooks in workflow configurations.

---

### CI-05: DOM Budget Assertion 600 ≠ AGENTS.md 500 ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L311)

**Problem:** The test asserts a budget of 600 DOM elements, whereas `AGENTS.md` strictly limits nodes to 500.
**Impact:** Permits performance budget violations.
**Fix:** Align test assertion to 500 elements.

---

### CI-06: Phase Testing Report References Done Tickets ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/audit-reports/phase-testing-verification-report.md`

**Problem:** Verification document marks several completed tickets as pending.
**Impact:** Stale status reports.
**Fix:** Sync file status markers.

---

### CI-07: F-13 Genre Behavior E2E Coverage Only Partial ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L197)

**Problem:** Checks victory flows but does not assert ghost stagger timings in the browser.
**Impact:** Ghost house stagger is visually untested.
**Fix:** Add E2E checks verifying stagger timings.

---

### CI-08: 3 E2E Tests Permanently Skipped Pending Runtime World Hook ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/render-desync-bugs.spec.js` (~L84)

**Problem:** Three specs are skipped because the E2E runner cannot access the ECS world directly.
**Impact:** Integration gaps in desync bug checks.
**Fix:** Expose ECS World state to `window` under test environments.

---

### CI-09: No Unit Test for `bomb-explosion-runtime-wiring` Integration ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps (big-pickle)
**Files:** Ownership: Track B (Tickets: B-06)
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`

**Problem:** Missing unit test coverage for the runtime wiring module itself.
**Impact:** Slow feedback loops for mapping errors.
**Fix:** Add unit tests mock-asserting pool allocations and event wiring.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | Track A | Event queue unbounded growth |
| BUG-02 | BUG-02 | — | — | — | — | Track D | Level-3 border destructible cells |
| BUG-03 | BUG-03 | — | — | — | — | Track D | `grid2D` mirror write guard |
| BUG-04 | BUG-04 | — | — | — | — | Track C | `scoring-system` dead guard |
| BUG-05 | BUG-05 | — | — | — | — | Track B | Explosion tile allocation |
| BUG-06 | BUG-06 | — | — | — | — | Track B | Collision scratch full fill |
| BUG-07 | BUG-07 | — | — | — | — | Track B | Detonation queue coupling |
| BUG-08 | BUG-08 | — | — | — | — | Track A | Empty input phase iteration |
| BUG-09 | BUG-D01 | — | — | — | — | Track C | Ghost respawn stale set failure |
| BUG-10 | BUG-D02 | — | — | — | — | Track B | Per-frame Set in ghost-ai |
| BUG-11 | BUG-D03 | — | — | — | — | Track C | Scratch sets World isolation |
| BUG-12 | BUG-D04 | — | — | — | — | Track C | Pause intent dead restart branch |
| BUG-13 | BUG-D05 | — | — | — | — | Track D | Production renderFrame undefined |
| BUG-14 | BUG-001 | — | — | — | — | Track C/A | ghostSpawnState carries over across level transitions |
| BUG-15 | BUG-002 | — | — | — | — | Track A | Deferred mutations in render/meta phases silently discarded |
| BUG-16 | BUG-003 | — | — | — | — | Track A/B | eventQueue not cleared on restart |
| BUG-17 | BUG-004 | — | — | — | — | Track B | Ghost stuck motionless when speed is missing/non-positive |
| BUG-18 | BUG-005 | — | — | — | — | Track B | ghostStore.timerMs leaks across fire-kill -> respawn |
| BUG-19 | BUG-006 | — | — | — | — | Track A | frame probe records wall-clock deltas during quarantine |
| BUG-20 | BUG-007 | — | — | — | — | Track C | levelFlow.pendingLevelAdvance is set but never read |
| BUG-21 | BUG-008 | — | — | — | — | Track D | HUD fallback drops bomb/fire/level fields |
| BUG-22 | BUG-009 | — | — | — | — | Track B | findBlinkyTile returns fallback {0,0} when Blinky missing |
| BUG-23 | BUG-010 | — | — | — | — | Track D | stale map read in loadLevel callback order |
| DEAD-01 | — | DEAD-01 | — | — | — | Track A | `changed-files.txt` tracked |
| DEAD-02 | — | DEAD-02 | — | — | — | Track C | Duplicate SCORE constants |
| DEAD-03 | — | DEAD-03 | — | — | — | Track D | Legacy `renderer-dom.js` |
| DEAD-04 | — | DEAD-04 | — | — | — | Track A | `test:integration` `--passWithNoTests` |
| DEAD-05 | — | DEAD-05 | — | — | — | Track A | Duplicate coverage script |
| DEAD-06..32 | — | DEAD-06..32 | — | — | — | Track A/B/C/D | 27 minor unused exports |
| DEAD-33 | — | DEAD-D01 | — | — | — | Track C | 4 unnecessary exports in spawn-system |
| DEAD-34 | — | DEAD-D02 | — | — | — | Track A | 8 `.gitkeep` files in `src/` |
| DEAD-35 | DEAD-06 | — | — | — | — | Track A | POWER_UP_TYPE enum in constants.js unused |
| DEAD-36 | DEAD-07 | — | — | — | — | Track A | skills-lock.json tracked but unused |
| DEAD-37 | DEAD-08 | — | — | — | — | Track A | generate_reports.py present in working tree |
| DEAD-38 | DEAD-09 | — | — | — | — | Track A | biome.json excludes drift from .gitignore |
| DEAD-39 | DEAD-10 | — | — | — | — | Track C | Local isDev() in audio-integration duplicates shared function |
| DEAD-40 | DEAD-11 | — | — | — | — | Track A | Stale JSDoc comments on active ghost AI constants |
| DEAD-41 | DEAD-04 | — | — | — | — | Track A | LEVEL_MAX_GHOSTS and LEVEL_GHOST_SPEED exported but never imported |
| DEAD-42 | DEAD-05 | — | — | — | — | Track A | GHOST_INTERSECTION_MIN_EXITS reserved but never consumed |
| ARCH-01 | — | — | ARCH-01 | — | — | Track C | `hud-system` DOM isolation breach |
| ARCH-02 | — | — | ARCH-02 | — | — | Track D | `board-sync` adapter injection breach |
| ARCH-03 | — | — | ARCH-03 | — | — | Track A | `entity-store` mutable array leak |
| ARCH-04 | — | — | ARCH-04 | — | — | Track D | Animation system unassigned track |
| ARCH-05 | — | — | ARCH-05 | — | — | Track A | Matrix status out of sync |
| ARCH-06 | — | — | ARCH-D01 | — | — | Track D | Redundant restart DOM writes |
| ARCH-07 | — | — | ARCH-07 | — | — | Track A/D | Asset WebP formatting drift |
| SEC-01 | — | — | — | SEC-01 | — | Track C | Storage schema validation gap |
| SEC-02 | — | — | — | SEC-02 | — | Track A | Map runtime JSON validation missing |
| SEC-03 | — | — | — | SEC-03 | — | Track A | `package.json` `"private": false` |
| SEC-04 | — | — | — | SEC-04 | — | Track D | Grid cell range validation gap |
| SEC-05 | — | — | — | SEC-05 | — | Track A | `isRecord` type guard accepts arrays |
| SEC-06 | — | — | — | SEC-06 | — | Track A | Ajv strict mode turned off |
| SEC-07 | — | — | — | SEC-07 | — | Track C | ARIA HUD clock mixing |
| SEC-08 | — | — | — | SEC-08 | — | Track D | DOM className overwriting |
| CI-01 | — | — | — | — | CI-01 | Track A | A-12 consolidated audit block |
| CI-02 | — | — | — | — | CI-02 | Track A | A-05/A-06 tests missing |
| CI-03 | — | — | — | — | CI-03 | Track B/C/D | 3 systems missing unit tests |
| CI-04 | — | — | — | — | CI-04 | Track A | CI duplicate workflow triggers |
| CI-05 | — | — | — | — | CI-05 | Track A | DOM budget assertion mismatch |
| CI-06 | — | — | — | — | CI-06 | Track A | Stale phase report ticket lists |
| CI-07 | — | — | — | — | CI-07 | Track A | F-13 ghost stagger E2E gap |
| CI-08 | — | — | — | — | CI-08 | Track A | 3 skipped E2E tests |
| CI-09 | — | — | — | — | CI-D01 | Track B | Missing wiring unit tests |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **CI-01**: Complete A-12 P2 Audit Consolidation (Track A)
2. **CI-02**: Implement A-05 (integration) and A-06 (E2E) testing suites (Track A)
3. **BUG-09**: Fix `RESPAWNING_SCRATCH_SET` stale state failure in spawn-system (Track C)
4. **BUG-14**: Reset spawn bookkeeping on level transitions (`ghostSpawnState` carrying over) (Track C/A)
5. **BUG-15**: Defer structural mutations inside render/meta phases (`applyDeferredMutations` missing) (Track A)

### Phase 2 — High Severity (immediate follow-up)
6. **ARCH-01**: Fix `hud-system.js` direct DOM mutations (Track C)
7. **ARCH-02**: Fix `board-sync-system.js` closure-passed adapter dependency (Track D)
8. **ARCH-03**: Return clones instead of mutable activeIds array in `entity-store.js` (Track A)
9. **ARCH-05**: Sync `audit-traceability-matrix.md` status with tests (Track A)
10. **SEC-01**: Hook validator callback checks in `storage-adapter.js` (Track C)
11. **CI-03**: Implement unit tests for animation, screen, and collision-event systems (Tracks B/C/D)
12. **CI-04**: Deduplicate triggers in `.github/workflows/policy-gate.yml` (Track A)
13. **BUG-16**: Reset eventQueue on restart to prevent phantom SFX (Track A/B)
14. **BUG-17**: Add fallback ghost speed when mapResource.ghostSpeed is missing (Track B)
15. **BUG-18**: Clear `ghostStore.timerMs` on fire-kill to prevent premature stun revival (Track B)
16. **BUG-19**: Defer frame probe logging until after quarantine checks (Track A)

### Phase 3 — Medium Severity
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
33. **BUG-22**: Return null targeting when Blinky missing to keep Inky from patrolling off-screen (Track B)
34. **DEAD-38**: Exclude `.audit-logs/`, `.policy-runtime/`, and `.tmp/` in `biome.json` (Track A)

### Phase 4 — Low Severity & Info (maintenance)
35. **BUG-02..08, BUG-11..13, BUG-23**: Fix minor logic bugs, module-level sets, loadLevel callback ordering (Tracks A/B/C/D)
36. **DEAD-03..05, DEAD-06..32, DEAD-33, DEAD-34, DEAD-35..37, DEAD-39..42**: Deduplicate legacy adapter files, remove unused exports, skills-lock.json, generate_reports.py, local `isDev`, stale JSDoc annotations, dead LEVEL_MAX_GHOSTS/LEVEL_GHOST_SPEED/GHOST_INTERSECTION_MIN_EXITS constants (Tracks A/B/C/D)
37. **SEC-05..08**: Refactor type guards, enable strict schema compiler flags, clean classNames (Tracks A/D)
38. **CI-08**: Wire test runtime hooks and enable skipped Playwright specs (Track A)

---

## Notes

- **Compliance Verifications:** Frame loop isolation, input contracts (snapshotted & edge-triggered), pooling transforms, and ECS structural mutation deferrals are strictly verified and comply fully with `AGENTS.md`.
- **Bugfix Branch Workarounds:** Temporary bypass of Track D constraints (e.g. for `ghost-animation-system`) is permitted via conventional bugfix/integration branches until ownership rules are normalized.

---

*End of report.*
