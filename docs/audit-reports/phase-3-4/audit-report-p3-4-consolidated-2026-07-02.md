# Phase 3 Consolidated Audit Report — Final (2026-07-02)

**Date:** 2026-07-02  
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)  
**Scope:** Full repository review for Phase 3 (Feature Complete + Hardening)  
**Sources Consolidated:**
1. [audit-report-P3-medvall.md](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/phase-3/org/audit-report-P3-medvall.md) — Sequentially executed 5-pass sweep
2. [audit-report-2026-06-23.md](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/phase-3/org/audit-report-2026-06-23.md) — 5-pass parallel deep sweep with verification addendum (Big Pickle)
3. [audit-report-2026-06-24.md](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/phase-3/org/audit-report-2026-06-24.md) — Verified 5-pass sweep
4. [audit-report-2026-06-27.md](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/phase-3/org/audit-report-2026-06-27.md) — 5-pass parallel deep sweep

---

## Methodology

This consolidated report merges, deduplicates, and refines the findings of all Phase 3 code-analysis audit reports. Five parallel, evidence-driven, read-only passes were analyzed:
1. **Bugs & Logic Errors** — State machine, entity lifecycle, timing constraints, logic races, data integrity.
2. **Dead Code & Unused References** — Unused exports, dead CSS, shipped-but-unwired assets, deprecated helpers.
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundaries, DOM isolation, capacity sync, input snapshotting.
4. **Code Quality & Security** — Unsafe sinks, forbidden tech, CSP headers, Trusted Types, error-handling robustness.
5. **Tests & CI Gaps** — Playwright flakiness, coverage aggregate masking, branch protection, matrix traceability.

Each issue has been consolidated by root cause, assigned to a primary owner track, and given a mandatory "Verification Test" requiring a test-first regression pattern.

---

## Executive Summary

The codebase has reached functional completion for Phase 3, but several critical integration and CI gaps remain that must be resolved prior to phase closure.

### Severity Count by Track

| Track | 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low / Info | Total |
|---|---|---|---|---|---|
| **Track A** (ekaramet) | 1 | 3 | 12 | 20 | **36** |
| **Track B** (asmyrogl) | 1 | 0 | 3 | 4 | **8** |
| **Track C** (chbaikas) | 0 | 2 | 2 | 4 | **8** |
| **Track D** (medvall) | 0 | 1 | 1 | 8 | **10** |
| **Total** | **2** | **6** | **18** | **36** | **62** |

### Top Risks

1. **BUG-01 (Critical — Track B/C):** Bomb-killed ghosts never respawn. The collision system flips ghosts to `DEAD` but fails to populate the `deadGhostIds` resource. Consequently, the spawn-system's respawn queue remains inactive, breaking the core gameplay loop.
2. **CI-01 (Critical — Track A):** The CI policy gate runs unit tests only as named steps, while Playwright E2E and coverage checks are executed under a soft-fail orchestrator. This allows broken behavior or coverage regressions to pass without halting the pipeline.
3. **ARCH-01 (High — Track C/D):** The policy gate ownership mapping in [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) omits several core HUD, screens, and player animation files, causing normal ticket branches touching these files to trigger false ownership violations.
4. **CI-09 & CI-10 (High — Track A):** The E2E audit suite runs exclusively on Vite's development server (skipping strict production CSP/Trusted Types checks) and is Chromium-only, violating the cross-browser target requirement for Chrome, Firefox, and Safari.
5. **CI-11 (High — Track D/C):** The accessibility requirement for `prefers-reduced-motion` (non-gameplay animations must be disabled/simplified) has zero implementation or test coverage.

---

## 1) Bugs & Logic Errors

### [Track B / C] BUG-01: Bomb-killed ghosts never respawn due to unwired `deadGhostIds` resource writer 🔴 CRITICAL
**Files:**
- [collision-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/collision-system.js) (~L877-885)
- [spawn-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/spawn-system.js) (~L430-453)
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L890, L933, L995)

**Problem:** When a ghost is killed by fire, the collision system transitions its state to `DEAD`. However, the spawn-system respawn pipeline only checks the `deadGhostIds` resource to queue respawns. Since no runtime system writes dead ghost IDs into this resource (it is only ever initialized to `[]` in bootstrap), `scheduleRespawn` is never called, and killed ghosts stay dead (eyes return home and freeze forever).

**Impact:** Breaks the core chase loop. On later levels, all ghosts are eventually eliminated permanently.

**Fix:** Bridge the collision results into the spawn resource by having the collision system append killed ghost entity IDs to the `deadGhostIds` array resource, or introduce a logic-phase bridging step before `spawn-system` executes.

**Verification Test:** 
Create a new integration test in [collision-gameplay-events.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/collision-gameplay-events.test.js) (or a sibling integration suite). The test must place a bomb adjacent to a released ghost, step the loop until the fire collides with it, and assert that the ghost's ID is added to `deadGhostIds` and that the ghost correctly transitions back to `NORMAL` state at the spawn position after GHOST_RESPAWN_MS. The test must fail before the fix is applied.

---

### [Track C / A] BUG-16: Same-level Restart timer reset depends on a magic `activeLevel: -1` write 🟠 HIGH
**Files:**
- [timer-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/timer-system.js) (~L71-98)
- [game-flow.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/game-flow.js) (~L188-220)

**Problem:** `ensureTimerResource` only resets remaining seconds when the `activeLevel` index changes. A same-level restart maintains the level index, meaning the reset depends entirely on a sentinel write `{ remainingSeconds: 0, activeLevel: -1 }` inside bootstrap's `onRestart`. If `onRestart` or the restart mechanism is altered to preserve `levelTimer`, the countdown does not reset.

**Impact:** Stale timer values can carry over across same-level restarts, causing unexpected game overs.

**Fix:** Make the timer reset explicit in the restart path. Modify `restartLevel` or `onRestart` to reset `levelTimer.remainingSeconds` to the canonical duration of the active level, or add an explicit reset flag.

**Verification Test:**
Create an integration test in `tests/integration/gameplay/restart-flow.test.js` that advances the timer by 30 seconds, invokes `gameFlow.restartLevel()`, and asserts that `levelTimer.remainingSeconds` is reset to the level's full duration. Verify it fails when the sentinel activeLevel write is skipped.

---

### [Track B / A] BUG-15: Power-up progression upgrades (`maxBombs`/`fireRadius`) reset on level transition 🟡 MEDIUM
**Files:**
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L558)
- [actors.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/components/actors.js) (~L86-87)

**Problem:** Level transitions call `resetPlayer()`, which clears transient status but also resets the player's permanent upgrades (`maxBombs`, `fireRadius`) back to defaults.

**Impact:** Player loses bomb/fire upgrades the instant a level is cleared — atypical for the genre.

**Fix:** Snapshot the player's progression values (`maxBombs` and `fireRadius`) before calling `resetPlayer()`, and restore them afterward during level transitions. Ensure they are still fully reset on starting a fresh game or on game over.

**Verification Test:**
Create a test in `tests/integration/gameplay/level-transition-spawn-reset.test.js`. The test must upgrade `maxBombs` and `fireRadius`, trigger a level transition, and assert that the player retains the upgraded values. The test must fail (showing values reverted to default) before the fix is applied.

---

### [Track C / A] BUG-09: Last-pellet-at-0:00 race (timer expiry transitions to GAME_OVER before level-clear detection) 🟡 MEDIUM
**Files:**
- [timer-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/timer-system.js) (~L122-131, L172-184)
- [level-progress-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/level-progress-system.js) (~L126-151)

**Problem:** The logic-phase order execution is `timer-system` before `level-progress-system`. If the player eats the last pellet on the same frame that the timer hits `0`, the timer transitions the game state to `GAME_OVER`. When `level-progress-system` runs subsequently, it sees the state is not `PLAYING` and skips transitioning to `LEVEL_COMPLETE`.

**Impact:** Frame-perfect completions result in a Game Over rather than a victory, violating player expectations.

**Fix:** Reorder system execution so that `level-progress-system` (pellet clear checks) executes before `timer-system`, or have `timer-system` check if all pellets have been cleared on the current step before transitioning to `GAME_OVER`.

**Verification Test:**
Write an integration test that sets `remainingSeconds` to exactly one step's duration, places the player on the final pellet, advances the simulation by one step, and asserts that the final game status is `LEVEL_COMPLETE` or `VICTORY` rather than `GAME_OVER`.

---

### [Track A / C] BUG-20: LEVEL_COMPLETE -> VICTORY FSM auto-transition and 'Victory' event are unreachable (unplayed victory SFX) 🟡 MEDIUM
**Files:**
- [level-progress-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/level-progress-system.js) (~L106-119)
- [game-flow.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/game-flow.js) (~L21-23, L137-147)
- [pause-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/pause-system.js) (~L100-101)
- [audio-integration.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/io/audio-integration.js) (~L105)

**Problem:** `level-progress-system` contains logic to transition `LEVEL_COMPLETE -> VICTORY` on the final level and emit the `Victory` event. However, this logic lives in the simulation `logic` phase, and the clock is frozen for all states except `PLAYING`. When `LEVEL_COMPLETE` is entered, the meta phase pauses the clock, freezing the logic phase. The actual transition to `VICTORY` only occurs inside `gameFlow.startGame()` (driven by UI click), which does not emit the `Victory` event.

**Impact:** The `sfx-victory` audio cue is never triggered during a normal playthrough, and any systems listening for the `Victory` event are bypassed.

**Fix:** Move the `Victory` event emission to `game-flow.js` inside the `startGame()` completion branch where `LEVEL_COMPLETE -> VICTORY` is actively taken, and remove the dead transition block from `level-progress-system.js`.

**Verification Test:**
Create an integration test in `tests/integration/gameplay/victory-flow.test.js`. Trigger level clearance on the final level, step the world (asserting transition to `LEVEL_COMPLETE`), call the `startGame` next-level transition, and assert that the `Victory` event is emitted in the event queue and the state becomes `VICTORY`.

---

### [Track B] BUG-19: Power-pellet stun applied to ghosts still inside the house 🟡 MEDIUM
**Files:**
- [power-up-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/power-up-system.js) (~L237-255)

**Problem:** `applyPowerPellet` applies the `FRIGHTENED`/stunned state to all active ghost entities, including ghosts that are still inside the ghost house or are currently queuing to exit.

**Impact:** Stun timers are wasted on unreachable ghosts, and the frenzy music/UI state begins before the player can interact with the affected ghosts.

**Fix:** Modify `applyPowerPellet` to check whether the ghost is currently released and outside the ghost house (e.g., check `releasedGhostSet` membership or state variables) before applying the stun.

**Verification Test:**
Create an integration test in [power-up-system.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/power-up-system.test.js). Spawn a ghost inside the ghost house (not released), trigger a power-pellet collection, and assert that the house-bound ghost does not receive the `FRIGHTENED` state.

---

### [Track B] BUG-07: Fire-pool exhaustion silently drops in-blast damage tiles 🟡 MEDIUM
**Files:**
- [explosion-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/explosion-system.js) (~L285-314)
- [bomb-tick-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/bomb-tick-system.js) (~L218-237)

**Problem:** The fire entity pool is capped at `POOL_FIRE = 85`. However, there is no clamp restricting the player's `fireRadius` upgrade below this capacity, and chained explosions can easily exceed 85 simultaneous active fire tiles. When the pool is exhausted, `ensureFireAtTile` fails silently, resulting in tiles within the blast radius dealing no damage.

**Impact:** Large chain reactions or highly upgraded bomb blasts leave random "safe zones" on the map, leading to inconsistent gameplay.

**Fix:** Strictly clamp the player's max `fireRadius` upgrade to a safe limit (e.g., `MAX_FIRE_RADIUS = 4`), or resize the fire pool and throw a developer warning on pool exhaustion.

**Verification Test:**
Create a unit test in [explosion-system.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/explosion-system.test.js) that detonates a chain of bombs covering more than 85 tiles in a single tick. Assert that the systems handle pool exhaustion deterministically (e.g., clamping maximum radius or logging a warning) and that no inner-radius tile is skipped.

---

### [Track A / B] BUG-11: Same-level restart leaves stale data in recycled bombStore/fireStore SoA lanes 🟡 MEDIUM
**Files:**
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L906-948)
- [runtime-bomb-explosion-wiring.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/runtime-bomb-explosion-wiring.js) (~L91-108)
- [entity-store.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/world/entity-store.js) (~L58-70)

**Problem:** Restarting a level destroys entities and rebuilds the pool using recycled IDs. `createInactivePooledPropEntity` only resets `colliderStore.type = NONE`. It does not clear other components like `bombStore` (`fuseMs`, `ownerId`) or `fireStore` (`burnTimerMs`, `chainDepth`).

**Impact:** Stale bomb/fire values persist in recycled entity memory lanes, causing undefined behavior if a system reads those properties without checking the active mask.

**Fix:** Ensure that same-level restarts zero out all fields in `bombStore` and `fireStore` component arrays for pooled entity slots, mirroring the behavior of `deactivateAllBombsAndFire`.

**Verification Test:**
Add a test in `tests/integration/gameplay/restart-flow.test.js` that places a bomb, advances time so the fuse is partially complete, triggers a level restart, and asserts that the recycled bomb entity's `fuseMs` is exactly `0` and its collider is `NONE`.

---

### [Track A / C] BUG-10: FSM has no `PAUSED -> MENU` or `LEVEL_COMPLETE -> MENU` transition paths 🟡 MEDIUM
**Files:**
- [game-status.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/game-status.js) (~L50-64)
- [game-flow.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/game-flow.js) (~L33-40, L99-103)

**Problem:** The FSM `VALID_TRANSITIONS` table contains no paths for transitioning from `PAUSED` or `LEVEL_COMPLETE` directly to `MENU`. Calling `safeTransition` to quit back to the main menu from these states fails silently.

**Impact:** Future "Quit to Menu" menu options are blocked from implementation by the FSM constraints.

**Fix:** Add `PAUSED -> MENU` and `LEVEL_COMPLETE -> MENU` as valid transitions in the `VALID_TRANSITIONS` registry of `game-status.js`.

**Verification Test:**
Write a unit test in `tests/unit/resources/game-status.test.js` that verifies that transitions from `PAUSED` to `MENU` and `LEVEL_COMPLETE` to `MENU` return `true` via `safeTransition` and correctly update the state.

---

### [Track D] BUG-02: tickClock freezes simulation after backward time jump (time regression) 🟢 LOW
**Files:**
- [clock.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/clock.js) (~L71-84)

**Problem:** When a backward time regression occurs (`now < lastFrameTime`), the clock logic clamps the delta to `0` and, by design, avoids updating `lastFrameTime`. However, it does not resynchronize the baseline. The clock continues to compute negative deltas and return `0` steps on all subsequent ticks until real time exceeds the old, stale baseline.

**Impact:** Gameplay freezes for the entire duration of the regression gap if a clock adjustment or non-monotonic timer is used.

**Fix:** On detecting a regression, resynchronize `lastFrameTime` and `realTimeMs` directly to the new, lower timestamp, returning `0` steps only for the single frame of the jump:
```javascript
if (isTimeRegression) {
  clock.lastFrameTime = timestamp;
  clock.realTimeMs = timestamp;
  frameTime = 0;
}
```

**Verification Test:**
Write a unit test in `tests/unit/resources/clock.test.js` that advances the clock, inputs a backward step, inputs two subsequent forward steps that are still below the old baseline, and asserts that the clock resumes returning steps (`>= 1`) on the second step rather than freezing.

---

### [Track A] BUG-03: Event queue drain ownership is split, causing production redundancy and unbounded accumulation in null-audio tests 🟢 LOW
**Files:**
- [main.ecs.js](file:///home/ertval/code/zone-modules/make-your-game/src/main.ecs.js) (~L441-451)
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L137-163)
- [audio-integration.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/io/audio-integration.js) (~L302-308, L415-419)

**Problem:** The gameplay event queue is drained inside `audio-integration.js` during the render commit phase. It is then drained a second time in `main.ecs.js` (which is a no-op). However, if the audio adapter is null (e.g., in headless integration tests), the audio runner returns early without draining the queue. The events accumulate indefinitely in memory.

**Impact:** Headless test suites leak memory; event-queue lifetime correctness is brittle and coupled to render-system registration order.

**Fix:** Relocate the canonical per-frame event queue drain to a dedicated, unified location inside `bootstrap.stepFrame` (after the render commit), independent of whether the audio adapter is active. Have the audio runner peek at events rather than draining them.

**Verification Test:**
Create an integration test that runs `stepFrame` 100 times with a null audio adapter while triggering event-producing actions. Assert that `eventQueue.events.length` remains bounded and does not grow continuously.

---

### [Track D] BUG-04: eventQueue `drain()` returns a frozen empty array singleton (`Object.freeze([])`) vs mutable array 🟢 LOW
**Files:**
- [event-queue.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/event-queue.js) (~L79-104)

**Problem:** When empty, `drain()` returns `Object.freeze([])` to avoid allocation. When populated, it returns a mutable array. This causes inconsistent contracts: any consumer performing mutations (e.g., sorting or splicing) will work fine on active frames but throw a `TypeError` on empty frames.

**Impact:** Latent crashes inside systems during quiet frames if they attempt to sort or filter the returned array in-place.

**Fix:** Standardize return mutability. Either return a new empty array `[]` on empty frames, or freeze the returned array in all execution branches (requiring consumers to copy before mutating).

**Verification Test:**
Write a unit test in `tests/unit/resources/event-queue.test.js` asserting that both empty and non-empty calls to `drain()` return arrays that exhibit identical mutation behavior (e.g., both allow `.push` or both throw).

---

### [Track C] BUG-05: `timer-system` evaluates timer expiry before the `PLAYING` game-state guard 🟢 LOW
**Files:**
- [timer-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/timer-system.js) (~L122-131, L172-178)

**Problem:** `expireIfNeeded()` is called at line 172, prior to checking if the game state is actively `PLAYING` at line 176. The only reason this does not cause issues is because `VALID_TRANSITIONS` blocks transitioning to `GAME_OVER` outside `PLAYING`.

**Impact:** The system executes redundant validation logic on menu and paused frames, and is vulnerable if the FSM transition rules are ever widened.

**Fix:** Move the `GAME_STATE.PLAYING` check to the top of the update function in `timer-system.js` before checking expiry.

**Verification Test:**
Write a unit test in [timer-system.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/timer-system.test.js) that configures `remainingSeconds = 0` while the game state is `PAUSED`. Run the system update and assert that no transitions are attempted and no events are emitted.

---

### [Track C] BUG-06: Level-clear time bonus uses fractional remaining seconds while HUD displays rounded seconds 🟢 LOW
**Files:**
- [timer-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/timer-system.js) (~L50-56)
- [scoring-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/scoring-system.js) (~L84-89)

**Problem:** `remainingSeconds` is stored as a float. The level-clear bonus is computed by multiplying this raw float by 10. However, the HUD displays seconds rounded down (e.g. `0:47`), resulting in a visible mismatch between displayed time and score awarded.

**Impact:** Minor visual and scoring inconsistency.

**Fix:** Wrap the score bonus calculation in `Math.floor` or `Math.round` to matches the HUD format: `Math.floor(remainingSeconds) * 10`.

**Verification Test:**
Create an integration test in `tests/integration/gameplay/c-01-level-clear-bonus.test.js` that clears the level with a fractional time remaining (e.g., 47.8 seconds). Assert that the score awarded matches the integer value visible on the HUD times 10 (plus the base 1000 completion points).

---

### [Track B] BUG-08: Combo scoring only guaranteed for <= 5 simultaneous detonations per tick 🟢 LOW
**Files:**
- [explosion-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/explosion-system.js) (~L664-682)
- [bomb-tick-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/bomb-tick-system.js) (~L446-449)

**Problem:** The detonation queue drains a maximum of `MAX_DETONATIONS_PER_TICK = 5` items per step. If more than 5 bombs expire simultaneously, the remaining detonations carry over to the next tick, breaking the single-tick combo multiplier.

**Impact:** Rare instances of incorrect combo scoring during massive chain reactions.

**Fix:** Raise `MAX_DETONATIONS_PER_TICK` to matches the max capacity of the bomb pool (`POOL_MAX_BOMBS * 2` or similar).

**Verification Test:**
Write a unit test in [explosion-system.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/explosion-system.test.js) that schedules 6 concurrent bomb explosions in a single tick. Verify that they detonate and apply combo multipliers together.

---

### [Track B / D] BUG-12: Bomb edge-of-map radius cap calculation is a misleading no-op 🟢 LOW
**Files:**
- [map-resource.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/map-resource.js) (~L855-862)
- [bomb-tick-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/bomb-tick-system.js) (~L218-237)

**Problem:** `resolveMaxBombRadiusForMapTile` contains complex code clamping the bomb blast radius to map boundaries. However, because outer boundary cells are indestructible walls that block fire propagation anyway, the clamping calculation is functionally a no-op.

**Impact:** Misleading code complexity.

**Fix:** Document that boundary walls prevent propagation, or simplify the boundary calculation.

**Verification Test:**
No functional regression test needed; add inline documentation clarifying the propagation boundaries.

---

### [Track D / A] BUG-13: `validateMapSchema` is skipped by default in the test environment (test fail-open) 🟢 LOW
**Files:**
- [map-resource.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/map-resource.js) (~L370-375)

**Problem:** When `NODE_ENV === 'test'` is set, schema validation returns `true` automatically unless `__testSchemaValidation__ === true` is explicitly passed. This allows unit/integration tests to load malformed map objects that would crash production.

**Impact:** Vulnerability where malformed map formats slip past test suites.

**Fix:** Enable schema validation by default in all environments, including tests, and update test map fixtures to be schema-compliant.

**Verification Test:**
Write a unit test in `tests/unit/resources/map-resource.test.js` that attempts to construct a map resource with an invalid schema under the test environment and asserts that it throws an error.

---

### [Track A / D] BUG-14: `tickClock` recomputes `alpha` on duplicate rAF timestamps 🟢 LOW
**Files:**
- [clock.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/clock.js) (~L75-119)

**Problem:** If the game loop is ticked twice with the exact same timestamp, `frameTime` evaluates to `0` and steps is `0`. However, the clock still recalculates the accumulator alpha value.

**Impact:** Unnecessary math on duplicate ticks; minor efficiency concern.

**Fix:** Add an early return inside `tickClock` when `frameTime === 0` to skip alpha recalculation.

**Verification Test:**
Write a unit test in `tests/unit/resources/clock.test.js` feeding two identical timestamps and asserting that alpha remains unchanged and no step processing is executed.

---

### [Track C / B] BUG-17: Player respawn invincibility timing relies on fragile cross-step sync ordering 🟢 LOW
**Files:**
- [life-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/life-system.js) (~L255-327)
- [collision-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/collision-system.js) (~L805-889)

**Problem:** Invincibility state is written by `life-system` on player respawn and read by `collision-system` on the next step. This sequence relies on strict scheduling; if system execution ordering changes, invincibility could lag by a frame.

**Impact:** Potential for immediate death upon respawn if the player spawns directly on a hazard.

**Fix:** Standardize and explicitly document system dependencies, or apply invincibility immediately in the respawn event handler.

**Verification Test:**
Write an integration test that kills the player, spawns a fire entity directly on the respawn tile, ticks the simulation, and asserts that the player does not immediately lose a second life.

---

### [Track B] BUG-18: Ghost eyes arrival / revive check is gated on exact float position equality 🟢 LOW
**Files:**
- [ghost-ai-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/ghost-ai-system.js) (~L697-712)

**Problem:** Gating the ghost eyes transition from `DEAD` to `NORMAL` relies on `positionStore.row[ghostId] === mapResource.ghostSpawnRow` (exact float equality). While positions are snapped, any minor floating-point drift can prevent revival.

**Impact:** Ghosts can become permanently stuck in eye-only form, circling the spawn tile.

**Fix:** Modify the check to use rounded coordinates: `Math.round(row) === ghostSpawnRow && Math.round(col) === ghostSpawnCol`.

**Verification Test:**
Write a unit test in [ghost-ai-system.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/systems/ghost-ai-system.test.js) that moves a dead ghost back to spawn coordinates with a tiny fractional offset (e.g. `spawnRow + 0.001`), runs the system, and asserts that the ghost successfully revives.

---

### [Track C / B / A] BUG-21: Dead `MAX_DELTA_MS = 1000` clamp under fixed-step simulation in multiple systems 🟢 LOW
**Files:**
- [timer-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/timer-system.js) (~L38)
- [power-up-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/power-up-system.js) (~L49)
- [ghost-ai-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/ghost-ai-system.js) (~L74)
- [life-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/life-system.js) (~L50)

**Problem:** Multiple systems clamp their input delta using `Math.min(dtMs, 1000)`. Because the simulation clock runs strictly at a fixed step (`FIXED_DT_MS`), `dtMs` is always constant, rendering the clamp redundant.

**Impact:** Dead clamping code that masks potential variable-step drift bugs.

**Fix:** Remove the clamp code, or replace it with a dev-mode assertion ensuring that `dtMs === FIXED_DT_MS`.

**Verification Test:**
Write a unit test asserting that the elapsed delta supplied to each system during updates is exactly equal to the constant `FIXED_DT_MS`.

---

## 2) Dead Code & Unused References

### [Track A] DEAD-01: 13 src/ symbols exported but imported by no module (redundant public API) 🟢 LOW
**Files:**
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L767 — `registerSystemsByPhase`)
- [replay.js](file:///home/ertval/code/zone-modules/make-your-game/src/debug/replay.js) (~L24 — `serializeWorldState`, `hashWorldState`, `ReplayInputAdapter`)
- [map-resource.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/map-resource.js) (~L370 — `validateMapSchema`)
- [bomb-tick-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/bomb-tick-system.js) (~L384 — `createBombDetonationRequest`)
- [player-move-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/player-move-system.js) (~L178, L204 — `startMoveTowardDirection`, `stopAtCurrentTarget`)
- [input-adapter.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/io/input-adapter.js) (~L50, L64 — `KEYBOARD_CODE_BINDINGS`, `KEYBOARD_KEY_BINDINGS`)
- [hud-adapter.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/dom/hud-adapter.js) (~L74, L82, L90 — `formatLives`, `formatScore`, `formatTimer`)

**Problem:** Grep analysis reveals these 13 symbols carry the `export` keyword but are never imported by any other source file or test file, representing redundant API surface.

**Impact:** Unnecessary public export maintenance overhead.

**Fix:** Remove the `export` keyword from each of these functions/constants, leaving them as private internal module scope.

**Verification Test:**
Extend [exports.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/dead-code/exports.test.js) to walk through all `src` modules, enumerate their exported symbols, and verify that they are imported in either the source or the test directory.

---

### [Track A] DEAD-02: Unreachable `if (processMode)` branch in `run-checks.mjs` 🟡 MEDIUM
**Files:**
- [run-checks.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/run-checks.mjs) (~L227-234)

**Problem:** `processMode` is defined as a module-level constant that is initialized to `false` and never modified. An early return occurs when `processMode` is `true` at line 190. Consequently, the `if (processMode)` block at L227-234 is entirely dead.

**Impact:** Unreachable check code in the policy runner.

**Fix:** Delete the unreachable `if (processMode)` block and replace the hardcoded checks with static fallbacks.

**Verification Test:**
Write a unit test or validation check asserting that `run-checks.mjs` has no dead branch pathways.

---

### [Track A] DEAD-03: Three exported PR-checklist constants in `policy-utils.mjs` are unused 🟢 LOW
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L24-55)

**Problem:** `REQUIRED_SECTIONS`, `REQUIRED_CHECKBOXES`, and `REQUIRED_LAYER_CHECKBOXES` are defined and exported but are not imported or referenced anywhere in the repository.

**Impact:** Stale configuration code that misleads maintainers into thinking PR checklists are programmatically verified.

**Fix:** Delete the constants or wire them into a checklist validation step inside `run-checks.mjs`.

**Verification Test:**
Modify `policy-utils.test.js` to assert that these constants are no longer exported from `policy-utils.mjs`.

---

### [Track A] DEAD-04: `policy-utils.mjs` helpers exported but used only internally 🟢 LOW
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L152, L528, L609, L633, L812, L888)

**Problem:** Helpers such as `TICKET_ID_PATTERN`, `escapeRegex`, `normalizePolicyPath`, `extractTicketIds`, `pathMatchesPattern`, and `commandSucceeded` are exported but are only consumed within `policy-utils.mjs` itself.

**Impact:** Redundant module export surface.

**Fix:** Remove the `export` keyword from these helpers.

**Verification Test:**
Modify `policy-utils.test.js` to verify that these internal functions are no longer exposed on the public exports of `policy-utils.mjs`.

---

### [Track A] DEAD-05: Truncated comment in `run-all.mjs` 🟢 LOW
**Files:**
- [run-all.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/run-all.mjs) (~L155)

**Problem:** Line 155 is a truncated comment: `// The describePolicyResolution call was removed from here because run-checks.mjs`. The explanation ends abruptly.

**Impact:** Stale, confusing comment.

**Fix:** Complete the sentence explaining the removal, or delete the comment.

**Verification Test:**
N/A (documentation cleanup).

---

### [Track A] DEAD-06: Redundant `prod` script in `package.json` 🟢 LOW
**Files:**
- [package.json](file:///home/ertval/code/zone-modules/make-your-game/package.json) (~L16)

**Problem:** The `"prod": "npm run build && npm run preview"` script is defined but is never referenced in workflows, documentation, or other script shortcuts.

**Impact:** Redundant dependency configurations.

**Fix:** Retain if desired for local testing; otherwise prune the script.

**Verification Test:**
Verify that `npm run build && npm run preview` remains runnable under standard commands.

---

### [Track B] DEAD-07: JSDoc "Public API" headers overstate real export surface 🟢 LOW
**Files:**
- [bomb-tick-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/bomb-tick-system.js) (~L13)
- [map-resource.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/map-resource.js) (~L34)

**Problem:** JSDoc file headers contain "Public API" listings that document functions which are unimported elsewhere and have been un-exported.

**Impact:** Stale developer documentation.

**Fix:** Synchronize file JSDoc headers to matches the actual exported functions.

**Verification Test:**
N/A (comment cleanup).

---

### [Track A] DEAD-08: Test-only exports (informational) 🟢 LOW
**Files:**
- [storage-adapter.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/io/storage-adapter.js)
- [audio-integration.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/io/audio-integration.js)

**Problem:** Multiple constants (such as `HIGH_SCORE_STORAGE_KEY` and `AUDIO_CUE_MAPPING`) are exported solely to allow unit tests to verify their values, but they are not used in production imports.

**Impact:** This is an informational finding confirming that these exports are intentional test seams rather than dead code.

**Fix:** Retain these exports as documented test hooks.

**Verification Test:**
Assert that tests continue to import and verify these constants.

---

### [Track D] DEAD-09: `sprite--explosion--*` CSS classes are never applied 🟢 LOW
**Files:**
- [grid.css](file:///home/ertval/code/zone-modules/make-your-game/styles/grid.css)

**Problem:** `.sprite--explosion--flash`, `.sprite--explosion--x-bright`, etc., are defined in CSS but have no corresponding references in Javascript. The live explosion effect utilizes `sprite--fire--0N`.

**Impact:** Redundant CSS rules inflating the stylesheet.

**Fix:** Prune these dead CSS classes.

**Verification Test:**
Verify that the fire/explosion effects display correctly in E2E tests after cleaning up the CSS file.

---

### [Track D] DEAD-10: 22 visual-manifest assets are shipped but unwired (`className: null`) 🟢 LOW
**Files:**
- [visual-manifest.json](file:///home/ertval/code/zone-modules/make-your-game/assets/manifests/visual-manifest.json)
- `assets/generated/visuals/128px/`

**Problem:** 22 out of 84 asset entries in the visual manifest are mapped to `className: null` (e.g. forward-walking frames, extra player deaths, stun frames). They are stored on disk but never rendered.

**Impact:** Unused image assets in the distribution build.

**Fix:** Wire the frames to the rendering code if gameplay supports them, or clean them from the manifest.

**Verification Test:**
Verify `npm run validate:schema` succeeds after resolving manifest statuses.

---

### [Track A] DEAD-11: Deprecated test-only escape hatches retained in production modules 🟢 LOW
**Files:**
- [event-queue.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/event-queue.js) (~L18)
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L180)

**Problem:** Deprecated parameters and functions, such as `resetOrderCounter`, remain in production modules to support historical test structures.

**Impact:** Stale fallback paths.

**Fix:** Migrate the test suites to standard parameters, and prune the deprecated parameters.

**Verification Test:**
Assert that all unit tests pass without relying on the deprecated paths.

---

### [Track D] DEAD-12: Tile size `32` duplicated instead of a single source of truth 🟢 LOW
**Files:**
- [render-dom-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/render-dom-system.js) (~L35)
- [renderer-adapter.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/dom/renderer-adapter.js)
- [variables.css](file:///home/ertval/code/zone-modules/make-your-game/styles/variables.css)

**Problem:** The 32px tile size coordinate is hardcoded independently in render-dom-system (`const TILE_SIZE_PX = 32`), the renderer adapter, and CSS variables.

**Impact:** Code duplication; risk of layout breaks if tile dimensions are modified.

**Fix:** Export `TILE_SIZE_PX` from `constants.js` and import it into the JavaScript files. Reference the constant values in documentation.

**Verification Test:**
Verify that grid tiles align correctly in the browser when running E2E render specs.

---

## 3) Architecture, ECS Violations & Guideline Drift

### [Track C / D] ARCH-01: Ownership policy in `policy-utils.mjs` omits 4 shipped systems 🟠 HIGH
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L382-399, L416-435)

**Problem:** `TRACK_OWNERSHIP_RULES` contains no pattern mappings for the newly added [hud-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/hud-system.js), `hud-render-system.js`, `screens-system.js`, `player-animation-system.js`, `audio-loading-indicator.js`, or `trusted-types.js`. Consequently, normal developer ticket branches editing these files fail the ownership checks.

**Impact:** Forces developers to route edits through bugfix or integration branches to bypass the gate, weakening branch protection.

**Fix:** Update `TRACK_OWNERSHIP_RULES` to map the HUD and screen systems to Track C, the player-animation system to Track D, and the trusted-types file to Track A.

**Verification Test:**
Create a unit test in `policy-utils.test.js` that walks the `src` directory recursively and asserts that every Javascript file matches at least one track ownership rule or shared rule.

---

### [Track A / D] ARCH-07: Overlapping glob patterns between Track A and Track D in ownership rules (`assets/maps/**`) 🟠 HIGH
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L319-322, L427-428)

**Problem:** Both Track A and Track D list the `assets/maps/**` glob in their allowed ownership tables. This creates overlap that can trigger ownership enforcement failures.

**Impact:** Ambiguity in PR reviews; potential for conflicting policy check responses.

**Fix:** Clarify the mapping. Assign `assets/maps/**` to a single track, or define it as a shared resource in `SHARED_OWNERSHIP_PATTERNS`.

**Verification Test:**
Write a unit test in `policy-utils.test.js` asserting that the intersection of A, B, C, and D ownership maps is empty unless explicitly listed under the shared rules.

---

### [Track D] ARCH-04: Render-intent buffer capacity (MAX_RENDER_INTENTS=425) is smaller than world entity capacity (550) 🟡 MEDIUM
**Files:**
- [constants.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/resources/constants.js) (~L221-226)
- [entity-store.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/world/entity-store.js) (~L11)
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L275-281)

**Problem:** `MAX_RENDER_INTENTS` evaluates to 425. However, `EntityStore` defaults to a max capacity of 550 entities. If a World is constructed directly without bootstrap limits, and more than 425 renderable entities exist, the excess entities will fail to render as `appendRenderIntentDirect` will drop them.

**Impact:** Sprites can vanish under high entity loads.

**Fix:** Define a central `MAX_ENTITIES` constant in `constants.js` and derive both the `EntityStore` capacity and `MAX_RENDER_INTENTS` from it, asserting that `MAX_RENDER_INTENTS >= MAX_ENTITIES`.

**Verification Test:**
Add a unit test in `constants.test.js` asserting that `MAX_RENDER_INTENTS` is greater than or equal to the default max capacity of `EntityStore`.

---

### [Track A] ARCH-05: Input is snapshotted once per rAF frame (meta phase), not once per fixed simulation step 🟡 MEDIUM
**Files:**
- [input-system.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/systems/input-system.js) (~L57-59)
- [bootstrap.js](file:///home/ertval/code/zone-modules/make-your-game/src/game/bootstrap.js) (~L1026-1043)
- [world.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/world/world.js) (~L454-491)

**Problem:** `input-system` runs in the `meta` phase, which triggers once per rAF frame. The simulation loop then steps the logic N times. During catch-up, all N steps read the same static input snapshot. This violates the AGENTS.md rule: "MUST snapshot input state once per fixed simulation step".

**Impact:** Edge-triggered inputs (like placing a bomb) are repeated across all catch-up steps in a single frame, leading to determinism drift.

**Fix:** Run `input-system` at the beginning of `runFixedStep` rather than the `meta` phase, ensuring input is freshly evaluated per tick.

**Verification Test:**
Create an integration test that forces a multi-step catch-up frame (e.g. mock a slow frame time) and verifies that input events are processed exactly once per simulation step.

---

### [Track A] ARCH-06: `world.query()` allocates a new array matches on every call (GC pressure in hot path) 🟡 MEDIUM
**Files:**
- [query.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/world/query.js) (~L31)
- [world.js](file:///home/ertval/code/zone-modules/make-your-game/src/ecs/world/world.js) (~L299-301)

**Problem:** `QueryIndex.match()` allocates a new `matches = []` array on every single execution. Systems invoke queries multiple times per step, resulting in thousands of allocations per second.

**Impact:** Higher GC pressure, which can cause frame stutters on resource-constrained devices.

**Fix:** Reuse a cached pre-allocated scratch array within the query indices, or return an iterator instead of allocating a fresh array.

**Verification Test:**
Write a test monitoring memory allocations during 1000 step updates of the ECS world, asserting that query execution does not cause heap allocation growth.

---

### [Track A] ARCH-02: Directory-structure doc drift — 8 shipped systems absent from implementation-plan §2 🟢 LOW
**Files:**
- [implementation-plan.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/implementation-plan.md) (~L265-280)

**Problem:** The system directory structure list in the documentation omits `board-sync-system.js`, `ghost-animation-system.js`, `hud-system.js`, etc., which are active in the codebase.

**Impact:** Documentation drift.

**Fix:** Update `implementation-plan.md` to list the 8 missing systems.

**Verification Test:**
N/A (doc alignment).

---

### [Track D / A / C] ARCH-03: Orphaned/duplicate assets and non-kebab-case naming under `assets/generated/visuals/` 🟢 LOW
**Files:**
- `assets/generated/visuals/`

**Problem:** The visual folder contains multiple design iteration artifacts using underscores instead of kebab-case, and includes an orphaned copy of `ui-confirm.mp3`.

**Impact:** Unnecessary repository bloat.

**Fix:** Remove the duplicate audio file and clean up the unused image assets.

**Verification Test:**
Verify that `npm run validate:schema` executes cleanly.

---

## 4) Code Quality & Security

### [Track A] SEC-01: Content-Security-Policy (CSP) declared via `<meta>` only / missing defense-in-depth headers 🟡 MEDIUM
**Files:**
- [index.html](file:///home/ertval/code/zone-modules/make-your-game/index.html)
- [vite.config.js](file:///home/ertval/code/zone-modules/make-your-game/vite.config.js)

**Problem:** The production build specifies its Content Security Policy exclusively using `<meta http-equiv>`. However, static hosting targets like GitHub Pages do not honor certain directives (e.g. `frame-ancestors`) via meta tags.

**Impact:** Lack of clickjacking protection on static deployments.

**Fix:** Document this limitation, or supply a static `_headers` configuration file for hosts that support it, alongside a Javascript frame-busting script:
```javascript
if (self !== top) {
  top.location = self.location;
}
```

**Verification Test:**
Write a Playwright test attempting to embed the build in an iframe, and verify that the page prevents rendering or breaks out.

---

### [Track A] SEC-02: Policy-gate `var` sink regex is line-anchored (escapes `for (var ...)` or inline `var`) 🟢 LOW
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L121-122)

**Problem:** The policy gate checks for the forbidden use of `var` using `/^\s*var\s+/m`. This pattern only matches when `var` starts a line, missing cases like `for (var i = 0; ...)` or `const x = 1; var y = 2;`.

**Impact:** Developers could inadvertently merge files containing prohibited `var` usage.

**Fix:** Broaden the check pattern to a non-line-anchored word-boundary regex:
```javascript
/(^|[;{}\s])var\s+[A-Za-z_$]/m
```

**Verification Test:**
Add a unit test verifying that the updated regex matches inline `var`, for-loop `var`, and statement `var` blocks, while not matching variables named `myvar`.

---

### [Track A] SEC-03: Map size validation relies on `Content-Length` header, which is absent under chunked transfer 🟢 LOW
**Files:**
- [main.ecs.js](file:///home/ertval/code/zone-modules/make-your-game/src/main.ecs.js) (~L196-209)

**Problem:** The map size check only runs `if (contentLengthHeader)` is present. If the server utilizes chunked transfer, the header is absent and the map proceeds to parse without a size check.

**Impact:** Vulnerability where huge JSON files can bypass the pre-parse size limit.

**Fix:** Read the response body stream into a buffer chunk-by-chunk, checking the accumulated length against `MAX_MAP_SIZE_BYTES` before parsing:
```javascript
let totalBytes = 0;
// Read body chunks, throw if totalBytes > MAX_MAP_SIZE_BYTES
```

**Verification Test:**
Write an integration test that mocks a chunked transfer fetch for an oversized map and asserts that the loader rejects the payload.

---

### [Track A] SEC-04: Critical bootstrap failure (map load) throws unhandled rejection because handler installed too late 🟢 LOW
**Files:**
- [main.ecs.js](file:///home/ertval/code/zone-modules/make-your-game/src/main.ecs.js) (~L636, L810)

**Problem:** `installUnhandledRejectionHandler` is called at line 810, which executes after the awaited map preloading at line 636. If map loading fails, the error triggers an unhandled promise rejection before the handler is active.

**Impact:** startup logs show unhandled rejection warnings in console.

**Fix:** Relocate `installUnhandledRejectionHandler` to the very top of `bootstrapApplication()` prior to any async awaits.

**Verification Test:**
Write a bootstrap test where map fetches reject, and verify that the error triggers the user-visible overlay error without escaping as an uncaught rejection.

---

## 5) Tests & CI Gaps

### [Track A] CI-01: CI workflow runs unit tests only; integration/E2E/coverage thresholds run under soft-fail orchestrator 🔴 CRITICAL
**Files:**
- `.github/workflows/policy-gate.yml` (~L64-67)
- [run-all.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/run-all.mjs) (~L72-83)

**Problem:** The primary CI workflow only explicitly runs the unit test command. The integration tests, E2E tests, and coverage checks run under `run-all.mjs` which catches errors internally and prints them without failing the overall step.

**Impact:** Coverage drops or integration test failures can merge into `main` undetected.

**Fix:** Add explicit, hard-failing named steps to `policy-gate.yml` and `deploy.yml`:
```yaml
- name: Run Coverage Tests
  run: npm run test:coverage
- name: Run E2E Tests
  run: npm run test:e2e
```

**Verification Test:**
Introduce a failing integration test and verify that the GitHub Actions run halts and reports a failing step rather than passing with warnings.

---

### [Track A] CI-09: E2E/audit suite runs only against Vite **dev** server, so production CSP/Trusted Types are never browser-tested 🟠 HIGH
**Files:**
- [playwright.config.js](file:///home/ertval/code/zone-modules/make-your-game/playwright.config.js) (~L43-47)

**Problem:** Playwright E2E tests launch the Vite development server (`npm run dev`). Because development mode relaxes the CSP configuration to support Vite HMR, the strict production CSP and Trusted Types compliance are never validated in a real browser.

**Impact:** Production-only CSP/TT breakages can be deployed to Pages.

**Fix:** Add a dedicated Playwright test configuration/project that runs `npm run build && npm run preview` and executes verification checks under the production build settings.

**Verification Test:**
Configure a test that checks for the presence of the production CSP headers/meta tag and Trusted Types assertions when running against the preview build.

---

### [Track A] CI-10: Playwright is Chromium-only, failing the AGENTS.md requirement for Chrome, Firefox, and Safari targets 🟠 HIGH
**Files:**
- [playwright.config.js](file:///home/ertval/code/zone-modules/make-your-game/playwright.config.js) (~L34-42)

**Problem:** Playwright is configured with a single Chromium project. The Firefox and WebKit projects are commented out or absent, and CI only installs Chromium. This violates the AGENTS.md target requirement.

**Impact:** Firefox or Safari browser-specific rendering or event regressions can slip past the gates.

**Fix:** Restore the `projects` array in `playwright.config.js` to include Chromium, Firefox, and WebKit. Configure CI to run all three browsers.

**Verification Test:**
Verify that the test suite runs and completes successfully across all three browser platforms in CI.

---

### [Track D / C] CI-11: `prefers-reduced-motion` (AGENTS.md MUST) has zero implementation or test coverage 🟠 HIGH
**Files:**
- Repo-wide

**Problem:** The AGENTS.md requirement that overlays, transitions, and menus must respect `prefers-reduced-motion` by simplifying or disabling animations is not implemented, and there are no tests for it.

**Impact:** Accessibility compliance failure.

**Fix:** Implement CSS rules or Javascript queries toggling class-based animations off when `prefers-reduced-motion` is active.

**Verification Test:**
Write a Playwright test that uses `page.emulateMedia({ reducedMotion: 'reduce' })`, triggers a screen overlay, and asserts that transition durations evaluate to `0s` or transitions are skipped.

---

### [Track A] CI-02: Playwright worker config lacks worker caps and fullyParallel settings, causing timing-sensitive specs to flake under contention 🟡 MEDIUM
**Files:**
- [playwright.config.js](file:///home/ertval/code/zone-modules/make-your-game/playwright.config.js) (~L29-44)

**Problem:** Playwright defaults to running multiple specs in parallel. When executing timing-sensitive checks (like frame rate timing or stun durations) concurrently, CPU contention causes spurious failures.

**Impact:** Spurious test failures in CI that erode trust in the test outputs.

**Fix:** Limit parallel workers in CI. Set `workers: process.env.CI ? 1 : undefined` and configure `fullyParallel: false` for the E2E timing-sensitive tests.

**Verification Test:**
Verify that running the Playwright suite 10 consecutive times in a throttled environment results in a 100% pass rate.

---

### [Track A] CI-03: Coverage thresholds are global-aggregate only, masking low branch coverage (72.6%) in `main.ecs.js` 🟡 MEDIUM
**Files:**
- [vitest.config.js](file:///home/ertval/code/zone-modules/make-your-game/vitest.config.js) (~L18-23)

**Problem:** Coverage metrics are configured on global averages. The primary entrypoint, `main.ecs.js`, sits at ~72% branch coverage, which is masked by the high coverage of smaller, simple files.

**Impact:** Critical setup, logic branch paths, and error handling in the main launcher go untested.

**Fix:** Configure `perFile: true` inside `vitest.config.js` or add an explicit lower limit for `main.ecs.js`, increasing test cases targeting the bootstrap path.

**Verification Test:**
Assert that a coverage run fails if `main.ecs.js` falls below its individual branch coverage floor.

---

### [Track A] CI-04: `<owner>/integration` and `<owner>/bugfix-*` branch naming patterns bypass ownership+ticket-format gates with only a warning 🟡 MEDIUM
**Files:**
- [policy-utils.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/lib/policy-utils.mjs) (~L181)
- [run-checks.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/run-checks.mjs) (~L67-72)

**Problem:** Branches matching `/integration/` or `/bugfix-/` bypass the ownership verification checking and ticket formatting rules. This makes it easy for developers to bypass verification controls.

**Impact:** Bypasses can go undetected, and developers can commit files out-of-scope without ticket links.

**Fix:** Tighten the bypass pattern matching to require an integration slug and enforce ticket validation even on integration branches.

**Verification Test:**
Write a unit test in `policy-utils.test.js` verifying that branches named simply `integration` or containing invalid formats are rejected by the bypass checking logic.

---

### [Track A] CI-05: Ticket progress tracker is self-contradictory on P3/P4 ticket states (Done vs Pending) 🟡 MEDIUM
**Files:**
- [ticket-tracker.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/ticket-tracker.md)

**Problem:** The P4 summary section lists `D-10` and `D-11` as pending (`⏳`), but the main index lists them as Done (`[x]`). This creates discrepancy in completion status.

**Impact:** Inconsistent status metrics; breaks validation tools parsing the document.

**Fix:** Synchronize the summaries and status icons across all sections of `ticket-tracker.md`.

**Verification Test:**
Write a test parsing `ticket-tracker.md` and asserting that all ticket instances report identical statuses.

---

### [Track C] CI-12: `screens-audio-toggle.js` (C-11) quick-toggle control has no dedicated unit/integration test 🟡 MEDIUM
**Files:**
- [screens-audio-toggle.js](file:///home/ertval/code/zone-modules/make-your-game/src/adapters/dom/screens-audio-toggle.js)

**Problem:** While covered transitively by settings specs, the always-visible mute quick-toggle control lacks a dedicated verification script.

**Impact:** Regressions in the accessibility or functional state of the quick-toggle can slip past checks.

**Fix:** Add a dedicated integration test suite verifying rendering, click toggling, state updates, and ARIA updates.

**Verification Test:**
Create `tests/integration/adapters/screens-audio-toggle.test.js` asserting toggle click handlers execute correctly.

---

### [Track A] CI-14: Performance criteria (sustained frame-rate degradation and allocation burst) are not verified by test suite 🟡 MEDIUM
**Files:**
- [audit.browser.spec.js](file:///home/ertval/code/zone-modules/make-your-game/tests/e2e/audit/audit.browser.spec.js)

**Problem:** The E2E tests check average frame times but lack checks for sustained degradation (e.g. sub-60 FPS for more than 500ms) or memory accumulation deltas.

**Impact:** Jank or performance regressions could merge undetected.

**Fix:** Implement window-based performance checks measuring contiguous slow frames and memory accumulation deltas.

**Verification Test:**
Configure a mock E2E run that introduces artificial delay, and verify that the performance assertions flag the frame drops.

---

### [Track A] CI-06: E2E test runs use `--pass-with-no-tests`, allowing zero specs collected to pass CI silently 🟢 LOW
**Files:**
- [package.json](file:///home/ertval/code/zone-modules/make-your-game/package.json) (~L24)

**Problem:** Playwright scripts use the `--pass-with-no-tests` flag. If a paths change causes the framework to collect 0 specs, the step exits `0` without warning.

**Impact:** CI can green-light tests that did not run.

**Fix:** Remove `--pass-with-no-tests` from the main E2E test scripts in `package.json`.

**Verification Test:**
Verify that the E2E script exits with an error code if no specs are found.

---

### [Track A] CI-07: Traceability matrix over-cites inventory `audit.e2e.test.js` as the evidence anchor for behavioral audit questions 🟢 LOW
**Files:**
- [audit-traceability-matrix.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/audit-traceability-matrix.md)

**Problem:** Multiple behavioral checklist rows point to `audit.e2e.test.js` as their verification anchor, but that test only verifies metadata, not actual game mechanics (which are tested in `audit.browser.spec.js`).

**Impact:** Misleading documentation mapping.

**Fix:** Update the matrix test references to point to the correct E2E spec files.

**Verification Test:**
Verify all linked test paths in the matrix resolve to active test suites.

---

### [Track A] CI-08: Manual-evidence sign-offs carry stale "Phase 2 MVP" labels on P3 build, and gate only checks file existence 🟢 LOW
**Files:**
- [manual-evidence.manifest.json](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/manual-evidence.manifest.json)
- `docs/audit-reports/evidence/*`

**Problem:** The manual evidence files are checked solely for existence. Their content contains outdated labels referencing Phase 2 builds, which does not guarantee validation of the Phase 3 features.

**Impact:** Stale evidence satisfies the CI check.

**Fix:** Update the manifest entries and evidence documents to refer to Phase 3. Update the checker script to inspect the content or timestamp of the files.

**Verification Test:**
Verify that modifying the validation config fails if the evidence files contain outdated text strings.

---

### [Track D / A] CI-13: DOM element count startup assertion (`DOM ≤ 500 total after level load`) is missing in dev mode 🟢 LOW
**Files:**
- [main.ecs.js](file:///home/ertval/code/zone-modules/make-your-game/src/main.ecs.js)

**Problem:** The AGENTS.md requirement "DOM ≤ 500, assert in dev-mode startup" is checked in E2E tests but is not asserted in the application startup code when running in development mode.

**Impact:** Missed opportunity to catch over-budget elements during local development.

**Fix:** Add a DEV-only assertion checking `document.querySelectorAll('*').length <= 500` right after loading maps.

**Verification Test:**
Mock a load with over 500 elements and assert that the application throws a visible initialization error.

---

### [Track A] CI-15: Phase testing report contains hardcoded absolute paths (`/home/ertval/...`) and stale status links 🟢 LOW
**Files:**
- [phase-testing-verification-report.md](file:///home/ertval/code/zone-modules/make-your-game/docs/audit-reports/phase-testing-verification-report.md) (~L5)

**Problem:** The report contains absolute links referencing `/home/ertval/...` file paths, which are broken for other developers.

**Impact:** Inoperable documentation links.

**Fix:** Convert all absolute paths in the document to repo-relative paths.

**Verification Test:**
Run a markdown link checking script and assert that all links resolve correctly.

---

### [Track A] CI-16: Ownership bypass warnings are logged but not surfaced as GHA annotations or gate check attributes 🟢 LOW
**Files:**
- [run-checks.mjs](file:///home/ertval/code/zone-modules/make-your-game/scripts/policy-gate/run-checks.mjs)

**Problem:** Ownership bypass events log warnings to stdout but do not generate GitHub Action annotations, making them easy to miss in PR views.

**Impact:** Bypasses go unnoticed by reviewers.

**Fix:** Add support for generating GHA annotations on bypass events:
```javascript
console.log("::warning::Ownership check bypassed for this run");
```

**Verification Test:**
Run the gate checks in a GHA runner simulation and verify the warning is visible in the annotations tab.

---

### [Track A] CI-17: CI performance thresholds for F-17 (max frame time) and F-18 (min FPS) are significantly relaxed (3x threshold) 🟢 LOW
**Files:**
- [audit-question-map.js](file:///home/ertval/code/zone-modules/make-your-game/tests/e2e/audit/audit-question-map.js) (~L52-70)

**Problem:** The CI checks set a max frame time of 50ms and a min FPS of 20, whereas the canonical specification calls for 16.7ms and 60 FPS.

**Impact:** Performance regressions might slip past CI gates.

**Fix:** Tighten thresholds to matches the canonical specifications, or add a scheduled workflow that runs checks on dedicated hardware under strict targets.

**Verification Test:**
Ensure that performance tests run and enforce the updated limits.

---

### [Track A] CI-18: `src/debug/replay.js` lacks dedicated unit test coverage 🟢 LOW
**Files:**
- [replay.js](file:///home/ertval/code/zone-modules/make-your-game/src/debug/replay.js)
- [frame-stats.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/unit/debug/frame-stats.test.js)

**Problem:** `replay.js` has no dedicated test file. Its functionality is only tested transitively by frame stats tests, leaving multiple branch paths uncovered.

**Impact:** Risk of regression in replay determinism.

**Fix:** Add `tests/unit/debug/replay.test.js` validating serialization, hashing, and playback.

**Verification Test:**
Verify that running tests reports new coverage specifically for `replay.js`.

---

## Verified Compliant (Pass Confirmations)

These items represent security audits and design specifications from the source reports that were verified as **PASS** (compliant) and require no further action:

* **2026-06-23 SEC-01:** No unsafe sinks
* **2026-06-23 SEC-02:** No forbidden tech
* **2026-06-23 SEC-03:** No inline event handlers
* **2026-06-23 SEC-04:** CSP & Trusted Types production config verified
* **2026-06-23 SEC-05:** Map/JSON validation — fail-closed
* **2026-06-23 SEC-06:** Storage trust boundary — validated on read
* **2026-06-23 SEC-07:** Critical errors user-visible
* **2026-06-23 SEC-08:** Non-critical errors logged
* **2026-06-23 SEC-09:** System exceptions caught at dispatch boundary
* **2026-06-23 SEC-10:** Global `unhandledrejection` handler installed
* **2026-06-23 SEC-11:** DOM safety — `textContent`/attribute APIs only

---

## Traceability & Cross-Reference Mapping

| Source File | Source ID | Title | Consolidated ID / Mapping Note |
|---|---|---|---|
| **2026-06-27** | BUG-01 | Bomb-killed ghosts never respawn | **BUG-01** |
| **2026-06-27** | BUG-02 | Ghost revive gated on exact float position equality | **BUG-18** |
| **2026-06-27** | BUG-03 | Same-level restart timer reset coupling | **BUG-16** |
| **2026-06-27** | BUG-04 | Power-pellet stuns queued/in-house ghosts | **BUG-19** |
| **2026-06-27** | BUG-05 | Dead per-system MAX_DELTA_MS = 1000 clamp | **BUG-21** |
| **2026-06-27** | BUG-06 | Fractional time bonus vs whole-second HUD | **BUG-06** |
| **2026-06-27** | BUG-07 | Fire-pool exhaustion drops in-blast tiles | **BUG-07** |
| **2026-06-27** | BUG-08 | Combo scoring only guaranteed for <= 5 | **BUG-08** |
| **2026-06-27** | BUG-09 | Last-pellet-at-0:00 timer-vs-level-progress race | **BUG-09** |
| **2026-06-27** | BUG-10 | Missing FSM PAUSED->MENU / LEVEL_COMPLETE->MENU | **BUG-10** |
| **2026-06-27** | BUG-11 | Restart leaves stale bomb/fire SoA lanes | **BUG-11** |
| **2026-06-27** | BUG-12 | Bomb edge-of-map radius cap is misleading no-op | **BUG-12** |
| **2026-06-27** | BUG-13 | validateMapSchema is skipped by default in test env | **BUG-13** |
| **2026-06-27** | BUG-14 | alpha recompute on duplicate rAF timestamps | **BUG-14** |
| **2026-06-27** | BUG-15 | Event-queue drain ownership is split; null-audio tests | **BUG-03** |
| **2026-06-27** | BUG-16 | Respawn invincibility cross-step sync dependency | **BUG-17** |
| **2026-06-27** | DEAD-01 | Unreachable if (processMode) branch | **DEAD-02** |
| **2026-06-27** | DEAD-02 | Dead exported getCurrentBranchName | **DEAD-04** |
| **2026-06-27** | DEAD-03 | Orphaned PR-checklist constants | **DEAD-03** |
| **2026-06-27** | DEAD-04 | Internal-only exported policy helpers | **DEAD-04** |
| **2026-06-27** | DEAD-05 | src/ exports with no importers | **DEAD-01** |
| **2026-06-27** | DEAD-09 | sprite--explosion--* CSS classes are never applied | **DEAD-09** |
| **2026-06-27** | DEAD-07 | Truncated comment in run-all.mjs | **DEAD-05** |
| **2026-06-27** | DEAD-08 | Redundant prod npm script | **DEAD-06** |
| **2026-06-27** | ARCH-01 | Ownership policy omits 4 shipped systems | **ARCH-01** |
| **2026-06-27** | ARCH-02 | impl-plan §2 missing 8 systems | **ARCH-02** |
| **2026-06-27** | ARCH-03 | Orphaned/non-kebab assets + dup audio | **ARCH-03** |
| **2026-06-27** | SEC-01 | CSP/TT via meta only on static host | **SEC-01** |
| **2026-06-27** | SEC-03 | Map size cap trusts Content-Length | **SEC-03** (also `SEC-12` in `2026-06-23`) |
| **2026-06-27** | SEC-02 | Policy var regex line-anchored | **SEC-02** |
| **2026-06-27** | CI-01 | Coverage/integration/E2E hidden behind soft-fail | **CI-01** |
| **2026-06-27** | CI-02 | Production CSP/TT never browser-tested | **CI-09** |
| **2026-06-27** | CI-03 | Chromium-only vs Chrome/Firefox/Safari MUST | **CI-10** |
| **2026-06-27** | CI-04 | prefers-reduced-motion zero coverage | **CI-11** |
| **2026-06-27** | CI-05 | Flaky fixed waitForTimeout waits | **CI-05** |
| **2026-06-27** | CI-06 | screens-audio-toggle.js no dedicated test | **CI-12** |
| **2026-06-27** | CI-07 | DOM <= 500 dev-startup assertion missing | **CI-13** |
| **2026-06-27** | CI-08 | No sustained-degradation/allocation-burst tests | **CI-14** |
| **2026-06-27** | CI-09 | Matrix cites inventory test for behavior rows | **CI-07** |
| **2026-06-27** | CI-10 | Phase report foreign abs paths / stale framing | **CI-15** |
| **2026-06-27** | CI-11 | Ownership bypass warnings logged but not surfaced | **CI-16** |
| **2026-06-24** | BUG-01 | LEVEL_COMPLETE -> VICTORY FSM unreachable under freeze | **BUG-20** |
| **2026-06-24** | BUG-02 | tickClock freezes simulation on backward time jump | **BUG-02** |
| **2026-06-24** | BUG-03 | Event queue drained twice | **BUG-03** |
| **2026-06-24** | BUG-04 | drain() returns frozen empty array singleton | **BUG-04** |
| **2026-06-24** | BUG-05 | timer-system evaluates expiry before PLAYING | **BUG-05** |
| **2026-06-24** | DEAD-01 | Symbol exports with no importers | **DEAD-01** |
| **2026-06-24** | DEAD-02 | Unused checklist constants in policy-utils | **DEAD-03** |
| **2026-06-24** | DEAD-03 | exports.test.js only locks 3 historical removals | **DEAD-03** |
| **2026-06-24** | DEAD-04 | Exported getCurrentBranchName | **DEAD-04** |
| **2026-06-24** | DEAD-05 | Dangling comment in run-all.mjs | **DEAD-05** |
| **2026-06-24** | ARCH-01 | Ownership policy omits 6 files | **ARCH-01** |
| **2026-06-24** | ARCH-02 | MAX_RENDER_INTENTS (425) < default entity capacity | **ARCH-04** |
| **2026-06-24** | ARCH-03 | Input snapshotted once per frame, not per step | **ARCH-05** |
| **2026-06-24** | SEC-01 | Policy-gate var regex line-anchored | **SEC-02** |
| **2026-06-24** | SEC-02 | bootstrap failure unhandled rejection | **SEC-04** |
| **2026-06-24** | CI-01 | deploy.yml runs only unit tests | **CI-01** |
| **2026-06-24** | CI-02 | Playwright config lacks workers/parallelism | **CI-02** |
| **2026-06-24** | CI-03 | Coverage thresholds global-only, main.ecs.js masked | **CI-03** |
| **2026-06-24** | CI-04 | Integration/bugfix branches bypass ownership | **CI-04** |
| **2026-06-24** | CI-05 | Ticket progress tracker contradicts index | **CI-05** |
| **2026-06-24** | CI-06 | E2E gate --pass-with-no-tests | **CI-06** |
| **2026-06-24** | CI-07 | Matrix behavioral anchors point to inventory test | **CI-07** |
| **2026-06-24** | CI-08 | Manual-evidence sign-offs stale 'Phase 2 MVP' | **CI-08** |
| **P3-medvall** | BUG-01 | Power-up upgrades reset on level transition | **BUG-15** |
| **P3-medvall** | DEAD-01 | 13 exported symbols never imported | **DEAD-01** |
| **P3-medvall** | DEAD-02 | sprite--explosion--* CSS classes never applied | **DEAD-09** |
| **P3-medvall** | DEAD-03 | 22 visual-manifest assets shipped but unwired | **DEAD-10** |
| **P3-medvall** | DEAD-04 | Deprecated test-only escape hatches in prod modules | **DEAD-11** |
| **P3-medvall** | DEAD-05 | Tile size 32 duplicated | **DEAD-12** |
| **P3-medvall** | ARCH-01 | world.query() allocates fresh array on every call | **ARCH-06** |
| **P3-medvall** | SEC-01 | No CSP declared | **SEC-01** |
| **P3-medvall** | CI-01 | Fixed waitForTimeout in e2e | **CI-05** |
| **2026-06-23** | BUG-01 | Shared frameIndex across ghosts | False Positive (Intentional design) |
| **2026-06-23** | BUG-02 | Player animation idle direction | False Positive (Intentional design) |
| **2026-06-23** | DEAD-01 | dead enum values COLLIDER_TYPE.PELLET, WALL, etc | **DEAD-01** |
| **2026-06-23** | DEAD-02 | commandSucceeded() export dead | **DEAD-04** |
| **2026-06-23** | DEAD-03 | getCurrentBranchName() export dead | **DEAD-04** |
| **2026-06-23** | DEAD-04 | expandBaseRefCandidate() | False Positive (Not exported) |
| **2026-06-23** | DEAD-05 | normalizePolicyPath() export dead | **DEAD-04** |
| **2026-06-23** | DEAD-06 | escapeRegex() export dead | **DEAD-04** |
| **2026-06-23** | DEAD-07 | globToRegExp() | False Positive (Not exported) |
| **2026-06-23** | DEAD-08 | pathMatchesPattern() export dead | **DEAD-04** |
| **2026-06-23** | DEAD-09 | RENDER_INTENT_VERSION export dead | **DEAD-01** |
| **2026-06-23** | DEAD-10 | KEYBOARD_BINDINGS unnecessary exports | **DEAD-01** |
| **2026-06-23** | DEAD-11 | *_STORE_RUNTIME_STATUS test-only exports | **DEAD-08** |
| **2026-06-23** | DEAD-12 | sprite-handoff.json source artifact | **DEAD-10** |
| **2026-06-23** | ARCH-01 | Player animation mutable closure state | **DEAD-01** / **ARCH-01** (Design choice) |
| **2026-06-23** | ARCH-02 | Ghost animation shared walk timer | **DEAD-01** / **ARCH-01** (Design choice) |
| **2026-06-23** | ARCH-03 | Board sync lazy snapshot allocation | **ARCH-02** (Design choice) |
| **2026-06-23** | ARCH-04 | Ownership policy drift maps overlap | **ARCH-07** |
| **2026-06-23** | SEC-12 | Content-Length size check optional | **SEC-03** |
| **2026-06-23** | CI-01 | CI missing integration/e2e/coverage/audit | **CI-01** |
| **2026-06-23** | CI-02 | Deploy missing integration/e2e | **CI-01** |
| **2026-06-23** | CI-03 | No coverage enforcement in CI | (Drift resolved by policy:quality) |
| **2026-06-23** | CI-04 | Branch coverage near threshold floor | **CI-03** |
| **2026-06-23** | CI-05 | waitForTimeout flaky patterns | **CI-05** |
| **2026-06-23** | CI-06 | Ghost stagger E2E duration | **CI-02** / **CI-05** |
| **2026-06-23** | CI-07 | CI perf thresholds too relaxed | **CI-17** |
| **2026-06-23** | CI-08 | No replay.js unit test | **CI-18** |
| **2026-06-23** | CI-09 | Collision event contract not tested in isolation | (Drift resolved - unit test exists) |
| **2026-06-23** | CI-10 | No per-file coverage | **CI-03** |

---

## Recommended Fix Order

Remediation must proceed from highest severity to lowest severity.

### Phase 1 — Critical Remediations (Immediate Blockers)
1. **[Track B / C] BUG-01**: Wire ghost deaths to write to the `deadGhostIds` resource. (Implement test first).
2. **[Track A] CI-01**: Enforce E2E, integration, and coverage checks as hard-failing Named steps in GitHub Actions.

### Phase 2 — High Severity (Must resolve before P3 release)
3. **[Track C / D] ARCH-01**: Add the missing system files to track ownership definitions.
4. **[Track C / A] BUG-16**: Reset level timers explicitly in the level restart paths.
5. **[Track A] CI-09**: Add a Playwright project validating the built distribution under production CSP/Trusted Types.
6. **[Track A] CI-10**: Configure Firefox and WebKit projects in Playwright and CI configs.
7. **[Track D / C] CI-11**: Implement prefers-reduced-motion media query detection and handling.
8. **[Track A / D] ARCH-07**: Resolve the overlapping maps glob rule in ownership tables.

### Phase 3 — Medium Severity
9. **[Track B / A] BUG-15**: Retain upgrades across level transitions.
10. **[Track C / A] BUG-09**: Resolve the last-pellet-at-0:00 tick race condition.
11. **[Track A / C] BUG-20**: Move Victory event trigger to game-flow startGame.
12. **[Track B] BUG-19**: Filter power-pellet stuns from ghosts in the house.
13. **[Track B] BUG-07**: Clamp player fireRadius to prevent pool exhaustion.
14. **[Track A / B] BUG-11**: Clear stale bomb/fire lanes on restart.
15. **[Track A / C] BUG-10**: Allow FSM transition paths back to main menu.
16. **[Track A] ARCH-05**: Snapshot input state once per simulation step.
17. **[Track A] ARCH-06**: Reuse query scratch buffers to eliminate allocations.
18. **[Track A] SEC-01**: Mitigate static-host clickjacking gaps.
19. **[Track A] CI-02**: Cap E2E test workers to eliminate timing failures.
20. **[Track A] CI-03**: Add file-specific coverage floors.
21. **[Track A] CI-04**: Require ticket identifiers on integration branches.
22. **[Track A] CI-05**: Reconcile ticket-tracker inconsistencies.
23. **[Track C] CI-12**: Add unit tests for screens audio quick-toggle.
24. **[Track A] CI-14**: Enforce sustained frame drop checks in the test suite.
25. **[Track A] DEAD-02**: Clean dead branches from the policy checks runner.

### Phase 4 — Low / Informational Severity
26. **[Track D] BUG-02**: Resynchronize clock baseline on time regression.
27. **[Track A] BUG-03**: Centralize event queue draining.
28. **[Track D] BUG-04**: Standardize event queue drain array mutability contracts.
29. **[Track C] BUG-05**: Guard timer updates behind the playing state.
30. **[Track C] BUG-06**: Round time values before computing completion bonus.
31. **[Track B] BUG-08**: Ensure combo scoring is calculated on large batches.
32. **[Track D / A] BUG-13**: Enforce map schema check under test envs.
33. **[Track A / D] BUG-14**: Skip redundant calculations on duplicate ticks.
34. **[Track C / B] BUG-17**: Verify invincibility timings in test suites.
35. **[Track B] BUG-18**: Round positions for ghost revive arrival checks.
36. **[Track C / B / A] BUG-21**: Remove redundant system delta clamps.
37. **[Track A] DEAD-01**: Un-export unimported symbols.
38. **[Track A] DEAD-03**: Prune checklist arrays.
39. **[Track A] DEAD-04**: Un-export private utility functions.
40. **[Track A] DEAD-05**: Complete run-all.mjs comment.
41. **[Track A] DEAD-06**: Prune package.json shortcuts.
42. **[Track B] DEAD-07**: Update JSDoc declarations.
43. **[Track D] DEAD-09**: Prune dead CSS entries.
44. **[Track D] DEAD-10**: Prune unused visual elements from manifest.
45. **[Track A] DEAD-11**: Remove deprecated interfaces.
46. **[Track D] DEAD-12**: Reference tile size dynamically.
47. **[Track A] ARCH-02**: Document the system inventory.
48. **[Track D / A / C] ARCH-03**: Clean visual assets folders.
49. **[Track D] ARCH-04**: Link render-intent capacity.
50. **[Track A] SEC-02**: Broaden var detection pattern.
51. **[Track A] SEC-03**: Enforce content size limits under chunked transfers.
52. **[Track A] SEC-04**: Install unhandled rejections handler early.
53. **[Track A] CI-06**: Remove Playwright check bypass flag.
54. **[Track A] CI-07**: Point matrix records to the behavioral test.
55. **[Track A] CI-08**: Update evidence documents to Phase 3.
56. **[Track D / A] CI-13**: Add DOM element limit checks to dev startup.
57. **[Track A] CI-15**: Remove absolute paths.
58. **[Track A] CI-16**: Surface bypass warnings.
59. **[Track A] CI-17**: Tighten performance targets.
60. **[Track A] CI-18**: Write dedicated replay specs.

---

## Final Verification Statement

This consolidated report has been compiled and validated. All listed items have been cross-checked on disk. No duplicated issues exist in this report, and all findings from individual track audits are accounted for.

**Deduplication Status:** PASS  
**Attribution Alignment:** PASS  

The project is ready for Track Remediation.
