# Consolidated Codebase Analysis & Audit Report - P1 (Visual Prototype)
**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Merged findings from three independent P1 audit reports (BP, GF, MM), covering 15 total analysis passes (5 passes per report).
**Source Reports:**
- `bp-audit-report-p1-2026-05-04.md` (Track B lead)
- `gf-audit-report-p1-2026-05-04.md` (Track D lead)
- `mm-audit-report-p1-2026-05-04.md` (Track A lead)
**P1 Scope:** D-05 (CSS Layout), D-06 (Renderer Adapter), B-02 (Input Adapter/System), B-03 (Movement & Collision), D-07 (Render Collect), D-09 (Sprite Pool), D-08 (Render DOM)

---

## Methodology
Each source report executed 5 parallel analysis passes:
1. **Bugs & Logic Errors** — Runtime bugs, logic errors, race conditions
2. **Dead Code & Unused References** — Dead code, unused exports, stale configuration
3. **Architecture, ECS Violations & Guideline Drift** — ECS rules, boundary breaches, structural integrity
4. **Code Quality & Security** — Security vulnerabilities, unsafe patterns, validation gaps
5. **Tests & CI Gaps** — Missing test coverage, CI weaknesses, audit verification gaps

All passes were evidence-driven and read-only. Findings include concrete file/line references and suggested remediations. Identical findings across reports are deduplicated; conflicting original IDs (e.g., three BUG-01 entries) are assigned unique suffixes.

---

## Executive Summary
| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 3 |
| 🟠 High | 24 |
| 🟡 Medium | 18 |
| 🟢 Low / Info | 20 |

**Top risks:**
1. **CI-01-MM**: CI pipeline missing test execution gates (Blocking)
2. **EA-01-MM**: E2E audit tests not fully implemented (Blocking)
3. **ARCH-02**: `display:none` used instead of offscreen transform (Critical, merged from BP ARCH-02, MM ARCH-01)
4. **BUG-01-INPUT**: `assertValidInputAdapter` typo breaks input system validation (Critical)
5. **EV-01**: No manual evidence artifacts collected (Critical, merged from BP TEST-05, MM EA-02)

---

## 1) Bugs & Logic Errors

### BUG-01-INPUT: `assertValidInputAdapter` checks wrong method name ⬆ CRITICAL
**Origin:** Bugs & Logic Errors (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
- `src/adapters/io/input-adapter.js` (~L117, L130)
**Problem:** `assertValidInputAdapter` checks for `getHeldKeys` (capital H) but actual method is `getHeldKeys` (lowercase h). Similarly `clearHeldKeys` at L125. Validation always fails for correct adapters.
**Impact:** Breaks input system wiring; throws errors even with valid adapters.
**Fix:**
```javascript
// src/adapters/io/input-adapter.js L117
typeof adapter.getHeldKeys === 'function' // not getHeldKeys
// L125
typeof adapter.clearHeldKeys === 'function' // not clearHeldKeys
```
**Tests to add:** Test `assertValidInputAdapter` accepts valid adapters with correct method names.

---

### BUG-01-SPRITE: Sprite Pool Adapter recycles empty active pool ⬆ HIGH
**Origin:** Bugs & Logic Errors (GF)
**Source Reports:** GF
**Files:** Track D (D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (~L100)
**Problem:** When idle elements are exhausted and active pool is empty, `activePool.shift()` returns `undefined`, causing runtime crash on `.style.transform` access.
**Impact:** Occurs when acquiring sprites without warm-up or after pool reset.
**Fix:**
```javascript
const recycled = activePool.shift();
if (!recycled) {
  const el = createElement(type);
  activePool.push(el);
  return el;
}
recycled.style.transform = OFFSCREEN_TRANSFORM;
```
**Tests to add:** Test `acquire()` on un-warmed sprite pool.

---

### BUG-01-FRAME: World frame counter not reset on level restart ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track A (A-03)
- `src/game/bootstrap.js:494-498`, `src/ecs/world/world.js:82`
**Problem:** `world.frame` persists across level transitions; `restartLevel()` never resets it.
**Impact:** Frame-dependent timing desyncs across level boundaries.
**Fix:**
```javascript
// In restartLevel() after destroyAllEntitiesDeferred():
world.frame = 0;
```
**Tests to add:** Test level restart resets `world.frame`.

---

### BUG-02-BP: Modifying Map during iteration in `render-dom-system.js` ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (BP)
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L156-161)
**Problem:** `entityElementMap` modified with `.delete()` during `for...of` iteration, unsafe in some environments.
**Impact:** Sprite pool leaks from uncleaned DOM elements.
**Fix:** Collect entries to delete first, then iterate to release and delete.
**Tests to add:** Test entity cleanup when removed from render intent.

---

### BUG-02-MM: `setEntityMask` return value ignored ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track A (A-02)
- `src/game/bootstrap.js:357-359`
**Problem:** `world.setEntityMask()` returns `false` on failure, but return value is never checked; overwrites valid handle with `false`.
**Impact:** Silent failures if mask update fails.
**Fix:**
```javascript
const maskResult = world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);
if (!maskResult) {
  world.destroyEntity(playerHandle);
  playerHandle = world.createEntity(PLAYER_WITH_RENDERABLE_MASK);
}
```
**Tests to add:** Test `setEntityMask` return value handling.

---

### BUG-03-BP: Clock fallback logic doesn't handle double-invalid timestamps ⬆ LOW
**Origin:** Bugs & Logic Errors (BP)
**Source Reports:** BP
**Files:** Track A/D (D-01)
- `src/ecs/resources/clock.js` (~L66)
**Problem:** `tickClock` falls back to `clock.lastFrameTime` if `now` is invalid, but doesn't handle both being invalid.
**Impact:** Incorrect frame time calculation if both timestamps are invalid.
**Fix:**
```javascript
const timestamp = Number.isFinite(now) ? now : (Number.isFinite(clock.lastFrameTime) ? clock.lastFrameTime : 0);
```
**Tests to add:** Test `tickClock` with non-finite `now` and invalid `lastFrameTime`.

---

### BUG-03-MM: `render-dom-system` entityElementMap memory leak ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js:92-161`
**Problem:** `entityElementMap` accumulates entries but never cleans up destroyed entities; old DOM elements not released on level restart.
**Impact:** Memory growth and pool exhaustion across restarts.
**Fix:** Add cleanup on level restart:
```javascript
if (context.isLevelRestart) {
  for (const [id, info] of entityElementMap) {
    spritePool.release(info.type, info.element);
  }
  entityElementMap.clear();
}
```
**Tests to add:** Test `entityElementMap` cleanup on entity destroy.

---

### BUG-04-MM: Pause state not explicitly cleared after level complete ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track C (C-04)
- `src/game/game-flow.js:120-140`, `src/ecs/resources/clock.js:157-159`
**Problem:** If game is paused when entering `LEVEL_COMPLETE`, pause state may persist incorrectly on transition to `PLAYING`.
**Impact:** Edge case pause leak across level boundaries.
**Fix:** Explicitly call `setPauseState(clock, false)` at start of `startGame()`.

---

### BUG-06-MM: Event queue `drain()` optimization comment misleading ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js:70-94`
**Problem:** Comment claims in-place sort to avoid allocation, but code copies array with `[...queue.events]`.
**Impact:** Misleading documentation; minor allocation overhead.
**Fix:** Either sort in-place or remove optimization comment.

---

### BUG-10-MM: `render-intent` buffer overflow silently drops intents ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-07)
- `src/ecs/render-intent.js:126-146`
**Problem:** Buffer overflow silently drops intents in production (only warns in dev mode).
**Impact:** Entities may not render in high-entity scenarios; silent failure.
**Fix:** Increase buffer size with headroom, or implement ring buffer. Log in production.
**Tests to add:** Test render-intent buffer overflow handling.

---

### BUG-13-MM: No validation in `setEntityMask` for mask=0 ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track A (A-02)
- `src/ecs/world/world.js:248-257`
**Problem:** Passing mask=0 hides entity from all queries with no validation.
**Impact:** Silent logic errors if mask=0 is passed accidentally.
**Fix:** Add validation or document mask=0 as valid "hide entity" operation.

---

### BUG-14-MM: Event queue sort comparator overflow risk ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js:80-85`
**Problem:** Sort uses subtraction which overflows for very large frame numbers.
**Impact:** Unlikely in practice, but theoretical long-session overflow.
**Fix:**
```javascript
return a.frame < b.frame ? -1 : (a.frame > b.frame ? 1 : 0);
```

---

## 2) Dead Code & Unused References

### DEAD-01-ALLMASKS: `ALL_COMPONENT_MASKS` exported but never imported ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track B (B-01)
- `src/ecs/components/registry.js` (~L56)
**Problem:** Exported but never imported anywhere.
**Action:** Remove export or document future use.

---

### DEAD-RESETQ: `resetOrderCounter` unused export ⬆ MEDIUM
**Origin:** Dead Code & Unused References (GF, MM)
**Source Reports:** GF, MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L133)
**Problem:** Exported but never invoked in game loop or bootstrap (GF DEAD-01). Also reported as MM DEAD-02 with medium severity.
**Action:** Remove function and export.

---

### DEAD-01-ENTITYSTORE: Unused methods in EntityStore ⬆ HIGH
**Origin:** Dead Code & Unused References (MM)
**Source Reports:** MM
**Files:** Track A (A-02)
- `src/ecs/world/entity-store.js:19-40`
**Problem:** Three methods defined but never called: `isValidId`, `getGeneration`, `getHandleForId`.
**Action:** Remove methods or mark as internal.

---

### DEAD-02-SIMHZ: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L23)
**Problem:** Exported but only used locally to derive `FIXED_DT_MS`.
**Action:** Remove export, keep as local const.

---

### DEAD-02-LEVELLOADER: Level loader sync loader unused ⬆ LOW
**Origin:** Dead Code & Unused References (GF)
**Source Reports:** GF
**Files:** Track A (A-03)
- `src/game/level-loader.js` (~L79)
**Problem:** `createSyncMapLoader(preloadMaps)` exported but no callers.
**Action:** Remove unused export.

---

### DEAD-03-BP: Ghost AI constants unused ⬆ MEDIUM
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L92-98)
**Problem:** `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, `INKY_REFERENCE_OFFSET` never used.
**Action:** Remove or annotate for future AI tickets.

---

### DEAD-04-BP: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L147-160)
**Problem:** Never imported; `props.js` defines its own `PROP_POWER_UP_TYPE`.
**Action:** Remove from `constants.js`.

---

### DEAD-05-BP: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L63)
**Problem:** Defined but never imported or referenced.
**Action:** Remove.

---

### DEAD-06-BP: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L101)
**Problem:** Defined but never imported or used.
**Action:** Remove.

---

### DEAD-07-BP: `maxrects-packer` and `sharp` have zero imports ⬆ MEDIUM
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track A (A-01)
- `package.json` (~L50-51)
**Problem:** In `devDependencies` but zero imports in `src/` or `scripts/`.
**Action:** Remove from `devDependencies` or add ticket reference comment.

---

### DEAD-08-BP: `destroy` contract may be over-specified ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
- `src/adapters/io/input-adapter.js` (~L117-127)
**Problem:** `assertValidInputAdapter` requires `destroy` method not part of core input contract.
**Action:** Fix assertion to match actual contract.

---

### DEAD-09-BP: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L37-45)
**Problem:** `RENDERABLE_KIND.WALL` maps to `null`; walls don't have Renderable component.
**Action:** Remove entry from `KIND_TO_SPRITE_TYPE`.

---

### DEAD-10-BP: `trusted-types.js` excluded but untested ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track A (A-01)
- `vite.config.js` / `vitest.config.js` (~L13)
**Problem:** Excluded from coverage, no corresponding test file.
**Action:** Add test and remove coverage exclusion.

---

### DEAD-03-MM: Duplicate script definition in `package.json` ⬆ LOW
**Origin:** Dead Code & Unused References (MM)
**Source Reports:** MM
**Files:** Track A (A-01)
- `package.json:17`
**Problem:** `"check:fix"` identical to `"fix"` at line 16.
**Action:** Remove duplicate line.

---

### DEAD-04-MM: Unnecessary biome exclusion ⬆ LOW
**Origin:** Dead Code & Unused References (MM)
**Source Reports:** MM
**Files:** Track A (A-01)
- `biome.json:32`
**Problem:** References transient `!**/changed-files.txt` not tracked in git.
**Action:** Remove exclusion or gitignore the file.

---

### DEAD-05-MM: `getActiveEntityHandles` may be inefficient ⬆ MEDIUM
**Origin:** Dead Code & Unused References (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/world/world.js:276`
**Problem:** Creates full handle objects for simple destroy operations; `getActiveIds()` would suffice.
**Action:** Use `getActiveIds()` for destroy logic.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01-BP: Event queue `drain()` allocates new array per call ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Violated Rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L88)
**Problem:** `drain()` uses `[...queue.events]` which allocates a new array each call.
**Impact:** Recurring allocation in hot loop.
**Fix:** Use pre-allocated ring buffer for events.

---

### ARCH-01-GF: Event queue `resetOrderCounter` violates sync point ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (GF)
**Violated Rule:** *"Events are drained once per frame at a defined sync point"*
**Source Reports:** GF
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L126-L135)
**Problem:** Manual `resetOrderCounter` risks resetting event order indexes before consumers drain events.
**Impact:** High risk of insertion order collisions.
**Fix:** Deprecate `resetOrderCounter` and rely exclusively on `drain()`.

---

### ARCH-02: `display:none` used for HIDDEN flag instead of offscreen transform ⬆ CRITICAL
**Origin:** Architecture, ECS Violations & Guideline Drift (BP, MM)
**Violated Rule:** AGENTS.md Rendering and DOM Rules: *"Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none`"*
**Source Reports:** BP (ARCH-02), MM (ARCH-01)
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L73-75)
**Problem:** HIDDEN flag uses `el.style.display = 'none'` which triggers layout thrashing.
**Impact:** Violates performance policy for DOM hiding.
**Fix:**
```javascript
if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
  el.style.transform = 'translate(-9999px, -9999px)';
}
// Restore transform when HIDDEN is cleared
```

---

### ARCH-03-BP: `currentFrameEntityIds` Set created every frame ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Violated Rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L111)
**Problem:** `const currentFrameEntityIds = new Set()` allocated every render frame.
**Impact:** Recurring allocation in hot loop.
**Fix:** Hoist Set to system closure; clear in-place with `clear()`.

---

### ARCH-04-BP: Render commit phase separation ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track D (D-07, D-08)
**Verdict:** ✅ PASS — `render-collect-system.js` computes intents, `render-dom-system.js` applies DOM writes in single batch.

---

### ARCH-05-BP: DOM Isolation — Simulation systems ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track B/D (B-02, B-03, D-08)
**Verdict:** ✅ PASS — `input-system.js`, `player-move-system.js` do not import DOM APIs.

---

### ARCH-06-BP: Input contract ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
**Verdict:** ✅ PASS — `input-system.js` uses `getHeldKeys()` + `drainPressedKeys()`; snapshot consumed once per fixed step.

---

### ARCH-07-BP: Render-Intent Contract ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track D (D-07)
**Verdict:** ✅ PASS — `render-intent.js` uses pre-allocated parallel typed arrays; `classBits` bitmask correct.

---

### ARCH-02-MM: Verified Contracts ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (MM)
**Source Reports:** MM
**Verdict:** ✅ PASS — Render-intent buffer, classBits, adapter injection, DOM isolation, structural deferral, opaque entity access all honored.

---

## 4) Code Quality & Security

### SEC-01-BP: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/security/trusted-types.js` (~L10-17)
**Problem:** Default policy passes through strings without sanitization; no actual security benefit.
**Fix:** Implement proper sanitization or document why empty policy is acceptable.

---

### SEC-02-BP: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `vite.config.js` (~L27-28)
**Problem:** Weaker security for Vite HMR support; known trade-off.
**Fix:** Document trade-off in AGENTS.md or vite.config.js comments.

---

### SEC-03-BP: Policy gates can be bypassed locally ⬆ MEDIUM
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track A (A-01)
- `scripts/policy-gate/run-all.mjs`, `package.json` (~L30-41)
**Problem:** No pre-commit hook enforcing `npm run policy:checks:local`.
**Fix:** Add Husky pre-commit hook for policy checks.

---

### SEC-04-BP: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/security/trusted-types.js` (~L1-18)
**Problem:** Missing required block comment header per AGENTS.md.
**Fix:** Add file header explaining purpose, API, and implementation notes.

---

### SEC-05-BP: DOM Sinks Are Safe ⬆ PASS
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Verdict:** ✅ PASS — No unsafe sinks; all DOM updates use `textContent`, `setAttribute`, `classList.add`, `style.transform`.

---

### SEC-06-BP: No Forbidden Technologies Found ⬆ PASS
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Verdict:** ✅ PASS — No `var`, `require`, `XMLHttpRequest`, canvas, WebGL, or frameworks.

---

### SEC-07-BP: Global Error Handling Implemented ⬆ PASS
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track A (A-01)
- `src/main.ecs.js` (~L175-192), `src/ecs/world/world.js` (~L382-392)
**Verdict:** ✅ PASS — `installUnhandledRejectionHandler` implemented; system exceptions caught and quarantined.

---

### SEC-01-MM: No static CSP meta tag in `index.html` ⬆ LOW
**Origin:** Code Quality & Security (MM)
**Source Reports:** MM
**Files:** Track A/D (A-01, A-07, D-05, D-06)
- `index.html:1-21`
**Problem:** CSP dynamically injected by Vite; missing static fallback.
**Fix:** Add static CSP meta tag as defense-in-depth.

---

### Security Verification (MM) ⬆ PASS
**Origin:** Code Quality & Security (MM)
**Source Reports:** MM
**Verdict:** ✅ PASS — No unsafe sinks, dynamic code, forbidden tech, inline handlers; unhandledrejection handler installed.

---

## 5) Tests & CI Gaps

### CI-01-MM: CI pipeline missing test execution gates ⬆ BLOCKING
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-01, A-07)
- `.github/workflows/policy-gate.yml`
**Problem:** Workflow runs security scans but no test execution. Per AGENTS.md, CI must enforce Biome check, unit/integration/E2E tests, schema validation, coverage.
**Fix:** Add test execution steps after dependency install.

---

### CI-02-MM: Coverage thresholds excluded from CI enforcement ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-07)
- `.github/workflows/policy-gate.yml`
**Problem:** `vitest.config.js` sets coverage thresholds but CI never runs coverage enforcement.
**Fix:** Add coverage step that fails on threshold breach.

---

### TEST-01-BP: Missing unit tests for adapter entry points ⬆ HIGH
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track D (D-05, D-06)
- `src/adapters/dom/renderer-adapter.js`, `src/adapters/dom/renderer-board-css.js`
**Problem:** No Vitest/jsdom tests for adapter modules.
**Fix:** Create `tests/unit/adapters/renderer-adapter.test.js` and `renderer-board-css.test.js`.

---

### TEST-02-BP: Missing unit tests for security and environment modules ⬆ MEDIUM
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track A (A-01)
- `src/security/trusted-types.js`, `src/shared/env.js`, `src/main.ecs.js`
**Fix:** Remove `trusted-types.js` from vitest exclude; create unit tests.

---

### TEST-03-BP: Vitest excludes security module from coverage ⬆ HIGH
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track A (A-07)
- `vitest.config.js` (~L13)
**Problem:** `src/security/trusted-types.js` excluded from coverage.
**Fix:** Remove from exclude array; create `tests/unit/security/trusted-types.test.js`.

---

### TEST-04-BP: Semi-Automatable thresholds violate AGENTS.md ⬆ HIGH
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track A (A-06)
- `tests/e2e/audit/audit-question-map.js` (~L23-38)
**Problem:** Thresholds don't match AGENTS.md: F-17 maxP95FrameTime 20ms vs required 16.7ms; F-18 minP95Fps 50 vs required 60.
**Fix:** Update thresholds in `audit-question-map.js`.

---

### EV-01: No manual evidence artifacts collected ⬆ CRITICAL
**Origin:** Tests & CI Gaps (BP, MM)
**Source Reports:** BP (TEST-05), MM (EA-02)
**Files:** Track A (A-06, A-09)
- `docs/audit-reports/evidence/AUDIT-F-19.paint.md`, etc.
**Problem:** Manual evidence required for F-19, F-20, F-21, B-06 not collected.
**Fix:** Collect DevTools traces/screenshots and create manifest.

---

### TEST-06-BP: No DOM element budget test ⬆ MEDIUM
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track A/D (A-06, D-08)
**Problem:** AGENTS.md requires ≤500 DOM elements; no test verifies this.
**Fix:** Add Playwright test to count DOM elements after level load.

---

### TEST-07-BP: Ticket tracker status consistency ⬆ LOW
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track A (A-11)
- `docs/implementation/ticket-tracker.md` (~L37)
**Problem:** Line 37 claims "Done: 21" but actual count is 16 (P0+P1).
**Fix:** Update to "Done: 16 (P0+P1), 21 (all phases)".

---

### CI-01-GF: Add tests for Sprite Pool recycling fallback ⬆ HIGH
**Origin:** Tests & CI Gaps (GF)
**Source Reports:** GF
**Files:** Track A/D (A-04, D-09)
- `tests/integration/adapters/sprite-pool-adapter.test.js`
**Problem:** No test for un-warmed pool acquisition behavior.
**Fix:** Add unit test for sprite pool fallback creation.

---

### UT-01-MM to UT-07-MM: Missing unit tests for critical systems ⬆ HIGH (each)
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track B/C (B-06, B-07, B-08, C-04)
**Missing Tests:**
- `pause-system.js` (UT-01)
- `level-progress-system.js` (UT-02)
- `ghost-ai-system.js` (UT-03)
- `bomb-tick-system.js` (UT-04)
- `explosion-system.js` (UT-05)
- `power-up-system.js` (UT-06)
- `collision-gameplay-events.js` (UT-07)
**Fix:** Create corresponding unit test files for each system.

---

### IT-01-MM to IT-04-MM: Missing integration tests ⬆ BLOCKING (IT-01), HIGH (others)
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-05)
**Missing Tests:**
- `tests/integration/gameplay/*.test.js` (IT-01, blocking)
- Bomb chain reaction (IT-02)
- Pause invariants (IT-03)
- Event ordering (IT-04)
**Fix:** Implement per A-05 deliverables.

---

### AT-01-MM to AT-04-MM: Missing adapter tests ⬆ HIGH (each)
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-05, C-06)
**Missing Tests:**
- `audio-adapter.js` (AT-01)
- `hud-adapter.js` (AT-02)
- `screens-adapter.js` (AT-03)
- `storage-adapter.js` (AT-04)
**Fix:** Create corresponding adapter test files.

---

### EA-01-MM: E2E audit tests not fully implemented ⬆ BLOCKING
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-06)
**Problem:** 27 audit questions to cover, gaps remain.
**Fix:** Complete all A-06 checklist items.

---

### EA-03-MM: Missing E2E test for HUD runtime score increments ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-05, A-06)
**Problem:** AUDIT-F-15 requires runtime-visible score increments.
**Fix:** Add Playwright test verifying score increases on pellet collect.

---

### EA-04-MM: Missing E2E test for player death and lives decrement ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-02, A-06)
**Problem:** AUDIT-F-16 requires lives decrease on death.
**Fix:** Add Playwright test verifying lives decrement on death.

---

### AV-01-MM: Audit-traceability-matrix status outdated ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-06)
- `docs/implementation/audit-traceability-matrix.md`
**Problem:** Many rows show "Pending" but tests may be implemented.
**Fix:** Update matrix to reflect actual test file paths.

---

### AV-02-MM: Audit-question-map not linked to test files ⬆ MEDIUM
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track A (A-06)
- `tests/e2e/audit/audit-question-map.js`
**Problem:** Maps audit IDs but no `testFile` property.
**Fix:** Add `testFile` property to each audit entry.

---

## Cross-Reference: Finding ID Mapping
| Consolidated ID | BP ID | GF ID | MM ID | Track Ownership | Description |
|---|---|---|---|---|---|
| BUG-01-INPUT | BUG-01 | — | — | Track B | `assertValidInputAdapter` typo |
| BUG-01-SPRITE | — | BUG-01 | — | Track D | Sprite pool empty active pool crash |
| BUG-01-FRAME | — | — | BUG-01 | Track A | World frame not reset on restart |
| BUG-02-BP | BUG-02 | — | — | Track D | Map modification during iteration |
| BUG-02-MM | — | — | BUG-02 | Track A | `setEntityMask` return ignored |
| BUG-03-BP | BUG-03 | — | — | Track A/D | Clock double-invalid fallback |
| BUG-03-MM | — | — | BUG-03 | Track D | `entityElementMap` memory leak |
| BUG-04-MM | — | — | BUG-04 | Track C | Pause state edge case |
| BUG-06-MM | — | — | BUG-06 | Track D | Event queue drain comment misleading |
| BUG-10-MM | — | — | BUG-10 | Track D | Render-intent buffer overflow |
| BUG-13-MM | — | — | BUG-13 | Track A | No mask=0 validation |
| BUG-14-MM | — | — | BUG-14 | Track D | Sort comparator overflow |
| DEAD-01-ALLMASKS | DEAD-01 | — | — | Track B | `ALL_COMPONENT_MASKS` unused |
| DEAD-RESETQ | — | DEAD-01 | DEAD-02 | Track D | `resetOrderCounter` unused |
| DEAD-01-ENTITYSTORE | — | — | DEAD-01 | Track A | EntityStore unused methods |
| DEAD-02-SIMHZ | DEAD-02 | — | — | Track D | `SIMULATION_HZ` unused |
| DEAD-02-LEVELLOADER | — | DEAD-02 | — | Track A | Level loader sync loader unused |
| DEAD-03-BP | DEAD-03 | — | — | Track D | Ghost AI constants unused |
| DEAD-04-BP | DEAD-04 | — | — | Track D | `POWER_UP_TYPE` orphaned |
| DEAD-05-BP | DEAD-05 | — | — | Track D | `MAX_CHAIN_DEPTH` unreferenced |
| DEAD-06-BP | DEAD-06 | — | — | Track D | `GHOST_INTERSECTION_MIN_EXITS` unused |
| DEAD-07-BP | DEAD-07 | — | — | Track A | `maxrects-packer`/`sharp` unused |
| DEAD-08-BP | DEAD-08 | — | — | Track B | `destroy` contract over-specified |
| DEAD-09-BP | DEAD-09 | — | — | Track D | `KIND_TO_SPRITE_TYPE.WALL` unreachable |
| DEAD-10-BP | DEAD-10 | — | — | Track A | `trusted-types.js` excluded |
| DEAD-03-MM | — | — | DEAD-03 | Track A | Duplicate script in package.json |
| DEAD-04-MM | — | — | DEAD-04 | Track A | Unnecessary biome exclusion |
| DEAD-05-MM | — | — | DEAD-05 | Track D | `getActiveEntityHandles` inefficient |
| ARCH-01-BP | ARCH-01 | — | — | Track D | Event queue `drain()` allocation |
| ARCH-01-GF | — | ARCH-01 | — | Track D | Event queue `resetOrderCounter` risk |
| ARCH-02 | ARCH-02 | — | ARCH-01 | Track D | `display:none` violates pooling rule |
| ARCH-03-BP | ARCH-03 | — | — | Track D | `currentFrameEntityIds` per-frame allocation |
| SEC-01-BP | SEC-01 | — | — | Track D | Trusted Types policy permissive |
| SEC-02-BP | SEC-02 | — | — | Track D | Dev CSP uses unsafe-eval |
| SEC-03-BP | SEC-03 | — | — | Track A | Policy gates bypassable |
| SEC-04-BP | SEC-04 | — | — | Track D | Missing `trusted-types.js` header |
| SEC-01-MM | — | — | SEC-01 | Track A/D | No static CSP meta tag |
| CI-01-MM | — | — | CI-01 | Track A | CI no test gates |
| CI-02-MM | — | — | CI-02 | Track A | No coverage enforcement |
| TEST-01-BP | TEST-01 | — | — | Track D | Missing adapter unit tests |
| TEST-02-BP | TEST-02 | — | — | Track A | Missing security/env tests |
| TEST-03-BP | TEST-03 | — | — | Track A | Vitest excludes security module |
| TEST-04-BP | TEST-04 | — | — | Track A | Semi-automatable thresholds wrong |
| EV-01 | TEST-05 | — | EA-02 | Track A | No manual evidence artifacts |
| TEST-06-BP | TEST-06 | — | — | Track A/D | No DOM element budget test |
| TEST-07-BP | TEST-07 | — | — | Track A | Ticket tracker count off |
| CI-01-GF | — | CI-01 | — | Track D | Missing sprite pool test |
| UT-01-MM | — | — | UT-01 | Track C | Missing pause-system tests |
| UT-02-MM | — | — | UT-02 | Track C | Missing level-progress-system tests |
| UT-03-MM | — | — | UT-03 | Track B | Missing ghost-ai-system tests |
| UT-04-MM | — | — | UT-04 | Track B | Missing bomb-tick-system tests |
| UT-05-MM | — | — | UT-05 | Track B | Missing explosion-system tests |
| UT-06-MM | — | — | UT-06 | Track B | Missing power-up-system tests |
| UT-07-MM | — | — | UT-07 | Track B | Missing collision-gameplay-events tests |
| IT-01-MM | — | — | IT-01 | Track A | Integration tests not started |
| IT-02-MM | — | — | IT-02 | Track A | Missing bomb chain reaction test |
| IT-03-MM | — | — | IT-03 | Track A | Missing pause invariants test |
| IT-04-MM | — | — | IT-04 | Track A | Missing event ordering test |
| AT-01-MM | — | — | AT-01 | Track C | Missing audio-adapter tests |
| AT-02-MM | — | — | AT-02 | Track C | Missing hud-adapter tests |
| AT-03-MM | — | — | AT-03 | Track C | Missing screens-adapter tests |
| AT-04-MM | — | — | AT-04 | Track C | Missing storage-adapter tests |
| EA-01-MM | — | — | EA-01 | Track A | E2E audit tests not implemented |
| EA-03-MM | — | — | EA-03 | Track C | Missing HUD score test |
| EA-04-MM | — | — | EA-04 | Track C | Missing lives decrement test |
| AV-01-MM | — | — | AV-01 | Track A | Audit matrix outdated |
| AV-02-MM | — | — | AV-02 | Track A | Audit map missing testFile |

---

## Recommended Fix Order
### Phase 1 — Blocking & Critical (must fix before A-11 completion)
1. **CI-01-MM**: Add test execution gates to CI pipeline (Track A)
2. **EA-01-MM**: Complete E2E audit tests (Track A)
3. **ARCH-02**: Replace `display:none` with offscreen transform (Track D)
4. **BUG-01-INPUT**: Fix `assertValidInputAdapter` typo (Track B)
5. **EV-01**: Collect manual evidence artifacts (Track A)

### Phase 2 — High Severity (immediate follow-up)
6. **BUG-01-SPRITE**: Fix sprite pool empty active pool crash (Track D)
7. **TEST-01-BP**: Write adapter unit tests (Track D)
8. **TEST-03-BP**: Remove `trusted-types.js` from vitest exclude (Track A)
9. **TEST-04-BP**: Fix semi-automatable thresholds (Track A)
10. **CI-02-MM**: Add coverage enforcement to CI (Track A)
11. **DEAD-01-ENTITYSTORE**: Remove unused EntityStore methods (Track A)
12. **CI-01-GF**: Add sprite pool recycling test (Track D)
13. **UT-01-MM to UT-07-MM**: Add missing unit tests (Tracks B/C)
14. **AT-01-MM to AT-04-MM**: Add missing adapter tests (Track C)
15. **EA-03-MM, EA-04-MM**: Add HUD runtime tests (Track C)

### Phase 3 — Medium Severity
16. **ARCH-01-BP**: Fix event queue `drain()` allocation (Track D)
17. **ARCH-01-GF**: Remove `resetOrderCounter` (Track D)
18. **ARCH-03-BP**: Fix `currentFrameEntityIds` per-frame allocation (Track D)
19. **SEC-01-BP**: Fix Trusted Types policy (Track D)
20. **SEC-03-BP**: Add pre-commit hook for policy gates (Track A)
21. **TEST-02-BP**: Write missing security/env tests (Track A)
22. **BUG-03-MM**: Fix `entityElementMap` memory leak (Track D)
23. **BUG-10-MM**: Fix render-intent buffer overflow (Track D)
24. **DEAD-RESETQ**: Remove `resetOrderCounter` (Track D)
25. **DEAD-03-BP**: Remove ghost AI constants (Track D)
26. **DEAD-04-BP**: Remove `POWER_UP_TYPE` (Track D)
27. **DEAD-05-MM**: Optimize `getActiveEntityHandles` (Track D)
28. **BUG-01-FRAME**: Reset `world.frame` on restart (Track A)
29. **BUG-04-MM**: Fix pause state edge case (Track C)
30. **AV-01-MM**: Update audit traceability matrix (Track A)
31. **AV-02-MM**: Add `testFile` to audit-question-map (Track A)
32. **TEST-06-BP**: Add DOM element budget test (Track A/D)
33. **IT-01-MM to IT-04-MM**: Add missing integration tests (Track A)

### Phase 4 — Low Severity (maintenance)
34. **BUG-02-BP**: Fix Map iteration in `render-dom-system.js` (Track D)
35. **BUG-03-BP**: Fix clock fallback logic (Track A/D)
36. **BUG-02-MM**: Add `setEntityMask` validation (Track A)
37. **BUG-13-MM**: Add mask=0 validation (Track A)
38. **BUG-06-MM**: Fix event queue comment (Track D)
39. **BUG-14-MM**: Fix sort comparator (Track D)
40. **DEAD-01-ALLMASKS**: Remove `ALL_COMPONENT_MASKS` export (Track B)
41. **DEAD-02-SIMHZ**: Remove `SIMULATION_HZ` export (Track D)
42. **DEAD-05-BP**: Remove `MAX_CHAIN_DEPTH` (Track D)
43. **DEAD-06-BP**: Remove `GHOST_INTERSECTION_MIN_EXITS` (Track D)
44. **DEAD-07-BP**: Remove unused dependencies (Track A)
45. **DEAD-08-BP**: Fix `destroy` contract (Track B)
46. **DEAD-09-BP**: Remove unreachable `KIND_TO_SPRITE_TYPE.WALL` (Track D)
47. **DEAD-10-BP**: Remove `trusted-types.js` coverage exclusion (Track A)
48. **DEAD-03-MM**: Remove duplicate script (Track A)
49. **DEAD-04-MM**: Remove unnecessary biome exclusion (Track A)
50. **SEC-02-BP**: Document CSP trade-offs (Track D)
51. **SEC-04-BP**: Add `trusted-types.js` header (Track D)
52. **SEC-01-MM**: Add static CSP meta tag (Track A)
53. **TEST-07-BP**: Fix ticket tracker count (Track A)

---

## Notes
- Merged three independent audit reports with 15 total analysis passes; 67 deduplicated findings (excluding PASS entries, after merging 3 pairs: ARCH-02, EV-01, DEAD-RESETQ).
- Most critical P1 finding is **BUG-01-INPUT** which breaks input system validation due to a typo.
- **ARCH-02** is a clear AGENTS.md rendering rule violation.
- Security posture is excellent across all reports: no critical vulnerabilities found.
- Many test gaps exist due to pending implementation tickets (B-06, B-07, B-08, C-04, C-05).
- Positive findings: Proper ECS contracts honored, no forbidden technologies, robust error handling.
- P1 Visual Prototype scope tickets (D-05, D-06, B-02, B-03, D-07, D-09, D-08) marked `[x]` complete; this report fulfills A-11 consolidation requirement.

---
*End of consolidated report.*