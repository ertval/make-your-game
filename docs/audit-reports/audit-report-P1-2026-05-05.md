# Codebase Analysis & Audit Report - Phase 1

**Date:** 2026-05-05
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 1 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Runtime bugs, state transitions, entity lifecycle, error handling
2. **Dead Code & Unused References** — Unused exports/imports, duplicate code, stale config, dead branches
3. **Architecture, ECS Violations & Guideline Drift** — AGENTS.md rule violations, DOM isolation, adapter injection, mutable exposure
4. **Code Quality & Security** — Unsafe sinks, CSP gaps, DOM safety, validation boundaries
5. **Tests & CI Gaps** — Coverage gaps, CI pipeline weaknesses, missing E2E, audit verification drift

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 3 |
| 🔴 Critical | 4 |
| 🟠 High | 11 |
| 🟡 Medium | 23 |
| 🟢 Low / Info | 33 |

**Top risks:**
1. **CI-01**: CI pipeline missing test execution gates (Blocking)
2. **CI-02**: E2E audit tests not fully implemented (Blocking)
3. **CI-03**: Missing integration tests for core gameplay and event invariants (Blocking)
4. **BUG-02**: `playerHandle` overwritten with boolean `true` from `setEntityMask()`, corrupting the handle for all subsequent operations (Critical)
5. **ARCH-01**: `display:none` used instead of offscreen transform, triggering layout thrashing (Critical)

---

## 1) Bugs & Logic Errors

### BUG-01: Double Bootstrap Execution ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.js` (~L14)
- `src/main.ecs.js` (~L513)

**Problem:** `src/main.js` imports `startBrowserApplication` and calls it, while `main.ecs.js` also auto-runs `bootstrapApplication()`. This triggers two concurrent async bootstrap calls in production.
**Impact:** Duplicate rAF loops, duplicate input listeners, double DOM rendering, breaking performance audits.

**Fix:** Remove the auto-execution guard in `main.ecs.js:513-514`. Keep startup side effects only in `src/main.js`.

**Tests to add:** Add a browser integration test that imports `src/main.js` and asserts only one runtime starts.

---

### BUG-02: `playerHandle` corrupted by `setEntityMask` return value ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L370)

**Problem:** `playerHandle = world.setEntityMask(...)` assigns the boolean return value of `setEntityMask` to `playerHandle`.
**Impact:** Player entity state is silently lost on restart/resync. All subsequent component operations fail.

**Fix:** 
```js
world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK); // Do not reassign playerHandle
```

**Tests to add:** Integration test verifying `playerHandle` remains a valid handle after sync.

---

### BUG-03: Resume and focus resync reset simulation time to zero ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A / Track D / Track C (Tickets: A-03, D-01, C-04)
- `src/ecs/resources/clock.js` (~L143)

**Problem:** `resetClock()` always sets `clock.simTimeMs = 0`. Runtime calls `bootstrap.resyncTime()` on resume/focus, rewinding simulation time.
**Impact:** Violates pause/resume determinism.

**Fix:** Split clock APIs. Keep restart reset that clears `simTimeMs`, and add baseline resync that updates `lastFrameTime` without changing `simTimeMs`.

**Tests to add:** Pause/resume integration coverage asserting `simTimeMs` is unchanged after `resyncTime()`.

---

### BUG-04: `life-system` crashes under normal World dispatch ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C / Track A (Tickets: C-02, A-02)
- `src/ecs/systems/life-system.js` (~L102)

**Problem:** `life-system` calls `world.entityStore.isAlive()`, but the dispatch view only exposes `isEntityAlive()`.
**Impact:** System throws on life-loss path.

**Fix:** Use `world.isEntityAlive(playerEntity)`.

**Tests to add:** Assert lives decrement and no system fault is recorded.

---

### BUG-05: Sprite Pool Adapter recycles empty active pool ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (~L100)

**Problem:** When active pool is empty, `activePool.shift()` returns `undefined`, causing crash on `.style.transform` access.
**Impact:** Runtime crash when acquiring sprites without warm-up.

**Fix:** If `recycled` is undefined, create a new element, push to active pool, and return it.

**Tests to add:** Test `acquire()` on un-warmed sprite pool.

---

### BUG-06: `droppedBombByCell` not cleared on bomb tile change ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L355)

**Problem:** When a bomb changes tiles, the previous cell's entry in `droppedBombByCell` is never cleared.
**Impact:** False collision responses.

**Fix:** Clear previous cell entry when a bomb moves.

**Tests to add:** Test that `droppedBombByCell` is cleared for previous cell.

---

### BUG-07: `render-dom-system` entityElementMap memory leak ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L92)

**Problem:** `entityElementMap` never cleans up destroyed entities.
**Impact:** Memory growth across restarts.

**Fix:** Add cleanup on level restart.

---

### BUG-08: World frame counter not reset on level restart ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L494)

**Problem:** `world.frame` persists across level transitions.
**Impact:** Frame-dependent timing desyncs.

**Fix:** Reset `world.frame = 0` in `restartLevel()`.

---

### BUG-09: Pause state not explicitly cleared after level complete ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (~L120)

**Problem:** Pause state may persist incorrectly on transition to PLAYING.
**Impact:** Edge case pause leak.

**Fix:** Explicitly call `setPauseState(false)` at start of `startGame()`.

---

### BUG-10: `render-intent` buffer overflow silently drops intents ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-07)
- `src/ecs/render-intent.js` (~L126)

**Problem:** Buffer overflow silently drops intents in production.
**Impact:** Visuals disappear silently.

**Fix:** Increase buffer size or implement ring buffer.

---

### BUG-11: `spawn-system.js` fallback ghost count forced to `POOL_GHOSTS` minimum ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L184)

**Problem:** Forces fallback ghost count to at least 4.
**Impact:** Wrong ghost count on early levels.

**Fix:** Remove `Math.max` wrapping.

---

### BUG-12: Event Queue `drain()` allocates new array / returns empty array on hot path ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L88)

**Problem:** `drain()` allocates a garbage array per frame (`[...queue.events]`).
**Impact:** Recurring allocation in hot loop.

**Fix:** Use pre-allocated ring buffer or return a frozen singleton array when empty.

---

### BUG-13: Spawn System Creates Multiple Sets Per Tick ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L228)

**Problem:** `new Set(...)` created multiple times per tick.
**Impact:** Minor GC pressure.

**Fix:** Hoist a reusable scratch Set into system closure scope.

---

### BUG-14: `collectStaticPickup` mutates map BEFORE emitting event ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L651)

**Problem:** Mutates map before emitting event.
**Impact:** Inconsistent state if event emission fails.

**Fix:** Emit event first, then mutate map.

---

### BUG-15: Event queue `enqueue` doesn't validate `queue` parameter ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L49)

**Problem:** Function throws if queue is null.
**Fix:** Add guard validation.

---

### BUG-16: Event queue sort comparator overflow risk ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L80)

**Problem:** Sort uses subtraction which overflows.
**Fix:** Use ternary comparison.

---

### BUG-17: No validation in `setEntityMask` for mask=0 ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L248)

**Problem:** Passing mask=0 hides entity with no validation.
**Fix:** Validate mask or document.

---

### BUG-18: Clock fallback logic doesn't handle double-invalid timestamps ⬆ INFO
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A/D (Tickets: D-01)
- `src/ecs/resources/clock.js` (~L66)

**Problem:** Implicit handling of double-invalid timestamps.
**Fix:** Explicitly handle.

---

## 2) Dead Code & Unused References

### DEAD-01: Two Competing Render Pipelines / Duplicate DOM Renderer ⬆ HIGH
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`
- `src/game/bootstrap.js` (~L242)

**Problem:** Runtime has two DOM commit paths (`runRenderCommit` via `render-dom-system` and `stepFrame` via `renderer-dom.js`). One bypasses sprite pooling entirely.
**Impact:** Double DOM writes per frame, duplicate elements.

**Fix:** Remove `createDomRenderer` from runtime frame path or make it delegate to the ECS system. Rely solely on ECS render-dom-system.

---

### DEAD-02: Asset tooling dependencies have no executable generation path ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A / Track D (Tickets: A-01, D-10)
- `package.json` (~L50)

**Problem:** `maxrects-packer` and `sharp` are installed but unused.
**Impact:** Dependency footprint grows.

**Fix:** Remove or implement.

---

### DEAD-03: Project gate runs audit browser specs twice ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/run-project-gate.mjs` (~L33)

**Problem:** Adds `test:audit:e2e` and `test:e2e` (which includes audit).
**Impact:** Slower CI, duplicated audit failures.

**Fix:** Exclude `tests/e2e/audit` from `test:e2e` in project gate.

---

### DEAD-04: `resetOrderCounter` unused export ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L133)

**Problem:** Exported but never invoked.
**Fix:** Remove.

---

### DEAD-05: Unused methods in EntityStore ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js` (~L19)

**Problem:** `getGeneration` and `getHandleForId` have no callers.
**Fix:** Remove or mark internal.

---

### DEAD-06: Ghost AI constants unused ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L92)

**Problem:** AI target offsets never used.
**Fix:** Remove or annotate.

---

### DEAD-07: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L147)

**Problem:** Redundant with `PROP_POWER_UP_TYPE`.
**Fix:** Remove.

---

### DEAD-08: `getActiveEntityHandles` may be inefficient ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/world/world.js` (~L276)

**Problem:** Creates full handles for simple destroys.
**Fix:** Use `getActiveIds()`.

---

### DEAD-09: Duplicate `readEntityTile()` in `bomb-tick-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (~L48)

**Problem:** Identical to `collision-system.js`.
**Fix:** Consolidate.

---

### DEAD-10: Legacy fallback in `destroyAllEntitiesDeferred()` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (~L63)

**Problem:** Fallback branch is never reached.
**Fix:** Remove.

---

### DEAD-11: `renderer-dom.js` Uses Its Own Element Map ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L31)

**Fix:** Subsumed by DEAD-01 resolution.

---

### DEAD-12: Level-loader compatibility guard is stale ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A/D (Tickets: D-03)
- `src/game/level-loader.js` (~L24)

**Fix:** Use direct named import.

---

### DEAD-13: README documents `sbom.json` as tracked content ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `README.md` (~L200)

**Fix:** Update docs.

---

### DEAD-14: Vitest coverage exclude is redundant ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-04)
- `vitest.config.js` (~L8)

**Fix:** Remove redundant exclude.

---

### DEAD-15: `ALL_COMPONENT_MASKS` exported but never imported ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/registry.js` (~L56)

**Fix:** Remove.

---

### DEAD-16: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L23)

**Fix:** Remove export.

---

### DEAD-17: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L63)

**Fix:** Remove.

---

### DEAD-18: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L101)

**Fix:** Remove.

---

### DEAD-19: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L37)

**Fix:** Remove.

---

### DEAD-20: `trusted-types.js` excluded but untested ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `vite.config.js` (~L13)

**Fix:** Add test, remove exclusion.

---

### DEAD-21: Duplicate script definition in `package.json` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L17)

**Fix:** Remove duplicate `check:fix`.

---

### DEAD-22: Unused `*_RUNTIME_STATUS` exports ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/spatial.js` (~L51)

**Fix:** Remove.

---

### DEAD-23: `isPlayerStart()` only used in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L584)

**Fix:** Move to test utils.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: `display:none` used for HIDDEN flag instead of offscreen transform ⬆ CRITICAL
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none`"
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L74, L139)

**Problem:** Uses `el.style.display = 'none'` triggering layout thrashing.
**Impact:** Frame-time spikes and layout jank, violating compositor-only update rule.

**Fix:** Use `el.style.transform = 'translate(-9999px, -9999px)'` instead.

---

### ARCH-02: `World.entityStore` getter exposes mutable internal store ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** Entities must be opaque IDs; systems must use World API, not internal stores.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L215)

**Problem:** Returns direct reference to internal EntityStore.
**Impact:** Breaks ECS encapsulation, enables non-deterministic mutation.

**Fix:** Remove `entityStore` getter. Expose specific safe accessors.

---

### ARCH-03: Product-level pause and HUD audit behavior is not wired into default runtime ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track C/A (Tickets: C-01, C-02, C-04, C-05)
- `src/game/bootstrap.js` (~L244)

**Problem:** Default runtime does not register `pause-system`, `level-progress-system`, `timer-system`, etc.
**Impact:** Audit questions cannot be satisfied through real gameplay.

**Fix:** Register Track C systems in deterministic order.

---

### ARCH-04: `input-system.js` directly imports adapter module ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Systems MUST NOT import adapters directly."
**Files:** Ownership: Track B (Tickets: B-02)
- `src/ecs/systems/input-system.js` (~L21)

**Problem:** Direct import from `input-adapter.js`.
**Impact:** Couples simulation to adapter.

**Fix:** Move adapter assertions to shared utils.

---

### ARCH-05: Per-Frame Set Allocation in Render DOM System ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L111)

**Problem:** `new Set()` allocated every render frame.
**Impact:** Violates no recurring allocations rule.

**Fix:** Hoist Set to system closure and clear in-place.

---

### ARCH-06: Render intent capacity does not match entity capacity contract ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D/A (Tickets: D-04, D-07)
- `src/ecs/resources/constants.js` (~L211)

**Problem:** `EntityStore` defaults to 10k entities, while `MAX_RENDER_INTENTS` is sized to a smaller estimate.
**Impact:** Visuals can silently disappear under pressure.

**Fix:** Align invariants.

---

### ARCH-07: Event queue `resetOrderCounter` violates sync point ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L126)

**Problem:** Manual reset risks index collisions before consumers drain.
**Fix:** Deprecate `resetOrderCounter` and rely on `drain()`.

---

### ARCH-08: Bootstrap Direct DOM Access in `onLevelLoaded` ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L495)

**Problem:** Direct `getElementById('game-board')` couples level loading to specific DOM ID.
**Fix:** Inject container element.

---

## 4) Code Quality & Security

### SEC-01: Forbidden-tech policy scan misses WebGL/WebGPU and inline handlers ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/policy-gate/check-forbidden.mjs` (~L26)

**Problem:** Doesn't block WebGL/WebGPU or inline `onclick=` handlers.
**Fix:** Extend `FORBIDDEN_TECH_RULES`.

---

### SEC-02: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L10)

**Problem:** Default policy passes strings without sanitization.
**Fix:** Implement proper sanitization.

---

### SEC-03: Policy gates can be bypassed locally ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L30)

**Problem:** No pre-commit hook enforcing checks locally.
**Fix:** Add Husky pre-commit hook.

---

### SEC-04: No CSP `<meta>` tag in `index.html` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `index.html` (~L1)

**Problem:** CSP only injected via Vite HTTP headers.
**Fix:** Add static `<meta http-equiv="Content-Security-Policy">` fallback.

---

### SEC-05: Storage trust boundary remains pending for high scores ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `docs/game-description.md` (~L311)

**Problem:** High scores require validation-on-read storage adapter.
**Fix:** Implement `storage-adapter.js` before C-05 lands.

---

### SEC-06: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `vite.config.js` (~L27)

**Fix:** Document trade-off in AGENTS.md.

---

### SEC-07: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L1)

**Fix:** Add block comment header per AGENTS.md.

---

### SEC-08: Trusted Types CSP declared but no default policy created ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L16)

**Fix:** Create policy or remove declaration.

---

### SEC-09: Missing `Permissions-Policy` and `Cross-Origin-*` headers ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L36)

**Fix:** Add remaining security headers.

---

### SEC-10: `className` string assignment instead of `classList` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L57)

**Fix:** Use `classList`.

---

### SEC-11: `response.json()` without size limit in map loading ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/main.ecs.js` (~L149)

**Fix:** Add content-length check.

---

## 5) Tests & CI Gaps

### CI-01: CI workflow runs `npm run policy` but NOT tests or coverage ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml` (~L70)

**Problem:** The workflow does not run `npm run ci`. Tests, coverage, schema validation, and E2E specs are completely bypassed.
**Impact:** PRs can merge with failing tests and regressions.

**Fix:** Add test execution steps (`npm run ci` and `npm run test:e2e`).

---

### CI-02: E2E audit tests not fully implemented ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** 8 Fully Automatable audit IDs (F-03, F-06, F-11, F-12, F-14, F-15, F-16, B-03) are missing dedicated Playwright E2E tests.
**Fix:** Complete A-06 E2E checklist items.

---

### CI-03: Missing integration tests for core gameplay and event invariants ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05)
- `tests/integration/gameplay/*.test.js`

**Problem:** Core gameplay integration tests not started (bomb chains, pause invariants, event ordering).
**Fix:** Implement A-05 deliverables.

---

### CI-04: No manual evidence artifacts collected ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `docs/audit-reports/manual-evidence.manifest.json` (~L15)

**Problem:** All signOff objects have empty reviewer and date fields. F-19, F-20, F-21, B-06 cannot be considered complete.
**Fix:** Complete manual evidence collection.

---

### CI-05: Performance audit thresholds are weaker than AGENTS.md criteria ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit-question-map.js` (~L23)

**Problem:** Thresholds (`maxP95FrameTimeMs: 20`, `minP95Fps: 50`) violate AGENTS.md (`<= 16.7ms`, `>= 60 FPS`).
**Fix:** Align thresholds.

---

### CI-06: Coverage thresholds excluded from CI enforcement ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** `vitest.config.js` sets thresholds, but CI never enforces them.
**Fix:** Add coverage enforcement step in CI.

---

### CI-07: Missing unit tests for multiple systems and adapter entry points ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A / B / C / D (Tickets: A-08, B-06, C-04, D-05)
- Multiple files in `src/ecs/systems/` and `src/adapters/`

**Problem:** Missing tests for pause-system, level-progress, ghost-ai, bomb-tick, explosion, collision-events, renderer-adapter, etc.
**Fix:** Create corresponding test files.

---

### CI-08: P1 audit output path conflicts with A-11 phase deliverable ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-11)
- `.github/prompts/code-analysis-audit.prompt.md` (~L269)

**Problem:** Output paths misaligned.
**Fix:** Align prompt output path with A-11.

---

### CI-09: No DOM element budget / memory allocation test ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A/D (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** AGENTS.md requires ≤500 DOM elements and zero repeated allocations, but no tests verify this.
**Fix:** Add Playwright tests for DOM counts and memory allocation limits.

---

### CI-10: Phase testing report out-of-sync with ticket tracker ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: All tracks
- `docs/audit-reports/phase-testing-verification-report.md` (~L68)

**Problem:** Report describes P2 criteria as testable despite 68% incomplete tickets.
**Fix:** Update phase report.

---

### CI-11: Coverage thresholds below project target ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `vitest.config.js` (~L14)

**Problem:** Coverage thresholds set to 60/70/70/70. Project requires 85%.
**Fix:** Raise thresholds to 85%.

---

### CI-12: `main.js` and `main.ecs.js` have coverage gaps ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.js`, `src/main.ecs.js`

**Problem:** Entry points lack full coverage.
**Fix:** Import and test entry points appropriately.

---

### CI-13: `audit.e2e.test.js` uses string-matching instead of execution ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-02)
- `tests/e2e/audit/audit.e2e.test.js` (~L136)

**Fix:** Replace with actual test execution.

---

### CI-14: Fixed `setTimeout` in Playwright test ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L232)

**Fix:** Use `page.waitForFunction`.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | BUG-A1-02 | — | — | — | Track A | Double Bootstrap Execution |
| BUG-02 | — | — | BUG-02 | BUG-01 | — | Track A | `playerHandle` corrupted by `setEntityMask` |
| BUG-03 | — | BUG-A1-03 | — | — | — | Track A/D/C | Resume resync resets simulation time |
| BUG-04 | — | BUG-A1-04 | — | — | — | Track C/A | `life-system` crashes under World dispatch |
| BUG-05 | — | — | BUG-01-SPRITE| — | — | Track D | Sprite Pool Adapter recycles empty active pool |
| BUG-06 | — | — | — | BUG-03 | — | Track B | `droppedBombByCell` not cleared |
| BUG-07 | — | — | BUG-03-MM | — | — | Track D | `render-dom-system` entityElementMap leak |
| BUG-08 | — | — | BUG-01-FRAME| — | — | Track A | World frame counter not reset on restart |
| BUG-09 | — | — | BUG-04-MM | — | — | Track C | Pause state not cleared after level complete |
| BUG-10 | — | — | BUG-10-MM | — | — | Track D | `render-intent` buffer overflow |
| BUG-11 | — | — | — | BUG-02 | — | Track C | spawn-system fallback ghost count wrong |
| BUG-12 | BUG-03 | — | ARCH-01-BP| — | — | Track D | Event Queue `drain()` allocates new array |
| BUG-13 | BUG-02 | — | — | — | — | Track C | Spawn System creates multiple sets |
| BUG-14 | — | — | — | BUG-04 | — | Track B | `collectStaticPickup` mutates map before event |
| BUG-15 | — | — | — | BUG-05 | — | Track D | Event queue `enqueue` lacks queue validation |
| BUG-16 | — | — | BUG-14-MM | — | — | Track D | Event queue sort comparator overflow risk |
| BUG-17 | — | — | BUG-13-MM | — | — | Track A | No validation in `setEntityMask` for mask=0 |
| BUG-18 | — | — | BUG-03-BP | — | — | Track A/D | Clock fallback logic double-invalid timestamps |
| DEAD-01 | DEAD-01 | ARCH-A3-01| — | — | — | Track D/A | Duplicate DOM Renderer / bypasses pooling |
| DEAD-02 | — | DEAD-A2-03| DEAD-07-BP | DEAD-01 | — | Track D/A | Asset tooling dependencies unused |
| DEAD-03 | — | DEAD-A2-01| — | — | — | Track A | Project gate runs audit browser specs twice |
| DEAD-04 | — | — | DEAD-RESETQ| — | — | Track D | `resetOrderCounter` unused export |
| DEAD-05 | — | — | DEAD-01-ES | — | — | Track A | Unused methods in EntityStore |
| DEAD-06 | — | — | DEAD-03-BP | — | — | Track D | Ghost AI constants unused |
| DEAD-07 | — | — | DEAD-04-BP | DEAD-04 | — | Track D | `POWER_UP_TYPE` enum orphaned |
| DEAD-08 | — | — | DEAD-05-MM | — | — | Track D | `getActiveEntityHandles` inefficient |
| DEAD-09 | — | — | — | DEAD-02 | — | Track B | Duplicate `readEntityTile()` |
| DEAD-10 | — | — | — | DEAD-03 | — | Track C | Legacy fallback in `destroyAllEntitiesDeferred`|
| DEAD-11 | DEAD-02 | — | — | — | — | Track D | `renderer-dom.js` Uses Its Own Element Map |
| DEAD-12 | — | DEAD-A2-02| — | — | — | Track A/D | Level-loader compatibility guard stale |
| DEAD-13 | — | DEAD-A2-04| — | — | — | Track A | README documents `sbom.json` tracked |
| DEAD-14 | — | DEAD-A2-05| — | — | — | Track A | Vitest coverage exclude redundant |
| DEAD-15 | — | — | DEAD-01-AM | — | — | Track B | `ALL_COMPONENT_MASKS` exported unused |
| DEAD-16 | — | — | DEAD-02-SIM| — | — | Track D | `SIMULATION_HZ` unused externally |
| DEAD-17 | — | — | DEAD-05-BP | — | — | Track D | `MAX_CHAIN_DEPTH` never referenced |
| DEAD-18 | — | — | DEAD-06-BP | — | — | Track D | `GHOST_INTERSECTION_MIN_EXITS` unused |
| DEAD-19 | — | — | DEAD-09-BP | — | — | Track D | `KIND_TO_SPRITE_TYPE.WALL` unreachable |
| DEAD-20 | — | — | DEAD-10-BP | — | — | Track A | `trusted-types.js` excluded but untested |
| DEAD-21 | — | — | DEAD-03-MM | — | — | Track A | Duplicate script definition in `package.json` |
| DEAD-22 | — | — | — | DEAD-05 | — | Track B | Unused `*_RUNTIME_STATUS` exports |
| DEAD-23 | — | — | — | DEAD-06 | — | Track D | `isPlayerStart()` only used in tests |
| ARCH-01 | ARCH-01 | ARCH-A3-02| ARCH-02 | ARCH-02 | — | Track D | `display:none` used instead of transform |
| ARCH-02 | ARCH-04 | ARCH-A3-05| — | ARCH-03 | — | Track A | `World.entityStore` exposes mutable store |
| ARCH-03 | — | ARCH-A3-04| — | — | — | Track C/A | Product-level pause/HUD not wired |
| ARCH-04 | — | — | — | ARCH-01 | — | Track B | `input-system.js` imports adapter directly |
| ARCH-05 | ARCH-02 | — | ARCH-03-BP | — | — | Track D | Per-Frame Set Allocation in Render DOM |
| ARCH-06 | — | ARCH-A3-06| — | — | — | Track D/A | Render intent capacity mismatch |
| ARCH-07 | — | — | ARCH-01-GF | — | — | Track D | Event queue `resetOrderCounter` violates sync |
| ARCH-08 | ARCH-05 | — | — | — | — | Track A | Bootstrap Direct DOM Access |
| SEC-01 | — | SEC-A4-01 | — | — | — | Track A | Forbidden-tech misses WebGL/WebGPU/inline |
| SEC-02 | — | — | SEC-01-BP | — | — | Track D | Trusted Types policy permissive |
| SEC-03 | — | — | SEC-03-BP | — | — | Track A | Policy gates bypassed locally |
| SEC-04 | — | — | SEC-01-MM | SEC-01 | — | Track D | No CSP `<meta>` tag in `index.html` |
| SEC-05 | — | SEC-A4-03 | — | — | — | Track C | Storage trust boundary pending high scores |
| SEC-06 | — | — | SEC-02-BP | — | — | Track D | Dev CSP uses `unsafe-eval` |
| SEC-07 | — | — | SEC-04-BP | — | — | Track D | Missing source header on `trusted-types.js` |
| SEC-08 | — | — | — | SEC-02 | — | Track D | Trusted Types no default policy |
| SEC-09 | — | — | — | SEC-03 | — | Track D | Missing `Permissions-Policy` headers |
| SEC-10 | — | — | — | SEC-04 | — | Track D | `className` string assignment |
| SEC-11 | — | — | — | SEC-05 | — | Track D | `response.json()` without size limit |
| CI-01 | — | — | CI-01-MM | CI-01 | CI-01 | Track A | CI misses tests/coverage execution |
| CI-02 | CI-01 | — | EA-01-MM | CI-03 | CI-03 | Track A | E2E audit tests not fully implemented |
| CI-03 | — | — | IT-01-MM | — | — | Track A | Missing core gameplay integration tests |
| CI-04 | — | — | EV-01 | CI-04 | CI-04 | Track A | No manual evidence artifacts |
| CI-05 | — | CI-01 | TEST-04-BP | CI-07 | CI-07 | Track A | Performance thresholds weaker than AGENTS |
| CI-06 | — | — | CI-02-MM | — | — | Track A | Coverage thresholds not enforced |
| CI-07 | — | — | UT/AT-01 | CI-05 | CI-05 | Track A/B/C/D | Missing unit tests for multiple systems |
| CI-08 | — | CI-02 | — | — | — | Track A | P1 audit output path conflicts A-11 |
| CI-09 | — | — | TEST-06-BP | — | — | Track A/D | No DOM budget/alloc test |
| CI-10 | — | — | — | CI-09 | CI-09 | All | Phase testing report out-of-sync |
| CI-11 | — | — | — | CI-10 | CI-10 | Track A | Coverage thresholds below target |
| CI-12 | CI-02/03| — | — | — | — | Track A | `main.js` and `main.ecs.js` coverage gaps |
| CI-13 | — | — | — | CI-12 | CI-13 | Track B | String-matching audit check |
| CI-14 | — | — | — | CI-13 | CI-10 | Track A | Fixed `setTimeout` in Playwright test |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **CI-01**: Add `npm run ci` and `test:e2e` execution to the CI workflow (Track A)
2. **BUG-01**: Remove auto-execution from `main.ecs.js` (Track A)
3. **BUG-02**: Remove boolean assignment to `playerHandle` in `bootstrap.js` (Track A)
4. **ARCH-01**: Replace `display:none` with offscreen transform (Track D)
5. **CI-02**: Add missing Playwright E2E tests for audit coverage (Track A)
6. **CI-03**: Complete core gameplay integration tests (Track A)
7. **CI-04**: Complete manual evidence sign-off (Track A)

### Phase 2 — High Severity (immediate follow-up)
8. **DEAD-01**: Collapse runtime rendering to one pooled DOM commit path (Track D)
9. **BUG-03**: Split restart clock reset from lifecycle baseline resync (Track A/C/D)
10. **BUG-04**: Use correct restricted World dispatch API for `life-system` (Track C/A)
11. **ARCH-02**: Remove `entityStore` getter; expose narrow World APIs (Track A)
12. **ARCH-03**: Wire pause, timer, score, life, and HUD systems into default runtime (Track C/A)
13. **BUG-05**: Handle empty active pool gracefully in Sprite Pool Adapter (Track D)
14. **BUG-06**: Clear previous `droppedBombByCell` on bomb move (Track B)
15. **ARCH-04**: Remove direct adapter import from `input-system.js` (Track B)
16. **CI-05**: Tighten performance thresholds to AGENTS.md acceptance values (Track A)
17. **CI-06**: Add coverage enforcement to CI workflow (Track A)
18. **CI-07**: Write missing unit tests for untested files across tracks (Track A/B/C/D)

### Phase 3 — Medium Severity
19. **BUG-07**: Clean up `entityElementMap` on level restart (Track D)
20. **BUG-08**: Reset `world.frame` on restartLevel (Track A)
21. **BUG-09**: Clear pause state on `startGame` (Track C)
22. **BUG-10**: Address `render-intent` buffer overflow silent drops (Track D)
23. **BUG-11**: Fix spawn-system fallback ghost count minimum (Track C)
24. **BUG-12**: Hoist or freeze array in event queue `drain()` (Track D)
25. **ARCH-05**: Hoist per-frame Set in render DOM system (Track D)
26. **ARCH-06**: Align render intent capacity with entity capacity (Track D/A)
27. **ARCH-07**: Deprecate `resetOrderCounter` in event queue (Track D)
28. **SEC-01**: Extend forbidden scans for WebGL/WebGPU/inline handlers (Track A)
29. **SEC-02**: Implement proper Trusted Types sanitization (Track D)
30. **SEC-03**: Add Husky pre-commit hooks for local policy enforcement (Track A)
31. **SEC-04**: Add static CSP meta tag to `index.html` (Track D)
32. **DEAD-02**: Remove or use `maxrects-packer`/`sharp` deps (Track D)
33. **DEAD-03**: Stop running audit specs twice in CI (Track A)
34. **DEAD-04**: Remove `resetOrderCounter` export (Track D)
35. **DEAD-05**: Remove unused `EntityStore` methods (Track A)
36. **DEAD-06**: Remove unused Ghost AI constants (Track D)
37. **DEAD-07**: Remove `POWER_UP_TYPE` enum (Track D)
38. **DEAD-08**: Optimize `getActiveEntityHandles` (Track D)
39. **DEAD-09**: Consolidate duplicate `readEntityTile` (Track B)
40. **DEAD-10**: Remove legacy `destroyAllEntitiesDeferred` fallback (Track C)
41. **CI-08**: Align P1 report path with A-11 (Track A)
42. **CI-09**: Add DOM budget / memory alloc Playwright test (Track A/D)
43. **CI-10**: Update phase test report status (All)
44. **CI-11**: Raise coverage thresholds to 85% (Track A)
45. **CI-12**: Improve `main.ecs.js` coverage (Track A)

### Phase 4 — Low Severity (maintenance)
46. Remaining LOW and INFO items (BUG-13..18, DEAD-11..23, ARCH-08, SEC-05..11, CI-13..14) can be addressed asynchronously as tech-debt cleanup during Phase 2.

---

## Notes

- Consolidation successfully merged duplicated bugs (e.g., `display:none` and double-bootstrap) and properly resolved cross-track test failures.
- **Top priority for Phase 1 closure** is restoring actual CI enforcement. The `npm run policy` script currently masks missing test failures because it doesn't execute `npm run ci`.

---

*End of report.*
