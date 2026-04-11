# Codebase Analysis & Audit Report — Consolidated

**Date:** April 10, 2026 (consolidated April 11, 2026)
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — merged findings from two independent parallel audits
**Sources:** `audit-report-codebase-analysis-codex.md` (Codex), `audit-report-qwen.md` (Qwen)

---

## Methodology

Two independent audit runs were executed, each using five parallel analysis passes:
1. **Bugs & Logic Errors** — runtime failures, incorrect behavior, race conditions
2. **Dead Code & Unused References** — unused exports, unreachable code, stale imports
3. **Architecture & ECS Violations** — boundary violations, structural mutation, pattern violations
4. **Code Quality & Security** — unsafe patterns, missing validation, CSP issues
5. **Tests & CI Gaps** — missing coverage, flaky tests, configuration issues

Findings below are consolidated, deduplicated, and re-numbered with a unified severity scale. Each finding notes its original report ID(s) for traceability.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 1 |
| 🟠 High | 14 |
| 🟡 Medium | 11 |
| 🟢 Low / Info | 14 |

**Top risks:**
1. Structural ECS mutation and entity-store leakage in restart flow
2. Final-level completion path fails to reach VICTORY
3. CI can pass while required audit categories are effectively unverified
4. `startGame()` non-idempotent when already PLAYING — causes clock reset
5. Entity store exposes mutable internals and lacks boundary validation

---

## 1) Bugs & Logic Errors

### BUG-01: Final level completion does not transition to VICTORY ⬆ HIGH
**Origin:** Codex H-01, Qwen H-02
**Files:**
- `src/game/level-loader.js` (~L115)
- `src/game/game-flow.js` (~L82-89, ~L96, ~L104)
- `docs/game-description.md` (~L348)

**Problem:** When on the last level and achieving `LEVEL_COMPLETE`, `advanceLevel()` returns `null` (no next level exists), but the game transitions to `PLAYING` instead of `VICTORY`. The last level simply restarts instead of showing the victory screen.

**Impact:** Players completing the final level never see the victory screen — the game loops the last level.

**Fix:** In the `startGame()` LEVEL_COMPLETE flow, check the result of `advanceLevel()`; if `null`, transition to `VICTORY` instead of `PLAYING`.
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
**Tests to add:** Unit test in `tests/unit/game/game-flow.test.js`, integration test in `tests/integration/gameplay/game-flow.level-loader.test.js`, Playwright E2E for last-level → VICTORY transition.

---

### BUG-02: `startGame()` is non-idempotent when already PLAYING — clock reset ⬆ HIGH
**Origin:** Codex H-02, Qwen H-01
**Files:**
- `src/game/game-flow.js` (~L90-92, ~L109)
- `src/main.ecs.js` (~L156-160, ~L185-186)

**Problem:** When `startGame()` is called while the game is already in `PLAYING` state, it returns `true`. The caller in `main.ecs.js` uses this return value to decide whether to call `resyncTime(getNow())`, which resets the timing baseline mid-gameplay causing frame skips or stutters.

**Impact:** UI double-clicks or race conditions calling `startGame()` during active gameplay would reset the clock baseline, causing the next frame to see a very small delta and not advance simulation steps.

**Fix:**
```js
// In game-flow.js startGame():
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false; // Already playing, no action needed
}
```
**Tests to add:** Repeated-start no-op unit test, integration timing assertion.

---

### BUG-03: Game can enter PLAYING with invalid/null map resource ⬆ HIGH
**Origin:** Codex H-03
**Files:**
- `src/game/bootstrap.js` (~L70)
- `src/game/level-loader.js` (~L80, ~L95)
- `src/game/game-flow.js` (~L81)

**Problem:** No validation that the map resource is valid before transitioning to `PLAYING` state. Future gameplay systems may crash or behave unpredictably if the map resource is missing.

**Impact:** Runtime crash or undefined behavior path for systems that depend on a valid map.

**Fix:** Load and validate map before PLAYING transition; fail closed with user-visible error and preserve last known-good map.
**Tests to add:** Failed-load start path test and map preservation test.

---

### BUG-04: Out-of-bounds map access can be treated as passable ⬆ HIGH
**Origin:** Codex H-04, Qwen L-08
**Files:**
- `src/ecs/resources/map-resource.js` (~L393, ~L449, ~L468)

**Problem:** `isPassable()` and related wall queries do not perform strict bounds checking. Out-of-range row/col values can escape the grid and produce downstream logic corruption. Additionally, `dimensions.width/height` could disagree with `grid.length`, enabling out-of-bounds access.

**Impact:** Movement/pathing can escape grid and create downstream logic corruption.

**Fix:** Add strict bounds helper and short-circuit `false` for out-of-range in passability/wall queries. Add dimension-to-grid validation in `validateMapSemantic`.
**Tests to add:** Negative and overflow row/col tests in `tests/unit/resources/map-resource.test.js`, fuzz tests for malformed input.

---

### BUG-05: Semantic validator can throw TypeError on malformed map payloads ⬆ MEDIUM
**Origin:** Codex M-01
**Files:**
- `src/ecs/resources/map-resource.js` (~L157, ~L231, ~L232)

**Problem:** Hard crash path (TypeError) instead of deterministic validation error reporting when map payload is malformed.

**Fix:** Add structural and bounds guards before grid indexing; accumulate validation errors rather than throwing.

---

### BUG-06: `loadLevel` commits level index before successful map resolve ⬆ MEDIUM
**Origin:** Codex M-02
**Files:**
- `src/game/level-loader.js` (~L91, ~L95)

**Problem:** Failed load can desynchronize level index and world resource state.

**Fix:** Resolve into temporary variable first, commit index/resource only on success.

---

### BUG-07: `tickClock` maxDelta uses hardcoded multiplier instead of `maxStepsPerFrame` ⬆ MEDIUM
**Origin:** Qwen M-03
**Files:**
- `src/ecs/resources/clock.js` (~L68-71)

**Problem:** `maxDelta = fixedDtMs * 10` is hardcoded, but `maxStepsPerFrame` defaults to 5. This mismatch causes unnecessary accumulator accumulation that must later be clamped.

**Fix:**
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

---

### BUG-08: `isPassable` JSDoc documents non-existent `isGhost` parameter ⬆ MEDIUM
**Origin:** Qwen M-02
**Files:**
- `src/ecs/resources/map-resource.js` (JSDoc ~L26 vs implementation ~L449)

**Problem:** JSDoc claims `isPassable(map, row, col, isGhost)` but implementation is `isPassable(map, row, col)`. A separate `isPassableForGhost` function exists. Callers passing `isGhost=true` will get incorrect results silently.

**Fix:** Either add the `isGhost` parameter to `isPassable` or fix the JSDoc to remove the documented parameter.

---

### BUG-09: Event queue `orderCounter` never auto-reset between frames ⬆ MEDIUM
**Origin:** Qwen M-04
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Counter grows monotonically during gameplay and is only reset on level restart. JSDoc claims it's "called once per fixed simulation step" but no such automatic call exists. Over very long play sessions, the counter could approach `Number.MAX_SAFE_INTEGER`.

**Fix:** Add automatic reset in `runFixedStep` world method, or document that systems must drain events each frame.

---

### BUG-10: `clock.js` `resyncTime` does not clamp accumulator to zero ⬆ LOW
**Origin:** Qwen L-10
**Files:**
- `src/ecs/resources/clock.js`

**Problem:** If accumulator has leftover time from before resync, it could cause a burst step on next tick.

**Fix:** Add `this.accumulator = 0` in `resyncTime`.

---

### BUG-11: `clampLevelIndex` redundant `Math.floor` after bounds check ⬆ LOW
**Origin:** Qwen L-02
**Files:**
- `src/game/level-loader.js` (~L12-19)

**Problem:** `Math.floor` could theoretically produce a value > maxLevel if input is a float just below an integer boundary.

**Fix:** Add final `Math.min(result, maxLevel)` guard.

---

## 2) Dead Code & Unused References

### DEAD-01: Unreachable `package.json` dependency-ban branch in policy checks ⬆ HIGH
**Origin:** Codex H-05
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L477, ~L515, ~L553)

**Problem:** Intended dependency-ban logic for `package.json` is effectively dead because it falls inside a source-only scan gate. Produces false confidence that dependencies are checked.

**Fix:** Move `package.json` checks outside source-only scan gate, or explicitly include `package.json` in scanned targets.

---

### DEAD-02: Dead conditional in `createSyncMapLoader` restart path ⬆ MEDIUM
**Origin:** Codex M-03, Qwen M-01
**Files:**
- `src/game/level-loader.js` (~L51-61)

**Problem:** The `if (options.restart)` check has identical code in both branches (`cloneMap(baseMap)`). Both branches do the same thing — misleads readers into thinking restart vs. non-restart loads behave differently.

**Fix:** Collapse to one return path, or implement truly different restart semantics.

---

### DEAD-03: Redundant `cachedMapResource` option plumbing ⬆ MEDIUM
**Origin:** Codex M-04
**Files:**
- `src/game/level-loader.js` (~L86, ~L100)
- `tests/unit/resources/map-resource.test.js` (~L489)

**Problem:** API surface grows without runtime usage.

**Fix:** Remove option until needed, or document as intentionally reserved.

---

### DEAD-04: `getSystemOrder` return value rarely consumed ⬆ LOW
**Origin:** Qwen (Dead Code table)
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** External code rarely calls this, increasing API surface with minimal value.

**Fix:** Evaluate removal or document internal-only usage.

---

### DEAD-05: `advanceLevel` options object only uses `reason` property ⬆ LOW
**Origin:** Qwen L-06
**Files:**
- `src/game/level-loader.js`

**Problem:** Dead API surface — accepts options object but only uses `reason`.

**Fix:** Simplify to `advanceLevel(reason)` or document future extensibility.

---

### DEAD-06: `resetOrderCounter` JSDoc claim unimplemented ⬆ LOW
**Origin:** Qwen (Dead Code table)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Documented as per-frame but never called automatically. See also BUG-09.

---

### DEAD-07: Duplicate npm scripts for same policy command ⬆ LOW
**Origin:** Codex L-01
**Files:**
- `package.json` (~L17, ~L35)

**Problem:** Script drift and maintenance overhead.

**Fix:** Keep one canonical script and deprecate alias.

---

### DEAD-08: Tracked `changed-files.txt` artifact appears stale ⬆ LOW
**Origin:** Codex L-02
**Files:**
- `changed-files.txt` (~L1)
- `.gitignore` (~L42)

**Problem:** Noise and confusion in repository state.

**Fix:** Remove tracked artifact from version control and regenerate only in CI/local gate runs.

---

## 3) Architecture & ECS Violations

### ARCH-01: Restart flow performs immediate structural mutation and breaks entity opacity ⬆ BLOCKING
**Origin:** Codex C-01
**Violated rule:** Structural deferral and opaque entities (AGENTS.md)
**Files:**
- `src/game/game-flow.js` (~L41-61)
- `src/ecs/world/world.js` (~L83, ~L103)

**Problem:** `destroyAllEntities` during restart performs immediate structural mutation that directly accesses `entityStore` internals. This violates the ECS requirement that structural changes (entity/component add/remove) must be deferred to controlled sync points. Additionally leaks the entity store reference outside the world boundary.

**Impact:** Order-sensitive bugs, determinism risk, and encapsulation leakage. Allocation during game restart via `getActiveIds()` creating new arrays every call.

**Fix:** Add world-level deferred teardown command at sync point; remove direct `entityStore` access from `game-flow`. Consider batch destroy API on entity store.

---

### ARCH-02: World API allows immediate structural mutation during dispatch ⬆ HIGH
**Origin:** Codex H-06
**Violated rule:** Structural changes must be deferred
**Files:**
- `src/ecs/world/world.js` (~L55, ~L61, ~L141)

**Problem:** Mid-dispatch mutation can create hidden nondeterminism and ordering bugs. The world's `addEntity`/`removeComponent`/etc. methods are callable during system dispatch without any guard.

**Fix:** Enforce dispatch guard that rejects immediate mutators during `runFixedStep`; require defer APIs for runtime/system paths.

---

### ARCH-03: ECS World exposes mutable internal state — `entityStore` and `systemOrder` ⬆ HIGH
**Origin:** Qwen H-03
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** `getEntityStore()` and `getSystemOrder()` return direct references to internal arrays/objects. External code can mutate these without going through the world API, breaking ECS encapsulation.

**Impact:** Any system or external code holding a reference to the entity store could corrupt entity tracking, causing crashes or silent data corruption.

**Fix:** Return immutable views or safe proxy objects:
```js
getEntityStore() {
  return {
    hasComponent: (entity, componentType) =>
      this.entityStore.hasComponent(entity, componentType),
    getComponent: (entity, componentType) =>
      this.entityStore.getComponent(entity, componentType),
    // ... expose only safe read methods
  };
}
```

---

### ARCH-04: `EntityStore` missing boundary validation in `hasComponent`/`getComponent` ⬆ HIGH
**Origin:** Qwen H-04
**Files:**
- `src/ecs/world/entity-store.js` (~L55-66)

**Problem:** No bounds checking on entity ID access. An invalid or stale entity ID can cause array out-of-bounds access or return garbage data. No stale-handle protection via generation checking.

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

### ARCH-05: Render phase coupled to fixed-step simulation loop ⬆ HIGH
**Origin:** Codex H-07
**Violated rule:** One dedicated DOM commit per frame with clear read/compute vs write boundaries
**Files:**
- `src/ecs/world/world.js` (~L16, ~L141)
- `src/game/bootstrap.js` (~L100)

**Problem:** During catch-up, render-related systems may run more than once per frame, increasing DOM pressure. Render should be decoupled from fixed-step simulation and run once per `requestAnimationFrame`.

**Fix:** Split simulation stepping and render commit; keep DOM commit once per `requestAnimationFrame`.

---

### ARCH-06: Input adapter contract leak via fallback field probing ⬆ MEDIUM
**Origin:** Codex M-05
**Files:**
- `src/main.ecs.js` (~L97, ~L107)
- `src/game/bootstrap.js` (~L125)

**Problem:** Tight coupling to adapter internals and brittle future adapter swaps. Systems probe for specific fields on the adapter object instead of using a formal interface.

**Fix:** Require explicit adapter interface methods and validate at registration.

---

### ARCH-07: `DOMPool` `release()` does not remove event listeners ⬆ MEDIUM
**Origin:** Qwen M-05
**Files:**
- `src/render/dom-pool.js` (~L48-54)

**Problem:** If any code adds event listeners to pooled elements, those listeners persist when elements are released and re-used. This causes listener accumulation and potential memory leaks or duplicate event firing.

**Fix:** Document that pooled elements must not have listeners, or implement a listener cleanup mechanism.

---

### ARCH-08: Systems can access resources without capability gating ⬆ MEDIUM
**Origin:** Qwen (Architecture table)
**Files:**
- World design overall

**Problem:** Any system can access any resource through the world API with no capability restrictions. This weakens ECS isolation.

**Fix:** Consider resource access policies or at minimum document trusted access boundaries.

---

### ARCH-09: `EventQueue` `drain()` returns reference to internal array ⬆ LOW
**Origin:** Qwen L-09
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Callers could mutate returned array or hold reference after drain, breaking encapsulation.

**Fix:** Return a copy or iterator.

---

## 4) Code Quality & Security

### SEC-01: Map validation path can hard-fail on malformed structures ⬆ HIGH
**Origin:** Codex H-08 (overlaps with BUG-05)
**Files:**
- `src/ecs/resources/map-resource.js` (~L146, ~L175, ~L336)

**Problem:** Runtime crash risk from malformed map payloads instead of controlled rejection.

**Fix:** Add strict structural preflight and in-bounds guards before semantic traversal.

---

### SEC-02: Runtime map trust boundary is not strictly enforced ⬆ HIGH
**Origin:** Codex H-09
**Files:**
- `src/game/level-loader.js` (~L80, ~L95)
- `src/ecs/resources/map-resource.js` (~L334)

**Problem:** Untrusted or malformed loader outputs can enter world state without schema or semantic validation at the load boundary.

**Fix:** Enforce schema plus semantic validation at load boundary before `setResource`.

---

### SEC-03: Production CSP and Trusted Types enforcement is missing ⬆ MEDIUM
**Origin:** Codex M-06
**Files:**
- `index.html` (~L4)
- `vite.config.js` (~L3)
- `AGENTS.md` (~L151, ~L156)

**Problem:** Lower defense-in-depth against future sink regressions. AGENTS.md mandates strict CSP and Trusted Types for production builds.

**Fix:** Enforce strict production CSP and Trusted Types policy in deployment path and CI checks.

---

### SEC-04: Security scanning is primarily changed-file scoped ⬆ MEDIUM
**Origin:** Codex M-07
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L514, ~L579)
- `scripts/policy-gate/run-all.mjs` (~L200)

**Problem:** Existing risky patterns in untouched files may persist undetected. Policy gate only scans diff files for forbidden sinks.

**Fix:** Add full-repo security scan stage in CI (or nightly) using same sink checks.

---

### SEC-05: Schema validation script can fail-open on missing files ⬆ MEDIUM
**Origin:** Codex M-08
**Files:**
- `scripts/validate-schema.mjs` (~L62, ~L63)

**Problem:** Missing critical schema/input may pass with warnings instead of failing.

**Fix:** Fail closed for required schemas/manifests/maps and allowlist optional files explicitly.

---

### SEC-06: Repetitive runtime error loop risk without escalation budget ⬆ LOW
**Origin:** Codex L-03
**Files:**
- `src/main.ecs.js` (~L192, ~L209)
- `src/ecs/world/world.js` (~L144)

**Problem:** Persistent per-frame exceptions can degrade performance and observability without any circuit-breaker.

**Fix:** Add per-system error budget and temporary quarantine/escalation after threshold.

---

### SEC-07: `renderCriticalError` uses `textContent` — safe but limited formatting ⬆ LOW
**Origin:** Qwen L-03
**Files:**
- `src/main.ecs.js` (~L87-92)

**Problem:** Safe from injection, but error messages with multiple issues are hard to read as plain text.

**Fix:** Consider structured error display with `<pre>` or `<code>` blocks.

---

### SEC-08: `UNHANDLED_REJECTION_HOOK_KEY` could conflict with other libraries ⬆ LOW
**Origin:** Qwen L-04
**Files:**
- `src/main.ecs.js` (~L96)

**Problem:** Unlikely but possible collision if other code uses same window property string key.

**Fix:** Use `Symbol` instead of string key.

---

### SEC-09: `createDOMRenderer` accepts `hudQueries` but never validates query results ⬆ LOW
**Origin:** Qwen L-07
**Files:**
- `src/render/render-ecs.js`

**Problem:** If HUD elements are missing from DOM, renderer silently produces no HUD updates.

**Fix:** Add `console.warn` if expected elements are not found.

---

## 5) Tests & CI Gaps

### CI-01: CI can pass with effectively no browser verification ⬆ BLOCKING
**Origin:** Codex B-01
**Files:**
- `package.json` (~L21, ~L22)
- `scripts/policy-gate/run-project-gate.mjs` (~L19)
- `.github/workflows/policy-gate.yml` (~L51)

**Problem:** Audit-required browser and gameplay checks can be absent while pipeline is green. The gate has pass-with-no-tests behavior.

**Fix:** Remove pass-with-no-tests behavior and make policy gate execute and require E2E plus audit test suites.

---

### CI-02: Audit coverage test is inventory-only, not behavior verification ⬆ BLOCKING
**Origin:** Codex B-02
**Files:**
- `tests/e2e/audit/audit.e2e.test.js` (~L6)
- `tests/e2e/audit/audit-question-map.js` (~L3)

**Problem:** The audit test only checks that audit IDs are listed — it does not execute any behavior verification. False confidence that audit IDs are validated.

**Fix:** Add executable assertions per audit ID or enforce evidence validators for each mapped question.

---

### CI-03: Semi-automatable and manual evidence categories are not CI-enforced ⬆ HIGH
**Origin:** Codex B-03
**Files:**
- `docs/audit-reports/phase-testing-verification-report.md` (~L29, ~L30)
- `scripts/policy-gate/run-checks.mjs` (~L401)

**Problem:** Performance and trace-based acceptance criteria (F-17, F-18, B-05, F-19, F-20, F-21, B-06) can regress silently.

**Fix:** Add Performance API assertions for semi-automatable IDs and require a manual-evidence manifest with artifact paths in CI.

---

### CI-04: Functional E2E coverage is too narrow for documented scope ⬆ HIGH
**Origin:** Codex H-10, Qwen (Test & CI Gaps table)
**Files:**
- `tests/e2e/game-loop.pause.spec.js`
- `tests/e2e/game-loop.unhandled-rejection.spec.js`
- `docs/audit.md` (~L26)

**Problem:** Many core gameplay and HUD behaviors remain unverified in real browser runs. Only pause and unhandled-rejection scenarios have E2E tests.

**Missing tests:**
- Pause continue/restart flow
- Timer/lives/score HUD changes
- Keyboard controls verification
- Level progression and last-level → VICTORY
- `startGame()` called during PLAYING state
- DOM pool listener leak integration test
- Event queue `orderCounter` growth stress test
- Fuzz testing for map resource with malformed input

**Fix:** Add scenario E2E tests for each of the above.

---

### CI-05: Adapter-boundary integration coverage is effectively empty ⬆ HIGH
**Origin:** Codex H-11
**Files:**
- `tests/integration/adapters/.gitkeep`
- `vitest.config.js` (~L6)
- `docs/audit-reports/phase-testing-verification-report.md` (~L16)

**Problem:** Adapter contracts can break unnoticed. The integration/adapters directory contains only a `.gitkeep`.

**Fix:** Add jsdom integration suite for adapter boundaries and ensure CI runs it as required.

---

### CI-06: Coverage gate is inflated by counting tests in coverage include ⬆ HIGH
**Origin:** Codex H-12
**Files:**
- `vitest.config.js` (~L11, ~L12)

**Problem:** Coverage percentage may overstate source confidence because test files are included in the coverage target.

**Fix:** Restrict coverage include to `src/` and keep `tests/` excluded.

---

### CI-07: Playwright flakiness risk from fixed sleep timing ⬆ MEDIUM
**Origin:** Codex M-09
**Files:**
- `tests/e2e/game-loop.pause.spec.js` (~L21, ~L29, ~L38)

**Problem:** Fixed `waitForTimeout` calls in Playwright tests cause nondeterministic CI failures under load variance.

**Fix:** Replace fixed waits with state-driven waits using `expect.poll` or `page.waitForFunction`.

---

### CI-08: Header policy check is warn-mode in CI ⬆ LOW
**Origin:** Codex L-04
**Files:**
- `.github/workflows/policy-gate.yml` (~L26)
- `scripts/policy-gate/check-source-headers.mjs` (~L22)

**Problem:** Non-blocking governance allows gradual quality drift.

**Fix:** Use fail mode in CI and keep warn mode only for local development.

---

### CI-09: `game-flow.js` exports both named and default — inconsistent with project style ⬆ LOW
**Origin:** Qwen L-05
**Files:**
- `src/game/game-flow.js`

**Problem:** Minor consistency issue vs ES module conventions used elsewhere.

**Fix:** Standardize on named exports only per ES module conventions.

---

### CI-10: `main.ecs.js` bootstrap auto-executes on import in browser ⬆ LOW
**Origin:** Qwen L-12
**Files:**
- `src/main.ecs.js` (~L230-232)

**Problem:** Side effect on module import makes testing harder.

**Fix:** Export bootstrap function and let consumer call it explicitly.

---

### CI-11: Duplicate `advanceLevel` logic in test mock and implementation ⬆ LOW
**Origin:** Qwen L-11
**Files:**
- Various test files

**Problem:** Test mocks and real implementation diverge slightly.

**Fix:** Ensure test mocks stay synchronized with implementation.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Codex ID | Qwen ID | Description |
|----------------|----------|---------|-------------|
| BUG-01 | H-01 | H-02 | Last-level → VICTORY missing |
| BUG-02 | H-02 | H-01 | `startGame()` non-idempotent |
| BUG-03 | H-03 | — | PLAYING with null map |
| BUG-04 | H-04 | L-08 | Out-of-bounds map access |
| BUG-05 | M-01 | — | Semantic validator TypeError |
| BUG-06 | M-02 | — | `loadLevel` index commit order |
| BUG-07 | — | M-03 | `tickClock` maxDelta mismatch |
| BUG-08 | — | M-02 | `isPassable` JSDoc mismatch |
| BUG-09 | — | M-04 | Event queue counter no auto-reset |
| BUG-10 | — | L-10 | `resyncTime` accumulator not cleared |
| BUG-11 | — | L-02 | `clampLevelIndex` edge case |
| DEAD-01 | H-05 | — | Unreachable dependency-ban logic |
| DEAD-02 | M-03 | M-01 | Dead restart conditional |
| DEAD-03 | M-04 | — | Redundant `cachedMapResource` |
| DEAD-04 | — | Dead Code table | `getSystemOrder` rarely consumed |
| DEAD-05 | — | L-06 | `advanceLevel` options dead surface |
| DEAD-06 | — | Dead Code table | `resetOrderCounter` JSDoc unimplemented |
| DEAD-07 | L-01 | — | Duplicate npm scripts |
| DEAD-08 | L-02 | — | Stale `changed-files.txt` |
| ARCH-01 | C-01 | — | Restart structural mutation (BLOCKING) |
| ARCH-02 | H-06 | — | Immediate mutation during dispatch |
| ARCH-03 | — | H-03 | Mutable entity store exposure |
| ARCH-04 | — | H-04 | Entity store missing boundary validation |
| ARCH-05 | H-07 | — | Render coupled to fixed-step |
| ARCH-06 | M-05 | — | Input adapter contract leak |
| ARCH-07 | — | M-05 | DOMPool listener retention |
| ARCH-08 | — | Arch table | Resource access no capability gating |
| ARCH-09 | — | L-09 | EventQueue drain exposes internal array |
| SEC-01 | H-08 | — | Map validation hard-fail |
| SEC-02 | H-09 | — | Map trust boundary not enforced |
| SEC-03 | M-06 | — | CSP / Trusted Types missing |
| SEC-04 | M-07 | — | Changed-file-only security scanning |
| SEC-05 | M-08 | — | Schema validation fail-open |
| SEC-06 | L-03 | — | Runtime error loop, no budget |
| SEC-07 | — | L-03 | `renderCriticalError` limited formatting |
| SEC-08 | — | L-04 | Hook key collision risk |
| SEC-09 | — | L-07 | HUD queries not validated |
| CI-01 | B-01 | — | CI passes with no browser tests (BLOCKING) |
| CI-02 | B-02 | — | Audit test is inventory-only (BLOCKING) |
| CI-03 | B-03 | — | Semi/manual evidence not CI-enforced |
| CI-04 | H-10 | CI table | E2E coverage too narrow |
| CI-05 | H-11 | — | Adapter integration coverage empty |
| CI-06 | H-12 | — | Coverage gate inflated |
| CI-07 | M-09 | — | Playwright fixed sleep flakiness |
| CI-08 | L-04 | — | Header check warn-mode |
| CI-09 | — | L-05 | Mixed export style |
| CI-10 | — | L-12 | Bootstrap side effect on import |
| CI-11 | — | L-11 | Test mock divergence |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **ARCH-01**: Move restart teardown to deferred world API and remove `entityStore` leakage
2. **CI-01 + CI-02**: Enforce required E2E/audit test suites — remove pass-with-no-tests behavior
3. **BUG-01**: Fix final-level to VICTORY transition

### Phase 2 — High Severity (immediate follow-up)
4. **BUG-02**: Make `startGame()` idempotent during PLAYING and guard resync
5. **ARCH-02 + ARCH-03 + ARCH-04**: Harden World API — dispatch guards, immutable views, boundary validation
6. **BUG-03 + BUG-04 + SEC-01 + SEC-02**: Harden map trust boundary, bounds handling, and validation
7. **ARCH-05**: Decouple render from fixed-step simulation loop
8. **CI-03**: Enforce semi-automatable and manual evidence gates in CI
9. **CI-04 + CI-05**: Expand E2E and adapter integration coverage
10. **CI-06**: Fix inflated coverage gate — exclude tests from coverage include
11. **DEAD-01**: Fix unreachable dependency-ban in policy checks

### Phase 3 — Medium Severity
12. **BUG-05 + BUG-06**: Map validation and load-order hardening
13. **BUG-07**: Fix `tickClock` maxDelta mismatch
14. **BUG-08 + BUG-09**: JSDoc accuracy and event queue lifecycle
15. **ARCH-06 + ARCH-07**: Adapter interface formalization and DOMPool cleanup
16. **SEC-03 + SEC-04 + SEC-05**: CSP enforcement, full-repo scanning, schema fail-closed
17. **CI-07**: Replace Playwright fixed waits with state-driven waits
18. **DEAD-02 + DEAD-03**: Dead code cleanup

### Phase 4 — Low Severity (maintenance)
19. All remaining LOW/INFO items (BUG-10, BUG-11, DEAD-04–08, ARCH-08–09, SEC-06–09, CI-08–11)

---

## Notes

- No direct unsafe HTML injection sink was confirmed in runtime paths reviewed; current error rendering uses safe `textContent` writes in `src/main.ecs.js`.
- A few findings are currently latent due to staged implementation, but they remain high-priority because they are in core runtime/state and CI gate paths.
- Both reports independently identified BUG-01 and BUG-02 as top-priority issues, confirming high confidence in those findings.
- The Qwen report surfaced additional entity-store and DOMPool boundary issues not covered by Codex.
- The Codex report provided deeper CI/policy-gate analysis and identified the three blocking items.

---

*End of consolidated report.*
