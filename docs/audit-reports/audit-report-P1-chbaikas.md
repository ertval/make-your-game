# Codebase Analysis & Audit Report - P1

**Date:** 2026-05-04
**Project:** make-your-game (Ms. Ghostman -- Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P1 -- 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** -- runtime bootstrap, game loop, clock lifecycle, and ECS dispatch contracts.
2. **Dead Code & Unused References** -- stale compatibility paths, redundant scripts/config, and unused dependency surface.
3. **Architecture, ECS Violations & Guideline Drift** -- ECS boundaries, render pipeline, pause/HUD runtime wiring, audit behavior, and capacity contracts.
4. **Code Quality & Security** -- forbidden technology scans, DOM safety, CSP/storage boundaries, and policy coverage.
5. **Tests & CI Gaps** -- audit thresholds, phase report workflow, CI execution shape, and audit evidence contracts.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations. Agent 5 did not return a final payload before timeout; the orchestrator completed the Tests & CI pass locally using the same read-only scope.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 1 |
| 🟠 High | 5 |
| 🟡 Medium | 6 |
| 🟢 Low / Info | 5 |

**Top risks:**
1. Browser startup still runs twice because `main.ecs.js` auto-starts while `main.js` also calls the entrypoint.
2. Resume/focus lifecycle resync resets `simTimeMs` to zero, breaking pause/determinism semantics.
3. The runtime render path has two DOM commit writers, one of which bypasses sprite pooling.
4. Product-level pause, HUD, timer, score, lives, and level-flow systems are not wired into the default runtime path.
5. Performance audit thresholds are weaker than AGENTS.md acceptance criteria.

---

## 1) Bugs & Logic Errors

### BUG-01: Browser entrypoint starts the application twice ⬆ Critical
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.js` (~L12)
- `src/main.js` (~L14)
- `src/main.ecs.js` (~L513)

**Problem:** `src/main.js` imports `startBrowserApplication` from `main.ecs.js` and calls it, while `main.ecs.js` also auto-runs `bootstrapApplication()` in browser contexts. This contradicts the `main.js` entrypoint comment that side effects are kept out of `main.ecs.js`.
**Impact:** Loading the browser entry can create two worlds, two rAF loops, duplicate input adapters, duplicate renderer registrations, and unstable runtime hooks. This directly threatens boot, rAF, input, render, and performance audit assertions.

**Fix:** Remove the browser auto-start block from `src/main.ecs.js` and keep startup side effects only in `src/main.js`.

```js
// Remove from main.ecs.js:
// if (typeof window !== 'undefined' && typeof document !== 'undefined') {
//   void bootstrapApplication();
// }
```

**Tests to add:** Add a browser/jsdom integration test that imports `src/main.js` and asserts only one runtime starts, one rAF loop is scheduled, and one input adapter is registered.

---

### BUG-02: Resume and focus resync reset simulation time to zero ⬆ High
**Origin:** 1. Bugs & Logic Errors; 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A / Track D / Track C (Tickets: A-03, D-01, C-04)
- `src/ecs/resources/clock.js` (~L143)
- `src/ecs/resources/clock.js` (~L146)
- `src/main.ecs.js` (~L270)
- `src/main.ecs.js` (~L335)
- `src/game/bootstrap.js` (~L600)

**Problem:** `resetClock()` always sets `clock.simTimeMs = 0`. The runtime calls `bootstrap.resyncTime()` on resume, visibility recovery, blur, and focus, so lifecycle baseline resync rewinds simulation time instead of only clearing catch-up state.
**Impact:** Violates pause/resume determinism. Spawn timing, timer systems, replay probes, and performance checks can observe time jumping backward after pause or focus changes.

**Fix:** Split clock APIs. Keep a restart/new-level reset that clears `simTimeMs`, and add a baseline resync function that updates `lastFrameTime`, `realTimeMs`, `accumulator`, and `alpha` without changing `simTimeMs`.

**Tests to add:** Add pause/resume integration coverage asserting `simTimeMs` is unchanged immediately after `resyncTime()` and advances from the previous value on the next unpaused frame.

---

### BUG-03: `life-system` crashes under normal World dispatch ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C / Track A (Tickets: C-02, A-02)
- `src/ecs/systems/life-system.js` (~L102)
- `src/ecs/systems/life-system.js` (~L118)
- `src/ecs/world/world.js` (~L126)

**Problem:** Systems dispatched by `World.runFixedStep()` receive a restricted world view. `life-system` calls `world.entityStore.isAlive(playerEntity)`, but the view exposes `isEntityAlive(handle)`, not `entityStore`.
**Impact:** The first real life-loss/respawn path can throw when `life-system` is registered normally, causing dispatcher fault handling and preventing reliable lives/HUD behavior.

**Fix:** Use the public world-view method.

```js
!world.isEntityAlive(playerEntity)
```

**Tests to add:** Register `createLifeSystem()` on a real `World`, emit a player-death collision intent, call `world.runFixedStep(...)`, and assert lives decrement, respawn state updates, and no system fault is recorded.

---

## 2) Dead Code & Unused References

### DEAD-01: Project gate runs audit browser specs twice ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `scripts/policy-gate/run-project-gate.mjs` (~L33)
- `package.json` (~L22)
- `package.json` (~L25)

**Problem:** `run-project-gate.mjs` adds `test:audit:e2e`, then also adds `test:e2e`. `test:e2e` runs all `tests/e2e`, including `tests/e2e/audit`, so audit browser specs run twice.
**Impact:** CI is slower and audit failures may be duplicated/noisier, making PR feedback harder to triage.

**Fix:** Exclude `tests/e2e/audit` from `test:e2e`, or make project gate choose either `test:audit:e2e` or full `test:e2e`, not both.

---

### DEAD-02: Level-loader compatibility guard is stale after D-03 export landed ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A / Track D (Tickets: A-03, D-03)
- `src/game/level-loader.js` (~L24)
- `src/game/level-loader.js` (~L47)
- `src/ecs/resources/map-resource.js` (~L372)

**Problem:** `level-loader.js` still dynamically checks for `mapResourceModule.assertValidMapResource`, but `assertValidMapResource` now exists as a stable export.
**Impact:** The optional fallback and stale integration comment obscure the actual dependency contract.

**Fix:** Replace the namespace import/fallback with a direct named import of `assertValidMapResource` and remove the stale compatibility comment.

---

### DEAD-03: Asset tooling dependencies have no executable generation path ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A / Track D (Tickets: A-01, D-10, D-11)
- `package.json` (~L50)
- `package.json` (~L51)

**Problem:** `maxrects-packer` and `sharp` are installed, but no source, script, npm command, or test imports them. Existing references are documentation/PR-message claims about sprite generation.
**Impact:** Dependency footprint grows without a reproducible asset-generation workflow.

**Fix:** Either remove the dependencies until generation code exists, or add a tracked `scripts/generate-spritesheets.mjs` and wire it into asset validation.

---

### DEAD-04: README documents `sbom.json` as tracked content ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `README.md` (~L200)
- `.github/workflows/policy-gate.yml` (~L74)
- `package.json` (~L42)

**Problem:** `README.md` lists `sbom.json` in the repo tree, but it is generated during CI and is not tracked.
**Impact:** Documentation misleads contributors about generated versus source-controlled artifacts.

**Fix:** Update README to describe `sbom.json` as generated by `npm run sbom`, or intentionally track it and keep the CI freshness check.

---

### DEAD-05: Vitest coverage exclude is redundant with current include ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01, A-04)
- `vitest.config.js` (~L8)
- `vitest.config.js` (~L12)

**Problem:** Coverage already includes only `src/**/*.js`, so `exclude: ['tests/e2e/**']` has no effect.
**Impact:** Minor config drift; future maintainers may think test exclusion is actively required for coverage correctness.

**Fix:** Remove the redundant exclude or broaden it only if future coverage includes non-`src` paths.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Runtime has two DOM commit paths, one bypasses sprite pooling ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** “MUST batch DOM writes in a dedicated render commit phase once per frame.” Also: “MUST use DOM pooling for high-churn visuals...”
**Files:** Ownership: Track D / Track A (Tickets: D-08, D-09, A-03)
- `src/game/bootstrap.js` (~L241)
- `src/game/bootstrap.js` (~L586)
- `src/main.ecs.js` (~L438)
- `src/adapters/dom/renderer-dom.js` (~L56)

**Problem:** `render-dom-system` commits pooled sprites during `world.runRenderCommit()`, then `registeredRenderer.update(renderIntent)` invokes `createDomRenderer`, which creates/removes direct DOM nodes outside the sprite pool.
**Impact:** Breaks the single DOM commit contract, risks duplicate visuals, and reintroduces allocation/removal churn in the render path.

**Fix:** Remove `createDomRenderer` from the runtime frame path or convert it into a non-mutating adapter facade. The default runtime should flow through `render-collect-system -> render-dom-system` once per frame.

---

### ARCH-02: Product-level pause and HUD audit behavior is not wired into default runtime ⬆ High
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** “Pause Menu: MUST preserve actions: Continue and Restart.” Also: “HUD: MUST maintain metrics: timer/countdown, score, and lives.”
**Files:** Ownership: Track C / Track A (Tickets: C-01, C-02, C-04, C-05, A-03, A-06)
- `src/game/bootstrap.js` (~L244)
- `src/game/bootstrap.js` (~L255)
- `src/main.ecs.js` (~L440)
- `src/ecs/systems/pause-system.js` (~L82)
- `src/ecs/systems/level-progress-system.js` (~L70)

**Problem:** The default runtime registers input, movement, bomb/explosion logic, render collect, and render DOM. It does not register `pause-input-system`, `pause-system`, `level-progress-system`, `timer-system`, `life-system`, `scoring-system`, or HUD/screen adapters.
**Impact:** Product-level `AUDIT-F-07..F-16` cannot be satisfied through real keyboard/UI gameplay yet. Current C-04/C systems remain system-layer coverage only.

**Fix:** In C-05/A-06 integration, register Track C systems in deterministic order, add HUD/screen adapters as World resources, and cover the runtime paths with keyboard-driven Playwright tests.

---

### ARCH-03: World exposes mutable ECS internals ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** “Entities as opaque IDs...” and “Structural Deferral: MUST defer entity/component add/remove operations to a controlled sync point.”
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/world.js` (~L215)
- `src/ecs/world/world.js` (~L219)
- `src/game/bootstrap.js` (~L308)

**Problem:** `world.entityStore` and `world.systemsByPhase` expose mutable internals. Bootstrap already depends on `world.entityStore.maxEntities` and `world.entityStore.isAlive()`.
**Impact:** External code can bypass stale-handle checks, mutate lifecycle arrays, or alter phase registration after setup.

**Fix:** Replace public internal getters with narrow APIs such as `getMaxEntities()`, `isEntityAlive(handle)`, and `getRegisteredSystemSummary()`.

---

### ARCH-04: Render intent capacity does not match entity capacity contract ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** “Preallocation: MUST preallocate or pool transient entities and corresponding DOM nodes.”
**Files:** Ownership: Track D / Track A (Tickets: D-04, D-07, D-08, A-02)
- `src/ecs/resources/constants.js` (~L211)
- `src/ecs/resources/constants.js` (~L216)
- `src/ecs/world/entity-store.js` (~L11)
- `src/ecs/render-intent.js` (~L172)

**Problem:** `EntityStore` defaults to `10_000` entities, while `MAX_RENDER_INTENTS` is sized to a gameplay estimate. If renderable entities exceed that estimate, render intents can be dropped.
**Impact:** Visuals can silently disappear under capacity pressure, violating the render-intent contract and weakening deterministic render output.

**Fix:** Declare a canonical `MAX_ENTITIES`/`MAX_RENDERABLE_ENTITIES` invariant and size `MAX_RENDER_INTENTS` from it, or enforce renderable capacity before appending.

---

### ARCH-05: Hidden render intents use `display:none` instead of offscreen transform ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift; 4. Code Quality & Security
**Violated rule:** “Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` -- not `display:none` -- to avoid triggering layout.”
**Files:** Ownership: Track D (Tickets: D-08, D-09)
- `src/ecs/systems/render-dom-system.js` (~L72)
- `src/ecs/systems/render-dom-system.js` (~L139)
- `src/adapters/dom/sprite-pool-adapter.js` (~L30)

**Problem:** `render-dom-system` sets hidden elements to `display: none` and later clears `display`, while the sprite pool correctly uses offscreen transforms.
**Impact:** Gameplay render commits can trigger layout work and violate the pooling invariant.

**Fix:** Encode hidden state with offscreen transform, opacity, or pool release. Do not write `style.display` in the gameplay render commit path.

---

## 4) Code Quality & Security

### SEC-01: Forbidden-tech policy scan misses WebGL/WebGPU and inline handlers ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07, A-06)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L75)
- `scripts/policy-gate/check-forbidden.mjs` (~L26)
- `.github/workflows/policy-gate.yml` (~L64)

**Problem:** The full-repo forbidden scan catches canvas elements, `createElement('canvas')`, framework imports, and legacy/dynamic sinks, but it does not block WebGL/WebGPU APIs or inline handler attributes such as `onclick=`.
**Impact:** A future PR could pass policy while adding tech explicitly forbidden by AGENTS.md.

**Fix:** Extend `FORBIDDEN_TECH_RULES` and security sink rules with WebGL/WebGPU API patterns and inline handler attribute scans. Add policy contract tests for these cases.

---

### SEC-02: Storage trust boundary remains pending for high scores ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `docs/game-description.md` (~L311)
- `docs/implementation/track-c.md` (~L121)
- `docs/implementation/ticket-tracker.md` (~L117)

**Problem:** The game spec requires high scores in `localStorage`, and C-05 owns the validated storage adapter, but no storage adapter exists yet.
**Impact:** No current unsafe storage read was found in `src/`, but high-score work must not land without validation-on-read.

**Fix:** Implement `src/adapters/io/storage-adapter.js` with strict JSON parsing, shape/range validation, entry caps, fail-closed fallback, and malformed-storage tests.

---

## 5) Tests & CI Gaps

### CI-01: Performance audit thresholds are weaker than AGENTS.md criteria ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06, A-09)
- `AGENTS.md` (~L208)
- `AGENTS.md` (~L210)
- `tests/e2e/audit/audit-question-map.js` (~L23)
- `tests/e2e/audit/audit-question-map.js` (~L26)
- `tests/e2e/audit/audit-question-map.js` (~L31)
- `tests/e2e/audit/audit.e2e.test.js` (~L84)
- `tests/e2e/audit/audit.e2e.test.js` (~L85)

**Problem:** AGENTS.md requires `>= 60 FPS at p95` and `p95 frame time <= 16.7 ms`. The audit map allows `maxP95FrameTimeMs: 20` and `minP95Fps: 50`; the Vitest audit only asserts those relaxed thresholds.
**Impact:** Semi-automated audit checks can pass while violating canonical performance acceptance.

**Fix:** Change thresholds to `maxP95FrameTimeMs: 16.7` and `minP95Fps: 60`, then update browser performance specs/evidence to satisfy the stricter contract or explicitly document an approved ADR exception.

---

### CI-02: P1 audit output path conflicts with A-11 phase deliverable ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-11)
- `.github/prompts/code-analysis-audit.prompt.md` (~L269)
- `docs/implementation/track-a.md` (~L301)
- `docs/implementation/track-a.md` (~L302)
- `docs/implementation/track-a.md` (~L305)
- `docs/implementation/ticket-tracker.md` (~L108)

**Problem:** The audit prompt saves reports directly under `docs/audit-reports/`, while A-11 requires P1 reports and deduplicated track reports under `docs/audit-reports/phase-1/`. The `phase-1` directory does not currently exist.
**Impact:** Teams can run the correct prompt and still miss the A-11 merge artifact location, making P1 audit consolidation harder to verify.

**Fix:** Align the prompt output path with A-11 for P1, or create a documented copy/move step into `docs/audit-reports/phase-1/` before A-11 closure.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-A1-02 | — | — | — | — | Track A | Browser entrypoint starts twice |
| BUG-02 | BUG-A1-03 | — | ARCH-A3-03 | — | — | Track A / C / D | Lifecycle resync resets simulation time |
| BUG-03 | BUG-A1-04 | — | — | — | — | Track A / C | Life system uses hidden entityStore under restricted dispatch |
| DEAD-01 | — | DEAD-A2-01 | — | — | — | Track A | Project gate duplicates audit browser specs |
| DEAD-02 | — | DEAD-A2-02 | — | — | — | Track A / D | Stale level-loader compatibility guard |
| DEAD-03 | — | DEAD-A2-03 | — | — | — | Track A / D | Asset tooling deps lack executable path |
| DEAD-04 | — | DEAD-A2-04 | — | — | — | Track A | README stale about generated SBOM |
| DEAD-05 | — | DEAD-A2-05 | — | — | — | Track A | Redundant Vitest coverage exclude |
| ARCH-01 | — | — | ARCH-A3-01 | — | — | Track A / D | Runtime has two DOM commit paths |
| ARCH-02 | — | — | ARCH-A3-04 | — | — | Track A / C | Product pause/HUD systems not wired |
| ARCH-03 | — | — | ARCH-A3-05 | — | — | Track A | World exposes mutable internals |
| ARCH-04 | — | — | ARCH-A3-06 | — | — | Track A / D | Render intent capacity mismatch |
| ARCH-05 | — | — | ARCH-A3-02 | SEC-A4-02 | — | Track D | Hidden visuals use display none |
| SEC-01 | — | — | — | SEC-A4-01 | — | Track A | Forbidden scan misses WebGL/WebGPU and inline handlers |
| SEC-02 | — | — | — | SEC-A4-03 | — | Track C | High-score storage adapter pending |
| CI-01 | — | — | — | — | Orchestrator CI pass | Track A | Performance thresholds are relaxed |
| CI-02 | — | — | — | — | Orchestrator CI pass | Track A | P1 audit report path conflicts with A-11 |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Remove browser auto-start from `main.ecs.js` so startup happens once through `main.js` (Track A).

### Phase 2 — High Severity (immediate follow-up)
2. **BUG-02**: Split restart clock reset from lifecycle baseline resync (Track A / C / D).
3. **BUG-03**: Make `life-system` use the restricted World dispatch API (Track C / A).
4. **ARCH-01**: Collapse runtime rendering to one pooled DOM commit path (Track D / A).
5. **ARCH-02**: Wire pause, timer, score, life, level progression, and HUD systems into the default runtime path (Track C / A).
6. **CI-01**: Tighten performance thresholds to AGENTS.md acceptance values (Track A).

### Phase 3 — Medium Severity
7. **ARCH-03**: Replace public mutable ECS internals with narrow World APIs (Track A).
8. **ARCH-04**: Align render intent capacity with entity/renderable capacity (Track D / A).
9. **ARCH-05**: Replace hidden render `display:none` with offscreen transform behavior (Track D).
10. **SEC-01**: Extend forbidden scans for WebGL/WebGPU and inline handlers (Track A).
11. **DEAD-01**: Stop running audit browser specs twice in project gate (Track A).
12. **CI-02**: Align P1 report output path with A-11 phase artifacts (Track A).

### Phase 4 — Low Severity (maintenance)
13. **SEC-02**: Implement validated high-score storage adapter before C-05 lands (Track C).
14. **DEAD-02**: Remove stale level-loader compatibility fallback (Track A / D).
15. **DEAD-03**: Add executable sprite generation path or remove unused asset tooling deps (Track A / D).
16. **DEAD-04**: Correct README SBOM tracking documentation (Track A).
17. **DEAD-05**: Remove redundant Vitest coverage exclude (Track A).

---

## Notes

- The security scan found no current unsafe DOM sinks, `var`, `require`, `XMLHttpRequest`, framework imports, canvas usage, or string timers in executable source.
- `BUG-A1-01` from the bugs pass was not carried forward because the current checkout already has `renderIntent` hoisted in `src/game/bootstrap.js` around L573-L587; the reported ReferenceError does not reproduce against this branch snapshot.
- `npm run check` passed during the read-only dead-code pass.

---

*End of report.*
