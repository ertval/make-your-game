# Codebase Analysis & Audit Report - P0 Foundation

**Date:** 2026-04-14
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P0 Foundation — 5 parallel analysis passes

---

## Methodology

Five analysis passes were executed sequentially across the codebase (single-agent mode):
1. **Bugs & Logic Errors** — Examined all `src/` files for runtime bugs, logic errors, race conditions, and edge-case failures.
2. **Dead Code & Unused References** — Scanned for unreachable branches, unused exports/imports, stale config, and redundant API surface.
3. **Architecture, ECS Violations & Guideline Drift** — Verified ECS architecture rules, boundary integrity, guideline alignment, and structural deferral contracts.
4. **Code Quality & Security** — Searched for unsafe sinks, forbidden tech, CSP gaps, data validation, and error handling deficiencies.
5. **Tests & CI Gaps** — Mapped test coverage against `docs/audit.md`, verified CI configuration, and identified audit verification gaps.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

**Context**: 9 of 44 tickets are marked `[x]` Done (P0 Foundation). The codebase has shipped resources, world engine, component stores, input adapter/system, game flow, and level loader. Most gameplay systems (movement, collision, bombs, AI, scoring, timer, lives, pause, spawn, render collect/DOM) are **not yet implemented**. This report evaluates the current state against canonical constraints, flagging both present issues and structural gaps that block downstream phases.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 5 |
| 🟠 High | 12 |
| 🟡 Medium | 14 |
| 🟢 Low / Info | 9 |

**Top risks:**
1. **Restart clock corruption** — `resetClock` receives `clock.realTimeMs` which is `undefined`, causing NaN simulation state after restart.
2. **Final-level VICTORY transition broken** — `advanceLevel()` returns `null` at last level but code transitions to `PLAYING`, looping the final level forever.
3. **Map-load fail-open** — game can enter `PLAYING` state with `null` map resource, guaranteeing downstream crashes.
4. **Render pipeline not wired** — no render-collect or render-DOM systems exist; the frame loop runs simulation only with zero visual output.
5. **Audit tests are inventory-only** — `audit.e2e.test.js` only counts IDs; no behavioral assertions exist for any of the 27 audit questions.

---

## 1) Bugs & Logic Errors

### BUG-01: Restart corrupts clock baseline with undefined timestamp ⬆ Blocking
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/game/bootstrap.js` (~L81) — `resetClock(clock, clock.realTimeMs)`
- `src/ecs/resources/clock.js` (~L89) — `clock.lastFrameTime = now`

**Problem:** The `onRestart` callback in `createBootstrap` passes `clock.realTimeMs` to `resetClock`, but the clock resource has no `realTimeMs` property — it only has `lastFrameTime` and `simTimeMs`. This means `resetClock` receives `undefined`, which gets stored as `clock.lastFrameTime = undefined`. The next frame's `tickClock` computes `now - clock.lastFrameTime` which produces `NaN`, causing the accumulator and step count to become `NaN`.
**Impact:** After any restart, the simulation freezes or behaves unpredictably. The game cannot recover without a full page reload.

**Fix:** Pass a finite timestamp to `resetClock`:
```js
// In bootstrap.js onRestart callback:
onRestart: () => {
  resetClock(clock, performance.now());
},
```

**Tests to add:** Integration test: start game → restart → verify `stepFrame` returns finite step count and monotonically increasing `simTimeMs`.

---

### BUG-02: Final level completion does not transition to VICTORY ⬆ Critical
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/level-loader.js` (~L114) — `advanceLevel` returns `null` at last level
- `src/game/game-flow.js` (~L82-89) — `startGame` LEVEL_COMPLETE flow

**Problem:** When the player completes Level 3 and `startGame()` is called from `LEVEL_COMPLETE` state, `levelLoader.advanceLevel()` returns `null` because there is no Level 4. The code then calls `safeTransition(gameStatus, GAME_STATE.PLAYING)` anyway, transitioning back to `PLAYING` with no level loaded. The player never sees the Victory screen.
**Impact:** Endgame is broken — the final level loops endlessly instead of showing the victory screen.

**Fix:**
```js
if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
  const nextLevel = levelLoader.advanceLevel({ reason: 'level-complete' });
  if (nextLevel === null) {
    return safeTransition(gameStatus, GAME_STATE.VICTORY);
  }
  applyPauseFromState(clock, gameStatus);
  return gameStatus.currentState === GAME_STATE.PLAYING;
}
```

**Tests to add:** Unit test in `game-flow.test.js` proving `advanceLevel` returning `null` triggers `VICTORY` transition.

---

### BUG-03: Game enters PLAYING with null map resource (fail-open) ⬆ Critical
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L70) — `startGame` called without map validation
- `src/game/level-loader.js` (~L95) — `loadLevel` can return `null`
- `src/game/game-flow.js` (~L81) — transitions to `PLAYING` regardless of load result

**Problem:** `levelLoader.loadLevel()` returns `null` when the map provider is not wired (which it currently isn't — no maps are preloaded and passed to bootstrap). The `startGame()` function checks only the state transition result, not whether a map was actually loaded. The game enters `PLAYING` with no map resource, guaranteeing that any system querying the map will crash.
**Impact:** The game cannot start successfully in its current state. Any gameplay system that reads the map resource will throw.

**Fix:** Validate map load before transitioning to `PLAYING`:
```js
if (gameStatus.currentState === GAME_STATE.MENU) {
  if (!safeTransition(gameStatus, GAME_STATE.PLAYING)) {
    return false;
  }
  if (levelLoader && typeof levelLoader.loadLevel === 'function') {
    const map = levelLoader.loadLevel(levelIndex, { reason: 'start-game' });
    if (!map) {
      // Fail closed — revert to MENU and surface error
      safeTransition(gameStatus, GAME_STATE.MENU);
      throw new Error(`Failed to load level ${levelIndex}.`);
    }
  }
  applyPauseFromState(clock, gameStatus);
  return true;
}
```

**Tests to add:** Unit test where `loadMapForLevel` returns `null`, asserting game stays in `MENU` and throws/errors.

---

### BUG-04: `startGame()` is non-idempotent when already PLAYING ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/game-flow.js` (~L90-92) — falls through to `return gameStatus.currentState === GAME_STATE.PLAYING`
- `src/main.ecs.js` (~L156-160) — caller uses return value to trigger `resyncTime`

**Problem:** When `startGame()` is called while the game is already in `PLAYING` state, none of the explicit state branches match, so the function falls through to `return gameStatus.currentState === GAME_STATE.PLAYING` which is `true`. The caller in `main.ecs.js` interprets `true` as "a state change occurred" and calls `resyncTime(getNow())`, resetting the timing baseline mid-gameplay.
**Impact:** Double-clicks or race conditions calling `startGame()` during active gameplay reset the frame probe baseline, causing frame skips or stutter.

**Fix:** Return `false` when already in `PLAYING`:
```js
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false;
}
```

**Tests to add:** Idempotency test: call `startGame()` twice → second call returns `false` and does not call `resyncTime`.

---

### BUG-05: Out-of-bounds map access not guarded ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L393) — `getCell(map, row, col)` with no bounds check
- `src/ecs/resources/map-resource.js` (~L410) — `isPassable()` delegates to `getCell` without bounds guard

**Problem:** `getCell` computes `map.grid[row * map.cols + col]` without validating that `(row, col)` is within grid bounds. Out-of-range coordinates return `undefined` from `Uint8Array`, which downstream logic treats as `0` (EMPTY), making out-of-bounds tiles passable.
**Impact:** Movement systems near map edges can query invalid positions as traversable, allowing actors to escape the grid.

**Fix:** Add bounds guard to `getCell`:
```js
export function getCell(map, row, col) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    return CELL_TYPE.INDESTRUCTIBLE; // Treat OOB as wall
  }
  return map.grid[row * map.cols + col];
}
```

**Tests to add:** Negative and overflow coordinate tests in `map-resource.test.js`.

---

### BUG-06: `tickClock` maxDelta uses hardcoded `10` instead of `maxStepsPerFrame` ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/clock.js` (~L70) — `const maxDelta = fixedDtMs * 10;`

**Problem:** The max delta clamp uses a hardcoded multiplier of `10` instead of the passed `maxStepsPerFrame` parameter (default `5`). This allows the accumulator to grow to `10 * fixedDtMs` before clamping, but `maxStepsPerFrame` limits execution to only `5` steps. The leftover `5 * fixedDtMs` stays in the accumulator, capping alpha near `1.0` instead of `0`.
**Impact:** After a tab-throttle event, interpolation factor (`alpha`) will be stuck near `1.0` for several frames, causing visual stutter during catch-up.

**Fix:** Use the parameter:
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

**Tests to add:** Clock unit test: simulate large delta (e.g., 500ms) and verify accumulator after `tickClock` is consistent with executed steps.

---

### BUG-07: Semantic validator crashes on malformed map ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L146, ~L157, ~L175) — `validateBorderIntegrity` accesses `grid[0]` etc. without null guards

**Problem:** If `grid` is `undefined` or has fewer rows than expected, the validator throws `TypeError` (cannot read property of undefined) instead of accumulating a validation error.
**Impact:** Malformed map payloads cause runtime crashes rather than controlled rejection with diagnostic messages.

**Fix:** Add dimension preflight before border checks:
```js
if (grid.length < rows || grid.some((r) => !Array.isArray(r) || r.length < cols)) {
  errors.push('grid dimensions do not match declared rows/columns');
  return { ok: false, errors };
}
```

---

### BUG-08: `loadLevel` commits level index before successful map resolve ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/level-loader.js` (~L91) — `currentLevelIndex = clampLevelIndex(...)` happens before map resolve

**Problem:** If `resolveMapForLevel` returns `null` (e.g., map provider not wired), the level index is still updated, desynchronizing the loader state from the world resource.
**Impact:** Subsequent `restartCurrentLevel` calls attempt to reload a level that was never successfully loaded.

**Fix:** Resolve map first, commit index only on success:
```js
function loadLevel(levelIndex, options = {}) {
  const resolvedIndex = clampLevelIndex(levelIndex, maxLevelIndex);
  const mapResource = resolveMapForLevel(resolvedIndex, options);
  if (!mapResource) {
    return null;
  }
  currentLevelIndex = resolvedIndex;
  if (world && typeof world.setResource === 'function') {
    world.setResource(mapResourceKey, mapResource);
  }
  cachedMapResource = mapResource;
  return mapResource;
}
```

---

### BUG-09: Event queue `orderCounter` never resets between frames ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` — no call to `resetOrderCounter`

**Problem:** The JSDoc for `resetOrderCounter` claims it's "called once per fixed simulation step" but no code actually calls it. The counter grows monotonically throughout a play session.
**Impact:** Over very long sessions (hours), the counter approaches `Number.MAX_SAFE_INTEGER`, at which point deterministic sort ordering breaks.

**Fix:** Call `resetOrderCounter` at the start of each frame's event processing phase, or document that consumers must drain events each frame.

---

### BUG-10: `drain()` allocates a new sorted array every call ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L67) — `queue.events.slice().sort(...)`

**Problem:** `drain()` creates a new sorted copy of events every frame, violating the "no recurring allocations in hot loops" principle.
**Impact:** Minor GC pressure per frame.

**Fix:** Sort in-place and then clear:
```js
export function drain(queue) {
  queue.events.sort((a, b) => a.frame !== b.frame ? a.frame - b.frame : a.order - b.order);
  const result = queue.events.slice();
  queue.events.length = 0;
  return result;
}
```
Or accept that `drain` returns a new array by design (once-per-frame allocation is acceptable if event count is small).

---

## 2) Dead Code & Unused References

### DEAD-01: `createSyncMapLoader` restart branch is identical to default ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/level-loader.js` (~L51-64) — both `if (options.restart)` and else branches call `cloneMap(baseMap)`

**Problem:** The `restart` option implies different semantics but both branches do the same thing. This misleads readers into thinking restart vs. non-restart loads behave differently.
**Impact:** Redundant API surface implies unsupported mode distinction.

**Fix:** Collapse to a single return path:
```js
return cloneMap(baseMap);
```

---

### DEAD-02: `cachedMapResource` option parameter is never read ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/level-loader.js` (~L86) — `cachedMapResource` passed to `loadMapForLevel` but never used inside

**Problem:** `resolveMapForLevel` spreads `options` (which includes `cachedMapResource`) into the call, but the sync loader at L48 doesn't use it. Dead plumbing.
**Impact:** Adds API surface complexity without runtime effect.

**Fix:** Remove `cachedMapResource` from the options spread until a loader implementation actually needs it.

---

### DEAD-03: `shared/` directory is empty (placeholder) ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `src/shared/` — contains only `.gitkeep`

**Problem:** The implementation plan declares `src/shared/result.js` and `src/shared/utils.js` but neither file exists.
**Impact:** Documentation/code drift. Not a functional issue yet but signals incomplete scaffolding.

**Fix:** Either implement the planned shared utilities or remove the directory reference from the implementation plan.

---

### DEAD-04: JSDoc claims `isPassable(map, row, col, isGhost)` but implementation has 3 params ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L26) — JSDoc lists 4 parameters
- `src/ecs/resources/map-resource.js` (~L399) — implementation has 3 parameters

**Problem:** `isPassable` JSDoc documents an `isGhost` parameter that doesn't exist in the implementation. A separate `isPassableForGhost` function exists.
**Impact:** Onboarding confusion; callers may pass a fourth argument that is silently ignored.

**Fix:** Align JSDoc with actual signature.

---

### DEAD-05: `package.json` has duplicate/overlapping policy scripts ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L26-35) — `policy`, `policy:repo`, `policy:quality`, `policy:checks`, `policy:checks:local`, `policy:trace`, `policy:forbid`, `policy:forbidrepo`, `policy:header`, `policy:headerrepo`, `policy:approve`, `policy:prep`

**Problem:** Many scripts are internal sub-steps (e.g., `policy:forbidrepo`, `policy:headerrepo`) that are not referenced by CI or documented for developers.
**Impact:** Script sprawl increases maintenance burden.

**Fix:** Document which scripts are user-facing vs. internal. Consider consolidating under `npm run policy -- --scope=repo`.

---

### DEAD-06: `normalizeSystemRegistration` forces phase override ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-02)
- `src/game/bootstrap.js` (~L36-55) — `normalizeSystemRegistration` spreads `registration` then overwrites `phase`

**Problem:** If a system declares `phase: 'physics'` but is registered under `'logic'`, the function silently overrides to `'logic'` after throwing an error. The throw happens first, making the override branch dead code.
**Impact:** Minor — the error path is the active behavior.

**Fix:** Remove the dead override branch; the throw is sufficient.

---

### DEAD-07: `getRenderIntentView` allocates per-frame in production ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-04)
- `src/ecs/render-intent.js` (~L114) — creates new `Array(buffer._count)` with objects

**Problem:** This function is designed for tests/debugging but nothing prevents a render system from calling it in the hot path, where it creates per-entry objects.
**Impact:** Allocation pressure if misused.

**Fix:** Add `@internal` or `@test-only` JSDoc annotation and consider guarding with `NODE_ENV === 'development'` check.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Render pipeline is not wired into runtime bootstrap ⬆ Blocking
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "MUST batch DOM writes in a dedicated render commit phase once per frame." and "MUST separate render read/compute from DOM write commit phases."
**Files:** Ownership: Track A (Tickets: A-03), Track D (Tickets: D-07, D-08)
- `src/main.ecs.js` (~L192) — `bootstrap.stepFrame` runs simulation only
- `src/game/bootstrap.js` (~L86) — no render systems registered
- `src/ecs/systems/` — `render-collect-system.js` and `render-dom-system.js` do not exist

**Problem:** The frame loop calls `world.runFixedStep()` which runs registered systems, but no render-collect or render-DOM systems exist or are registered. The render-intent buffer (`src/ecs/render-intent.js`) is pre-allocated but never consumed. There is zero visual output pipeline.
**Impact:** The game has no rendering. This is a P0 foundation gap — the render contract exists but is not implemented. Per the ticket tracker, D-06, D-07, D-08, D-09 are all `[ ]` Not Started.

**Fix:** This is a phase-appropriate gap — render systems are P1 tickets (D-07, D-08). The architecture is sound (render-intent buffer, classBits, pool sizes are defined). The fix is implementation work in P1.

---

### ARCH-02: Restart flow bypasses deferred structural mutation ⬆ Critical
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "MUST defer entity/component add/remove operations to a controlled sync point."
**Files:** Ownership: Track A (Tickets: A-02, A-03)
- `src/game/game-flow.js` (~L41-61) — `destroyAllEntities` directly accesses `world.entityStore`
- `src/ecs/world/world.js` (~L69) — `destroyEntity` is callable immediately

**Problem:** `destroyAllEntities` in `game-flow.js` directly accesses `world.entityStore.getActiveIds()` and calls `world.destroyEntity(handle)` for each entity. This violates ECS encapsulation (reaching into `entityStore`) and performs immediate structural mutation outside the deferred sync point.
**Impact:** During restart, entities are destroyed immediately. If any system is still running or if the mutation order matters, this creates determinism risk. Also leaks internal `entityStore` reference.

**Fix:** Add a world-level batch teardown API:
```js
// In world.js:
destroyAllEntities() {
  const activeIds = this.entityStore.getActiveIds();
  for (const id of activeIds) {
    const generation = this.entityStore.generations[id];
    this.deferDestroyEntity({ id, generation });
  }
  this.applyDeferredMutations();
}
```
Then call `world.destroyAllEntities()` from game-flow instead of direct entityStore access.

---

### ARCH-03: Input adapter is not registered as a World resource ⬆ Critical
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "Adapters MUST be registered as World resources and accessed through the resource API."
**Files:** Ownership: Track A (Tickets: A-03), Track B (Tickets: B-02)
- `src/game/bootstrap.js` (~L86) — no `world.setResource('inputAdapter', ...)` call
- `src/ecs/systems/input-system.js` (~L37) — reads `context.world.getResource('inputAdapter')`
- `src/main.ecs.js` — `createInputAdapter` is never called

**Problem:** The input system expects an `inputAdapter` resource, but bootstrap never creates or registers one. The `createInputAdapter` function exists in `src/adapters/io/input-adapter.js` but is never imported or called in the bootstrap chain.
**Impact:** The input system silently returns (no adapter found → early return). Keyboard input has zero effect on simulation.

**Fix:** Wire input adapter into bootstrap:
```js
import { createInputAdapter } from '../adapters/io/input-adapter.js';

const inputAdapter = createInputAdapter();
world.setResource('inputAdapter', inputAdapter);
world.setResource('inputState', createInputStateStore(MAX_ENTITIES));
```
And ensure adapter teardown on game stop.

---

### ARCH-04: Component stores are not wired into the World ⬆ Critical
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "SHOULD use data-oriented storage and stable iteration order on hot paths."
**Files:** Ownership: Track B (Tickets: B-01), Track A (Tickets: A-02)
- `src/ecs/components/*.js` — store factory functions exist
- `src/ecs/world/world.js` — no component store registration

**Problem:** Component stores (`createPositionStore`, `createPlayerStore`, etc.) are factory functions that return typed arrays, but they are never instantiated or registered with the World. Systems that try to read/write component data (e.g., `inputState.up[entityId]`) will fail because the stores don't exist.
**Impact:** No component data is available. All simulation systems will crash or produce undefined results when they try to access stores.

**Fix:** Create a component store registry in the World or bootstrap:
```js
// In bootstrap:
const maxEntities = 10_000;
const stores = {
  position: createPositionStore(maxEntities),
  player: createPlayerStore(maxEntities),
  // ... all stores
};
world.setResource('stores', stores);
```

---

### ARCH-05: Event queue resource not registered in bootstrap ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "MUST process cross-system events in deterministic insertion order."
**Files:** Ownership: Track D (Tickets: D-01), Track A (Tickets: A-03)
- `src/ecs/resources/event-queue.js` — factory exists
- `src/game/bootstrap.js` — no `world.setResource('eventQueue', ...)` call

**Problem:** The event queue resource is defined but never instantiated or registered. Systems that emit or consume events will find no queue.
**Impact:** Deterministic cross-system event pipeline is non-functional.

**Fix:** Register event queue in bootstrap:
```js
import { createEventQueue } from '../ecs/resources/event-queue.js';
world.setResource('eventQueue', createEventQueue());
```

---

### ARCH-06: Render-intent contract aligns with spec but has no consumer ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "Render Intent: Data prepared by simulation for visual updates before DOM commit."
**Files:** Ownership: Track D (Tickets: D-04, D-07, D-08)
- `src/ecs/render-intent.js` — buffer pre-allocated with typed arrays, classBits bitmask ✓
- No render-collect-system or render-dom-system exists

**Problem:** The render-intent buffer is correctly designed (pre-allocated, classBits integer, capacity matches `MAX_RENDER_INTENTS` from constants). However, no system writes into it (render-collect doesn't exist) and no system reads from it (render-DOM doesn't exist).
**Impact:** Architecture is sound but unimplemented. This is a P1 implementation gap, not an architectural flaw.

**Fix:** Implement D-07 (render-collect-system) and D-08 (render-dom-system) per the existing contract.

---

### ARCH-07: Board dimensions in CSS don't match map dimensions ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "MUST preserve single-player gameplay and genre alignment with requirements docs."
**Files:** Ownership: Track D (Tickets: D-05)
- `styles/variables.css` (~L82-85) — `--board-columns: 21; --board-rows: 17;`
- `assets/maps/level-1.json` — `dimensions: { columns: 15, rows: 11 }`

**Problem:** CSS declares a 21×17 grid (357 cells) but the Level 1 map is 15×11 (165 cells). The CSS board is more than double the size of the actual map.
**Impact:** When the board renders, there will be 192 empty CSS grid cells with no corresponding map data. The visual layout will look wrong — most of the grid will be empty.

**Fix:** Align CSS variables with map dimensions:
```css
--board-columns: 15;
--board-rows: 11;
```
Or make board dimensions dynamic based on loaded map.

---

### ARCH-08: No adapter lifecycle teardown on game stop ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "Adapters MUST be registered as World resources."
**Files:** Ownership: Track A (Tickets: A-03), Track B (Tickets: B-02)
- `src/main.ecs.js` (~L220-228) — `stop()` removes DOM listeners but adapters aren't registered
- `src/adapters/io/input-adapter.js` (~L153) — `destroy()` method exists but is never called

**Problem:** When `runtime.stop()` is called, DOM event listeners on window/document are removed, but the input adapter (once wired) has its own listeners and `destroy()` method that will never be invoked.
**Impact:** Memory leak — adapter event listeners persist after game stop.

**Fix:** Call `inputAdapter.destroy()` in the runtime stop path.

---

### ARCH-09: `World.runFixedStep` lacks frame context for alpha/interpolation ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "Frame Context & Clock: `alpha` — Render interpolation factor."
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L130) — `stepContext` spreads into context but `alpha` is passed from `bootstrap.stepFrame`

**Problem:** The `World.runFixedStep` method correctly receives `alpha`, `dtMs`, `isPaused`, `simTimeMs` in its stepContext. However, the world doesn't store or expose these values as resources — systems must read them from the context object passed each frame. This is architecturally acceptable but means systems can't access frame context outside the `update` call.
**Impact:** Minor — systems need to read frame context from `context` parameter. No functional issue for P0.

---

### ARCH-10: Game flow FSM doesn't support RESTART from PLAYING state ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: "Pause Menu: MUST preserve actions: Continue and Restart."
**Files:** Ownership: Track A (Tickets: A-03)
- `src/ecs/resources/game-status.js` (~L50-58) — `VALID_TRANSITIONS[PLAYING]` does not include `PLAYING`
- `src/game/game-flow.js` (~L96-114) — `restartLevel` transitions PAUSED → PLAYING then restarts

**Problem:** The FSM allows `PLAYING → PAUSED → PLAYING` for restart, but not `PLAYING → PLAYING` directly. `restartLevel` first transitions from PAUSED to PLAYING (if paused), then restarts. This works but means you can't restart from active gameplay without first pausing.
**Impact:** UX friction — user must press ESC/P, then select Restart. A direct Restart action would be blocked by FSM.

**Fix:** Add `PLAYING → PLAYING` as a valid transition (self-transition for restart), or document that restart always goes through pause menu.

---

## 4) Code Quality & Security

### SEC-01: No CSP meta tag in `index.html` ⬆ High
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `index.html` (~L4-6) — no `<meta http-equiv="Content-Security-Policy">`

**Problem:** `AGENTS.md` mandates: "SHOULD enforce strict CSP and Trusted Types where deployment allows. During development with Vite, CSP enforcement MAY be relaxed to allow HMR inline scripts. Production builds MUST enforce strict CSP." No CSP meta tag exists even as a development-time placeholder.
**Impact:** No defense-in-depth against DOM injection vulnerabilities. Any future use of unsafe sinks would go undetected by browser policy.

**Fix:** Add a development-relaxed CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;">
```
And tighten for production builds via Vite config.

---

### SEC-02: Schema validation script fails open on missing files ⬆ High
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` — missing schema/data files log `console.warn` and continue

**Problem:** If the JSON schema or map files are missing, the validation script warns but exits 0 (success). This means CI passes even when no validation occurs.
**Impact:** Tampered or missing map assets can bypass CI validation entirely.

**Fix:** Treat missing required files as hard failures (exit 1).

---

### SEC-03: Policy-gate scan excludes its own files ⬆ High
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `scripts/policy-gate/run-checks.mjs` (~L653) — `if (normalizedPath.startsWith('scripts/policy-gate/')) continue;`

**Problem:** The security and architecture boundary scan skips all policy-gate files. This means a PR that modifies `run-checks.mjs` could weaken forbidden-pattern detection and pass its own gate.
**Impact:** Self-modification bypass. Governance code can be weakened without detection.

**Fix:** Require separate review for policy-gate changes, or run a second pass with policy-gate files included.

---

### SEC-04: No `unhandledrejection` handler in production build pipeline ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L110-125) — handler installed at runtime bootstrap
- `vite.config.js` — no CSP or error-handling injection for production

**Problem:** The unhandled rejection handler is installed in `main.ecs.js` but only when the browser runs the module. If the module fails to load (e.g., 404, syntax error), the handler is never installed and the failure is silent.
**Impact:** Critical boot failures go unreported to the user.

**Fix:** Add an inline script (or external script loaded before the module) that installs a global error handler as a safety net:
```html
<script>window.onerror = function(msg, url, line) { /* show error overlay */ };</script>
```

---

### SEC-05: `localStorage` not validated on read (trust boundary) ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05) — not yet implemented
- No `storage-adapter.js` exists yet

**Problem:** Per `AGENTS.md`: "MUST treat `localStorage`/`sessionStorage` data as untrusted input and validate on read." The storage adapter (C-05) doesn't exist yet, but when it does, it must validate.
**Impact:** Future XSS or data injection via tampered localStorage.

**Fix:** When implementing C-05, add JSON schema validation for all localStorage reads.

---

### SEC-06: No `var`, `require`, or `XMLHttpRequest` found ⬆ Info (Pass)
**Origin:** 4. Code Quality & Security
**Scope:** Full `src/` scan

**Finding:** Codebase correctly uses `const`/`let`, ES module `import`, and `fetch` patterns. No forbidden legacy JS detected.

---

### SEC-07: No `<canvas>`, WebGL, or WebGPU found ⬆ Info (Pass)
**Origin:** 4. Code Quality & Security
**Scope:** Full `src/` + `index.html` scan

**Finding:** No canvas elements or GPU APIs detected. Project is pure DOM/CSS as required.

---

### SEC-08: All DOM sinks are safe (textContent only) ⬆ Info (Pass)
**Origin:** 4. Code Quality & Security
**Scope:** Full `src/` scan for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`

**Finding:** No unsafe DOM sinks found. `overlayRoot.textContent` is used for error messages — safe.

---

## 5) Tests & CI Gaps

### CI-01: Audit tests are inventory-only — no behavioral assertions ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Violated rule:** AGENTS.md: "MUST maintain end-to-end/integration verification coverage for every question in `docs/audit.md`"
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.e2e.test.js` (~L6-23) — only counts audit IDs
- `playwright.config.js` (~L6) — `testIgnore: ['**/audit/**']` — Playwright excludes audit folder

**Problem:** The audit test file runs under Vitest (not Playwright) and only validates that `AUDIT_QUESTIONS` has 27 entries with correct category counts. It does not execute any behavioral assertions for any audit question. Meanwhile, Playwright is configured to ignore the audit folder entirely.
**Impact:** Zero audit behavioral verification exists. The project cannot prove it passes any of the 27 audit questions (F-01 through F-21, B-01 through B-06).

**Fix:** Convert audit inventory to executable Playwright tests:
- F-01 through F-16, B-01 through B-04: Fully automatable Playwright browser tests.
- F-17, F-18, B-05: Semi-automatable via `page.evaluate()` + Performance API.
- F-19, F-20, F-21, B-06: Manual evidence collection (document as PR artifacts).

---

### CI-02: Merge gate does not require Playwright E2E ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-01, A-06)
- `.github/workflows/policy-gate.yml` (~L51) — runs `npm run policy` only
- `package.json` — `ci` script runs `check + test + coverage + validate:schema + sbom` — no `test:e2e`

**Problem:** The CI pipeline runs Biome, Vitest, schema validation, and SBOM, but never runs Playwright. Browser-level regressions can merge without detection.
**Impact:** The highest-value test category (E2E/browser) is completely absent from CI.

**Fix:** Add a Playwright job to the CI workflow:
```yaml
- name: Run E2E tests
  run: npx playwright install --with-deps && npm run test:e2e
```

---

### CI-03: Coverage includes test files ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-01)
- `vitest.config.js` (~L11) — `include: ['src/**/*.js', 'tests/**/*.js']`

**Problem:** Coverage target includes `tests/**/*.js`, inflating coverage metrics by counting test code as covered production code.
**Impact:** Coverage signal overstates actual production-code verification.

**Fix:** Restrict to source only:
```js
coverage: {
  include: ['src/**/*.js'],
  exclude: ['tests/**'],
}
```

---

### CI-04: No E2E coverage for pause, score, timer, lives, or movement ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/` — only `game-loop.pause.spec.js` and `game-loop.unhandled-rejection.spec.js` exist
- `playwright.config.js` — `testIgnore: ['**/audit/**']`

**Problem:** Only 2 E2E spec files exist, covering pause loop continuity and unhandled rejection handling. No browser tests exist for:
- F-07: Pause menu display (Continue/Restart options)
- F-08: Continue resumes gameplay
- F-09: Restart resets level
- F-11: Player obeys keyboard commands
- F-12: Hold-to-move
- F-14: Timer/countdown
- F-15: Score increases
- F-16: Lives decrease

**Impact:** Critical user-facing behaviors are unverified in a real browser.

**Fix:** Add Playwright specs for each missing audit question.

---

### CI-05: Integration/adapters directory is empty ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05)
- `tests/integration/adapters/` — contains only `.gitkeep`
- `tests/integration/gameplay/` — 3 test files exist (game-loop, error-handling, level-loader)

**Problem:** Per `AGENTS.md`: "Adapter Tests: For renderer and input boundaries." The adapter integration test directory is empty. Only the input adapter has one integration test (`input-adapter.test.js`).
**Impact:** Adapter contracts (input normalization, DOM safety, sprite pool behavior) are untested at the integration layer.

**Fix:** Add jsdom integration tests for all adapters when they are implemented.

---

### CI-06: Unit tests exist for shipped code — 258 tests passing ⬆ Info (Pass)
**Origin:** 5. Tests & CI Gaps
**Finding:** 20 unit test files and 4 integration test files exist with 258 passing tests. Coverage is good for P0-shipped code:
- All resources tested (clock, rng, event-queue, game-status, constants, map-resource)
- All component stores tested (actors, props, spatial, stats, visual, registry)
- World engine tested (entity-store, query, world)
- Game flow tested (game-flow, level-loader)
- Input system tested

**Gap:** No tests for systems that don't exist yet (movement, collision, bomb, explosion, AI, scoring, timer, lives, pause, spawn, render-collect, render-dom).

---

### CI-07: Policy gate header check is warn-only in CI ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `.github/workflows/policy-gate.yml` (~L20) — `POLICY_HEADER_MODE: warn`

**Problem:** `AGENTS.md` states: "Each file MUST begin with a comment block that explains the file's purpose." The header check runs in warn mode in CI, meaning missing headers don't fail the build.
**Impact:** Documentation quality degrades without enforcement.

**Fix:** Change to `POLICY_HEADER_MODE: fail` in CI, keep warn for local dev.

---

### CI-08: `policy:checks` requires PR metadata not available on main ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/run-checks.mjs` — requires `changed-files.txt` and `.policy-pr-meta.json`

**Problem:** The PR-focused policy checks depend on generated artifacts (`changed-files.txt`, `.policy-pr-meta.json`) that are created by `prepare-context.mjs`. If these files don't exist, the checks may fail or produce misleading results on direct branch pushes.
**Impact:** CI noise on non-PR workflows.

**Fix:** Add graceful fallback in `run-checks.mjs` when PR context files are missing (fall back to repo-wide checks).

---

### CI-09: No performance regression testing ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06, A-09)
- No frame-time, long-task, or allocation tests exist

**Problem:** `AGENTS.md` defines detailed performance acceptance criteria (p95 ≤ 16.7ms, ≤ 500ms sustained drops, ≤ 500 DOM elements, no recurring allocations). None of these are tested programmatically.
**Impact:** Performance regressions can merge without detection.

**Fix:** Add Playwright `page.evaluate()` tests using `PerformanceObserver` and `performance.getEntriesByType('frame')` with explicit thresholds.

---

### CI-10: Phase testing report is out of sync with actual test reality ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `docs/audit-reports/phase-testing-verification-report.md` — references phases that don't fully exist
- `docs/implementation/ticket-tracker.md` — 9 tickets done but report claims phase completion

**Problem:** The phase report documents P0 through P4 completion criteria, but the codebase is only at P0 Foundation (9/44 tickets). The report's language implies more maturity than exists.
**Impact:** Misleading release-readiness signals.

**Fix:** Update phase report to reflect current P0-only status and mark P1-P4 as "not yet reached."

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 (Bugs) | Agent 2 (Dead) | Agent 3 (Arch) | Agent 4 (Sec) | Agent 5 (CI) | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | ✓ | — | — | — | — | Track D | Restart clock NaN from undefined timestamp |
| BUG-02 | ✓ | — | — | — | — | Track A | Final level loops instead of VICTORY |
| BUG-03 | ✓ | — | — | — | — | Track A | PLAYING with null map resource |
| BUG-04 | ✓ | — | — | — | — | Track A | startGame() non-idempotent |
| BUG-05 | ✓ | — | — | — | — | Track D | OOB map access unguarded |
| BUG-06 | ✓ | — | — | — | — | Track D | tickClock maxDelta hardcoded |
| BUG-07 | ✓ | — | — | — | — | Track D | Validator crashes on malformed map |
| BUG-08 | ✓ | — | — | — | — | Track A | loadLevel commits index before map resolve |
| BUG-09 | ✓ | — | — | — | — | Track D | Event queue orderCounter never resets |
| BUG-10 | ✓ | — | — | — | — | Track D | drain() allocates per call |
| DEAD-01 | — | ✓ | — | — | — | Track A | Sync loader restart branch dead |
| DEAD-02 | — | ✓ | — | — | — | Track A | cachedMapResource unused |
| DEAD-03 | — | ✓ | — | — | — | Track A | shared/ directory empty |
| DEAD-04 | — | ✓ | — | — | — | Track D | JSDoc param mismatch |
| DEAD-05 | — | ✓ | — | — | — | Track A | Duplicate policy scripts |
| DEAD-06 | — | ✓ | — | — | — | Track A | Dead phase override branch |
| DEAD-07 | — | ✓ | — | — | — | Track D | getRenderIntentView allocates |
| ARCH-01 | — | — | ✓ | — | — | Track A/D | Render pipeline not wired |
| ARCH-02 | — | — | ✓ | — | — | Track A | Restart bypasses deferral |
| ARCH-03 | — | — | ✓ | — | — | Track A/B | Input adapter not registered |
| ARCH-04 | — | — | ✓ | — | — | Track A/B | Component stores not wired |
| ARCH-05 | — | — | ✓ | — | — | Track A/D | Event queue not registered |
| ARCH-06 | — | — | ✓ | — | — | Track D | Render-intent has no consumer |
| ARCH-07 | — | — | ✓ | — | — | Track D | CSS board dims ≠ map dims |
| ARCH-08 | — | — | ✓ | — | — | Track A/B | No adapter teardown on stop |
| ARCH-09 | — | — | ✓ | — | — | Track A | Frame context access pattern |
| ARCH-10 | — | — | ✓ | — | — | Track A | FSM blocks direct restart |
| SEC-01 | — | — | — | ✓ | — | Track A | No CSP meta tag |
| SEC-02 | — | — | — | ✓ | — | Track A | Schema validation fails open |
| SEC-03 | — | — | — | ✓ | — | Track A | Policy-gate self-exclusion |
| SEC-04 | — | — | — | ✓ | — | Track A | Boot failure silent |
| SEC-05 | — | — | — | ✓ | — | Track C | localStorage not validated |
| CI-01 | — | — | — | — | ✓ | Track A | Audit tests inventory-only |
| CI-02 | — | — | — | — | ✓ | Track A | CI lacks Playwright |
| CI-03 | — | — | — | — | ✓ | Track A | Coverage includes tests |
| CI-04 | — | — | — | — | ✓ | Track A | No E2E for audit questions |
| CI-05 | — | — | — | — | ✓ | Track A | Adapter integration tests empty |
| CI-06 | — | — | — | — | ✓ | Track A | 258 unit tests passing (good) |
| CI-07 | — | — | — | — | ✓ | Track A | Header check warn-only in CI |
| CI-08 | — | — | — | — | ✓ | Track A | PR metadata dependency |
| CI-09 | — | — | — | — | ✓ | Track A | No performance regression tests |
| CI-10 | — | — | — | — | ✓ | Track A | Phase report out of sync |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Fix restart clock resync — pass finite timestamp instead of `clock.realTimeMs` (Track D)
2. **ARCH-01**: Acknowledge render pipeline is P1 gap — document in ticket tracker (Track A/D)
3. **ARCH-02**: Add `world.destroyAllEntities()` with deferred mutation (Track A)
4. **BUG-02**: Fix final-level VICTORY transition — check `advanceLevel()` return value (Track A)
5. **BUG-03**: Fail closed on null map load before entering PLAYING (Track A)
6. **ARCH-03**: Wire input adapter into bootstrap as World resource (Track A/B)
7. **ARCH-04**: Wire component stores into bootstrap (Track A/B)
8. **CI-01**: Begin converting audit inventory to executable Playwright tests (Track A)
9. **CI-02**: Add Playwright E2E to CI merge gate (Track A)

### Phase 2 — High Severity (immediate follow-up)
1. **BUG-04**: Make `startGame()` idempotent when already PLAYING (Track A)
2. **BUG-05**: Add OOB bounds guard to `getCell` and `isPassable` (Track D)
3. **ARCH-05**: Register event queue resource in bootstrap (Track A/D)
4. **ARCH-07**: Align CSS board dimensions with map dimensions (Track D)
5. **SEC-01**: Add CSP meta tag to index.html (Track A)
6. **SEC-02**: Make schema validation fail on missing files (Track A)
7. **SEC-03**: Require separate review for policy-gate changes (Track A)
8. **CI-03**: Exclude test files from coverage target (Track A)
9. **CI-04**: Add Playwright specs for pause, HUD, movement audit questions (Track A)
10. **CI-05**: Add adapter integration tests when adapters ship (Track A)

### Phase 3 — Medium Severity
1. **BUG-06**: Use `maxStepsPerFrame` in tickClock maxDelta (Track D)
2. **BUG-07**: Add preflight guards to map semantic validator (Track D)
3. **BUG-08**: Commit level index only after successful map resolve (Track A)
4. **BUG-09**: Reset event queue orderCounter per frame (Track D)
5. **DEAD-01**: Collapse identical restart branches in sync loader (Track A)
6. **DEAD-02**: Remove unused `cachedMapResource` option (Track A)
7. **DEAD-06**: Remove dead phase override branch (Track A)
8. **ARCH-08**: Wire adapter teardown into runtime stop path (Track A/B)
9. **ARCH-10**: Consider adding PLAYING self-transition for restart (Track A)
10. **SEC-04**: Add inline error handler as boot failure safety net (Track A)
11. **CI-07**: Change header check to fail mode in CI (Track A)
12. **CI-08**: Add graceful fallback for missing PR context files (Track A)
13. **CI-09**: Add PerformanceObserver-based regression tests (Track A)
14. **CI-10**: Update phase report to reflect P0-only status (Track A)

### Phase 4 — Low Severity (maintenance)
1. **BUG-10**: Accept or optimize drain() allocation (Track D)
2. **DEAD-03**: Implement or remove `src/shared/` planned files (Track A)
3. **DEAD-04**: Align `isPassable` JSDoc with implementation (Track D)
4. **DEAD-05**: Consolidate/duplicate policy scripts (Track A)
5. **DEAD-07**: Mark `getRenderIntentView` as test-only (Track D)

---

## Notes

- **P0 context**: The codebase is at P0 Foundation completion. 9 of 44 tickets are done. Resources, world engine, component stores, input adapter, game flow, and level loader are shipped. Most gameplay systems are not yet implemented. Many findings are "gap" rather than "bug" — the architecture is defined but not wired.
- **Prior audit overlap**: A previous audit (2026-04-11) found 64 issues including many of the same findings (restart clock, VICTORY transition, map fail-open, audit inventory). This report consolidates and updates those findings against the current codebase state. Key findings from the prior report that remain unfixed: BUG-01 (restart clock), BUG-02 (VICTORY transition), BUG-03 (map fail-open), CI-01 (audit inventory), SEC-03 (policy-gate self-exclusion).
- **Positive findings**: No unsafe DOM sinks, no canvas/WebGL, no forbidden JS (`var`/`require`/`XMLHttpRequest`), 258 unit tests passing, clean Biome lint, clean component store design (typed arrays, classBits bitmask), well-structured event queue, solid entity store with generation-based recycling.
- **Architecture is sound**: The ECS design (SoA storage, bitmask queries, deferred mutations, render-intent buffer with classBits, adapter-as-resource pattern) aligns with AGENTS.md requirements. The gaps are implementation, not architecture.

---

*End of report.*
