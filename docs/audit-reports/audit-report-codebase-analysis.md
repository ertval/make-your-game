# Codebase Analysis & Audit Report

**Date:** April 10, 2026  
**Scope:** Full codebase review for bugs, errors, dead code, unused references, and architectural issues  
**Project:** make-your-game (Modern JavaScript 2026 DOM + ECS Game)

---

## Executive Summary

Five parallel analysis passes were conducted across the codebase covering:
1. **Bugs & Logic Errors** — runtime failures, incorrect behavior, race conditions
2. **Dead Code & Unused References** — unused exports, unreachable code, stale imports
3. **Architecture & ECS Violations** — boundary violations, pattern violations
4. **Code Quality & Security** — unsafe patterns, missing validation, CSP issues
5. **Tests & CI Gaps** — missing coverage, flaky tests, configuration issues

**Findings Summary:**
- 🔴 **Critical:** 0
- 🟠 **High:** 4
- 🟡 **Medium:** 5
- 🟢 **Low/Info:** 12

---

## 🔴 Critical Findings

*None identified.*

---

## 🟠 High Severity

### H-01: `startGame()` Returns `true` When Already Playing — Causes Mid-Game Clock Reset

**Files:**
- `src/game/game-flow.js` (lines 90-92)
- `src/main.ecs.js` (lines 156-160)

**Problem:** When `startGame()` is called while the game is already in `PLAYING` state, it returns `true`. The caller in `main.ecs.js` uses this return value to decide whether to call `resyncTime(getNow())`, which resets the timing baseline mid-gameplay. This can cause frame skips or stutters.

**Impact:** UI double-clicks or race conditions calling `startGame()` during active gameplay would reset the clock baseline, causing the next frame to see a very small delta and not advance simulation steps.

**Fix:**
```js
// In game-flow.js startGame():
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false; // Already playing, no action needed
}
```

---

### H-02: Last-Level Completion Replays Level Instead of Triggering VICTORY

**File:** `src/game/game-flow.js` (lines 82-89)

**Problem:** When on the last level and achieving LEVEL_COMPLETE, `advanceLevel()` returns `null` (no next level exists), but the game still transitions to `PLAYING` state instead of `VICTORY`. This replays the last level rather than showing the victory screen.

**Impact:** Players completing the final level never see the victory screen — the last level just restarts.

**Fix:**
```js
// In game-flow.js startGame(), when currentState is LEVEL_COMPLETE:
if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
  const nextLevel = levelLoader.advanceLevel({ reason: 'level-complete' });
  if (nextLevel === null) {
    // No more levels — transition to victory
    return safeTransition(gameStatus, GAME_STATE.VICTORY);
  }
  applyPauseFromState(clock, gameStatus);
  return gameStatus.currentState === GAME_STATE.PLAYING;
}
```

---

### H-03: ECS World Exposes Mutable Internal State — `entityStore` and `systemOrder`

**File:** `src/ecs/world/create-world.js`

**Problem:** `getEntityStore()` and `getSystemOrder()` return direct references to internal arrays/objects. External code can mutate these without going through the world API, breaking ECS encapsulation and potentially causing simulation corruption.

**Impact:** Any system or external code holding a reference to the entity store could corrupt entity tracking, causing crashes or silent data corruption.

**Fix:**
```js
getEntityStore() {
  return {
    hasComponent: (entity, componentType) =>
      this.entityStore.hasComponent(entity, componentType),
    getComponent: (entity, componentType) =>
      this.entityStore.getComponent(entity, componentType),
    // ... expose only safe methods
  };
}
```

---

### H-04: `EntityStore` Missing Boundary Validation in `hasComponent`/`getComponent`

**File:** `src/ecs/world/entity-store.js` (lines 55-66)

**Problem:** No bounds checking on entity ID access. An invalid or stale entity ID can cause array out-of-bounds access or return garbage data.

**Impact:** Silent data corruption or crashes when systems query destroyed entities.

**Fix:**
```js
hasComponent(entityHandle, componentType) {
  const { id, generation } = entityHandle;
  if (id < 0 || id >= this.generations.length) return false;
  if (this.generations[id] !== generation) return false;
  const mask = this.componentMasks[id];
  return mask !== undefined && (mask & (1 << componentType)) !== 0;
}
```

---

## 🟡 Medium Severity

### M-01: `createSyncMapLoader` Has Dead Conditional — Both Branches Identical

**File:** `src/game/level-loader.js` (lines 51-61)

**Problem:** The `if (options.restart)` check has identical code in both branches (`cloneMap(baseMap)`). This is dead code that misleads readers into thinking restart vs. non-restart loads behave differently.

**Fix:** Either remove the conditional entirely (always clone) or implement different behavior for non-restart loads (e.g., return cached clone).

---

### M-02: `isPassable` JSDoc Documents Non-Existent `isGhost` Parameter

**File:** `src/ecs/resources/map-resource.js` (line 26 JSDoc vs line 449 implementation)

**Problem:** JSDoc claims `isPassable(map, row, col, isGhost)` but implementation is `isPassable(map, row, col)`. A separate `isPassableForGhost` function exists. Callers passing `isGhost=true` will get incorrect results silently.

**Fix:** Either add the `isGhost` parameter to `isPassable` or fix the JSDoc to remove the documented parameter.

---

### M-03: `tickClock` maxDelta Uses Hardcoded Multiplier Instead of `maxStepsPerFrame`

**File:** `src/ecs/resources/clock.js` (lines 68-71)

**Problem:** `maxDelta = fixedDtMs * 10` is hardcoded, but `maxStepsPerFrame` defaults to 5. This mismatch causes unnecessary accumulator accumulation that must later be clamped.

**Fix:**
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

---

### M-04: Event Queue `orderCounter` Never Auto-Reset Between Frames

**File:** `src/ecs/resources/event-queue.js`

**Problem:** The counter grows monotonically during gameplay and is only reset on level restart. The JSDoc claims it's "called once per fixed simulation step" but no such automatic call exists.

**Impact:** Over very long play sessions, the counter could approach `Number.MAX_SAFE_INTEGER`, though this is extremely unlikely in practice.

**Fix:** Add automatic reset in `runFixedStep` world method, or document that systems must drain events each frame.

---

### M-05: `DOMPool` `release()` Does Not Remove Event Listeners

**File:** `src/render/dom-pool.js` (lines 48-54)

**Problem:** If any code adds event listeners to pooled elements, those listeners persist when elements are released and re-used. This causes listener accumulation and potential memory leaks or duplicate event firing.

**Fix:** Either document that pooled elements must not have listeners, or implement a listener cleanup mechanism:
```js
release(element) {
  element.cloneNode(true); // Replace with clean clone
  this._pool.push(element);
}
```

---

## 🟢 Low / Informational

### L-01: `destroyAllEntities` Allocates New Array via `getActiveIds()` Every Call
**File:** `src/game/game-flow.js` (lines 41-51)  
**Impact:** Allocation during game restart — not on hot path, but architecturally fragile.  
**Recommendation:** Consider batch destroy API on entity store.

### L-02: `clampLevelIndex` Redundant `Math.floor` After Bounds Check
**File:** `src/game/level-loader.js` (lines 12-19)  
**Impact:** No functional issue, but `Math.floor` could theoretically produce a value > maxLevel if input is a float just below an integer boundary.  
**Recommendation:** Add final `Math.min(result, maxLevel)` guard.

### L-03: `renderCriticalError` Uses `textContent` — Safe but Limited Formatting
**File:** `src/main.ecs.js` (lines 87-92)  
**Impact:** Safe from injection, but error messages with multiple issues are hard to read as plain text.  
**Recommendation:** Consider structured error display with `<pre>` or `<code>` blocks.

### L-04: `UNHANDLED_REJECTION_HOOK_KEY` Could Conflict With Other Libraries
**File:** `src/main.ecs.js` (line 96)  
**Impact:** Unlikely but possible collision if other code uses same window property.  
**Recommendation:** Use Symbol instead of string key.

### L-05: `game-flow.js` Exports Both Named and Default — Inconsistent With Project Style
**File:** `src/game/game-flow.js`  
**Impact:** Minor consistency issue.  
**Recommendation:** Standardize on named exports only per ES module conventions.

### L-06: `advanceLevel` Accepts Options Object But Only Uses `reason` Property
**File:** `src/game/level-loader.js`  
**Impact:** Dead API surface.  
**Recommendation:** Simplify to `advanceLevel(reason)` or document future extensibility.

### L-07: `createDOMRenderer` Accepts `hudQueries` But Never Validates Query Results
**File:** `src/render/render-ecs.js`  
**Impact:** If HUD elements are missing from DOM, renderer silently produces no HUD updates.  
**Recommendation:** Add `console.warn` if expected elements are not found.

### L-08: No Validation That Map Grid Dimensions Match Actual Array Sizes
**File:** `src/ecs/resources/map-resource.js`  
**Impact:** `dimensions.width/height` could disagree with `grid.length`, causing out-of-bounds access.  
**Recommendation:** Add dimension-to-grid validation in `validateMapSemantic`.

### L-09: `EventQueue` `drain()` Returns Reference to Internal Array
**File:** `src/ecs/resources/event-queue.js`  
**Impact:** Callers could mutate returned array or hold reference after drain.  
**Recommendation:** Return a copy or iterator.

### L-10: `clock.js` `resyncTime` Does Not Clamp Accumulator to Zero
**File:** `src/ecs/resources/clock.js`  
**Impact:** If accumulator has leftover time from before resync, it could cause a burst step on next tick.  
**Recommendation:** Add `this.accumulator = 0` in `resyncTime`.

### L-11: Duplicate `advanceLevel` Logic in `game-flow.js` Test and Implementation
**File:** Various  
**Impact:** Test mocks and real implementation diverge slightly.  
**Recommendation:** Ensure test mocks stay synchronized with implementation.

### L-12: `main.ecs.js` Bootstrap Auto-Executes on Import in Browser
**File:** `src/main.ecs.js` (lines 230-232)  
**Impact:** Side effect on module import makes testing harder.  
**Recommendation:** Export bootstrap function and let consumer call it explicitly.

---

## Dead Code & Unused References

| Item | Location | Details |
|------|----------|---------|
| `options.restart` dead branch | `src/game/level-loader.js:58-61` | Both branches do `cloneMap(baseMap)` |
| `getSystemOrder` return value rarely consumed | `src/ecs/world/create-world.js` | External code rarely calls this |
| `resetOrderCounter` JSDoc claim | `src/ecs/resources/event-queue.js` | Documented as per-frame but never called automatically |
| `clampLevelIndex` float edge case | `src/game/level-loader.js` | `Math.floor` after bounds check is redundant for integers |
| `advanceLevel` options object | `src/game/level-loader.js` | Only `reason` property used |

---

## Architecture & ECS Violations

| Violation | Location | Severity |
|-----------|----------|----------|
| `getEntityStore()` returns mutable reference | `create-world.js` | High |
| No stale handle protection in `hasComponent` | `entity-store.js` | High |
| Systems can access resources without capability gating | World design | Medium |
| Event queue not auto-drained per frame | `event-queue.js` | Medium |
| DOM pool elements retain listeners on release | `dom-pool.js` | Medium |

---

## Test & CI Gaps

| Gap | Details |
|-----|---------|
| No Playwright test for last-level → VICTORY transition | H-02 needs E2E coverage |
| No test for `startGame()` called during PLAYING state | H-01 needs unit test |
| Event queue orderCounter growth untested | M-04 needs stress test |
| DOM pool listener leak untested | M-05 needs integration test |
| No fuzz testing for map resource with malformed input | L-08 needs property test |

---

## Recommended Fix Priority

1. **H-01** — Fix `startGame()` return value for PLAYING state (1 line change, high impact)
2. **H-02** — Fix last-level completion to trigger VICTORY (logic fix, blocks game completion)
3. **H-03** — Return immutable view of entity store (encapsulation fix)
4. **H-04** — Add bounds validation to entity store queries (crash prevention)
5. **M-01** — Remove dead conditional in map loader (code clarity)
6. **M-02** — Fix `isPassable` JSDoc or implementation (API correctness)
7. **M-03** — Use `maxStepsPerFrame` for maxDelta (performance correctness)
8. **M-05** — Fix DOM pool listener retention (memory leak prevention)

---

## Methodology

This report was generated by 5 parallel analysis agents:
1. **Bug & Logic Analysis** — Searched for runtime errors, logic mistakes, race conditions
2. **Dead Code Analysis** — Identified unused exports, unreachable code, stale imports
3. **Architecture Review** — Checked ECS boundaries, pattern compliance, mutation safety
4. **Security & Quality Review** — Audited unsafe patterns, validation gaps, CSP issues
5. **Test & CI Review** — Found coverage gaps, configuration issues, flaky tests

Each agent systematically read source files, tests, configuration, and documentation to identify issues.

---

*End of report.*
