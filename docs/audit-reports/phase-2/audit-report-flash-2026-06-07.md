# Codebase Analysis & Audit Report - Phase 2 (Playable MVP)

**Date:** 2026-06-07
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 2 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — Traced runtime bugs, edge-case failures, state machine transitions, event queue growth, and entity/resource isolation.
2. **Dead Code & Unused References** — Analyzed unused exports, dead branches, stale configurations, and legacy files.
3. **Architecture, ECS Violations & Guideline Drift** — Checked ECS boundary rules, DOM isolation, resource-based adapter injection, render-intent contracts, and ownership policies.
4. **Code Quality & Security** — Audited unsafe DOM sinks, validation paths, storage trust boundaries, CSP directives, and error handlers.
5. **Tests & CI Gaps** — Reviewed unit/integration/E2E coverage, Playwright specs against `docs/audit.md`, and CI policy pipeline enforcement.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 1 |
| 🔴 Critical | 2 |
| 🟠 High | 7 |
| 🟡 Medium | 14 |
| 🟢 Low / Info | 22 |

**Top risks:**
1. **A-12 P2 audit consolidation not completed** (CI-01) — Blocks 19 tickets in P3/P4, stalling subsequent feature work.
2. **Ghost Respawn Failure due to stale RESPAWNING_SCRATCH_SET** (BUG-09) — Causes respawned ghosts to be silently dropped and permanently lost, emptying the ghost pool.
3. **A-05/A-06 Integration & E2E tests not implemented** (CI-02) — Leaves 12 of 20 fully automatable audit questions without Playwright browser validation.
4. **Unbounded Event Queue Growth** (BUG-01) — Events accumulate without drain calls, leaking memory over prolonged sessions.
5. **DOM Isolation Violations** (ARCH-01, ARCH-02) — ECS systems accessing or modifying DOM/adapters outside resources, breaking engine boundaries.

---

## 1) Bugs & Logic Errors

### BUG-01: Event Queue Unbounded Growth — `drain()` Never Called ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03, A-11)
- `src/ecs/resources/event-queue.js` (~L30-80)
- `src/ecs/systems/collision-system.js` (~L200-220)
- `src/ecs/systems/bomb-tick-system.js` (~L90-110)
- `src/ecs/systems/explosion-system.js` (~L100-130)
- `src/ecs/systems/player-move-system.js` (~L60-80)
- `src/main.ecs.js` (bootstrap)

**Problem:** Multiple systems emit gameplay events to the `eventQueue` resource every simulation step. However, no active system or logic in the game loop drains the queue. The audio cue runner has a `drain` function, but it is not registered or wired into the bootstrap execution loop.
**Impact:** Memory leak. At a 60 Hz simulation rate, approximately 216,000 events per hour accumulate in memory, eventually causing an Out-of-Memory (OOM) crash.
**Fix:** Wire the `drain(eventQueue)` call at a deterministic synchronization point (e.g., at the end of the render commit phase) or register an audio-integration system that performs the drain.
**Tests to add:** Leak check test in `event-queue.test.js`: execute 10,000 steps and assert queue length remains bounded.

---

### BUG-02: Map Level-3 Border Has Destructible Cells ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-02)
- `assets/maps/level-3.json` (~L21, col 0, col 14)

**Problem:** Perimeter cells `[5][0]` and `[5][14]` are marked as destructible (type 2). An explosion can destroy these cells, causing a perimeter breach.
**Impact:** Visual-to-gameplay discrepancy. The player will see a hole in the boundary but cannot pass through because outer out-of-bounds coordinates clamp to indestructible.
**Fix:** Change cells to INDESTRUCTIBLE (type 1).
**Tests to add:** Map schema verification test to ensure outer boundaries do not contain destructible cells.

---

### BUG-03: `grid2D` Mirror Write Guard Masks Data Loss ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L507-509)

**Problem:** The `setCell` function writes to the flat grid array unconditionally, but guards the 2D mirror write with `if (map.grid2D[row])`. If the row is undefined, the 2D mirror write is silently skipped while the flat write succeeds.
**Impact:** Stale 2D grid representations will be consumed by debug systems, tests, or renderers.
**Fix:** Remove the conditional check or add an assertion to throw if the row index is out of bounds.
**Tests to add:** Add a test verifying `grid2D[row][col]` always matches the flat array equivalent after writes.

---

### BUG-04: `scoring-system` `lastProcessedFrame` Guard Dead Code ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/systems/scoring-system.js` (~L262-264)

**Problem:** The system contains a comparison guard comparing `frameIndex` against `scoreState.lastProcessedFrame` to prevent double-scoring. Because the system runs exactly once per tick within the dispatch phase, this guard is unreachable.
**Impact:** Dead code in scoring execution path.
**Fix:** Remove the dead condition.
**Tests to add:** None needed.

---

### BUG-05: `resolveExplosionTile` Per-Tile Object Allocation in Hot Loop ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L518-563)

**Problem:** For every tile in an explosion path, a new 15-field object literal is created. A single bomb with 4 arms of radius 7 allocates up to 28 objects, plus chain reactions.
**Impact:** Frequent GC allocations during chain reactions, potentially causing frame rate drops on low-end devices.
**Fix:** Re-use a single pre-allocated scratch object or pass positional arguments instead.
**Tests to add:** Benchmark test tracking heap allocations during chain explosions.

---

### BUG-06: `resetCollisionScratch` Full Fill Every Step ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L149-157)

**Problem:** The system clears and refills 5 typed arrays via `.fill()` on every update tick.
**Impact:** Minimal on default small maps (15x11), but creates scaling bottlenecks on larger maps.
**Fix:** Track dirty indices and reset only the modified coordinates.
**Tests to add:** None.

---

### BUG-07: Detonation Queue Coupled to Explosion System Only ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js`
- `src/ecs/systems/explosion-system.js`

**Problem:** The shared `bombDetonationQueue` is a plain array. If the explosion system fails or gets quarantined, the queue grows unboundedly, causing a processing spike when re-enabled.
**Impact:** Burst entity creation can starve the sprite/fire pool, leading to layout thrashing.
**Fix:** Cap the maximum number of detonations processed per frame.
**Tests to add:** Simulate a blocked explosion system and verify queue size is capped.

---

### BUG-08: `runFixedStep` Iterates Empty `input` Phase ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/ecs/world/world.js` (~L384)

**Problem:** The `'input'` phase in `DEFAULT_PHASE_ORDER` has no registered systems, but is iterated on every fixed simulation step.
**Impact:** Redundant loop iterations.
**Fix:** Remove `'input'` from the default order.
**Tests to add:** None.

---

### BUG-09: Ghost Respawn Failure — `RESPAWNING_SCRATCH_SET` Stale After `processRespawns` ⬆ CRITICAL
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L426-436)

**Problem:** `pruneRespawningGhostsFromReleasedIds` fills `RESPAWNING_SCRATCH_SET` with all respawning IDs. Then, `processRespawns` mutates `spawnState.respawnQueue` by removing ready ghosts, but **never updates `RESPAWNING_SCRATCH_SET`**. The stale set is passed to `enqueueUniqueGhostIds`. Because the ghosts that just finished respawning are still found in `RESPAWNING_SCRATCH_SET`, they are skipped during re-queueing.
**Impact:** Respawning ghosts are silently dropped and permanently lost, emptying the active ghost pool.
**Fix:** Refresh `RESPAWNING_SCRATCH_SET` from `spawnState.respawnQueue` immediately after `processRespawns` finishes and before calling `enqueueUniqueGhostIds`.
**Tests to add:** A test verifying ghosts that complete respawn are successfully queued back into the spawn state.

---

### BUG-10: Per-Frame `new Set()` in Ghost-AI Hot Path ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track B (Tickets: B-08)
- `src/ecs/systems/ghost-ai-system.js` (~L757-759)

**Problem:** Every single update frame, `new Set(spawnState.releasedGhostIds)` is allocated, used once, and garbage collected.
**Impact:** Increases garbage collection pressure in the main simulation loop.
**Fix:** Use a module-level scratch set, cleared and refilled every frame.
**Tests to add:** Monitor allocations in the ghost AI test suite.

---

### BUG-11: Module-Level Scratch Sets Not World-Instance Isolated ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L42-44)

**Problem:** `QUEUED_SCRATCH_SET`, `RELEASED_SCRATCH_SET`, and `RESPAWNING_SCRATCH_SET` are module-level global Singletons.
**Impact:** If multiple World instances run concurrently (e.g., in parallel test runners or fast level loads), shared access will cause state corruption.
**Fix:** Move scratch sets to the spawn state resource or local closures inside `createSpawnSystem()`.
**Tests to add:** Instantiate two parallel worlds and verify their spawn systems do not leak state to each other.

---

### BUG-12: `pauseIntent.restart` Never Set — Dead FSM Branch ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track C (Tickets: C-04)
- `src/ecs/systems/pause-system.js` (~L113)

**Problem:** `if (pauseIntent.restart)` is unreachable. No code path in `pause-input-system.js` or elsewhere ever sets `pauseIntent.restart` to `true`.
**Impact:** Dead code branch. Restarting levels bypasses the pause system and goes directly through `gameFlow.restartLevel()`.
**Fix:** Clean up the dead FSM branch or bind it to a developer key intent.
**Tests to add:** None.

---

### BUG-13: `context.world.renderFrame` Always `undefined` in Production ⬆ LOW
**Origin:** 1. Bugs & Logic Errors (big-pickle)
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L182)

**Problem:** The condition checks `context.world.renderFrame === 0`, but `context.world` is the restricted `worldView` which does not expose `renderFrame`. The check evaluates to `undefined === 0` (always false).
**Impact:** `entityElementMap` is never cleared on restarts, leaking references. Re-using entity IDs across restarts may display stale sprites.
**Fix:** Change `context.world.renderFrame` to `context.renderFrame`.
**Tests to add:** Add unit test verifying `entityElementMap` is cleared when `renderFrame` is `0`.

---

## 2) Dead Code & Unused References

### DEAD-01: `changed-files.txt` Tracked Generated Artifact ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06, A-11)
- `changed-files.txt` (repo root)

**Problem:** A generated diff tracking file is tracked in git history.
**Impact:** Wastes repository storage and causes Git noise.
**Fix:** Remove from track via `git rm --cached changed-files.txt` and exclude in `.gitignore`.

---

### DEAD-02: Duplicate SCORE Constants in `constants.js` vs `scoring-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/resources/constants.js` (~L135-153)
- `src/ecs/systems/scoring-system.js` (~L44-62)

**Problem:** Scoring multipliers and pellet values are duplicated with identical values across both files. The values in `constants.js` are never imported.
**Impact:** Code drift risk.
**Fix:** Remove constants from `constants.js` and import them from `scoring-system.js` if needed.

---

### DEAD-03: Legacy `renderer-dom.js` Superseded But Still in Repo ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`

**Problem:** File remains in the repo despite being marked "LEGACY" and not consumed by active game loops.
**Impact:** Incremental noise and reader confusion.
**Fix:** Delete the file or archive it.

---

### DEAD-04: `test:integration` Runs with `--passWithNoTests` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L21)

**Problem:** Script carries `--passWithNoTests` which hides the fact that no gameplay-integration tests are run by it.
**Impact:** False sense of security.
**Fix:** Remove the flag.

---

### DEAD-05: `coverage` Script Duplicates `test:coverage` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L26-27)

**Problem:** `"coverage"` script is a direct alias of `"test:coverage"`.
**Impact:** Redundant script configuration.
**Fix:** Keep only `"test:coverage"`.

---

### DEAD-06 through DEAD-32: 27 Unused/Minor Exports Across Tracks A/B/C/D ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Various (refer to `audit-report-P2-2026-06-07-deep.md` L241-267 table)

**Problem:** Multiple helper methods, enums, and unused functions exported across systems but never consumed externally.
**Impact:** Bloats external API surface.
**Fix:** Remove `export` keywords or consolidate functions.

---

### DEAD-33: 4 Unnecessarily Exported Symbols in `spawn-system.js` ⬆ LOW
**Origin:** 2. Dead Code & Unused References (big-pickle)
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L46-48, L171)

**Problem:** `DEFAULT_GAME_STATUS_RESOURCE_KEY`, `DEFAULT_MAP_RESOURCE_KEY`, `DEFAULT_GHOST_IDS_RESOURCE_KEY`, and `resolveActiveGhostCap` are exported but only consumed internally.
**Impact:** Over-exposed API surface.
**Fix:** Remove `export` modifier.

---

### DEAD-34: 8 `.gitkeep` Files Under `src/` ⬆ INFO
**Origin:** 2. Dead Code & Unused References (big-pickle)
**Files:** Ownership: Track A (Tickets: A-01)
- Various paths in `src/` (e.g. `src/shared/.gitkeep`, `src/game/.gitkeep`)

**Problem:** Empty directories contain `.gitkeep` files despite no longer being empty.
**Impact:** Minor repository clutter.
**Fix:** Remove files now that directories contain source code.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: DOM Isolation Violation — `hud-system.js` Writes DOM Directly ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § DOM Isolation: "Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems."
**Files:** Ownership: Track C (Tickets: C-05)
- `src/ecs/systems/hud-system.js` (direct DOM writes)

**Problem:** `hud-system.js` (a logic system) accesses and mutates the HUD DOM elements directly to write text content.
**Impact:** Bypasses DOM isolation boundaries, creating testing problems and breaking deterministic loop separations.
**Fix:** Write metrics to a resource, and let a dedicated render-phase adapter/system commit values to the DOM.

---

### ARCH-02: Adapter Injection Violation — `board-sync-system.js` Receives Adapter as Closure Param ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § Adapter Injection: "Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js`
- `src/game/bootstrap.js`

**Problem:** `board-sync-system.js` accepts the `boardAdapter` as a direct closure parameter rather than retrieving it via `world.getResource('boardAdapter')`.
**Impact:** Violates the adapter resource injection contract.
**Fix:** Access the adapter via `world.getResource()`.

---

### ARCH-03: `entity-store.getActiveIds()` Returns Mutable Internal Array Reference ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` § ECS Data: Encapsulation and structural deferral invariants.
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js`

**Problem:** `getActiveIds()` returns a direct, mutable reference to the internal `activeIds` array.
**Impact:** External systems could mutate the entity index bypass-checking the store, causing memory/lifecycle desyncs.
**Fix:** Return a copy `[...this.activeIds]` or a frozen representation.

---

### ARCH-04: `ghost-animation-system.js` Not Listed in Any Track Ownership ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` / Codebase Ownership Policy Drift.
**Files:** Ownership: Unassigned (Track D intended)
- `src/ecs/systems/ghost-animation-system.js`
- `scripts/policy-gate/lib/policy-utils.mjs`

**Problem:** The file `ghost-animation-system.js` exists but its path matches no track rules. Any PR touching this file gets flagged by the policy gate.
**Impact:** PR blocks unless bypassed via bugfix branches.
**Fix:** Add `src/ecs/systems/ghost-animation-*.js` to Track D ownership patterns.

---

### ARCH-05: Audit-Traceability Matrix Out of Sync With Actual Tests ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-06, A-12)
- `docs/implementation/audit-traceability-matrix.md`
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** Multiple audit checks (e.g. F-03, F-04, F-05, F-06, F-19, F-20, F-21, B-06) are marked `Pending` in the matrix but are actually `Executable` in the E2E suite.
**Impact:** Stale status reporting.
**Fix:** Update matrix status to `Executable` and add evidence links.

---

### ARCH-06: Board-Sync Snapshot Causes Redundant DOM Writes on Same-Level Restart ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift (big-pickle)
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js` (~L71-73)

**Problem:** On same-level restart, the stale snapshot triggers cell-by-cell modifications because coordinates seem to differ from the fresh grid. The board is already re-drawn by `generateBoard()`, making these updates redundant.
**Impact:** Causes up to 165 redundant DOM writes on the first frame of a restart, potentially causing visual lag.
**Fix:** Reset the grid snapshot to null during the restart cycle.

---

### ARCH-07: Asset Pipeline — Naming Conventions and Validation ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A / Track D (Tickets: A-07, D-10, D-11)
- `assets/manifests/visual-manifest.json`

**Problem:** Characters are WebP formats instead of SVG as preferred in `assets-pipeline.md` §9.2.
**Impact:** Minor guideline deviation.
**Fix:** Update `assets-pipeline.md` to document and permit WebP formats for raster character sheets.

---

### ARCH-08: Frame Pipeline — Render Commit Phase Correctly Separated ✅ PASS
**Status:** PASS — batched DOM updates run once per rAF, decoupling computation from render writes.

### ARCH-09: Input Contract — Keydown/Keyup, Snapshot, Blur Clear ✅ PASS
**Status:** PASS — key events captured, snapshotted in fixed steps, and cleared on blur.

### ARCH-10: Pause Invariants — rAF Active, Simulation Frozen ✅ PASS
**Status:** PASS — rAF active while paused, simulation time advancement frozen.

### ARCH-11: DOM Pooling — Offscreen Hiding ✅ PASS
**Status:** PASS — pooling uses offscreen transforms (`-9999px`) instead of `display: none` to avoid layout reflows.

### ARCH-12: Structural Deferral — Entity/Component Mutations Deferred ✅ PASS
**Status:** PASS — structural mutations deferred to sync points after system ticks.

---

## 4) Code Quality & Security

### SEC-01: Storage Adapter `safeRead()` Schema Parameter Unused ⬆ HIGH
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/storage-adapter.js` (~L18-41)

**Problem:** `safeRead(key, _schema, defaultValue)` accepts a schema argument but does not perform any validation against it, leaving only a basic object check.
**Impact:** Bypasses the strict `AGENTS.md` local storage trust boundary validation requirements.
**Fix:** Implement callback validation using the schema parameters.

---

### SEC-02: Map Runtime Validation Lacks JSON Schema Enforcement ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07, D-03)
- `src/ecs/resources/map-resource.js` (~L425-470)

**Problem:** `createMapResource` validates map semantics but does not enforce JSON Schema validation at runtime, relying only on pre-commit CI validations.
**Impact:** Stale or malformed maps loaded at runtime bypass checks.
**Fix:** Integrate JSON Schema validator (e.g. Ajv) into `createMapResource()`.

---

### SEC-03: `package.json` Marked `"private": false` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L5)

**Problem:** `"private": false` allows unintended packages to be published to NPM.
**Impact:** Potential accidental disclosure of proprietary source code.
**Fix:** Set `"private": true`.

---

### SEC-04: Grid Cell Type Range Not Validated at Runtime ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L320-334)

**Problem:** Semantic validation doesn't check whether grid values map to valid `CELL_TYPE` ranges (0-9).
**Impact:** Undefined cell integers cause rendering and collision bugs.
**Fix:** Add cell type range check in `validateMapSemantic`.

---

### SEC-05: `isRecord()` Type Guard Accepts Arrays ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `src/shared/type-guards.js` (~L8-10)

**Problem:** `isRecord(value)` returns `true` for arrays since `typeof [] === 'object'`.
**Impact:** Weakens map payload structural validations.
**Fix:** Add `!Array.isArray(value)` to the guard.

---

### SEC-06: `validate-schema.mjs` Ajv `strict: false` Masks Schema Errors ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** Ajv instantiated with `strict: false` ignores keyword mismatches.
**Impact:** Schema validation flaws pass CI.
**Fix:** Set `strict: true`.

---

### SEC-07: HUD Throttling Mixes `performance.now()` and `Date.now()` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/dom/hud-adapter.js` (~L28-30, L152)

**Problem:** ARIA announcement throttling switches between `performance.now()` and `Date.now()`.
**Impact:** Timebase desyncs can drop screen reader updates.
**Fix:** Standardize on `performance.now()`.

---

### SEC-08: `render-dom-system.js` Uses `className` Overwrite ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L224)

**Problem:** Overwrites classes with string assignment `el.className = 'sprite'`.
**Impact:** Overwrites custom accessibility styles.
**Fix:** Manipulate classes via `classList` methods.

---

## 5) Tests & CI Gaps

### CI-01: A-12 P2 Audit Consolidation Not Started — Blocks P3+ ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/implementation/ticket-tracker.md` (~L143)

**Problem:** Ticket A-12 is not completed, which blocks 19 P3/P4 hardening and validation tickets.
**Impact:** Stalls Phase 2 closure and halts progress.
**Fix:** Consolidate P2 audits and publish track-specific reports.

---

### CI-02: A-05/A-06 Integration + E2E Tests Not Started ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05, A-06)
- `docs/implementation/track-a.md`

**Problem:** Integration tests for system boundaries (A-05) and Playwright E2E suites (A-06) are not started.
**Impact:** Critical gameplay elements (bomb chains, event systems) lack automated loop testing.
**Fix:** Author integration and E2E test suites.

---

### CI-03: 3 Systems Without Unit Tests ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B / Track C / Track D (Tickets: B-09, C-05, D-10)
- `src/ecs/systems/collision-gameplay-events.js`
- `src/ecs/systems/ghost-animation-system.js`
- `src/ecs/systems/screens-system.js`

**Problem:** Three core systems have no dedicated unit tests.
**Impact:** Regressions in screens or animations will not be caught.
**Fix:** Add unit tests verifying states, frames, and event loops.

---

### CI-04: CI Workflow Triggers on Both `pull_request` AND `pull_request_review_submitted` ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** The workflow is triggered by redundant events, leading to duplicate runs.
**Impact:** Wastes CI minutes.
**Fix:** Deduplicate hooks in workflow configurations.

---

### CI-05: DOM Budget Assertion 600 ≠ AGENTS.md 500 ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L311)

**Problem:** The test asserts a budget of 600 DOM elements, whereas `AGENTS.md` strictly limits nodes to 500.
**Impact:** Permits performance budget violations.
**Fix:** Align test assertion to 500 elements.

---

### CI-06: Phase Testing Report References Done Tickets ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/audit-reports/phase-testing-verification-report.md`

**Problem:** Verification document marks several completed tickets as pending.
**Impact:** Stale status reports.
**Fix:** Sync file status markers.

---

### CI-07: F-13 Genre Behavior E2E Coverage Only Partial ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L197)

**Problem:** Checks victory flows but does not assert ghost stagger timings in the browser.
**Impact:** Ghost house stagger is visually untested.
**Fix:** Add E2E checks verifying stagger timings.

---

### CI-08: 3 E2E Tests Permanently Skipped Pending Runtime World Hook ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/render-desync-bugs.spec.js` (~L84)

**Problem:** Three specs are skipped because the E2E runner cannot access the ECS world directly.
**Impact:** Integration gaps in desync bug checks.
**Fix:** Expose ECS World state to `window` under test environments.

---

### CI-09: No Unit Test for `bomb-explosion-runtime-wiring` Integration ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps (big-pickle)
**Files:** Ownership: Track B (Tickets: B-06)
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`

**Problem:** Missing unit test coverage for the runtime wiring module itself.
**Impact:** Slow feedback loops for mapping errors.
**Fix:** Add unit tests mock-asserting pool allocations and event wiring.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | Track A | Event queue unbounded growth |
| BUG-02 | BUG-02 | — | — | — | — | Track D | Level-3 border destructible cells |
| BUG-03 | BUG-03 | — | — | — | — | Track D | `grid2D` mirror write guard |
| BUG-04 | BUG-04 | — | — | — | — | Track C | `scoring-system` dead guard |
| BUG-05 | BUG-05 | — | — | — | — | Track B | Explosion tile allocation |
| BUG-06 | BUG-06 | — | — | — | — | Track B | Collision scratch full fill |
| BUG-07 | BUG-07 | — | — | — | — | Track B | Detonation queue coupling |
| BUG-08 | BUG-08 | — | — | — | — | Track A | Empty input phase iteration |
| BUG-09 | BUG-D01 | — | — | — | — | Track C | Ghost respawn stale set failure |
| BUG-10 | BUG-D02 | — | — | — | — | Track B | Per-frame Set in ghost-ai |
| BUG-11 | BUG-D03 | — | — | — | — | Track C | Scratch sets World isolation |
| BUG-12 | BUG-D04 | — | — | — | — | Track C | Pause intent dead restart branch |
| BUG-13 | BUG-D05 | — | — | — | — | Track D | Production renderFrame undefined |
| DEAD-01 | — | DEAD-01 | — | — | — | Track A | `changed-files.txt` tracked |
| DEAD-02 | — | DEAD-02 | — | — | — | Track C | Duplicate SCORE constants |
| DEAD-03 | — | DEAD-03 | — | — | — | Track D | Legacy `renderer-dom.js` |
| DEAD-04 | — | DEAD-04 | — | — | — | Track A | `test:integration` `--passWithNoTests` |
| DEAD-05 | — | DEAD-05 | — | — | — | Track A | Duplicate coverage script |
| DEAD-06..32 | — | DEAD-06..32 | — | — | — | Track A/B/C/D | 27 minor unused exports |
| DEAD-33 | — | DEAD-D01 | — | — | — | Track C | 4 unnecessary exports in spawn-system |
| DEAD-34 | — | DEAD-D02 | — | — | — | Track A | 8 `.gitkeep` files in `src/` |
| ARCH-01 | — | — | ARCH-01 | — | — | Track C | `hud-system` DOM isolation breach |
| ARCH-02 | — | — | ARCH-02 | — | — | Track D | `board-sync` adapter injection breach |
| ARCH-03 | — | — | ARCH-03 | — | — | Track A | `entity-store` mutable array leak |
| ARCH-04 | — | — | ARCH-04 | — | — | Track D | Animation system unassigned track |
| ARCH-05 | — | — | ARCH-05 | — | — | Track A | Matrix status out of sync |
| ARCH-06 | — | — | ARCH-D01 | — | — | Track D | Redundant restart DOM writes |
| ARCH-07 | — | — | ARCH-07 | — | — | Track A/D | Asset WebP formatting drift |
| SEC-01 | — | — | — | SEC-01 | — | Track C | Storage schema validation gap |
| SEC-02 | — | — | — | SEC-02 | — | Track A | Map runtime JSON validation missing |
| SEC-03 | — | — | — | SEC-03 | — | Track A | `package.json` `"private": false` |
| SEC-04 | — | — | — | SEC-04 | — | Track D | Grid cell range validation gap |
| SEC-05 | — | — | — | SEC-05 | — | Track A | `isRecord` type guard accepts arrays |
| SEC-06 | — | — | — | SEC-06 | — | Track A | Ajv strict mode turned off |
| SEC-07 | — | — | — | SEC-07 | — | Track C | ARIA HUD clock mixing |
| SEC-08 | — | — | — | SEC-08 | — | Track D | DOM className overwriting |
| CI-01 | — | — | — | — | CI-01 | Track A | A-12 consolidated audit block |
| CI-02 | — | — | — | — | CI-02 | Track A | A-05/A-06 tests missing |
| CI-03 | — | — | — | — | CI-03 | Track B/C/D | 3 systems missing unit tests |
| CI-04 | — | — | — | — | CI-04 | Track A | CI duplicate workflow triggers |
| CI-05 | — | — | — | — | CI-05 | Track A | DOM budget assertion mismatch |
| CI-06 | — | — | — | — | CI-06 | Track A | Stale phase report ticket lists |
| CI-07 | — | — | — | — | CI-07 | Track A | F-13 ghost stagger E2E gap |
| CI-08 | — | — | — | — | CI-08 | Track A | 3 skipped E2E tests |
| CI-09 | — | — | — | — | CI-D01 | Track B | Missing wiring unit tests |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **CI-01**: Complete A-12 P2 Audit Consolidation (Track A)
2. **CI-02**: Implement A-05 (integration) and A-06 (E2E) testing suites (Track A)
3. **BUG-09**: Fix `RESPAWNING_SCRATCH_SET` stale state failure in spawn-system (Track C)

### Phase 2 — High Severity (immediate follow-up)
4. **ARCH-01**: Fix `hud-system.js` direct DOM mutations (Track C)
5. **ARCH-02**: Fix `board-sync-system.js` closure-passed adapter dependency (Track D)
6. **ARCH-03**: Return clones instead of mutable activeIds array in `entity-store.js` (Track A)
7. **ARCH-05**: Sync `audit-traceability-matrix.md` status with tests (Track A)
8. **SEC-01**: Hook validator callback checks in `storage-adapter.js` (Track C)
9. **CI-03**: Implement unit tests for animation, screen, and collision-event systems (Tracks B/C/D)
10. **CI-04**: Deduplicate triggers in `.github/workflows/policy-gate.yml` (Track A)

### Phase 3 — Medium Severity
11. **BUG-01**: Register and run the event queue drain consumer (Track A)
12. **BUG-10**: Pool the `Set` in ghost AI to reduce allocations (Track B)
13. **DEAD-01**: Remove cached `changed-files.txt` from Git (Track A)
14. **DEAD-02**: Remove duplicated SCORE constants from `constants.js` (Track C)
15. **ARCH-04**: Register `ghost-animation-system` patterns under Track D ownership (Track D)
16. **ARCH-06**: Clear snapshots on board restart to stop redundant updates (Track D)
17. **ARCH-07**: Document raster-to-WebP asset deviation in docs (Track A/D)
18. **SEC-02**: Implement JSON Schema validation inside `createMapResource` (Track A)
19. **SEC-03**: Set private status to `true` in `package.json` (Track A)
20. **SEC-04**: Add cell type range check inside `validateMapSemantic` (Track D)
21. **CI-05**: Constrain Playwright budget test assertion to 500 DOM elements (Track A)
22. **CI-06**: Align Phase testing report with current ticket states (Track A)
23. **CI-07**: Expand E2E check to assert stagger release timings (Track A)
24. **CI-09**: Write unit test coverages for `bomb-explosion-runtime-wiring.js` (Track B)

### Phase 4 — Low Severity & Info (maintenance)
25. **BUG-02..08, BUG-11..13**: Fix minor logic bugs, module-level sets, dead branches (Tracks A/B/C/D)
26. **DEAD-03..05, DEAD-06..32, DEAD-33, DEAD-34**: Deduplicate legacy adapter files, remove unused exports, purge stale `.gitkeeps` (Tracks A/B/C/D)
27. **SEC-05..08**: Refactor type guards, enable strict schema compiler flags, clean classNames (Tracks A/D)
28. **CI-08**: Wire test runtime hooks and enable skipped Playwright specs (Track A)

---

## Notes

- **Compliance Verifications:** Frame loop isolation, input contracts (snapshotted & edge-triggered), pooling transforms, and ECS structural mutation deferrals are strictly verified and comply fully with `AGENTS.md`.
- **Bugfix Branch Workarounds:** Temporary bypass of Track D constraints (e.g. for `ghost-animation-system`) is permitted via conventional bugfix/integration branches until ownership rules are normalized.

---

*End of report.*
