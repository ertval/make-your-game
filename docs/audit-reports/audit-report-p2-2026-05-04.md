# Codebase Analysis & Audit Report - P2 (Playable MVP)

**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P2 (Playable MVP) — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — runtime bugs, logic errors, race conditions, state transitions
2. **Dead Code & Unused References** — dead code, unused exports, stale configuration
3. **Architecture, ECS Violations & Guideline Drift** — ECS rules, boundary breaches, structural integrity
4. **Code Quality & Security** — security vulnerabilities, unsafe patterns, validation gaps
5. **Tests & CI Gaps** — missing test coverage, CI weaknesses, audit verification gaps

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 3 |
| 🟠 High | 10 |
| 🟡 Medium | 14 |
| 🟢 Low / Info | 16 |

**Top risks:**
1. BUG-01/BUG-02: `assertValidInputAdapter` has typo (`getHeldKeys` vs `getHeldKeys`) — breaks entire input system validation
2. ARCH-07: `life-system.js` bypasses `worldView` capability gating by accessing `world.entityStore` directly
3. ARCH-05: `render-dom-system.js` uses `display:none` for HIDDEN flag instead of offscreen transform
4. TEST-04: 7 Fully Automatable audit IDs (F-03, F-06, F-11, F-12, F-14, F-15, F-16) have no Playwright E2E tests
5. TEST-05: Semi-Automatable thresholds in `audit-question-map.js` violate AGENTS.md performance budget

---

## 1) Bugs & Logic Errors

### BUG-01: `assertValidInputAdapter` checks wrong method name `getHeldKeys` ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-02)
- `src/adapters/io/input-adapter.js` (~L117, L130)

**Problem:** The `assertValidInputAdapter` function checks for `adapter.getHeldKeys` (with capital 'H' in "Held"), but the actual adapter method is named `getHeldKeys` (lowercase 'h'). Similarly for `clearHeldKeys` at line 125. This means validation ALWAYS fails for correctly implemented adapters.

**Impact:** Any code path calling `assertValidInputAdapter` (e.g., `input-system.js:78` or `bootstrap.js:612`) throws an error even when the adapter is correctly implemented. Breaks the entire input system wiring.

**Fix:**
```javascript
// In src/adapters/io/input-adapter.js, line 117, change:
typeof adapter.getHeldKeys === 'function'
// To:
typeof adapter.getHeldKeys === 'function'

// Line 125, change:
typeof adapter.clearHeldKeys === 'function'
// To:
typeof adapter.clearHeldKeys === 'function'
```

**Tests to add:** Test that `assertValidInputAdapter` accepts a valid adapter with correct method names.

---

### BUG-02: Missing `applyPauseFromState` call on early return in `startGame()` ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-01, A-03)
- `src/game/game-flow.js` (~L92-96, L142)

**Problem:** In `startGame()`, when transitioning from `GAME_OVER` or `VICTORY` to `MENU` fails, the function returns early without calling `applyPauseFromState(clock, gameStatus)`. This means the clock's pause state may be out of sync with the game status.

**Impact:** If the transition fails, the clock's `isPaused` flag might not match the actual game state.

**Fix:**
```javascript
// In src/game/game-flow.js, lines 92-96, change:
if (state === GAME_STATE.GAME_OVER || state === GAME_STATE.VICTORY) {
  if (!safeTransition(gameStatus, GAME_STATE.MENU)) {
    return false;
  }
}
// To:
if (state === GAME_STATE.GAME_OVER || state === GAME_STATE.VICTORY) {
  if (!safeTransition(gameStatus, GAME_STATE.MENU)) {
    applyPauseFromState(clock, gameStatus);
    return false;
  }
}
```

**Tests to add:** Test that `startGame()` from `GAME_OVER` with failed MENU transition still applies pause state.

---

### BUG-03: Scoring system doesn't guard against `null` frameIndex properly ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/systems/scoring-system.js` (~L224-226)

**Problem:** The duplicate-processing guard uses `frameIndex !== null` check. If `frameIndex` is `null`, the guard doesn't trigger, and the same collision intents could be scored multiple times.

**Impact:** In edge cases where the frame index is not available, the same collision intents could be processed multiple times, leading to inflated scores.

**Fix:**
```javascript
// In src/ecs/systems/scoring-system.js, lines 224-226, change:
if (frameIndex !== null && scoreState.lastProcessedFrame === frameIndex) {
  return;
}
// To:
if (frameIndex === null || scoreState.lastProcessedFrame === frameIndex) {
  return;
}
```

**Tests to add:** Test that scoring system skips processing when `frameIndex` is `null`.

---

### BUG-04: Modifying Map during iteration in `render-dom-system.js` ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L156-161)

**Problem:** The `entityElementMap` is modified (with `.delete()`) during `for...of` iteration. While modern JS engines may handle this, it's not guaranteed across all environments.

**Impact:** Some entities might not have their DOM elements cleaned up properly, leading to sprite pool leaks.

**Fix:**
```javascript
// In src/ecs/systems/render-dom-system.js, lines 156-161, change:
for (const [prevEntityId, info] of entityElementMap) {
  if (!currentFrameEntityIds.has(prevEntityId)) {
    spritePool.release(info.type, info.element);
    entityElementMap.delete(prevEntityId);
  }
}
// To:
const toDelete = [];
for (const [prevEntityId, info] of entityElementMap) {
  if (!currentFrameEntityIds.has(prevEntityId)) {
    toDelete.push([prevEntityId, info]);
  }
}
for (const [prevEntityId, info] of toDelete) {
  spritePool.release(info.type, info.element);
  entityElementMap.delete(prevEntityId);
}
```

**Tests to add:** Test that entities removed from the render intent are properly cleaned up.

---

### BUG-05: Clock fallback logic doesn't handle double-invalid timestamps ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A/D (Tickets: D-01)
- `src/ecs/resources/clock.js` (~L66)

**Problem:** In `tickClock`, the `timestamp` falls back to `clock.lastFrameTime` when `now` is not finite, but doesn't handle the case where BOTH are invalid.

**Impact:** If the clock receives invalid timestamps and has an invalid baseline, frame time calculation could be incorrect.

**Fix:**
```javascript
// Add validation to ensure timestamp is finite before using it:
const timestamp = Number.isFinite(now) ? now : (Number.isFinite(clock.lastFrameTime) ? clock.lastFrameTime : 0);
```

**Tests to add:** Test `tickClock` with non-finite `now` and invalid `lastFrameTime`.

---

## 2) Dead Code & Unused References

### DEAD-01: `ALL_COMPONENT_MASKS` exported but never imported ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/registry.js` (~L56)

**What is dead:** `ALL_COMPONENT_MASKS` is exported but never imported anywhere in the codebase.

**Action:** Remove export, or document intent if planned for future tooling.

---

### DEAD-02: Duplicate score constants in `constants.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/resources/constants.js` (~L122-141)

**What is dead:** Score constants (`SCORE_PELLET`, `SCORE_POWER_PELLET`, etc.) are defined in `constants.js` but never imported. Identical constants exist in `src/ecs/systems/scoring-system.js:39-57`.

**Action:** Remove duplicated score constants from `constants.js`; keep only in `scoring-system.js`.

---

### DEAD-03: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L23)

**What is dead:** `SIMULATION_HZ` is exported but only used locally to derive `FIXED_DT_MS`. No module imports `SIMULATION_HZ` directly.

**Action:** Remove export, keep as local const.

---

### DEAD-04: Ghost AI constants unused ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L92-98)

**What is dead:** `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, `INKY_REFERENCE_OFFSET` are never imported or used in any system.

**Action:** Remove dead constants or annotate as planned for ghost AI ticket.

---

### DEAD-05: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L147-160)

**What is dead:** `POWER_UP_TYPE` enum is never imported. The `props.js` module defines its own `PROP_POWER_UP_TYPE`.

**Action:** Remove `POWER_UP_TYPE` from `constants.js`.

---

### DEAD-06: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L63)

**What is dead:** `MAX_CHAIN_DEPTH` is defined but never imported or referenced in any system logic.

**Action:** Remove dead constant.

---

### DEAD-07: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L101)

**What is dead:** `GHOST_INTERSECTION_MIN_EXITS` is defined but never imported or used.

**Action:** Remove dead constant.

---

### DEAD-08: `maxrects-packer` and `sharp` have zero imports ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L50-51)

**What is dead:** `maxrects-packer` and `sharp` are in `devDependencies` but have zero imports in `src/` or `scripts/`.

**Action:** Remove from `devDependencies` or add comment referencing planned ticket (D-06).

---

### DEAD-09: `destroy` contract may be over-specified ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-02)
- `src/adapters/io/input-adapter.js` (~L117-127)

**What is dead:** `assertValidInputAdapter` requires `adapter.destroy` to be a function, but this is not part of the core input adapter contract for gameplay.

**Action:** Fix assertion to match actual contract, or remove `destroy` requirement if not needed.

---

### DEAD-10: `activeGhostTypes` field unwired ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L383)

**What is dead:** `assertValidMapResource` validates `map.activeGhostTypes` as an array, but this field is never read by any system.

**Action:** Wire `activeGhostTypes` into ghost spawning (Track C-03) or remove the field and its validation.

---

### DEAD-11: Event emission from collision-system largely no-op ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-04, B-05)
- `src/ecs/systems/collision-system.js` (~L600-602)

**What is dead:** The event emission path from collision-system is largely a no-op in the current wiring. The `eventContext` parameter is often `undefined`.

**Action:** Document that event emission requires explicit `eventQueueResourceKey` wiring, or remove dead event emission code until Track B-05 is fully integrated.

---

### DEAD-12: `STRICT_GENERATED_BASENAME_PATTERN` may be unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` (~L16)

**What is dead:** The regex pattern is defined but only used in `validateManifestAssets` — may not cover actual asset filenames.

**Action:** Verify regex matches actual asset filenames.

---

### DEAD-13: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L37-45)

**What is dead:** `RENDERABLE_KIND.WALL` maps to `null` but walls don't have a Renderable component, so this mapping is unreachable.

**Action:** Remove `RENDERABLE_KIND.WALL` entry from `KIND_TO_SPRITE_TYPE`.

---

### DEAD-14: `trusted-types.js` excluded but untested ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-07)
- `vitest.config.js` (~L13)

**What is dead:** `src/security/trusted-types.js` is excluded from coverage but has no corresponding test file.

**Action:** Add a test for `trusted-types.js` and remove the coverage exclusion.

---

### DEAD-15: 5 implemented systems not wired in default runtime ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A/B/C (Tickets: B-04, C-01, C-02, C-03)
- `src/game/bootstrap.js` (~L240-244)

**What is dead:** The default runtime system stack only registers 4 systems. The following are implemented but NOT wired in: `collision-system.js`, `scoring-system.js`, `timer-system.js`, `life-system.js`, `spawn-system.js`.

**Action:** Wire these systems into `createDefaultSystemsByPhase` now that they're implemented.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: `destroyAllEntitiesDeferred()` flushes deferred mutations outside fixed step ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md: *"MUST defer entity/component add/remove operations to a controlled sync point."*
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/game-flow.js` (~L54-75)

**Problem:** `destroyAllEntitiesDeferred()` calls `flushDeferredMutations()` outside the fixed-step boundary, violating the "controlled sync point" rule.

**Impact:** Deferred mutations could be applied at non-deterministic times, breaking simulation determinism.

**Fix:** Replace `flushDeferredMutations()` call with a mechanism that only applies deferred ops at the next fixed-step boundary.

---

### ARCH-02: `render-dom-system.js` HIDDEN flag uses `display:none` instead of offscreen transform ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md Render Rules: *"Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none`"*
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L73-75)

**Problem:** The HIDDEN visual flag uses `el.style.display = 'none'` instead of the mandated offscreen transform.

**Impact:** `display:none` triggers layout thrashing when toggled; violates the performance policy for DOM hiding.

**Fix:**
```javascript
// In src/ecs/systems/render-dom-system.js, lines 73-75, change:
if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
  el.style.display = 'none';
}
// To:
if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
  el.style.transform = 'translate(-9999px, -9999px)';
}
// Also restore transform when HIDDEN is cleared (around line 123)
```

---

### ARCH-03: `life-system.js` bypasses `worldView` capability gating ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md ECS Architecture Rules: *"Systems MUST NOT import adapters directly — Adapters MUST be registered as World resources and accessed through the resource API."*
**Files:** Ownership: Track C (Tickets: C-02)
- `src/ecs/systems/life-system.js` (~L102-161)

**Problem:** `life-system.js` uses `world.entityStore.isAlive()` and `world.setResource()` directly — bypassing the `worldView` abstraction and capability gating.

**Impact:** System bypasses resource capability gating by accessing `world.setResource` directly; can write to any resource regardless of declared capabilities.

**Fix:** Refactor `respawnPlayerEntity` to use only `worldView` methods; pass `worldView` instead of `world`.

---

### ARCH-04: Event queue `drain()` allocates new array per call ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L88)

**Problem:** `drain()` uses `[...queue.events]` which allocates a new array each call.

**Impact:** Each `drain()` call allocates a new array; for deterministic event processing this could be pre-allocated.

**Fix:** Use `slice()` (still allocates) or implement a pre-allocated ring buffer for events.

---

### ARCH-05: `spawn-system.js` creates `Set` objects in hot paths ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L228, L296, L329)

**Problem:** `createMembershipSet()`, `enqueueUniqueGhostIds`, `releaseEligibleGhosts` create new `Set` + cloned array every fixed step.

**Impact:** New Set + cloned array allocated per fixed step in spawn-system.

**Fix:** Pre-allocate reusable Sets and arrays; clear and refill in-place.

---

### ARCH-06: `render-dom-system.js` creates `currentFrameEntityIds` Set every frame ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L111)

**Problem:** `const currentFrameEntityIds = new Set()` is created every render frame.

**Impact:** New Set allocated per render frame.

**Fix:** Hoist Set to system closure; clear in-place with `clear()`.

---

### ARCH-07: Planned systems not yet implemented ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track B/C/D
- Multiple files

**Problem:** Per track-b.md and track-c.md, several systems are still "planned" (not implemented): `bomb-tick-system.js`, `explosion-system.js`, `power-up-system.js`, `ghost-ai-system.js`, `pause-system.js`, `level-progress-system.js`, `hud-adapter.js`, `screens-adapter.js`, `audio-adapter.js`, `storage-adapter.js`.

**Impact:** Audit questions F-06 through F-16, B-01 through B-04 cannot be fully satisfied without these systems.

**Fix:** Implement remaining Track B, C, D systems per their ticket definitions.

---

## 4) Code Quality & Security

### SEC-01: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L10-17)

**Problem:** The default Trusted Types policy simply passes through strings without sanitization. While this satisfies the CSP directive, it provides no actual sanitization benefit.

**Impact:** CSP `require-trusted-types-for 'script'` is satisfied but no actual sanitization occurs.

**Fix:** Implement proper sanitization in the handlers, or remove the policy creation if sanitization is not implemented. At minimum, document why an empty policy is acceptable.

---

### SEC-02: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `vite.config.js` (~L27-28)

**Problem:** Development CSP includes `'unsafe-eval'` and `'unsafe-inline'` which weakens security posture. This is a known trade-off for Vite HMR support.

**Fix:** Document this trade-off in AGENTS.md or vite.config.js comments. Ensure production builds enforce strict CSP (which they do).

---

### SEC-03: Policy gates can be bypassed locally ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/run-all.mjs`, `package.json` (~L30-41)

**Problem:** Policy gates rely on developers running `npm run policy` locally. There's no pre-commit hook or forced local enforcement.

**Fix:** Add a pre-commit hook (e.g., using Husky) that runs `npm run policy:checks:local` automatically.

---

### SEC-04: JSON parsing error handling could be more explicit ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/main.ecs.js` (~L149), `src/ecs/resources/map-resource.js` (~L149)

**Problem:** `response.json()` can throw on invalid JSON. Error handling could be more explicit with better error messages.

**Fix:** Add explicit error handling around `response.json()` in `loadDefaultMaps` to provide better error messages.

---

### SEC-05: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L1-18)

**Problem:** The file is missing the required block comment header per AGENTS.md ("Each file MUST begin with a comment block...").

**Fix:** Add a proper file header comment explaining the purpose, public API, and implementation notes.

---

## 5) Tests & CI Gaps

### TEST-01: Missing unit test for `collision-gameplay-events.js` ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-05)
- `src/ecs/systems/collision-gameplay-events.js` (145 lines)

**What is missing:** No unit test exists for this module which defines `GAMEPLAY_EVENT_TYPE`, `validateGameplayEventPayload()`, and `emitGameplayEvent()` — all critical for deterministic cross-system event contracts.

**Why it matters:** B-05 is a P3 ticket requiring event surface validation. Without unit tests, payload validation logic and event emission are untested.

**Fix:** Create `tests/unit/systems/collision-gameplay-events.test.js`.

---

### TEST-02: Missing unit tests for adapter entry points ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track D (Tickets: D-05, D-06)
- `src/adapters/dom/renderer-adapter.js`
- `src/adapters/dom/renderer-board-css.js`

**What is missing:** No Vitest/jsdom tests for these adapter modules.

**Fix:** Create `tests/unit/adapters/renderer-adapter.test.js` and `tests/unit/adapters/renderer-board-css.test.js` using jsdom.

---

### TEST-03: Missing unit tests for security and environment modules ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-01)
- `src/security/trusted-types.js`
- `src/shared/env.js`
- `src/main.ecs.js`
- `src/main.js`

**What is missing:** Security modules must have 100% coverage. Bootstrap logic failures cascade to the entire game.

**Fix:** Remove `src/security/trusted-types.js` from vitest.config.js `exclude` array. Create unit tests for all these modules.

---

### TEST-04: E2E coverage gaps for 7 Fully Automatable audit IDs ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.e2e.test.js`

**What is missing:** The following Fully Automatable audit questions have no Playwright E2E tests:
- **F-03** (single player)
- **F-06** (pre-approved genre)
- **F-11** (player movement)
- **F-12** (hold-to-move)
- **F-14** (timer HUD)
- **F-15** (score HUD)
- **F-16** (lives HUD)

**Fix:** Add Playwright specs to `tests/e2e/gameplay.flow.spec.js` for each missing audit ID.

---

### TEST-05: Semi-Automatable thresholds violate AGENTS.md ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit-question-map.js` (~L23-38)

**What is missing:** Threshold values don't match AGENTS.md performance budget:
- **F-17**: `maxP95FrameTimeMs: 20` — AGENTS.md requires ≤ 16.7 ms
- **F-18**: `minP95Fps: 50` — AGENTS.md requires ≥ 60 FPS
- **B-05**: `maxLongTaskCount: 0` is too strict

**Fix:** Update thresholds in `audit-question-map.js` to match AGENTS.md.

---

### TEST-06: Manual evidence artifacts are placeholders ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `docs/audit-reports/evidence/AUDIT-F-19.paint.md`
- `docs/audit-reports/evidence/AUDIT-F-20.layers.md`
- `docs/audit-reports/evidence/AUDIT-F-21.promotion.md`
- `docs/audit-reports/evidence/AUDIT-B-06.overall.md`

**What is missing:** Evidence files contain only "Logic Verified" placeholders with no actual DevTools trace screenshots or performance data.

**Fix:** Before P4 closure, collect actual DevTools traces and screenshots, then update evidence files with real data.

---

### TEST-07: Integration test gaps for cross-system flows ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05)
- `tests/integration/gameplay/` (8 test files)

**What is missing:** No integration tests for collision → scoring → HUD update, pause integration, spawn integration, power-up integration, bomb → explosion → chain reaction.

**Fix:** Create integration tests in `tests/integration/gameplay/` for each cross-system flow.

---

### TEST-08: Vitest excludes security module from coverage ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `vitest.config.js` (~L13)

**What is missing:** `src/security/trusted-types.js` is in the `exclude` array, meaning security code coverage is not measured.

**Fix:** Remove from exclude array, create security tests, verify coverage passes.

---

### CI-01: CI doesn't fail on missing E2E tests for Done tickets ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**What is missing:** CI doesn't verify that all "Done" tickets have corresponding passing tests or that audit-traceability-matrix.md status matches actual test execution.

**Fix:** Add a CI step that verifies audit-traceability-matrix.md "Executable" status claims match actual test files.

---

### TEST-10: No performance budget test for DOM element count ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A/D (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`

**What is missing:** AGENTS.md specifies "DOM Elements: ≤ 500 total". No test verifies this.

**Fix:** Add a Playwright test in `audit.browser.spec.js` to count DOM elements after level load.

---

### TEST-11: No GC/allocation performance test ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)

**What is missing:** AGENTS.md specifies GC pause budget. No test measures GC pauses or verifies allocation timeline is flat.

**Fix:** Consider adding DevTools memory profiling to Manual-With-Evidence collection (B-06).

---

### TEST-12: Ticket tracker "Done" count may be off ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-10)
- `docs/implementation/ticket-tracker.md` (~L37)

**What is missing:** The ticket-tracker.md says "Done: 21" but actual count shows 22 tickets with `[x]`.

**Fix:** Update line 37 in ticket-tracker.md to "Done: 22" or verify if a ticket was miscounted.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|---|---|---|---|---|---|---|---|
| BUG-01 | BUG-01 | — | — | — | — | Track B | `assertValidInputAdapter` typo `getHeldKeys` |
| BUG-02 | BUG-03 | — | — | — | — | Track A | Missing `applyPauseFromState` call |
| BUG-03 | BUG-04 | — | — | — | — | Track C | Scoring system null frameIndex guard |
| BUG-04 | BUG-05 | — | — | — | — | Track D | Map modification during iteration |
| BUG-05 | BUG-06 | — | — | — | — | Track A/D | Clock double-invalid fallback |
| DEAD-01 | — | DEAD-01 | — | — | — | Track B | `ALL_COMPONENT_MASKS` unused |
| DEAD-02 | — | DEAD-02 | — | — | — | Track C | Duplicate score constants |
| DEAD-03 | — | DEAD-03 | — | — | — | Track D | `SIMULATION_HZ` export unused |
| DEAD-04 | — | DEAD-04 | — | — | — | Track D | Ghost AI constants unused |
| DEAD-05 | — | DEAD-05 | — | — | — | Track D | `POWER_UP_TYPE` orphaned |
| DEAD-06 | — | DEAD-06 | — | — | — | Track D | `MAX_CHAIN_DEPTH` unreferenced |
| DEAD-07 | — | DEAD-07 | — | — | — | Track D | `GHOST_INTERSECTION_MIN_EXITS` unused |
| DEAD-08 | — | DEAD-08 | — | — | — | Track A | `maxrects-packer`, `sharp` unused |
| DEAD-09 | — | DEAD-09 | — | — | — | Track B | `destroy` contract over-specified |
| DEAD-10 | — | DEAD-10 | — | — | — | Track D | `activeGhostTypes` unwired |
| DEAD-11 | — | DEAD-11 | — | — | — | Track B | Event emission no-op |
| DEAD-12 | — | DEAD-12 | — | — | — | Track A | `STRICT_GENERATED_BASENAME_PATTERN` |
| DEAD-13 | — | DEAD-13 | — | — | — | Track D | `KIND_TO_SPRITE_TYPE.WALL` unreachable |
| DEAD-14 | — | DEAD-14 | — | — | — | Track A | `trusted-types.js` excluded |
| DEAD-15 | — | DEAD-15 | — | — | — | Track A/B/C | 5 systems not wired in default runtime |
| ARCH-01 | — | — | ARCH-03 | — | — | Track A | Deferred mutations outside fixed step |
| ARCH-02 | — | — | ARCH-05 | — | — | Track D | HIDDEN flag uses `display:none` |
| ARCH-03 | — | — | ARCH-07 | — | — | Track C | `life-system.js` bypasses `worldView` |
| ARCH-04 | — | — | ARCH-10 | — | — | Track D | Event queue `drain()` allocates |
| ARCH-05 | — | — | ARCH-12 | — | — | Track C | `spawn-system.js` creates Sets in hot path |
| ARCH-06 | — | — | ARCH-13 | — | — | Track D | `currentFrameEntityIds` allocated per frame |
| ARCH-07 | — | — | ARCH-16 | — | — | Track B/C/D | Planned systems not implemented |
| SEC-01 | — | — | — | SEC-01 | — | Track D | Trusted Types policy permissive |
| SEC-02 | — | — | — | SEC-02 | — | Track D | Dev CSP uses unsafe-eval |
| SEC-03 | — | — | — | SEC-03 | — | Track A | Policy gates bypassable locally |
| SEC-04 | — | — | — | SEC-05 | — | Track D | JSON parse error handling |
| SEC-05 | — | — | — | SEC-12 | — | Track D | Missing source header on `trusted-types.js` |
| TEST-01 | — | — | — | — | TEST-01 | Track B | Missing test for `collision-gameplay-events.js` |
| TEST-02 | — | — | — | — | TEST-02 | Track D | Missing adapter unit tests |
| TEST-03 | — | — | — | — | TEST-03 | Track A | Missing security/env tests |
| TEST-04 | — | — | — | — | TEST-04 | Track A | E2E gaps for 7 audit IDs |
| TEST-05 | — | — | — | — | TEST-05 | Track A | Semi-Automatable thresholds wrong |
| TEST-06 | — | — | — | — | TEST-06 | Track A | Manual evidence are placeholders |
| TEST-07 | — | — | — | — | TEST-07 | Track A | Integration test gaps |
| TEST-08 | — | — | — | — | TEST-08 | Track A | Vitest excludes security module |
| CI-01 | — | — | — | — | CI-01 | Track A | CI doesn't fail on missing E2E tests |
| TEST-10 | — | — | — | — | TEST-10 | Track A/D | No DOM element budget test |
| TEST-11 | — | — | — | — | TEST-11 | Track A | No GC/allocation test |
| TEST-12 | — | — | — | — | TEST-12 | Track A | Ticket tracker count off |

---

## Recommended Fix Order

### Phase 1 — Critical (must fix before any merge)
1. **BUG-01**: Fix `assertValidInputAdapter` typo in `getHeldKeys`/`clearHeldKeys` (Track B)
2. **TEST-01**: Write unit test for `collision-gameplay-events.js` (Track B)
3. **TEST-04**: Add E2E tests for missing Fully Automatable audit IDs (Track A)

### Phase 2 — High Severity (immediate follow-up)
4. **ARCH-03**: Fix `life-system.js` to use `worldView` not raw `world` (Track C)
5. **ARCH-02**: Fix HIDDEN flag to use `translate()` not `display:none` (Track D)
6. **ARCH-01**: Fix `destroyAllEntitiesDeferred()` flush timing (Track A)
7. **TEST-05**: Fix Semi-Automatable thresholds in `audit-question-map.js` (Track A)
8. **TEST-02**: Write adapter unit tests (Track D)
9. **TEST-07**: Write integration tests for cross-system flows (Track A)
10. **TEST-08**: Remove `trusted-types.js` from vitest exclude, write tests (Track A)

### Phase 3 — Medium Severity
11. **BUG-02**: Add `applyPauseFromState` call in `startGame()` early return (Track A)
12. **BUG-03**: Fix scoring system null frameIndex guard (Track C)
13. **BUG-04**: Fix Map iteration in `render-dom-system.js` (Track D)
14. **ARCH-04**: Fix event queue `drain()` allocation (Track D)
15. **ARCH-05**: Fix `spawn-system.js` hot-path allocations (Track C)
16. **ARCH-06**: Fix `render-dom-system.js` per-frame Set allocation (Track D)
17. **DEAD-02**: Remove duplicate score constants from `constants.js` (Track C)
18. **DEAD-04**: Remove unused ghost AI constants (Track D)
19. **DEAD-05**: Remove orphaned `POWER_UP_TYPE` (Track D)
20. **DEAD-08**: Remove unused dependencies from `package.json` (Track A)
21. **DEAD-10**: Wire or remove `activeGhostTypes` (Track D)
22. **DEAD-15**: Wire implemented systems into default runtime (Track A/B/C)
23. **SEC-01**: Implement/fix Trusted Types policy (Track D)
24. **SEC-03**: Add pre-commit hook for policy gates (Track A)
25. **TEST-03**: Write missing unit tests for security/env modules (Track A)
26. **CI-01**: Enhance CI to verify audit coverage (Track A)
27. **TEST-06**: Collect real manual evidence artifacts (Track A)
28. **TEST-10**: Add DOM element budget test (Track A/D)

### Phase 4 — Low Severity (maintenance)
29. **BUG-05**: Fix clock fallback logic (Track A/D)
30. **DEAD-01**: Remove `ALL_COMPONENT_MASKS` export (Track B)
31. **DEAD-03**: Remove `SIMULATION_HZ` export (Track D)
32. **DEAD-06**: Remove `MAX_CHAIN_DEPTH` (Track D)
33. **DEAD-07**: Remove `GHOST_INTERSECTION_MIN_EXITS` (Track D)
34. **DEAD-09**: Fix `destroy` contract in input adapter (Track B)
35. **DEAD-11**: Clean up dead event emission code (Track B)
36. **DEAD-12**: Verify `STRICT_GENERATED_BASENAME_PATTERN` (Track A)
37. **DEAD-13**: Remove unreachable `KIND_TO_SPRITE_TYPE.WALL` (Track D)
38. **DEAD-14**: Remove `trusted-types.js` from coverage exclusion (Track A)
39. **SEC-04**: Improve JSON parse error handling (Track D)
40. **SEC-05**: Add source header to `trusted-types.js` (Track D)
41. **TEST-11**: Consider memory profiling for evidence (Track A)
42. **TEST-12**: Fix ticket tracker "Done" count (Track A)
43. **ARCH-07**: Implement remaining planned systems (Track B/C/D)

---

## Notes

- The most critical finding is **BUG-01** which will break the entire input system validation due to a simple typo in method name capitalization.
- **ARCH-03** represents a significant ECS architecture violation where `life-system.js` bypasses the capability gating system.
- **TEST-04** and **TEST-05** represent the highest-priority test gaps that block audit completion per AGENTS.md requirements.
- Many dead code findings in `constants.js` (DEAD-02 through DEAD-07) suggest a cleanup pass is needed.
- The codebase shows strong security posture overall with no critical vulnerabilities found (no `innerHTML`, no canvas, no frameworks).
- Several implemented systems (DEAD-15) are not wired into the default runtime and should be integrated.

---

*End of report.*
