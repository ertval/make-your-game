# Track A Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report with full details.

> **Verification note (2026-05-05):** This report has been updated based on direct source inspection. False positives have been removed. Fix suggestions have been corrected where the original was inaccurate or suboptimal. See `audit-verification-notes-2026-05-05.md` for the full verification log.

**Total Actual Issues to Resolve: 0**

--- 

## 1) Bugs & Logic Errors

### ✅ [DONE] BUG-01: Double Bootstrap Execution ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.js` (~L14)
- `src/main.ecs.js` (~L509-511)

**Problem:** `src/main.js` imports `startBrowserApplication` and calls it. `main.ecs.js` also unconditionally auto-runs `bootstrapApplication()` at the module level via a bare browser-environment check (lines 509–511). This triggers two concurrent async bootstrap calls in any browser context.
**Impact:** Duplicate rAF loops, duplicate input listeners, double DOM rendering, breaking performance audits.

**Fix:** Remove lines 509–511 from `main.ecs.js`. The file's own header comment already states: *"It intentionally does NOT execute any side effects upon import."* Keep startup side effects only in `src/main.js`.

**Tests to add:** Add a browser integration test that imports `src/main.js` and asserts only one runtime starts (e.g., verify `window.__MS_GHOSTMAN_RUNTIME__` is set exactly once).

---

### ✅ [DONE] BUG-02: `playerHandle` corrupted by `setEntityMask` return value ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (L370)

**Problem:** `playerHandle = world.setEntityMask(...)` assigns the boolean `true` return value of `setEntityMask` to `playerHandle`. The next line `const entityId = playerHandle.id` then resolves to `undefined`, silently corrupting all subsequent component writes for the player entity.
**Impact:** Player entity state is silently lost on restart/resync. All subsequent component operations write to slot `undefined` (treated as 0) or throw.

**Fix:**
```js
// Before (buggy):
playerHandle = world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK);

// After (correct):
world.setEntityMask(playerHandle, PLAYER_WITH_RENDERABLE_MASK); // Do not reassign — return value is boolean
```

**Tests to add:** Integration test verifying `playerHandle` remains a valid `{id, generation}` object after `syncPlayerEntityFromMap` is called on an already-alive player entity.

---

### ✅ [DONE] BUG-08: World frame counter not reset on level restart ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (onRestart callback)
- `src/ecs/world/world.js` (fields: `frame`, `renderFrame`)

**Problem:** `world.frame` and `world.renderFrame` both persist across level transitions. Only the `World` constructor resets them.
**Impact:** Frame-dependent timing desyncs across levels.

**Fix:** Reset both counters in the `onRestart` callback in `bootstrap.js`:
```js
onRestart: () => {
  resetClock(clock, toFiniteTimestamp(nowProvider()));
  world.frame = 0;        // ADD: reset simulation frame counter
  world.renderFrame = 0;  // ADD: reset render frame counter
  initializeBombExplosionResources(world, options);
},
```

**Note:** `world.frame` and `world.renderFrame` are public fields on the `World` class, so direct assignment is safe.

---

### ✅ [DONE] BUG-17: No validation in `setEntityMask` for mask=0 ⬆ LOW (documentation only)
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L248)

**Problem:** Passing `mask=0` is valid behavior (removes entity from all queries, effectively hiding it) but this is not documented in the JSDoc.
**Fix:** Add JSDoc clarification to `setEntityMask()` documenting that `mask=0` is intentional and removes the entity from all system queries. No code guard needed — a guard could break valid use cases.

---

> ~~**BUG-18: Clock fallback logic doesn't handle double-invalid timestamps**~~ **REMOVED — FALSE POSITIVE**  
> Verification confirmed that `tickClock()` in `clock.js:65-84` explicitly handles both non-finite `now` (falls back to `lastFrameTime`) and non-finite `lastFrameTime` (treats baseline as invalid and updates it). Both cases are deterministically handled.

---

## 2) Dead Code & Unused References

---

### ✅ [DONE] DEAD-02: Asset tooling dependencies have no executable generation path ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A / Track D (Tickets: A-01, D-10)
- `package.json` (~L50)

**Problem:** `maxrects-packer` and `sharp` are installed but unused.
**Impact:** Dependency footprint grows.

**Fix:** Remove or implement.

---

### ✅ [DONE] DEAD-03: Project gate runs audit browser specs twice ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/run-project-gate.mjs` (~L33)

**Problem:** Adds `test:audit:e2e` and `test:e2e` (which includes audit).
**Impact:** Slower CI, duplicated audit failures.

**Fix:** Exclude `tests/e2e/audit` from `test:e2e` in project gate.

---

### ✅ [DONE] DEAD-05: Unused methods in EntityStore ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js` (~L19)

**Problem:** `getGeneration` and `getHandleForId` have no callers.
**Fix:** Remove or mark internal.

---

### ✅ [DONE] DEAD-12: Level-loader compatibility guard is stale ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A/D (Tickets: D-03)
- `src/game/level-loader.js` (~L24)

**Fix:** Use direct named import.

---

### ✅ [DONE] DEAD-13: README documents `sbom.json` as tracked content ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `README.md` (~L200)

**Fix:** Update docs.

---

### ✅ [DONE] DEAD-14: Vitest coverage exclude is redundant ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-04)
- `vitest.config.js` (~L8)

**Fix:** Remove redundant exclude.

---

### ✅ [DONE] DEAD-20: `trusted-types.js` excluded but untested ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `vite.config.js` (~L13)

**Fix:** Add test, remove exclusion.

---

### ✅ [DONE] DEAD-21: Duplicate script definition in `package.json` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L17)

**Fix:** Remove duplicate `check:fix`.

---

### ✅ [DONE] ARCH-02: `World.entityStore` getter exposes mutable internal store ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** Entities must be opaque IDs; systems must use World API, not internal stores.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L215)

**Problem:** Returns direct reference to internal EntityStore.
**Impact:** Breaks ECS encapsulation, enables non-deterministic mutation.

**Fix:** Remove `entityStore` getter. Expose specific safe accessors.

---

### ✅ [DONE] ARCH-06: Render intent capacity does not match entity capacity contract ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D/A (Tickets: D-04, D-07)
- `src/ecs/resources/constants.js` (~L211)

**Problem:** `EntityStore` defaults to 10k entities, while `MAX_RENDER_INTENTS` is sized to a smaller estimate.
**Impact:** Visuals can silently disappear under pressure.

**Fix:** Align invariants.

---

### ✅ [DONE] ARCH-08: Bootstrap Direct DOM Access in `onLevelLoaded` ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L495)

**Problem:** Direct `getElementById('game-board')` couples level loading to specific DOM ID.
**Fix:** Inject container element.

---

## 4) Code Quality & Security

---

### ✅ [DONE] SEC-01: Forbidden-tech policy scan misses WebGL/WebGPU and inline handlers ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/policy-gate/check-forbidden.mjs` (~L26)

**Problem:** Doesn't block WebGL/WebGPU or inline `onclick=` handlers.
**Fix:** Extend `FORBIDDEN_TECH_RULES`.

---

### ✅ [DONE] SEC-03: Policy gates can be bypassed locally ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L30)

**Problem:** No pre-commit hook enforcing checks locally.
**Fix:** Add Husky pre-commit hook.

---

### ✅ [DONE] CI-01: CI workflow runs `npm run policy` but NOT tests or coverage ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml` (~L70)

**Problem:** The workflow does not run `npm run ci`. Tests, coverage, schema validation, and E2E specs are completely bypassed.
**Impact:** PRs can merge with failing tests and regressions.

**Fix:** Add test execution steps (`npm run ci` and `npm run test:e2e`).

---

### ✅ [DONE] CI-02: E2E audit tests not fully implemented ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** 8 Fully Automatable audit IDs (F-03, F-06, F-11, F-12, F-14, F-15, F-16, B-03) are missing dedicated Playwright E2E tests.
**Fix:** Complete A-06 E2E checklist items.

---

### ✅ [DONE] CI-03: Missing integration tests for core gameplay and event invariants ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05)
- `tests/integration/gameplay/*.test.js`

**Problem:** Core gameplay integration tests not started (bomb chains, pause invariants, event ordering).
**Fix:** Implement A-05 deliverables.

---

### ✅ [DONE] CI-04: No manual evidence artifacts collected ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `docs/audit-reports/manual-evidence.manifest.json` (~L15)

**Problem:** All signOff objects have empty reviewer and date fields. F-19, F-20, F-21, B-06 cannot be considered complete.
**Fix:** Complete manual evidence collection.

---

### ✅ [DONE] CI-05: Performance audit thresholds are weaker than AGENTS.md criteria ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit-question-map.js` (~L23)

**Problem:** Thresholds (`maxP95FrameTimeMs: 20`, `minP95Fps: 50`) are weaker than AGENTS.md requirements (`≤ 16.7ms`, `≥ 60 FPS`).

**Fix:** Align thresholds to AGENTS.md values for local/evidence runs. **Do NOT simply hardcode strict values in CI** — previous CI runs showed flaky failures on slower GitHub Actions runners at strict thresholds (see conversation `2b58ad08`). Instead:
1. Set canonical thresholds to AGENTS.md values (`maxP95FrameTimeMs: 16.7`, `minP95Fps: 60`).
2. Add a documented `CI_TOLERANCE_FACTOR` environment variable (e.g., `1.3`) that multiplies thresholds when running on CI runners. This keeps the audit gates meaningful while preventing false failures on throttled VMs.
3. Document the tolerance rationale in the test file with a comment.


---

### ✅ [DONE] CI-06: Coverage thresholds excluded from CI enforcement ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** `vitest.config.js` sets thresholds, but CI never enforces them.
**Fix:** Add coverage enforcement step in CI.

---

### ✅ [DONE] CI-07: Missing unit tests for multiple systems and adapter entry points ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A / B / C / D (Tickets: A-08, B-06, C-04, D-05)
- Multiple files in `src/ecs/systems/` and `src/adapters/`

**Problem:** Missing tests for pause-system, level-progress, ghost-ai, bomb-tick, explosion, collision-events, renderer-adapter, etc.
**Fix:** Create corresponding test files.

---

### ✅ [DONE] CI-08: P1 audit output path conflicts with A-11 phase deliverable ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-11)
- `.github/prompts/code-analysis-audit.prompt.md` (~L269)

**Problem:** Output paths misaligned.
**Fix:** Align prompt output path with A-11.

---

### ✅ [DONE] CI-09: No DOM element budget / memory allocation test ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A/D (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** AGENTS.md requires ≤500 DOM elements and zero repeated allocations, but no tests verify this.
**Fix:** Add Playwright tests for DOM counts and memory allocation limits.

---

### ✅ [DONE] CI-11: Branch coverage threshold below project target ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `vitest.config.js` (L14-19)

**Problem:** Actual thresholds verified in code are `branches: 80, functions: 85, lines: 90, statements: 90`. The `branches: 80` threshold is the only one below the 85% project target. (Note: the original audit claimed "60/70/70/70" which was stale — those values do not exist in the current config.)

**Fix:** Raise `branches` threshold from `80` to `85` in `vitest.config.js`:
```js
thresholds: {
  branches: 85,    // raise from 80
  functions: 85,   // already at target
  lines: 90,       // already above target
  statements: 90,  // already above target
},
```

**Severity revised to LOW** (from MEDIUM) since 3 of 4 dimensions already meet or exceed the target.

---

### ✅ [DONE] CI-12: `main.js` and `main.ecs.js` have coverage gaps ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.js`, `src/main.ecs.js`

**Problem:** Entry points lack full coverage.
**Fix:** Import and test entry points appropriately.

---

### ✅ [DONE] CI-14: Fixed `setTimeout` in Playwright test ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L232)

**Fix:** Use `page.waitForFunction`.

---

