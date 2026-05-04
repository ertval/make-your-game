# Codebase Analysis & Audit Report - P1

**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 1 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Runtime bugs, state transitions, entity lifecycle, error handling in `src/`
2. **Dead Code & Unused References** — Unused exports/imports, duplicate code, stale config, dead branches
3. **Architecture, ECS Violations & Guideline Drift** — AGENTS.md rule violations, DOM isolation, adapter injection, mutable exposure
4. **Code Quality & Security** — Unsafe sinks, CSP gaps, DOM safety, validation boundaries
5. **Tests & CI Gaps** — Coverage gaps, CI pipeline weaknesses, missing E2E, audit verification drift

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 2 |
| 🔴 Critical | 3 |
| 🟠 High | 5 |
| 🟡 Medium | 10 |
| 🟢 Low / Info | 10 |

**Top risks:**
1. **BUG-08**: `bootstrap.js:370` — `playerHandle` overwritten with boolean `true` from `setEntityMask()`, corrupting the handle for all subsequent operations
2. **CI-01**: CI workflow runs `npm run policy` but NOT `npm run ci` — tests and coverage are never enforced on PR merges
3. **CI-03**: E2E/Playwright tests are never executed in CI
4. **ARCH-03**: `World.entityStore` getter exposes internal mutable entity store, breaking ECS encapsulation
5. **SEC-02**: No CSP `<meta>` tag in `index.html` — defense-in-depth gap when headers are not replicated by static host

---

## 1) Bugs & Logic Errors

### BUG-01: `playerHandle` corrupted by `setEntityMask` return value ⬆ Critical
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L370)

**Problem:** Line 370 assigns the return value of `world.setEntityMask()` (which returns `true`/`false`) to `playerHandle`:
```js
playerHandle = world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);
```
After this line, `playerHandle` is `true` (boolean), not an entity handle. Line 373 then accesses `playerHandle.id` which is `undefined`, causing all player component stores to be set on entity ID `undefined`.

**Impact:** Player entity state is silently lost on restart/resync. All subsequent component operations on the player fail or corrupt other entities.

**Fix:**
```js
} else {
  world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);
  // playerHandle is preserved — setEntityMask mutates in place
}
```

**Tests to add:** Integration test that calls `syncPlayerEntityFromMap` twice and verifies `playerHandle` remains a valid handle object with `id` and `generation` fields.

---

### BUG-02: `spawn-system.js` fallback ghost count forced to `POOL_GHOSTS` minimum ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L184)

**Problem:** `Math.max(toFiniteNonNegativeInteger(activeGhostCap, 0), POOL_GHOSTS)` forces the fallback ghost count to at least 4 (POOL_GHOSTS). For level 1 with `activeGhostCap = 2`, the fallback generates 4 ghost IDs instead of 2.

**Impact:** Ghost stagger/respawn logic uses wrong ghost count on levels with fewer than 4 ghosts.

**Fix:** Remove the `Math.max` wrapping:
```js
const fallbackCount = toFiniteNonNegativeInteger(activeGhostCap, POOL_GHOSTS);
```

---

### BUG-03: `collision-system.js` `droppedBombByCell` not cleared on bomb tile change ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L355-361)

**Problem:** When a bomb changes tiles, `droppedBombByCell[currentCellIndex]` is set, but the previous cell's entry is never cleared.

**Impact:** Ghosts may be incorrectly pushed off cells where a bomb previously was, causing false collision responses.

**Fix:** Clear the previous cell entry when a bomb moves:
```js
if (hasTileChanged(currentTile, previousTile)) {
  const prevCellIndex = tileToCellIndex(mapResource, previousTile.row, previousTile.col);
  if (prevCellIndex >= 0) {
    scratch.droppedBombByCell[prevCellIndex] = -1;
  }
  scratch.droppedBombByCell[cellIndex] = entityId;
}
```

**Tests to add:** Test that `droppedBombByCell` is cleared for the previous cell when a bomb moves between cells.

---

### BUG-04: `collectStaticPickup` mutates map BEFORE emitting event ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L651-691)

**Problem:** `setCell(mapResource, row, col, CELL_TYPE.EMPTY)` is called before `emitPickupEvent`. If event emission throws, the map is already mutated but the event was not delivered.

**Impact:** Inconsistent state if event emission fails — pellet disappears but score is never updated.

**Fix:** Emit event first, then mutate map. Wrap in try-catch to ensure atomicity.

---

### BUG-05: Event queue `enqueue` doesn't validate `queue` parameter ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L49-60)

**Problem:** No validation that `queue` is a valid event queue object. If `queue` is `null` or missing `events`, the function throws.

**Fix:** Add guard: `if (!queue || !Array.isArray(queue.events)) return null;`

---

## 2) Dead Code & Unused References

### DEAD-01: Unused `maxrects-packer` and `sharp` devDependencies ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-09)
- `package.json` (~L50-51)

**What is dead:** These packages are listed as devDependencies but no source files import them.

**Suggested action:** Remove from `package.json` if sprite sheet generation is not yet implemented, or add the implementation that uses them.

---

### DEAD-02: Duplicate `readEntityTile()` in `bomb-tick-system.js` ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (~L48-56)
- `src/ecs/systems/collision-system.js` (~L96-106)

**What is dead:** `readEntityTile()` is re-defined in `bomb-tick-system.js` with identical logic to `collision-system.js`.

**Suggested action:** Remove duplicate from `bomb-tick-system.js` and import from a shared utility.

---

### DEAD-03: Legacy fallback in `destroyAllEntitiesDeferred()` ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (~L63-74)

**What is dead:** The legacy fallback that manually iterates entities via `getActiveEntityHandles()` is never reached because `world.deferDestroyAllEntities` always exists.

**Suggested action:** Remove the fallback branch (lines 63-74).

---

### DEAD-04: Unused `POWER_UP_TYPE` enum in constants.js ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L158-163)

**What is dead:** `POWER_UP_TYPE` enum is defined and exported but never consumed. The codebase uses `PROP_POWER_UP_TYPE` from `props.js` instead.

**Suggested action:** Remove or consolidate with `PROP_POWER_UP_TYPE`.

---

### DEAD-05: Unused `*_RUNTIME_STATUS` exports ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/spatial.js` (~L51-55)
- `src/ecs/components/props.js` (~L52-55)

**What is dead:** `SPATIAL_STORE_RUNTIME_STATUS` and `PROP_STORE_RUNTIME_STATUS` are exported but never imported anywhere.

**Suggested action:** Remove if documentation-only, or implement usage.

---

### DEAD-06: `isPlayerStart()` only used in tests ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L584-586)

**What is dead:** Exported but only used in tests, never by runtime systems.

**Suggested action:** Mark as `@internal` or move to test utilities.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: `input-system.js` directly imports adapter module ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track B (Tickets: B-02)
- `src/ecs/systems/input-system.js` (~L21)

**Problem:**
```js
import { assertValidInputAdapter } from '../adapters/io/input-adapter.js';
```
Simulation system imports directly from adapter module, violating DOM isolation boundary.

**Impact:** Couples simulation to adapter. If adapter gains import-time side effects, they execute in simulation context.

**Fix:** Move `assertValidInputAdapter` to a shared utility. Bootstrap already calls it before registration; the system doesn't need it.

---

### ARCH-02: `display: none` used instead of offscreen transform ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none` — to avoid triggering layout."
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L74, L139)

**Problem:**
```js
el.style.display = 'none';  // L74
el.style.display = '';       // L139
```
Triggers layout recalculation, violating compositor-only update rule.

**Impact:** Frame-time spikes and layout thrashing during gameplay stress scenarios.

**Fix:** Use `el.style.transform = 'translate(-9999px, -9999px)'` instead. Or omit HIDDEN entities from render-intent buffer entirely.

---

### ARCH-03: `World.entityStore` getter exposes mutable internal store ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** ECS encapsulation — entities must be opaque IDs; systems must use World API, not internal stores.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L215-217)

**Problem:**
```js
get entityStore() {
  return this.#entityStore;
}
```
Returns direct reference to internal EntityStore. External code can mutate `activeFlags`, `generations`, `freeIds` directly.

**Impact:** Breaks ECS encapsulation, enables non-deterministic mutation bypassing World's controlled API.

**Fix:** Remove the `entityStore` getter. Add safe accessor for needed fields:
```js
get maxEntities() { return this.#entityStore.maxEntities; }
```

---

## 4) Code Quality & Security

### SEC-01: No CSP `<meta>` tag in `index.html` ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `index.html` (~L1-21)

**Security impact:** CSP is only injected via Vite HTTP headers. If deployed on a static server that doesn't replicate headers (e.g., default GitHub Pages), the game runs with zero CSP protection.

**Fix:** Add `<meta http-equiv="Content-Security-Policy" content="...">` tag matching production CSP from `vite.config.js`.

---

### SEC-02: Trusted Types CSP declared but no default policy created ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L16-17)

**Impact:** `require-trusted-types-for 'script'` and `trusted-types default` are declared but no policy exists. Brittle configuration that may break on browser updates.

**Fix:** Either create a default Trusted Types policy in bootstrap, or remove `trusted-types default` from CSP.

---

### SEC-03: Missing `Permissions-Policy` and `Cross-Origin-*` headers ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L36-43)

**Impact:** No restrictions on camera, microphone, geolocation. No protection against tabnapping.

**Fix:** Extend `createSecurityHeaders()` to include `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`.

---

### SEC-04: `className` string assignment instead of `classList` ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L57)
- `src/ecs/systems/render-dom-system.js` (~L138)

**Impact:** Replaces all classes on element. Could inadvertently strip accessibility or listener classes.

**Fix:** Use `classList.add()`/`classList.remove()` for granular control.

---

### SEC-05: `response.json()` without size limit in map loading ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/main.ecs.js` (~L149)

**Impact:** Compromised endpoint returning large JSON could cause memory exhaustion before validation.

**Fix:** Add content-length check before parsing.

---

*Note: SEC-01 (`display:none`) from agent 4 was merged into ARCH-02 above.*

---

## 5) Tests & CI Gaps

### CI-01: CI workflow does not run tests or coverage ⬆ Blocking
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml` (~L70-72)

**Issue:** CI runs `npm run policy` but NOT `npm run ci`. The `policy` script only runs policy gates — tests, coverage, schema validation, and SBOM are never enforced on PR merges.

**Fix:** Add `npm run ci` step to the workflow.

---

### CI-02: E2E tests not run in CI workflow ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `.github/workflows/policy-gate.yml` (missing `npm run test:e2e`)

**Issue:** Playwright E2E tests are never executed in CI. Critical runtime assertions (pause invariants, rAF, frame drops) are not validated on PR merges.

**Fix:** Add `npm run test:e2e` step to CI after `npm run policy`.

---

### CI-03: 8 Fully Automatable audit IDs missing E2E tests ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`
- `tests/e2e/gameplay.flow.spec.js`

**Issue:** AUDIT-F-03, F-06, F-11, F-12, F-14, F-15, F-16, B-03 have no dedicated Playwright E2E test beyond static checks.

**Fix:** Add E2E specs that press keys, collect pellets, lose lives, and verify HUD updates.

---

### CI-04: Manual evidence sign-off fields empty ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `docs/audit-reports/manual-evidence.manifest.json` (~L15-17, 30-32, 45-47, 60-62)

**Issue:** All `signOff` objects have empty `reviewer`, `date`, and `notes` fields. Manual-With-Evidence audits (F-19, F-20, F-21, B-06) cannot be considered complete.

**Fix:** Complete manual evidence collection and fill sign-off fields.

---

### CI-05: Missing unit tests for multiple source files ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-08)
- `src/ecs/systems/collision-gameplay-events.js`
- `src/game/runtime-bomb-explosion-wiring.js`
- `src/main.ecs.js`
- `src/main.js`
- `src/shared/env.js`

**Issue:** These files have no dedicated unit tests.

**Fix:** Create corresponding test files.

---

### CI-06: HUD adapter tests missing (C-05 Not Started) ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track C (Tickets: C-05)

**Issue:** AUDIT-F-14, F-15, F-16 all depend on C-05 for HUD-visible runtime verification. Only shell presence is checked.

**Fix:** Prioritize C-05 completion; add E2E tests verifying timer/score/lives updates during gameplay.

---

### CI-07: Semi-automatable thresholds don't match AGENTS.md criteria ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06, A-09)
- `tests/e2e/audit/audit-question-map.js` (~L23-37)

**Issue:** F-17 threshold `maxP95FrameTimeMs: 20` exceeds AGENTS.md p95 ≤ 16.7ms. F-18 `minP95Fps: 50` is below AGENTS.md ≥ 60 FPS target.

**Fix:** Align thresholds: F-17 p95 ≤ 16.7ms, F-18 p95 ≥ 60 FPS.

---

### CI-08: No allocation/GC jank test for AUDIT-B-03 ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A, D (Tickets: A-06, D-08)
- `tests/e2e/audit/audit.browser.spec.js`

**Issue:** AGENTS.md requires "No repeated burst allocations in core loops after warm-up" but no browser-based memory/allocation test exists.

**Fix:** Add Playwright test using `performance.measureUserAgentSpecificMemory()` or `performance.memory`.

---

### CI-09: Phase testing report out-of-sync with ticket tracker ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: All tracks
- `docs/implementation/ticket-tracker.md` (~L37-39)
- `docs/audit-reports/phase-testing-verification-report.md` (~L68-78)

**Issue:** 30 Not Started tickets (68% incomplete), yet phase report describes P2 completion criteria as if testable. C-05, A-07, C-06, A-12 are Not Started.

**Fix:** Update phase report to reflect actual ticket status.

---

### CI-10: Coverage thresholds below project target ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `vitest.config.js` (~L14-18)

**Issue:** Coverage thresholds are 60/70/70/70. Project requires >85% across all metrics.

**Fix:** Raise thresholds to 85% for all four metrics.

---

### CI-11: Audio adapter tests missing (C-06 Not Started) ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track C (Tickets: C-06)

**Issue:** AGENTS.md requires audio pre-decode via `AudioContext.decodeAudioData()`. C-06 not started, no audio adapter or tests exist.

**Fix:** Implement C-06 with corresponding tests.

---

### CI-12: `audit.e2e.test.js` uses string-matching instead of execution ⬆ Low
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-02)
- `tests/e2e/audit/audit.e2e.test.js` (~L136-151)

**Issue:** Test only checks that strings exist in test files, not that tests actually pass or cover required behaviors.

**Fix:** Replace with actual test execution or remove and rely on CI test runner.

---

### CI-13: Fixed `setTimeout` in Playwright test ⬆ Low
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L232-234)

**Issue:** AUDIT-B-05 uses `setTimeout(resolve, 1500ms)` — fixed delay that could cause timing-sensitive failures under load.

**Fix:** Use `page.waitForFunction` with timestamp check.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track | Description |
|----------------|---------|---------|---------|---------|---------|-------|-------------|
| BUG-01 | BUG-08 | — | — | — | — | A | playerHandle corrupted by setEntityMask return value |
| BUG-02 | BUG-01 | — | — | — | — | C | spawn-system fallback ghost count wrong |
| BUG-03 | BUG-07 | — | — | — | — | B | droppedBombByCell not cleared on bomb move |
| BUG-04 | BUG-09 | — | — | — | — | B | collectStaticPickup mutates before emit |
| BUG-05 | BUG-04 | — | — | — | — | D | enqueue no queue validation |
| DEAD-01 | — | DEAD-06 | — | — | — | D | Unused maxrects-packer/sharp deps |
| DEAD-02 | — | DEAD-04 | — | — | — | B | Duplicate readEntityTile |
| DEAD-03 | — | DEAD-10 | — | — | — | C | Legacy fallback in destroyAllEntitiesDeferred |
| DEAD-04 | — | DEAD-01 | — | — | — | D | Unused POWER_UP_TYPE enum |
| DEAD-05 | — | DEAD-08 | — | — | — | B | Unused *_RUNTIME_STATUS exports |
| DEAD-06 | — | DEAD-02 | — | — | — | D | isPlayerStart only used in tests |
| ARCH-01 | — | — | ARCH-01 | — | — | B | input-system imports adapter directly |
| ARCH-02 | — | — | ARCH-02 | SEC-01 | — | D | display:none instead of transform |
| ARCH-03 | — | — | ARCH-03 | — | — | A | World exposes mutable entity store |
| SEC-01 | — | — | — | SEC-02 | — | D | No CSP meta tag in index.html |
| SEC-02 | — | — | — | SEC-04 | — | D | Trusted Types no default policy |
| SEC-03 | — | — | — | SEC-03 | — | D | Missing Permissions-Policy headers |
| SEC-04 | — | — | — | SEC-05 | — | D | className string assignment |
| SEC-05 | — | — | — | SEC-06 | — | D | response.json() no size limit |
| CI-01 | — | — | — | — | CI-01 | A | CI doesn't run tests/coverage |
| CI-02 | — | — | — | — | CI-03 | A | E2E tests not run in CI |
| CI-03 | — | — | — | — | CI-06 | A | 8 audit IDs missing E2E tests |
| CI-04 | — | — | — | — | CI-04 | A | Manual evidence sign-off empty |
| CI-05 | — | — | — | — | CI-05 | A | Missing unit tests for 5 files |
| CI-06 | — | — | — | — | CI-12 | C | HUD tests missing (C-05) |
| CI-07 | — | — | — | — | CI-08 | A | Thresholds don't match AGENTS.md |
| CI-08 | — | — | — | — | CI-07 | A/D | No allocation/GC test |
| CI-09 | — | — | — | — | CI-09 | All | Phase report out-of-sync |
| CI-10 | — | — | — | — | CI-02 | A | Coverage thresholds too low |
| CI-11 | — | — | — | — | CI-11 | C | Audio adapter tests missing |
| CI-12 | — | — | — | — | CI-13 | B | String-matching audit check |
| CI-13 | — | — | — | — | CI-10 | A | setTimeout in Playwright test |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Remove boolean assignment to `playerHandle` in `bootstrap.js:370` (Track A / A-03)
2. **CI-01**: Add `npm run ci` to CI workflow (Track A / A-07)
3. **CI-02**: Add `npm run test:e2e` to CI workflow (Track A / A-06)
4. **CI-03**: Add E2E tests for 8 missing audit IDs (Track A / A-06)

### Phase 2 — High Severity (immediate follow-up)
5. **ARCH-01**: Remove direct adapter import from `input-system.js` (Track B / B-02)
6. **ARCH-03**: Remove `entityStore` getter, add safe `maxEntities` accessor (Track A / A-02)
7. **BUG-03**: Clear previous `droppedBombByCell` on bomb tile change (Track B / B-04)
8. **CI-04**: Complete manual evidence sign-off (Track A / A-09)
9. **CI-05**: Create unit tests for 5 uncovered source files (Track A / A-08)
10. **CI-06**: Prioritize C-05 HUD adapter implementation (Track C / C-05)

### Phase 3 — Medium Severity
11. **BUG-02**: Fix spawn-system fallback ghost count (Track C / C-03)
12. **ARCH-02**: Replace `display:none` with offscreen transform (Track D / D-08)
13. **SEC-01**: Add CSP meta tag to `index.html` (Track D / D-05)
14. **DEAD-01**: Remove unused `maxrects-packer`/`sharp` deps (Track D / D-09)
15. **DEAD-02**: Consolidate duplicate `readEntityTile` (Track B / B-06)
16. **DEAD-03**: Remove legacy fallback in `destroyAllEntitiesDeferred` (Track C / C-04)
17. **DEAD-04**: Remove unused `POWER_UP_TYPE` enum (Track D / D-01)
18. **CI-07**: Align semi-automatable thresholds with AGENTS.md (Track A / A-06)
19. **CI-08**: Add allocation/GC jank test (Track A/D / A-06, D-08)
20. **CI-09**: Update phase report to match ticket tracker (All tracks)
21. **CI-10**: Raise coverage thresholds to 85% (Track A / A-07)
22. **CI-11**: Implement C-06 audio adapter with tests (Track C / C-06)

### Phase 4 — Low Severity (maintenance)
23. **BUG-04**: Fix collectStaticPickup order (emit event before mutating map) (Track B / B-04)
24. **BUG-05**: Add queue validation to `enqueue` (Track D / D-01)
25. **SEC-02**: Fix Trusted Types configuration (Track D / D-05)
26. **SEC-03**: Add Permissions-Policy and Cross-Origin headers (Track D / D-05)
27. **SEC-04**: Replace `className` with `classList` (Track D / D-08)
28. **SEC-05**: Add content-length check before JSON parse (Track D / D-03)
29. **DEAD-05**: Remove unused `*_RUNTIME_STATUS` exports (Track B / B-01)
30. **DEAD-06**: Mark `isPlayerStart` as internal or move to test utils (Track D / D-03)
31. **CI-12**: Replace string-matching audit check (Track B / B-02)
32. **CI-13**: Replace fixed setTimeout with state-driven wait (Track A / A-06)

---

## Notes

- The most impactful single fix is **BUG-01** — a one-line change in `bootstrap.js` that silently corrupts the player entity handle on restart. This likely explains any observed "player disappears on restart" behavior.
- **ARCH-03** (`World.entityStore` getter) and **BUG-01** are related: the exposed internal store enables the pattern that led to the boolean assignment bug. Removing the getter prevents future similar mistakes.
- **CI-01 + CI-02** together mean the CI pipeline currently provides zero test validation — any failing test or coverage regression can merge unchecked.
- All AGENTS.md architectural rules are structurally satisfied in the codebase, with three violations found (ARCH-01, ARCH-02, ARCH-03), all of which are straightforward to fix.
- The codebase demonstrates strong ECS discipline overall: typed arrays, deferred mutations, deterministic event ordering, and proper pause invariants.

---

*End of report.*
