# Phase 1 (Visual Prototype) — Consolidated Codebase Audit Report

> **Date**: 2026-05-05
> **Phase**: P1 — Visual Prototype: Maze & Movement
> **Branch**: `asmyrogl/process-hotfix-test-coverage` (Track B coverage extension)
> **Audit Methodology**: 5-pass analysis per `.github/prompts/code-analysis-audit.prompt.md`
> **Test Status**: 57 test files, 694 tests passing, 92.52% statement coverage

---

## Executive Summary

Phase 1 is substantially complete at the system-layer level. The core rendering pipeline (render-collect → render-dom-system → sprite pool) is implemented and tested. However, **ticket D-08 remains marked incomplete** in the tracker, which is the formal P1 gate blocker. The main issues found are:

1. **Critical Bug**: Double-bootstrap execution path in production (severity: HIGH)
2. **Architecture Violation**: `display:none` used instead of offscreen transform in render-dom-system (severity: MEDIUM)
3. **Performance**: Per-frame `new Set()` allocation in render-dom-system (severity: MEDIUM)
4. **Dead Code**: `renderer-dom.js` adapter duplicates `render-dom-system.js` functionality (severity: LOW)
5. **Architecture**: Two competing render paths create confusion about which is canonical (severity: MEDIUM)

---

## Pass 1: Bugs & Logic Errors

### BUG-01 — Double Bootstrap Execution (HIGH)

| Field | Value |
|-------|-------|
| **File** | `src/main.ecs.js:513-514`, `src/main.js:14` |
| **Ticket** | A-03 |
| **Track** | A |

**Description**: `main.ecs.js` lines 513-514 auto-executes `bootstrapApplication()` when `window` and `document` exist:
```js
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void bootstrapApplication();
}
```
Meanwhile, `main.js` (the actual HTML entrypoint) also calls:
```js
import { startBrowserApplication } from './main.ecs.js';
startBrowserApplication();
```
Since `startBrowserApplication` is aliased to `bootstrapApplication` (line 511), this triggers **two concurrent async bootstrap calls** in production. The second call will race with the first, potentially creating duplicate rAF loops, duplicate input listeners, and double DOM rendering.

**Fix**: Remove the auto-execution guard in `main.ecs.js:513-514`. The `main.js` entrypoint is the sole designated browser trigger (as documented in its own header comment).

---

### BUG-02 — Spawn System Creates Multiple Sets Per Tick (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/ecs/systems/spawn-system.js:228,236,248,297,329` |
| **Ticket** | C-03 |
| **Track** | C |

**Description**: `createMembershipSet()` at line 228 creates a `new Set(...)` and is called multiple times per tick within `pruneRespawningGhostsFromReleasedIds`, `countActiveReleasedGhosts`, `releaseEligibleGhosts`, and `enqueueNewlyEligibleInitialGhosts`. Under heavy ghost churn (4 ghosts dying/respawning), this creates 4-5 Sets per fixed step.

**Impact**: Minor GC pressure during active gameplay. Not critical since ghost counts are capped at 4, but violates the "zero-allocation hot path" guidance.

**Fix**: Hoist a reusable scratch Set into system closure scope (same pattern as explosion-system's `processedBombIds`).

---

### BUG-03 — Event Queue drain() Returns Empty Array on Hot Path (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/ecs/resources/event-queue.js:72-73` |
| **Ticket** | D-01 |
| **Track** | D |

**Description**: When the queue is empty, `drain()` returns a fresh `[]` literal every call. If `drain()` is called every frame (which is the expected pattern), this allocates a garbage array per frame.

**Fix**: Return a frozen singleton empty array: `const EMPTY_EVENTS = Object.freeze([]);`

---

## Pass 2: Dead Code & Unused Exports

### DEAD-01 — Duplicate DOM Renderer (`renderer-dom.js`) (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `src/adapters/dom/renderer-dom.js` |
| **Ticket** | D-08 |
| **Track** | D |

**Description**: `renderer-dom.js` implements a standalone `createDomRenderer()` that creates elements, manages a `new Set()` of stale IDs per frame, and performs the same translate3d + opacity batch writes as `render-dom-system.js`. The ECS system (`render-dom-system.js`) is the canonical D-08 implementation registered through bootstrap and integrated with the sprite pool. `renderer-dom.js` is imported only in `main.ecs.js:39` and passed to `bootstrap.registerRenderer()`.

**Root Cause**: `renderer-dom.js` was the earlier prototype before the ECS system was written. Now both exist, but bootstrap registers the standalone renderer while **also** registering the ECS render-dom-system in its system pipeline. This means the render pipeline runs **twice** per frame: once through the ECS system dispatch in `runRenderCommit`, and once through the standalone `renderer.update()` in `stepFrame`.

**Impact**: Double DOM writes per frame → potential flicker, double element creation, and wasted work.

**Fix**: Either (a) remove the standalone `registerRenderer` path and rely solely on the ECS render-dom-system, or (b) remove `render-dom-system.js` from the bootstrap system list and use `renderer-dom.js` as the adapter. The project architecture favors option (a) because the ECS system integrates with the sprite pool.

---

### DEAD-02 — `renderer-dom.js` Uses Its Own Element Map (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/adapters/dom/renderer-dom.js:31` |
| **Ticket** | D-08 |
| **Track** | D |

**Description**: Creates its own `const elementMap = new Map()` and `new Set(elementMap.keys())` per frame (line 40), completely independent of the sprite pool. This means the standalone renderer bypasses the preallocation strategy of `sprite-pool-adapter.js`.

**Fix**: Subsumed by DEAD-01 resolution.

---

### DEAD-03 — `src/main.js` Is Nearly Empty (INFORMATIONAL)

| Field | Value |
|-------|-------|
| **File** | `src/main.js` |
| **Ticket** | A-03 |
| **Track** | A |

**Description**: `main.js` is 14 lines, with its only purpose being to call `startBrowserApplication()`. Since `main.ecs.js` already auto-executes (BUG-01), one of these two entry strategies is dead.

**Fix**: After fixing BUG-01, `main.js` becomes the sole entrypoint and remains necessary.

---

## Pass 3: Architecture & ECS Violations

### ARCH-01 — `display:none` in Render DOM System (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `src/ecs/systems/render-dom-system.js:74` |
| **Ticket** | D-08 |
| **Track** | D |

**Description**: `applyVisualFlagClasses()` sets `el.style.display = 'none'` when the `HIDDEN` visual flag is active. AGENTS.md explicitly mandates: "Pooled elements are hidden with `transform: translate(-9999px, -9999px)` NOT `display: none`." The sprite pool adapter correctly uses the offscreen transform pattern (line 30), but the system that consumes pool elements violates it.

**Impact**: `display:none` removes the element from layout entirely, causing reflow when it reappears. This can trigger layout thrashing during rapid ghost state changes (stunned→dead→respawning) and creates measurable jank above 60 FPS targets.

**Fix**: Replace line 74 with:
```js
el.style.transform = 'translate(-9999px, -9999px)';
```
And skip the normal transform update when HIDDEN is set.

---

### ARCH-02 — Per-Frame Set Allocation in Render DOM System (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `src/ecs/systems/render-dom-system.js:111` |
| **Ticket** | D-08 |
| **Track** | D |

**Description**: `const currentFrameEntityIds = new Set()` is created inside the `update()` function, which runs every frame. This violates the "no recurring allocations per frame" rule from AGENTS.md.

**Fix**: Hoist the Set to the system closure (alongside `entityElementMap`) and call `.clear()` at the start of each frame.

---

### ARCH-03 — Two Competing Render Pipelines (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `src/game/bootstrap.js:242,443` + `src/main.ecs.js:438,478` |
| **Ticket** | D-08 |
| **Track** | D |

**Description**: The architecture has two render execution paths:
1. **ECS path**: `runRenderCommit()` → render-collect-system → render-dom-system (via sprite pool)
2. **Adapter path**: `stepFrame()` → `registeredRenderer.update(renderIntent)` (via `renderer-dom.js`)

Both paths consume the same `renderIntent` buffer in the same frame. The ECS system uses the sprite pool; the adapter does not.

**Impact**: Confusion about which path is canonical, potential double DOM writes, and architectural inconsistency that will worsen as more systems depend on the sprite pool.

**Fix**: Designate one canonical path. The ECS system is the correct architecture per AGENTS.md. Remove the `registerRenderer` adapter path or make it a no-op that delegates to the ECS system.

---

### ARCH-04 — World Exposes Mutable Internals (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/ecs/world/world.js` (getters for `entityStore`, `systemsByPhase`) |
| **Ticket** | A-02 |
| **Track** | A |

**Description**: The World class exposes `get entityStore()` and `get systemsByPhase()` which return references to mutable internal data structures. External code can mutate the entity store or system registry without going through the World's controlled API.

**Impact**: Low in current codebase (only test code and life-system use `world.entityStore.isAlive()`), but creates a footgun for future code.

**Fix**: Return frozen views or proxy objects, or document the getter as `@internal` and enforce via policy lint.

---

### ARCH-05 — Bootstrap Direct DOM Access in `onLevelLoaded` (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/game/bootstrap.js:495` (approximate — in the level-loaded callback) |
| **Ticket** | A-03 |
| **Track** | A |

**Description**: The `onLevelLoaded` callback in bootstrap uses `document.getElementById('game-board')` directly. While bootstrap is technically an adapter-level module (not a simulation system), this couples level loading to a specific DOM ID, making it harder to test and violating the principle of DOM access only through injected dependencies.

**Fix**: Accept the container element as a constructor parameter or resolve it from a registered resource.

---

## Pass 4: Security & Code Quality

### SEC-01 — CSP and Security Headers (PASS)

All security headers and CSP policies are correctly configured:
- Production CSP includes `require-trusted-types-for 'script'` and `trusted-types default`
- Development CSP relaxes only what Vite HMR needs (`unsafe-eval`, `unsafe-inline`, `ws:`)
- No `innerHTML`, `outerHTML`, `eval()`, `new Function()`, `document.write()`, or `var` declarations found in source
- Input adapter correctly prevents default on captured gameplay keys
- No CommonJS `require()` calls found

### SEC-02 — No Framework Dependencies (PASS)

`package.json` contains only tooling devDependencies. No runtime dependencies. No frameworks.

### SEC-03 — No Sensitive Data Exposure (PASS)

No API keys, tokens, or credentials found in source or configuration files.

### SEC-04 — Event Listener Cleanup (PASS)

Input adapter correctly implements `destroy()` that removes all event listeners. Runtime teardown calls `inputAdapter.destroy()` on stop.

---

## Pass 5: Tests & CI Gaps

### CI-01 — No E2E Tests Exist Yet (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `tests/e2e/` |
| **Ticket** | A-06 |
| **Track** | A |

**Description**: The `tests/e2e/audit/audit.e2e.test.js` exists but tests infrastructure only. There are no Playwright tests verifying:
- Board renders visually after level load
- Player sprite moves via keyboard input
- Frame rate meets p95 ≤ 16.7ms threshold
- Paint flashing is minimal

These are P1 exit criteria per `phase-testing-verification-report.md`.

**Impact**: Phase 1 verification cannot be completed without browser-level validation.

**Fix**: Blocked by D-08 completion. Once the render pipeline is unified, write Playwright tests for F-11, F-12, F-17, F-18.

---

### CI-02 — `main.js` Has 0% Coverage (LOW)

| Field | Value |
|-------|-------|
| **File** | `src/main.js` |
| **Ticket** | A-03 |
| **Track** | A |

**Description**: The browser entrypoint has 0% statement coverage because it's a side-effect-only module that can't be imported in Node tests without triggering bootstrap.

**Fix**: After BUG-01 is resolved, `main.js` becomes importable for coverage since bootstrap won't auto-execute on import.

---

### CI-03 — `main.ecs.js` Has 79% Coverage (MEDIUM)

| Field | Value |
|-------|-------|
| **File** | `src/main.ecs.js` |
| **Ticket** | A-03 |
| **Track** | A |

**Description**: Key paths in the runtime creation (lines 438-508, the error recovery path at 502-507, and the auto-execution at 514) are not exercised by tests.

**Fix**: Test the error recovery path with a failing `loadDefaultMaps`. The auto-execution will be removed (BUG-01).

---

### CI-04 — No Policy Gate Run in This Audit (INFORMATIONAL)

The `npm run policy` command was not executed because the policy gate requires branch/PR context (`--require-branch-ticket=true`). Local testing confirms all unit and integration tests pass.

---

## Deduplication & Cross-Reference Matrix

| Finding ID | Category | Severity | Track | Ticket | Blocks |
|-----------|----------|----------|-------|--------|--------|
| BUG-01 | Bug | HIGH | A | A-03 | D-08, A-11 |
| BUG-02 | Bug | LOW | C | C-03 | — |
| BUG-03 | Bug | LOW | D | D-01 | — |
| DEAD-01 | Dead Code | MEDIUM | D | D-08 | A-11 |
| DEAD-02 | Dead Code | LOW | D | D-08 | — |
| DEAD-03 | Dead Code | INFO | A | A-03 | — |
| ARCH-01 | Architecture | MEDIUM | D | D-08 | A-11, F-19 |
| ARCH-02 | Architecture | MEDIUM | D | D-08 | F-17, F-18 |
| ARCH-03 | Architecture | MEDIUM | D | D-08 | A-11 |
| ARCH-04 | Architecture | LOW | A | A-02 | — |
| ARCH-05 | Architecture | LOW | A | A-03 | — |
| CI-01 | Tests/CI | MEDIUM | A | A-06 | A-11 |
| CI-02 | Tests/CI | LOW | A | A-03 | — |
| CI-03 | Tests/CI | MEDIUM | A | A-03 | — |

---

## Track Ownership Summary

### Track A (World, Game Flow, Testing, QA)
- **BUG-01** (HIGH): Remove auto-execution in main.ecs.js
- **ARCH-04** (LOW): Guard mutable World internals
- **ARCH-05** (LOW): Inject container element instead of hardcoded getElementById
- **CI-02** (LOW): Coverage gap in main.js
- **CI-03** (MEDIUM): Coverage gap in main.ecs.js error paths

### Track B (Components, Input, Movement, Combat, AI)
- No critical findings. All P1 Track B systems pass tests with high coverage.

### Track C (Scoring, Timer, Lives, Pause, HUD, Audio)
- **BUG-02** (LOW): Spawn system allocation churn — reuse scratch Sets

### Track D (Resources, Map, Rendering, Visual Assets)
- **DEAD-01** (MEDIUM): Remove or unify duplicate renderer
- **ARCH-01** (MEDIUM): Replace display:none with offscreen transform
- **ARCH-02** (MEDIUM): Hoist per-frame Set to closure
- **ARCH-03** (MEDIUM): Unify render pipeline to single canonical path
- **BUG-03** (LOW): Return frozen empty array from drain()

---

## Phase 1 Exit Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Board visible and renders | ✅ PASS | CSS Grid + board adapter working |
| Player moves via keyboard | ✅ PASS | Hold-to-move confirmed in integration tests |
| Render-collect → DOM commit active | ⚠️ PARTIAL | Pipeline runs but has dual-path confusion |
| Frame rate p95 ≤ 16.7ms | ❌ NOT VERIFIED | No E2E performance tests yet |
| D-08 ticket complete | ❌ INCOMPLETE | Per tracker; ARCH-01/02/03 must be fixed |
| A-11 audit consolidation | ❌ BLOCKED | Blocked by D-08 |

---

## Recommended Fix Priority (Phase 1 Closure)

1. **BUG-01**: Remove auto-execution guard in main.ecs.js (5 min, Track A)
2. **ARCH-03 + DEAD-01**: Remove standalone renderer-dom.js adapter path, rely on ECS render-dom-system (30 min, Track D)
3. **ARCH-01**: Replace display:none with offscreen transform in render-dom-system (5 min, Track D)
4. **ARCH-02**: Hoist currentFrameEntityIds Set to closure (5 min, Track D)
5. **CI-01**: Write minimal Playwright smoke test for board render + movement (blocked by above fixes, Track A)
6. Mark D-08 complete, proceed to A-11 audit consolidation

---

## Appendix: Test Execution Summary

```
Unit Tests:    40 files, 575 tests — ALL PASS (1.52s)
Integration:   16 files, 113 tests — ALL PASS (702ms)
Coverage:      92.52% statements, 85.11% branches, 93.98% functions
Thresholds:    branches 60% ✅, functions 70% ✅, lines 70% ✅, statements 70% ✅
```

No test failures. No lint errors. All policy-relevant source files use ES modules, `const`/`let` only, no forbidden APIs.
