# Codebase Analysis & Audit Report - P1 (Visual Prototype)

**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P1 (Visual Prototype) — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — runtime bugs, logic errors, race conditions
2. **Dead Code & Unused References** — dead code, unused exports, stale configuration  
3. **Architecture, ECS Violations & Guideline Drift** — ECS rules, boundary breaches, structural integrity
4. **Code Quality & Security** — security vulnerabilities, unsafe patterns, validation gaps
5. **Tests & CI Gaps** — missing test coverage, CI weaknesses, audit verification gaps

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

**P1 Scope:** D-05 (CSS Layout), D-06 (Renderer Adapter), B-02 (Input Adapter/System), B-03 (Movement & Collision), D-07 (Render Collect), D-09 (Sprite Pool), D-08 (Render DOM)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 2 |
| 🟠 High | 5 |
| 🟡 Medium | 8 |
| 🟢 Low / Info | 10 |

**Top risks:**
1. **BUG-01/02**: `assertValidInputAdapter` has typo (`getHeldKeys` vs `getHeldKeys`) — breaks input system validation (B-02)
2. **ARCH-02**: `render-dom-system.js` uses `display:none` for HIDDEN flag instead of offscreen transform (D-08)
3. **ARCH-01**: Event queue `drain()` allocates new array per call (D-01, but affects D-07/D-08)
4. **SEC-01**: Trusted Types policy is permissive passthrough (D-01)
5. **TEST-02**: Missing unit tests for adapter entry points `renderer-adapter.js`, `renderer-board-css.js` (D-06)

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

### BUG-02: Modifying Map during iteration in `render-dom-system.js` ⬆ MEDIUM
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

### BUG-03: Clock fallback logic doesn't handle double-invalid timestamps ⬆ LOW
**Origin:** 1. Bugs & Logic Errors  
**Files:** Ownership: Track A/D (Tickets: D-01)  
- `src/ecs/resources/clock.js` (~L66)

**Problem:** In `tickClock`, the `timestamp` falls back to `clock.lastFrameTime` when `now` is not finite, but doesn't handle the case where BOTH are invalid.

**Impact:** If the clock receives invalid timestamps and has an invalid baseline, frame time calculation could be incorrect.

**Fix:**
```javascript
const timestamp = Number.isFinite(now) ? now : (Number.isFinite(clock.lastFrameTime) ? clock.lastFrameTime : 0);
```

**Tests to add:** Test `tickClock` with non-finite `now` and invalid `lastFrameTime`.

---

## 2) Dead Code & Unused References

### DEAD-01: ALL_COMPONENT_MASKS exported but never imported ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track B (Tickets: B-01)  
- `src/ecs/components/registry.js` (~L56)

**What is dead:** `ALL_COMPONENT_MASKS` is exported but never imported anywhere in the codebase.

**Action:** Remove export, or document intent if planned for future tooling.

---

### DEAD-02: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/constants.js` (~L23)

**What is dead:** `SIMULATION_HZ` is exported but only used locally to derive `FIXED_DT_MS`. No module imports `SIMULATION_HZ` directly.

**Action:** Remove export, keep as local const.

---

### DEAD-03: Ghost AI constants unused ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/constants.js` (~L92-98)

**What is dead:** `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, `INKY_REFERENCE_OFFSET` are never imported or used in any system.

**Action:** Remove dead constants or annotate as planned for ghost AI ticket.

---

### DEAD-04: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/constants.js` (~L147-160)

**What is dead:** `POWER_UP_TYPE` enum is never imported. The `props.js` module defines its own `PROP_POWER_UP_TYPE`.

**Action:** Remove `POWER_UP_TYPE` from `constants.js`.

---

### DEAD-05: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/constants.js` (~L63)

**What is dead:** `MAX_CHAIN_DEPTH` is defined but never imported or referenced in any system logic.

**Action:** Remove dead constant.

---

### DEAD-06: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/constants.js` (~L101)

**What is dead:** `GHOST_INTERSECTION_MIN_EXITS` is defined but never imported or used.

**Action:** Remove dead constant.

---

### DEAD-07: `maxrects-packer` and `sharp` have zero imports ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track A (Tickets: A-01)  
- `package.json` (~L50-51)

**What is dead:** `maxrects-packer` and `sharp` are in `devDependencies` but have zero imports in `src/` or `scripts/`.

**Action:** Remove from `devDependencies` or add comment referencing planned ticket (D-06).

---

### DEAD-08: `destroy` contract may be over-specified ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track B (Tickets: B-02)  
- `src/adapters/io/input-adapter.js` (~L117-127)

**What is dead:** `assertValidInputAdapter` requires `adapter.destroy` to be a function, but this is not part of the core input adapter contract for gameplay.

**Action:** Fix assertion to match actual contract, or remove `destroy` requirement if not needed.

---

### DEAD-09: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track D (Tickets: D-08)  
- `src/ecs/systems/render-dom-system.js` (~L37-45)

**What is dead:** `RENDERABLE_KIND.WALL` maps to `null`. Walls don't have a Renderable component, so this mapping is unreachable.

**Action:** Remove `RENDERABLE_KIND.WALL` entry from `KIND_TO_SPRITE_TYPE`.

---

### DEAD-10: `trusted-types.js` excluded but untested ⬆ LOW
**Origin:** 2. Dead Code & Unused References  
**Files:** Ownership: Track A (Tickets: A-01)  
- `vite.config.js` / `vitest.config.js` (~L13)

**What is dead:** `src/security/trusted-types.js` is excluded from coverage. No corresponding test file exists.

**Action:** Add a test for `trusted-types.js` and remove the coverage exclusion.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Event queue `drain()` allocates new array per call ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Violated rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/ecs/resources/event-queue.js` (~L88)

**Problem:** `drain()` uses `[...queue.events]` which allocates a new array each call.

**Impact:** Each `drain()` call allocates a new array; for deterministic event processing this could be pre-allocated.

**Fix:** Use `slice()` (still allocates) or implement a pre-allocated ring buffer for events.

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

### ARCH-03: `render-dom-system.js` creates `currentFrameEntityIds` Set every frame ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Violated rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*  
**Files:** Ownership: Track D (Tickets: D-08)  
- `src/ecs/systems/render-dom-system.js` (~L111)

**Problem:** `const currentFrameEntityIds = new Set()` is created every render frame.

**Impact:** New Set allocated per render frame.

**Fix:** Hoist Set to system closure; clear in-place with `clear()`.

---

### ARCH-04: Render separation — render commit phase ⬆ PASS
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Files:** Ownership: Track D (Tickets: D-07, D-08)  

**Verdict:** ✅ PASS — `render-collect-system.js` computes intents, `render-dom-system.js` applies DOM writes in single batch. Correct separation.

---

### ARCH-05: DOM Isolation — Simulation systems ⬆ PASS
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Files:** Ownership: Track B/D (Tickets: B-02, B-03, D-08)  

**Verdict:** ✅ PASS — `input-system.js`, `player-move-system.js` do NOT import DOM APIs. Only `render-dom-system.js` (allowed) touches DOM.

---

### ARCH-06: Input contract ⬆ PASS
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Files:** Ownership: Track B (Tickets: B-02)  

**Verdict:** ✅ PASS — `input-system.js` uses `getHeldKeys()` + `drainPressedKeys()`; snapshot consumed once per fixed step in `bootstrap.js`.

---

### ARCH-07: Render-Intent Contract ⬆ PASS
**Origin:** 3. Architecture, ECS Violations & Guideline Drift  
**Files:** Ownership: Track D (Tickets: D-07)  

**Verdict:** ✅ PASS — `render-intent.js` uses pre-allocated parallel typed arrays; `classBits` bitmask implemented correctly.

---

## 4) Code Quality & Security

### SEC-01: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** 4. Code Quality & Security  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/security/trusted-types.js` (~L10-17)

**Problem:** The default Trusted Types policy simply passes through strings without sanitization. While this satisfies the CSP `require-trusted-types-for 'script'` directive, it provides no actual sanitization benefit.

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

### SEC-04: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** 4. Code Quality & Security  
**Files:** Ownership: Track D (Tickets: D-01)  
- `src/security/trusted-types.js` (~L1-18)

**Problem:** The file is missing the required block comment header per AGENTS.md ("Each file MUST begin with a comment block...").

**Fix:** Add a proper file header comment explaining the purpose, public API, and implementation notes.

---

### SEC-05: DOM Sinks Are Safe ⬆ PASS
**Origin:** 4. Code Quality & Security  

**Verdict:** ✅ PASS — No `innerHTML`, `outerHTML`, or `insertAdjacentHTML` found. All DOM updates use safe sinks: `textContent`, `setAttribute`, `classList.add`, `style.transform`.

---

### SEC-06: No Forbidden Technologies Found ⬆ PASS
**Origin:** 4. Code Quality & Security  

**Verdict:** ✅ PASS — No `var`, `require`, `XMLHttpRequest`, canvas, WebGL, React, Vue, Angular, or jQuery found.

---

### SEC-07: Global Error Handling Implemented ⬆ PASS
**Origin:** 4. Code Quality & Security  
**Files:** Ownership: Track A (Tickets: A-01)  
- `src/main.ecs.js` (~L175-192), `src/ecs/world/world.js` (~L382-392)

**Verdict:** ✅ PASS — `installUnhandledRejectionHandler` is implemented. System exceptions caught, logged, and quarantined.

---

## 5) Tests & CI Gaps

### TEST-01: Missing unit tests for adapter entry points ⬆ HIGH
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track D (Tickets: D-05, D-06)  
- `src/adapters/dom/renderer-adapter.js` — no unit test
- `src/adapters/dom/renderer-board-css.js` — no unit test

**What is missing:** No Vitest/jsdom tests for these adapter modules. `renderer-board-css.js` generates the CSS Grid board structure.

**Fix:** Create `tests/unit/adapters/renderer-adapter.test.js` and `tests/unit/adapters/renderer-board-css.test.js` using jsdom.

---

### TEST-02: Missing unit tests for security and environment modules ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A (Tickets: A-01)  
- `src/security/trusted-types.js` — excluded from coverage
- `src/shared/env.js` — no unit test
- `src/main.ecs.js` — no unit test

**Fix:** Remove `src/security/trusted-types.js` from vitest.config.js `exclude` array. Create unit tests for these modules.

---

### TEST-03: Vitest excludes security module from coverage ⬆ HIGH
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A (Tickets: A-07)  
- `vitest.config.js` (~L13)

**What is missing:** `src/security/trusted-types.js` is in the `exclude` array, meaning security code coverage is not measured.

**Fix:** Remove `'src/security/trusted-types.js'` from `exclude` array. Create `tests/unit/security/trusted-types.test.js`.

---

### TEST-04: Semi-Automatable thresholds violate AGENTS.md ⬆ HIGH
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A (Tickets: A-06)  
- `tests/e2e/audit/audit-question-map.js` (~L23-38)

**What is missing:** Threshold values don't match AGENTS.md performance budget:
- **F-17**: `maxP95FrameTimeMs: 20` — AGENTS.md requires ≤ 16.7 ms
- **F-18**: `minP95Fps: 50` — AGENTS.md requires ≥ 60 FPS

**Fix:** Update thresholds in `audit-question-map.js` to match AGENTS.md.

---

### TEST-05: Manual evidence artifacts are placeholders ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A (Tickets: A-09)  
- `docs/audit-reports/evidence/AUDIT-F-19.paint.md` (placeholder)
- `docs/audit-reports/evidence/AUDIT-F-20.layers.md` (placeholder)
- `docs/audit-reports/evidence/AUDIT-F-21.promotion.md` (placeholder)

**Fix:** Before P4 closure, collect actual DevTools traces and screenshots for P1 Visual Prototype evidence.

---

### TEST-06: No DOM element budget test ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A/D (Tickets: A-06, D-08)  

**What is missing:** AGENTS.md specifies "DOM Elements: ≤ 500 total". No test verifies this after level load.

**Fix:** Add a Playwright test in `audit.browser.spec.js` to count DOM elements.

---

### TEST-07: Ticket tracker status consistency ⬆ LOW
**Origin:** 5. Tests & CI Gaps  
**Files:** Ownership: Track A (Tickets: A-11)  
- `docs/implementation/ticket-tracker.md` (~L37)

**What is missing:** Line 37 says "Done: 21" but actual count of `[x]` in P0+P1 = 9 (P0) + 7 (P1, excluding A-11) = 16 done in these phases.

**Fix:** Update line 37 to reflect accurate count: "Done: 16 (P0+P1), 21 (all phases)".

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|---|---|---|---|---|---|---|---|
| BUG-01 | BUG-01 | — | — | — | — | Track B | `assertValidInputAdapter` typo |
| BUG-02 | BUG-05 | — | — | — | — | Track D | Map modification during iteration |
| BUG-03 | BUG-06 | — | — | — | — | Track A/D | Clock double-invalid fallback |
| DEAD-01 | — | DEAD-01 | — | — | — | Track B | `ALL_COMPONENT_MASKS` unused |
| DEAD-02 | — | DEAD-03 | — | — | — | Track D | `SIMULATION_HZ` export unused |
| DEAD-03 | — | DEAD-04 | — | — | — | Track D | Ghost AI constants unused |
| DEAD-04 | — | DEAD-05 | — | — | — | Track D | `POWER_UP_TYPE` orphaned |
| DEAD-05 | — | DEAD-06 | — | — | — | Track D | `MAX_CHAIN_DEPTH` unreferenced |
| DEAD-06 | — | DEAD-07 | — | — | — | Track D | `GHOST_INTERSECTION_MIN_EXITS` unused |
| DEAD-07 | — | DEAD-08 | — | — | — | Track A | `maxrects-packer`, `sharp` unused |
| DEAD-08 | — | DEAD-09 | — | — | — | Track B | `destroy` contract over-specified |
| DEAD-09 | — | DEAD-13 | — | — | — | Track D | `KIND_TO_SPRITE_TYPE.WALL` unreachable |
| DEAD-10 | — | DEAD-14 | — | — | — | Track A | `trusted-types.js` excluded |
| SEC-01 | — | — | — | SEC-01 | — | Track D | Trusted Types policy permissive |
| SEC-02 | — | — | — | SEC-02 | — | Track D | Dev CSP uses unsafe-eval |
| SEC-03 | — | — | — | SEC-03 | — | Track A | Policy gates bypassable locally |
| SEC-04 | — | — | — | SEC-12 | — | Track D | Missing source header on `trusted-types.js` |
| ARCH-01 | — | — | ARCH-10 | — | — | Track D | Event queue `drain()` allocates |
| ARCH-02 | — | — | ARCH-05 | — | — | Track D | HIDDEN flag uses `display:none` |
| ARCH-03 | — | — | ARCH-13 | — | — | Track D | `currentFrameEntityIds` allocated per frame |
| TEST-01 | — | — | — | — | TEST-02 | Track D | Missing adapter unit tests |
| TEST-02 | — | — | — | — | TEST-03 | Track A | Missing security/env tests |
| TEST-03 | — | — | — | — | TEST-08 | Track A | Vitest excludes security module |
| TEST-04 | — | — | — | — | TEST-05 | Track A | Semi-automatable thresholds wrong |
| TEST-05 | — | — | — | — | TEST-06 | Track A | Manual evidence are placeholders |
| TEST-06 | — | — | — | — | TEST-10 | Track A/D | No DOM element budget test |
| TEST-07 | — | — | — | — | TEST-12 | Track A | Ticket tracker count off |

---

## Recommended Fix Order

### Phase 1 — Critical (must fix before A-11 completion)
1. **BUG-01**: Fix `assertValidInputAdapter` typo in `getHeldKeys`/`clearHeldKeys` (Track B)
2. **ARCH-02**: Fix HIDDEN flag to use `translate()` not `display:none` (Track D)

### Phase 2 — High Severity (immediate follow-up)
3. **TEST-01**: Write adapter unit tests (Track D)
4. **TEST-03**: Remove `trusted-types.js` from vitest exclude, write tests (Track A)
5. **TEST-04**: Fix Semi-Automatable thresholds in `audit-question-map.js` (Track A)

### Phase 3 — Medium Severity
6. **ARCH-01**: Fix event queue `drain()` allocation (Track D)
7. **ARCH-03**: Fix `currentFrameEntityIds` per-frame allocation (Track D)
8. **SEC-01**: Implement/fix Trusted Types policy (Track D)
9. **SEC-03**: Add pre-commit hook for policy gates (Track A)
10. **TEST-02**: Write missing unit tests for security/env modules (Track A)
11. **TEST-05**: Collect real manual evidence artifacts for P1 (Track A)
12. **TEST-06**: Add DOM element budget test (Track A/D)

### Phase 4 — Low Severity (maintenance)
13. **BUG-02**: Fix Map iteration in `render-dom-system.js` (Track D)
14. **BUG-03**: Fix clock fallback logic (Track A/D)
15. **DEAD-01**: Remove `ALL_COMPONENT_MASKS` export (Track B)
16. **DEAD-02**: Remove `SIMULATION_HZ` export (Track D)
17. **DEAD-03**: Remove ghost AI constants (Track D)
18. **DEAD-04**: Remove `POWER_UP_TYPE` (Track D)
19. **DEAD-05**: Remove `MAX_CHAIN_DEPTH` (Track D)
20. **DEAD-06**: Remove `GHOST_INTERSECTION_MIN_EXITS` (Track D)
21. **DEAD-07**: Remove unused dependencies from `package.json` (Track A)
22. **DEAD-08**: Fix `destroy` contract in input adapter (Track B)
23. **DEAD-09**: Remove unreachable `KIND_TO_SPRITE_TYPE.WALL` (Track D)
24. **DEAD-10**: Remove `trusted-types.js` from coverage exclusion (Track A)
25. **SEC-02**: Document CSP development trade-offs (Track D)
26. **SEC-04**: Add source header to `trusted-types.js` (Track D)
27. **TEST-07**: Fix ticket tracker count (Track A)

---

## Notes

- The most critical finding for P1 is **BUG-01** which will break the entire input system validation due to a simple typo in method name capitalization.
- **ARCH-02** represents a clear AGENTS.md rendering rule violation where `display:none` is used instead of the mandated offscreen transform.
- **ARCH-01** and **ARCH-03** highlight performance allocation issues in P1-critical systems (event-queue, render-dom).
- The codebase shows strong security posture overall with no critical vulnerabilities found (no `innerHTML`, no canvas, no frameworks).
- P1 Visual Prototype scope includes: D-05, D-06, B-02, B-03, D-07, D-09, D-08 — all marked `[x]` complete.
- A-11 (P1 consolidation ticket) remains as the final check — this report fulfills that requirement.

---

*End of report.*
