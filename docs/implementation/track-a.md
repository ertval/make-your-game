# ⚙️ Track A — World, Game Flow, Scaffolding, Testing & QA (Dev 1)

��� Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Project scaffolding, ECS internals (World, Entity Store, Queries), game flow orchestration (`game/` folder), game loop, CI/schema wiring, **ALL testing** (unit, integration, e2e, audit), QA, polish, and evidence aggregation. Track A has global ownership of `tests/**`; Tracks B/C/D may also modify scoped tests that map to files they own. **Does NOT own** resources (`constants`, `clock`, `rng`, `event-queue`, `game-status`) or map loading — those are owned by Track D.
> **Execution model**: Prototype-first delivery for fastest visual feedback, then playable MVP, feature depth, and hardening.

## Phase Order (Prototype-First)

- **P0 Foundation**: `A-01` to `A-03`, `A-10`
- **P1 Visual Prototype**: `A-11` (support only)
- **P2 Playable MVP**: `A-07`, `A-12`
- **P3 Feature Complete + Hardening**: `A-04` to `A-06`, `A-08`, `A-13`
- **P4 Final Acceptance**: `A-09`, `A-14`

---

#### A-01: Project Scaffolding & Tooling
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: None
**Impacts**: Repo bootstrapping, local dev velocity, policy gates (`AUDIT-F-04`, `AUDIT-F-05`, `AUDIT-B-02`)
**Blocks**: A-02, A-03, A-07, C-06, D-05

**Deliverables**:
- `package.json` with all scripts (`dev`, `build`, `preview`, `lint`, `format`, `check`, `test`, `test:watch`, `test:unit`, `test:integration`, `test:e2e`, `test:audit`, `coverage`, `ci`, `validate:schema`, `sbom`)
- `vite.config.js`, `biome.json`, `vitest.config.js`, `playwright.config.js`
- `index.html` with core `<div>` mount points (game-board, hud, overlay containers)
- Basic CSS reset and variable stubs
- CI workflow configuration with merge gates (lint, tests, coverage)
- Static CI scan failing on `<canvas>` usage and banned frameworks

- [x] Initialize `package.json` with ES modules, configure Vite and Biome.
- [x] Setup Vitest for pure system/component testing.
- [x] Setup Playwright for e2e/audit testing.
- [x] Configure CI merge gates (lint, tests, coverage minimums, protected branch checks).
- [x] Implement dependency governance (strict lockfile policy and SBOM generation).
- [x] Create `index.html` structure with core `<div>` mount points (game-board, hud, overlay containers).
- [x] Commit basic CSS reset and variable stubs.
- [x] Add all scripts in `package.json`.
- [x] Add `vite.config.js`, `biome.json`, `vitest.config.js`, and `playwright.config.js` with CI-compatible defaults.
- [x] Add a static CI scan that fails on `<canvas>` usage and banned framework dependencies (`react`, `vue`, `angular`, `svelte`).
- [x] Verification gate: CI passes on baseline and fails when intentionally introducing a banned dependency or `<canvas>` node.

---

#### A-02: ECS Architecture Core (World, Entity, Query)
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-01`
**Impacts**: Deterministic runtime backbone, unblocks all simulation systems (`AUDIT-B-03`)
**Blocks**: A-03, A-04, B-01, D-01, D-04

**Deliverables**:
- `src/ecs/world/world.js` — lifecycle, system scheduling, frame context, resource API
- `src/ecs/world/entity-store.js` — ID generation, recycling, stale-handle protection
- `src/ecs/world/query.js` — bitmask component matching

- [x] Implement `src/ecs/world/entity-store.js` using ID arrays via a recycling pool to avoid GC chunks.
- [x] Implement `src/ecs/world/query.js`: Provides fast entity lookups matching component masks (bitmask-based).
- [x] Implement `src/ecs/world/world.js`:
  - Registers systems and dictates phase ordering (Input -> Physics -> Logic -> Render).
  - Handles fixed-step logic loop (`accumulator`) and calls simulation systems.
  - Passes resource references smoothly without global singleton abuse.
- [x] Enforce deterministic system ordering and a single deferred-structural-mutation sync point per fixed step.
- [x] Catch exceptions at the system-dispatch boundary, log them, and skip the faulting system for the current frame rather than crashing the loop.
- [x] Add generation-based stale-handle protection semantics for recycled entity IDs.
- [x] Verification gate: unit tests cover ID recycling, stale-handle rejection, deferred mutation application, and deterministic system order.

---

#### A-03: Game Loop & Main Initialization
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-02`, `D-01` (resources from Track D)
**Impacts**: Runtime frame pipeline, pause semantics, FPS instrumentation (`AUDIT-F-02`, `AUDIT-F-10`, `AUDIT-F-17`, `AUDIT-F-18`)
**Blocks**: A-04, A-05, A-06, B-02, C-04

**Deliverables**:
- `src/main.ecs.js` — app entry, boots World, binds rAF
- `src/game/bootstrap.js` — World assembly + system registration order
- `src/game/game-flow.js` — FSM driver (MENU → PLAYING ↔ PAUSED → GAMEOVER/VICTORY)
- `src/game/level-loader.js` — level transition orchestration (stub, data from D-03)
- Global `unhandledrejection` handler with error overlay

- [x] Implement `main.ecs.js`: Boots World, binds `window.requestAnimationFrame`.
- [x] Connect `rAF` pipeline into World's internal accumulator update.
- [x] Implement basic state-transition flow (playing, paused) handled by checking `clock.isPaused` to freeze simulation while keeping rAF active.
- [x] Add resume safety and lifecycle handling: baseline reset (`lastFrameTime = now`) and accumulator clamp/clear on unpause and tab restore.
- [x] Clamp catch-up using `MAX_STEPS_PER_FRAME` and resync clock baselines on `blur` and `visibilitychange` recovery.
- [x] Add global `unhandledrejection` handler that logs the error and displays a visible error overlay for critical failures.
- [x] Add instrumentation hooks for Playwright frame-time/FPS collection in semi-automated audit tests.
- [x] Implement `src/game/bootstrap.js`: World assembly + system registration order.
- [x] Implement `src/game/game-flow.js`: FSM driver that coordinates state transitions.
- [x] Implement `src/game/level-loader.js`: Level transition orchestration (data from Track D map resource).
- [x] Verification gate: integration tests prove pause invariants; e2e proves rAF continues while simulation is frozen.

---

#### A-04: Unit Tests — ECS Core & Resources
**Priority**: ��� Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `A-02`, `A-03`, `D-01`, `D-03`
**Impacts**: Early regression safety net for runtime foundation
**Blocks**: None

**Deliverables**:
- `tests/unit/resources/clock.test.js`
- `tests/unit/resources/rng.test.js`
- `tests/unit/resources/event-queue.test.js`
- `tests/unit/resources/game-status.test.js`
- `tests/unit/resources/constants.test.js`
- `tests/unit/resources/map-resource.test.js`

- [x] Write unit tests for `clock.js`: time progression, pause freeze, resume baseline reset, accumulator clamp.
- [x] Write unit tests for `rng.js`: deterministic sequences from same seed, different seeds produce different sequences.
- [x] Write unit tests for `event-queue.js`: insertion ordering, flush behavior, deterministic iteration.
- [x] Write unit tests for `game-status.js`: FSM transitions, invalid transition rejection.
- [x] Write unit tests for `constants.js`: all canonical values correct.
- [x] Write unit tests for `map-resource.js`: valid parse, invalid JSON rejection, spawn point extraction.
- [x] Verification gate: all core/resource unit tests green with >90% line coverage on tested files.

---

#### A-05: Integration Tests — Multi-System & Adapter Boundaries
**Priority**: ��� Medium
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `A-03`, `B-03`, `B-04`, `B-06`, `B-09`, `C-01`, `C-02`, `C-04`, `C-05`, `D-08`
**Impacts**: Cross-system correctness, adapter boundary guarantees, deterministic replay confidence
**Blocks**: A-09

**Deliverables**:
- `tests/integration/gameplay/*.test.js` — multi-system interaction scenarios
- `tests/integration/adapters/*.test.js` — adapter boundary tests (jsdom)
- `src/debug/replay.js` — replay utility
- Replay determinism test using `src/debug/replay.js`

- [ ] Write integration tests for `tests/integration/gameplay/`: multi-system interaction scenarios (bomb→explosion→collision→scoring pipeline).
- [ ] Write integration tests for gameplay event emission: event order, payload schema, deterministic ordering across seeded runs.
- [ ] Write integration tests for pause invariants: rAF active, simulation frozen, HUD responsive, timer/fuse frozen.
- [ ] Write integration tests for `tests/integration/adapters/`: adapter boundary tests using jsdom.
  - `input-adapter.js`: keydown/keyup mapping, blur clearing, no OS key-repeat dependency.
  - `renderer-adapter.js`: safe DOM sinks (no innerHTML), createElementNS.
  - `sprite-pool-adapter.js`: pool sizing, offscreen-transform hiding (not display:none), pool exhaustion.
  - `hud-adapter.js`: textContent updates, no unsafe sinks.
  - `screens-adapter.js`: overlay toggling, keyboard focus transfer.
  - `audio-adapter.js`: async decode path, cue mapping, fallback behavior for missing clips.
  - `storage-adapter.js`: untrusted data validation on read.
- [ ] Implement replay utility in `src/debug/replay.js` to support determinism checks and tests.
- [ ] Write replay determinism test: same seed + input trace → identical `hashWorldState` at frame N.
- [ ] Verification gate: all integration tests green.

---

#### A-06: E2E Audit Tests (Playwright)
**Priority**: ��� Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `A-03`, `B-04`, `B-06`, `B-07`, `B-08`, `B-09`, `C-01`, `C-02`, `C-03`, `C-04`, `C-05`
**Impacts**: Acceptance automation coverage (`AUDIT-F-01..F-18`, `AUDIT-B-01..B-05`)
**Blocks**: A-09

**Deliverables**:
- `tests/e2e/audit/audit-question-map.js`
- `tests/e2e/audit/audit.e2e.test.js`
- Evidence artifact templates for manual audit items

- [ ] Implement `tests/e2e/audit/audit-question-map.js` mapping each audit question to a test ID.
- [ ] **Fully Automatable tests** (Playwright real browser):
  - F-01: Game runs without crashing (60s smoke test with randomized input).
  - F-02: Animation uses `requestAnimationFrame` (assert rAF in source/runtime).
  - F-03: Game is single player.
  - F-04: No `<canvas>` element in DOM.
  - F-05: No framework usage.
  - F-06: Game is from pre-approved list (Pac-Man + Bomberman hybrid).
  - F-07: Pause menu displays with Continue and Restart options.
  - F-08: Continue resumes game from exact paused state.
  - F-09: Restart resets current level.
  - F-10: No dropped frames during pause (rAF rate unaffected).
  - F-11: Player obeys keyboard commands (arrow keys move player).
  - F-12: Hold-to-move works (no key spamming needed).
  - F-13: Game works as expected (genre-aligned gameplay loop).
  - F-14: Timer/countdown clock works.
  - F-15: Score increases on player actions (pellet collection, ghost kill).
  - F-16: Lives decrease on death.
  - B-01: Project runs quickly and effectively.
  - B-02: Code obeys good practices (CI/static/security gates).
  - B-03: Memory reuse (no jank from GC).
  - B-04: SVG usage (static SVG scan + runtime DOM/assertion checks).
- [ ] **Semi-Automatable tests** (Playwright + `page.evaluate()`):
  - F-17: No sustained frame-drop periods.
  - F-18: Game runs at ~60fps.
  - B-05: Async performance.
- [ ] **Manual-With-Evidence** (DevTools traces as PR artifacts):
  - F-19: Paint usage minimal.
  - F-20: Layers minimal but non-zero.
  - F-21: Layer promotion proper.
  - B-06: Overall project quality.
- [ ] Verification gate: all automated audit tests pass; evidence artifacts attached for manual items.

---

#### A-07: CI, Schema Validation & Asset Gates
**Priority**: ��� Medium
**Phase**: P2 Playable MVP
**Depends On**: `A-01`, `D-03`
**Impacts**: Merge safety, schema integrity, dependency and asset governance (`AUDIT-B-02`)
**Blocks**: A-09, C-10, D-11

**Deliverables**:
- CI workflow additions for schema validation
- File existence checks for manifest paths
- Naming/size-budget checks for generated assets

- [ ] Wire schema checks for map JSONs and `assets/manifests/*.json` against `docs/schemas/*.schema.json` into CI.
- [ ] Add file existence checks for manifest paths and fail CI on missing assets.
- [ ] Enforce naming and size-budget checks for generated assets.
- [ ] Implement and validate strict CSP/Trusted Types enforcement in the production build pipeline.
- [ ] Verification gate: CI fails on schema mismatch, missing file, naming-rule violation, or budget overrun, and production CSP is validated.

---

#### A-08: Unit Tests — All Gameplay Systems
**Priority**: ��� Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `B-01` through `B-09`, `C-01` through `C-05`, `C-07`
**Impacts**: Full simulation regression protection and deterministic behavior guarantees
**Blocks**: A-09

**Deliverables**:
- `tests/unit/systems/*.test.js` — one test file per gameplay system

- [ ] Write unit tests for `input-system.js`: snapshot consumption, direction mapping, bomb request forwarding.
- [ ] Write unit tests for `player-move-system.js`: grid boundary blocking, interpolation steps, no diagonal drift.
- [ ] Write unit tests for `ghost-ai-system.js`: each personality (Blinky/Pinky/Inky/Clyde), flee mode, dead return, no-reverse rule, seeded determinism.
- [ ] Write unit tests for `bomb-tick-system.js`: fuse countdown, one-bomb-per-cell, detonation trigger.
- [ ] Write unit tests for `explosion-system.js`: cross-pattern geometry, wall blocking, chain reactions, pellet immunity, power-up destruction, combo multiplier.
- [ ] Write unit tests for `collision-system.js`: all collision permutations (fire/player, fire/ghost, player/ghost, player/pellet, player/powerup, stunned-ghost harmless).
- [ ] Write unit tests for `power-up-system.js`: stun entry/exit, speed boost entry/exit, bomb+/fire+ increment.
- [ ] Write unit tests for `scoring-system.js`: all point values match `game-description.md` §6 exactly.
- [ ] Write unit tests for `timer-system.js`: countdown, time-up triggers GAME_OVER, time bonus calculation.
- [ ] Write unit tests for `life-system.js`: life decrement, respawn, invincibility window `2000ms`, zero-lives triggers GAME_OVER.
- [ ] Write unit tests for `pause-system.js`: simulation freeze, timer freeze, fuse freeze.
- [ ] Write unit tests for `spawn-system.js`: staggered ghost release, death-return respawn.
- [ ] Write unit tests for `level-progress-system.js`: all-pellets-eaten detection, level transition, victory after level 3.
- [ ] Verification gate: all system unit tests green; determinism tests produce identical outputs for identical seed + input.

---

#### A-09: Evidence Aggregation & Final QA Polish
**Priority**: ��� Medium
**Phase**: P4 Final Acceptance
**Depends On**: `A-05`, `A-06`, `A-07`, `A-08`, `C-09`, `D-11`
**Impacts**: Final audit sign-off (`AUDIT-F-19..F-21`, `AUDIT-B-06`), release readiness
**Blocks**: None

**Deliverables**:
- Evidence bundle (frame stats, paint/layer traces, environment notes)
- Updated `audit-traceability-matrix.md` with all evidence links
- Final QA pass report (3-level playthrough)

- [ ] Capture before/after size report for generated visual and audio assets.
- [ ] Collect runtime evidence notes for paint/layer behavior and audio startup timing.
- [ ] Produce evidence bundle for `AUDIT-F-17..F-21` and `AUDIT-B-01..B-06`: environment, frame stats (`p50/p95/p99`), long-task notes, paint/layer observations.
- [ ] Link evidence artifacts to `audit-traceability-matrix.md` rows.
- [ ] Final QA pass: play through all 3 levels verifying complete gameplay loop.
- [ ] Verification gate: evidence links attached and all audit matrix rows covered.

---

#### A-10: Phase Codebase Audit (P0 Foundation)
**Priority**: 🚨 Critical
**Phase**: P0 Foundation
**Depends On**: `A-01` to `A-03`, `B-01`, `D-01` to `D-04`
**Impacts**: Enforces codebase quality at the end of P0
**Blocks**: `D-05`, `D-06`, `B-02`, `B-03`, `D-07`, `D-08`, `D-09`

**Deliverables**:
- Consolidated deduplicated codebase audit report for P0

- [ ] Execute `codebase-analysis-audit` prompt against the P0 foundation codebase.
- [ ] Merge the generated report to main.
- [ ] Create a deduplicated consolidated report mapping all issues to track owners.
- [ ] Map issues to existing or new implementation tickets.
- [ ] Organize issues by track so each dev can easily find their assigned work in the next phase.
- [ ] Resolve all issues from the P0 audit, such that P0 codebase is clean and high-quality before starting P1 implementation.
- [ ] Verification gate: P0 consolidated report merged to `docs/audit-reports/`.

---

#### A-11: Phase Codebase Audit (P1 Visual Prototype)
**Priority**: 🚨 Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-05` to `D-09`, `B-02`, `B-03`
**Impacts**: Enforces codebase quality at the end of P1
**Blocks**: First-wave P2 tickets

**Deliverables**:
- Consolidated deduplicated codebase audit report for P1

- [ ] Execute `codebase-analysis-audit` prompt against the P1 codebase.
- [ ] Merge the generated report to main.
- [ ] Create a deduplicated consolidated report mapping all issues to track owners.
- [ ] Map issues to existing or new implementation tickets.
- [ ] Verification gate: P1 consolidated report merged to `docs/audit-reports/`.

---

#### A-12: Phase Codebase Audit (P2 Playable MVP)
**Priority**: 🚨 Critical
**Phase**: P2 Playable MVP
**Depends On**: `B-04`, `C-01` to `C-06`, `B-05`, `A-07`
**Impacts**: Enforces codebase quality at the end of P2
**Blocks**: First-wave P3 tickets

**Deliverables**:
- Consolidated deduplicated codebase audit report for P2

- [ ] Execute `codebase-analysis-audit` prompt against the P2 codebase.
- [ ] Merge the generated report to main.
- [ ] Create a deduplicated consolidated report mapping all issues to track owners.
- [ ] Map issues to existing or new implementation tickets.
- [ ] Verification gate: P2 consolidated report merged to `docs/audit-reports/`.

---

#### A-13: Phase Codebase Audit (P3 Feature Complete + Hardening)
**Priority**: 🚨 Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `B-06` to `B-09`, `C-07`, `A-04` to `A-06`, `A-08`
**Impacts**: Enforces codebase quality at the end of P3
**Blocks**: First-wave P4 tickets

**Deliverables**:
- Consolidated deduplicated codebase audit report for P3

- [ ] Execute `codebase-analysis-audit` prompt against the P3 codebase.
- [ ] Merge the generated report to main.
- [ ] Create a deduplicated consolidated report mapping all issues to track owners.
- [ ] Map issues to existing or new implementation tickets.
- [ ] Verification gate: P3 consolidated report merged to `docs/audit-reports/`.

---

#### A-14: Phase Codebase Audit (P4 Polish + Validation)
**Priority**: 🚨 Critical
**Phase**: P4 Final Acceptance
**Depends On**: `C-08` to `C-10`, `D-10`, `D-11`, `A-09`
**Impacts**: Enforces codebase quality at the end of P4
**Blocks**: None

**Deliverables**:
- Consolidated deduplicated codebase audit report for P4

- [ ] Execute `codebase-analysis-audit` prompt against the final codebase.
- [ ] Merge the generated report to main.
- [ ] Create a deduplicated consolidated report mapping all issues to track owners.
- [ ] Map issues to existing or new implementation tickets.
- [ ] Verification gate: P4 consolidated report merged to `docs/audit-reports/`.
