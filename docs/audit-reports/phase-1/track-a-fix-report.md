# Track A Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report with full details.

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

### BUG-08: World frame counter not reset on level restart ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L494)

**Problem:** `world.frame` persists across level transitions.
**Impact:** Frame-dependent timing desyncs.

**Fix:** Reset `world.frame = 0` in `restartLevel()`.

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

### DEAD-05: Unused methods in EntityStore ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js` (~L19)

**Problem:** `getGeneration` and `getHandleForId` have no callers.
**Fix:** Remove or mark internal.

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

### ARCH-02: `World.entityStore` getter exposes mutable internal store ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** Entities must be opaque IDs; systems must use World API, not internal stores.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L215)

**Problem:** Returns direct reference to internal EntityStore.
**Impact:** Breaks ECS encapsulation, enables non-deterministic mutation.

**Fix:** Remove `entityStore` getter. Expose specific safe accessors.

---

### ARCH-06: Render intent capacity does not match entity capacity contract ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D/A (Tickets: D-04, D-07)
- `src/ecs/resources/constants.js` (~L211)

**Problem:** `EntityStore` defaults to 10k entities, while `MAX_RENDER_INTENTS` is sized to a smaller estimate.
**Impact:** Visuals can silently disappear under pressure.

**Fix:** Align invariants.

---

### ARCH-08: Bootstrap Direct DOM Access in `onLevelLoaded` ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/bootstrap.js` (~L495)

**Problem:** Direct `getElementById('game-board')` couples level loading to specific DOM ID.
**Fix:** Inject container element.

---

## 4) Code Quality & Security

---

### SEC-01: Forbidden-tech policy scan misses WebGL/WebGPU and inline handlers ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/policy-gate/check-forbidden.mjs` (~L26)

**Problem:** Doesn't block WebGL/WebGPU or inline `onclick=` handlers.
**Fix:** Extend `FORBIDDEN_TECH_RULES`.

---

### SEC-03: Policy gates can be bypassed locally ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L30)

**Problem:** No pre-commit hook enforcing checks locally.
**Fix:** Add Husky pre-commit hook.

---

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

### CI-14: Fixed `setTimeout` in Playwright test ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L232)

**Fix:** Use `page.waitForFunction`.

---

