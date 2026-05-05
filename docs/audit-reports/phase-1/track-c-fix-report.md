# Track C Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report, verified against
the actual source code on 2026-05-05. Verification status, corrected severities, and improved fix
guidance are noted inline.

**Total Actual Issues to Resolve: 8**

---

## Verified Issues

---

### BUG-03: `resetClock()` rewinds `simTimeMs` on resume/focus ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A / Track D / Track C (Tickets: A-03, D-01, C-04)
- `src/ecs/resources/clock.js` (L143–149)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** `resetClock(clock, now)` unconditionally sets
`clock.simTimeMs = 0` (L146). The runtime calls `resetClock` on unpause/focus-return to
resynchronize timing, which **rewinds the simulation clock to zero** — violating pause/resume
determinism. The `simTimeMs` should only be zeroed on full game restart, not on lifecycle resync.

**Fix:** Split `resetClock` into two purposeful APIs:
```js
// For game restart — full zero reset including simTimeMs:
export function resetClockForRestart(clock, now) {
  clock.lastFrameTime = now;
  clock.realTimeMs = now;
  clock.simTimeMs = 0;
  clock.accumulator = 0;
  clock.alpha = 0;
}

// For unpause/focus-return — only resync the baseline; preserve simTimeMs:
export function resyncClockBaseline(clock, now) {
  clock.lastFrameTime = now;
  clock.realTimeMs = now;
  clock.accumulator = 0;
  clock.alpha = 0;
  // simTimeMs intentionally NOT reset
}
```
Update all callers: restart path calls `resetClockForRestart`, lifecycle handlers call
`resyncClockBaseline`. Keep `resetClock` as a deprecated alias until all callers are migrated.

**Tests to add:**
- Assert `simTimeMs` is **unchanged** after calling `resyncClockBaseline()`.
- Assert `simTimeMs` is **zero** after `resetClockForRestart()`.
- Pause/resume integration test: simulate 10 ticks, pause, call resync, unpause, assert `simTimeMs`
  continues from where it left off (not reset to 0).

---

### BUG-04: `life-system` calls `world.entityStore.isAlive()` instead of `world.isEntityAlive()` ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C / Track A (Tickets: C-02, A-02)
- `src/ecs/systems/life-system.js` (L118)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Line 118:
```js
!world.entityStore.isAlive(playerEntity)
```
`world.entityStore` is the raw internal `EntityStore` exposed via a mutable getter (ARCH-02
violation). This directly accesses the internal store from a simulation system, violating ECS
isolation. Additionally, if the `entityStore` getter is ever removed or restricted (the fix for
ARCH-02), this call will throw.

**Fix:**
```js
// Replace:
!world.entityStore.isAlive(playerEntity)
// With:
!world.isEntityAlive(playerEntity)
```
Verify `world.isEntityAlive()` is exposed as part of the restricted dispatch view that systems
receive. If not, add it to the World public API as part of the ARCH-02 fix.

**Tests to add:** Unit test asserting that `life-system` correctly detects dead player entities
and that the system does NOT crash when called without a live player entity. Assert lives
decrement correctly on death intent.

---

### BUG-09: Pause state not explicitly cleared before LEVEL_COMPLETE → PLAYING transition ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (L120–140)

**Verification:** ⚠️ **DOWNGRADED TO LOW.** Code review shows `startGame()` handles the
`LEVEL_COMPLETE` state at L120–140. It calls `safeTransition(gameStatus, GAME_STATE.PLAYING)` then
`applyPauseFromState(clock, gameStatus)` — the latter always synchronizes clock pause state from
the game state. This means the pause state IS consistently set on valid transitions.

The finding's concern ("pause state may persist incorrectly") is a theoretical edge case with no
currently reachable code path. The severity is downgraded from MEDIUM to LOW.

**Fix (precautionary):** Add an explicit `setPauseState(clock, false)` at the top of
`startGame()` as a defensive guard for future state machine changes. This is low-cost and
eliminates the theoretical risk:
```js
function startGame(options = {}) {
  // Defensive: ensure pause is cleared before any transition attempt.
  setPauseState(clock, false);
  // ... rest of existing logic
}
```

**Tests to add:** Integration test verifying that calling `startGame()` from `LEVEL_COMPLETE`
state results in `clock.isPaused === false` and `gameStatus.currentState === GAME_STATE.PLAYING`.

---

### BUG-11: `spawn-system.js` fallback ghost count forced to `POOL_GHOSTS` minimum ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (L184)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Line 184:
```js
const fallbackCount = Math.max(toFiniteNonNegativeInteger(activeGhostCap, 0), POOL_GHOSTS);
```
`POOL_GHOSTS = 4` (constants.js:L209). This forces the fallback ghost count to a minimum of 4
even when `activeGhostCap` is 0 (e.g., early levels with no ghosts, or when the map resource
hasn't loaded yet). This is incorrect: if the level has 0 active ghosts, spawning 4 ghost IDs
[0,1,2,3] will attempt to release non-existent ghost entities.

**Fix:** Remove the `Math.max` wrapping so the fallback count respects the resolved cap:
```js
// Replace:
const fallbackCount = Math.max(toFiniteNonNegativeInteger(activeGhostCap, 0), POOL_GHOSTS);
// With:
const fallbackCount = toFiniteNonNegativeInteger(activeGhostCap, 0);
```
The only valid floor is 0 (no ghosts), not 4.

**Tests to add:**
- Test `resolveDeterministicGhostOrder([], 0)` returns `[]` (empty ghost order when cap is 0).
- Test `resolveDeterministicGhostOrder([], 2)` returns `[0, 1]` (correct 2-ghost fallback).
- Test `resolveDeterministicGhostOrder([], 4)` returns `[0, 1, 2, 3]` (full pool).

---

### BUG-13: Spawn System creates multiple `new Set()` allocations per tick ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (L227–229, L236–240, L247–251, L296–301, L328–333)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Multiple `new Set()` calls per tick across
several internal functions (`createMembershipSet`, `pruneRespawningGhostsFromReleasedIds`,
`countActiveReleasedGhosts`, `releaseEligibleGhosts`, `enqueueNewlyEligibleInitialGhosts`).
Minor GC pressure at 60Hz fixed-step rate.

**Fix:** The audit's suggested fix ("hoist a reusable scratch Set into system closure scope") is
correct. Use `Set.prototype.clear()` to reuse the Set in-place. Example for the common
respawningGhostIds Set:

```js
// In createSpawnSystem closure:
const _respawningGhostIdsScratch = new Set();

// In each function that builds this Set:
_respawningGhostIdsScratch.clear();
for (const entry of spawnState.respawnQueue) {
  _respawningGhostIdsScratch.add(entry.ghostId);
}
// Use _respawningGhostIdsScratch instead of creating a new Set
```

Note: Only hoist Sets that hold *transient within-tick* data. Sets tracking persistent state
(like `releasedSet`) may still be created fresh to avoid stale-data bugs. Audit all uses before
hoisting blindly.

**Tests to add:** No behavioral change expected — existing spawn tests should continue passing
after the refactor.

---

### DEAD-10: Legacy fallback branch in `destroyAllEntitiesDeferred()` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (L63–75)

**Verification:** ⚠️ **DOWNGRADED TO LOW / DEFER.** The legacy fallback (L63–75) checks for
`world.deferDestroyAllEntities` first (L54). If the current World always provides this method,
the fallback branch is unreachable dead code. However, the fallback exists as a safety net for
test harnesses or partial World stubs that don't implement the deferred API.

**Recommended fix (conservative):** Add a `console.warn` inside the fallback to make it visible
in dev when hit, rather than silently removing it:
```js
// Legacy fallback keeps restart deterministic without reaching into world internals.
if (typeof world.getActiveEntityHandles === 'function') {
  if (typeof console !== 'undefined') {
    console.warn('[game-flow] Legacy destroyAll path reached — migrate to deferDestroyAllEntities');
  }
  // ... rest of fallback
}
```
Full removal is acceptable only after confirming no test harnesses rely on this path.

---

### ARCH-03: Core gameplay systems (pause, HUD, timer) not registered in default runtime ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track C/A (Tickets: C-01, C-02, C-04, C-05)
- `src/game/bootstrap.js` (~L244)

**Verification:** Needs confirmation against current `bootstrap.js` system registration list.
The finding is plausible — Track C systems (pause-system, level-progress-system, timer-system,
life-system) are likely registered only in Track C integration tests, not the default production
bootstrap.

**Fix:** Register Track C systems in deterministic order in `bootstrap.js`. The correct insertion
order (relative to existing systems) is:
1. `life-system` — after `collision-system` (consumes collision intents)
2. `pause-system` — after input processing
3. `timer-system` — logic phase, independent
4. `level-progress-system` — after timer and life (reads both)

Register systems by their factory functions, not ad-hoc inline objects.

**Tests to add:** Integration test verifying that the default runtime bootstrap exposes working
pause (HUD freezes), timer countdown, lives HUD, and score HUD. This is the core audit gate for
F-01 through F-06.

---

### SEC-05: Storage trust boundary not implemented for high scores ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `docs/game-description.md` (~L311)

**Verification:** Finding is forward-looking (C-05 not yet landed). Valid as a pre-condition
reminder.

**Fix:** Before C-05 high-score persistence lands, implement a `storage-adapter.js` that:
- Validates data on `read` (type-checks, range-clamps score values, rejects non-integer/NaN)
- Uses `try/catch` around all `localStorage` access (throws in private browsing on some browsers)
- Treats missing or malformed data as "no high score" rather than throwing

This satisfies the AGENTS.md storage trust boundary requirement.
