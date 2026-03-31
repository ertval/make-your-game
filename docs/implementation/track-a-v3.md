# ⚙️ Track A — World, Game Flow, Scaffolding, Testing & QA (Dev 1)

��� Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Project scaffolding, ECS internals (World, Entity Store, Queries), game flow orchestration (`game/` folder), game loop, CI/schema wiring, **ALL testing** (unit, integration, e2e, audit), QA, polish, and evidence aggregation. **Does NOT own** resources (`constants`, `clock`, `rng`, `event-queue`, `game-status`) or map loading — those are owned by Track D.
> **Execution model**: Phase-first delivery for fastest playable MVP, then feature-complete hardening.

## Phase Order (MVP First)

- **P0 Foundation**: `A-01` to `A-03`
- **P1 Playable MVP**: `A-04` to `A-06`
- **P2 Hardening**: `A-07` to `A-08`
- **P3 Final Acceptance**: `A-09`

---

#### A-01: Project Scaffolding & Tooling
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: None
**Impacts**: Repo bootstrapping, local dev velocity, policy gates (`AUDIT-F-04`, `AUDIT-F-05`, `AUDIT-B-02`)

**Deliverables**:
- `package.json` with all scripts (`dev`, `build`, `preview`, `lint`, `format`, `check`, `test`, `test:watch`, `test:unit`, `test:integration`, `test:e2e`, `test:audit`, `coverage`, `ci`, `validate:schema`, `sbom`)
- `vite.config.js`, `biome.json`, `vitest.config.js`, `playwright.config.js`
- `index.html` with core `<div>` mount points (game-board, hud, overlay containers)
- Basic CSS reset and variable stubs
- CI workflow configuration with merge gates (lint, tests, coverage)
- Static CI scan failing on `<canvas>` usage and banned frameworks

**Blocks**:
- A-02, A-03 (same track)

- [ ] Initialize `package.json` with ES modules, configure Vite and Biome.
- [ ] Setup Vitest for pure system/component testing.
- [ ] Setup Playwright for e2e/audit testing.
- [ ] Configure CI merge gates (lint, tests, coverage minimums, protected branch checks).
- [ ] Implement dependency governance (strict lockfile policy and SBOM generation).
- [ ] Create `index.html` structure with core `<div>` mount points (game-board, hud, overlay containers).
- [ ] Commit basic CSS reset and variable stubs.
- [ ] Add all scripts in `package.json`.
- [ ] Add `vite.config.js`, `biome.json`, `vitest.config.js`, and `playwright.config.js` with CI-compatible defaults.
- [ ] Add a static CI scan that fails on `<canvas>` usage and banned framework dependencies (`react`, `vue`, `angular`, `svelte`).
- [ ] Verification gate: CI passes on baseline and fails when intentionally introducing a banned dependency or `<canvas>` node.

---

#### A-02: ECS Architecture Core (World, Entity, Query)
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-01`
**Impacts**: Deterministic runtime backbone, unblocks all simulation systems (`AUDIT-B-03`)

**Deliverables**:
- `src/ecs/world/world.js` — lifecycle, system scheduling, frame context, resource API
- `src/ecs/world/entity-store.js` — ID generation, recycling, stale-handle protection
- `src/ecs/world/query.js` — bitmask component matching

**Blocks**:
- A-03 (same track)
- B-01 (Track B — components need world)
- D-01 (Track D — resources need world)

- [ ] Implement `src/ecs/world/entity-store.js` using ID arrays via a recycling pool to avoid GC chunks.
- [ ] Implement `src/ecs/world/query.js`: Provides fast entity lookups matching component masks (bitmask-based).
- [ ] Implement `src/ecs/world/world.js`:
  - Registers systems and dictates phase ordering (Input -> Physics -> Logic -> Render).
  - Handles fixed-step logic loop (`accumulator`) and calls simulation systems.
  - Passes resource references smoothly without global singleton abuse.
- [ ] Enforce deterministic system ordering and a single deferred-structural-mutation sync point per fixed step.
- [ ] Catch exceptions at the system-dispatch boundary, log them, and skip the faulting system for the current frame rather than crashing the loop.
- [ ] Add generation-based stale-handle protection semantics for recycled entity IDs.
- [ ] Verification gate: unit tests cover ID recycling, stale-handle rejection, deferred mutation application, and deterministic system order.

---

#### A-03: Game Loop & Main Initialization
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-02`, `D-01` (resources from Track D)
**Impacts**: Runtime frame pipeline, pause semantics, FPS instrumentation (`AUDIT-F-02`, `AUDIT-F-10`, `AUDIT-F-17`, `AUDIT-F-18`)

**Deliverables**:
- `src/main.ecs.js` — app entry, boots World, binds rAF
- `src/game/bootstrap.js` — World assembly + system registration order
- `src/game/game-flow.js` — FSM driver (MENU → PLAYING ↔ PAUSED → GAMEOVER/VICTORY)
- `src/game/level-loader.js` — level transition orchestration (stub, data from D-03)
- Global `unhandledrejection` handler with error overlay

**Blocks**:
- A-04, A-05, A-06 (same track — tests)
- B-02 (Track B — input system needs game loop)

- [ ] Implement `main.ecs.js`: Boots World, binds `window.requestAnimationFrame`.
- [ ] Connect `rAF` pipeline into World's internal accumulator update.
- [ ] Implement basic state-transition flow (playing, paused) handled by checking `clock.isPaused` to freeze simulation while keeping rAF active.
- [ ] Add resume safety and lifecycle handling: baseline reset (`lastFrameTime = now`) and accumulator clamp/clear on unpause and tab restore.
- [ ] Clamp catch-up using `MAX_STEPS_PER_FRAME` and resync clock baselines on `blur` and `visibilitychange` recovery.
- [ ] Add global `unhandledrejection` handler that logs the error and displays a visible error overlay for critical failures.
- [ ] Add instrumentation hooks for Playwright frame-time/FPS collection in semi-automated audit tests.
- [ ] Implement `src/game/bootstrap.js`: World assembly + system registration order.
- [ ] Implement `src/game/game-flow.js`: FSM driver that coordinates state transitions.
- [ ] Implement `src/game/level-loader.js`: Level transition orchestration (data from Track D map resource).
- [ ] Verification gate: integration tests prove pause invariants; e2e proves rAF continues while simulation is frozen.

---

#### A-04: Unit Tests — ECS Core & Resources
**Priority**: ��� Critical
**Phase**: P1 Playable MVP
**Depends On**: `A-02`, `A-03`, `D-01`, `D-03`
**Impacts**: Early regression safety net for runtime foundation

**Deliverables**:
- `tests/unit/world/entity-store.test.js`
- `tests/unit/world/query.test.js`
- `tests/unit/world/world.test.js`
- `tests/unit/resources/clock.test.js`
- `tests/unit/resources/rng.test.js`
- `tests/unit/resources/event-queue.test.js`
- `tests/unit/resources/game-status.test.js`
- `tests/unit/resources/constants.test.js`
- `tests/unit/resources/map-resource.test.js`

**Blocks**:
- A-05 (same track)

- [ ] Write unit tests for `entity-store.js`: ID generation, recycling, stale-handle rejection, capacity limits.
- [ ] Write unit tests for `query.js`: bitmask matching, multi-component queries, empty result sets.
- [ ] Write unit tests for `world.js`: system registration, execution ordering, deferred mutation sync, frame context delivery.
- [ ] Write unit tests for `clock.js`: time progression, pause freeze, resume baseline reset, accumulator clamp.
- [ ] Write unit tests for `rng.js`: deterministic sequences from same seed, different seeds produce different sequences.
- [ ] Write unit tests for `event-queue.js`: insertion ordering, flush behavior, deterministic iteration.
- [ ] Write unit tests for `game-status.js`: FSM transitions, invalid transition rejection.
- [ ] Write unit tests for `constants.js`: all canonical values correct.
- [ ] Write unit tests for `map-resource.js`: valid parse, invalid JSON rejection, spawn point extraction.
- [ ] Verification gate: all core/resource unit tests green with >90% line coverage on tested files.

---

#### A-05: Integration Tests — Multi-System & Adapter Boundaries
**Priority**: ��� Medium
**Phase**: P1 Playable MVP
**Depends On**: `A-03`, `B-03`, `C-02`, `C-04`, `C-05`, `D-08`
**Impacts**: Cross-system correctness, adapter boundary guarantees, deterministic replay confidence

**Deliverables**:
- `tests/integration/gameplay/*.test.js` — multi-system interaction scenarios
- `tests/integration/adapters/*.test.js` — adapter boundary tests (jsdom)
- Replay determinism test using `src/debug/replay.js`

**Blocks**:
- A-06 (same track)

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
- [ ] Write replay determinism test: same seed + input trace → identical `hashWorldState` at frame N.
- [ ] Verification gate: all integration tests green.

---

#### A-06: E2E Audit Tests (Playwright)
**Priority**: ��� Critical
**Phase**: P1 Playable MVP
**Depends On**: `A-03`, `B-04`, `C-04`, `C-05`
**Impacts**: Acceptance automation coverage (`AUDIT-F-01..F-18`, `AUDIT-B-01..B-05`)

**Deliverables**:
- `tests/e2e/audit/audit-question-map.js`
- `tests/e2e/audit/audit.e2e.test.js`
- Evidence artifact templates for manual audit items

**Blocks**:
- A-09 (same track)

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
**Phase**: P2 Hardening
**Depends On**: `A-01`, `D-03`
**Impacts**: Merge safety, schema integrity, dependency and asset governance (`AUDIT-B-02`)

**Deliverables**:
- CI workflow additions for schema validation
- File existence checks for manifest paths
- Naming/size-budget checks for generated assets

**Blocks**:
- A-09 (same track)

- [ ] Wire schema checks for `assets/manifests/*.json` against `docs/schemas/*.schema.json` into CI.
- [ ] Add file existence checks for manifest paths and fail CI on missing assets.
- [ ] Enforce naming and size-budget checks for generated assets.
- [ ] Verification gate: CI fails on schema mismatch, missing file, naming-rule violation, or budget overrun.

---

#### A-08: Unit Tests — All Gameplay Systems
**Priority**: ��� Critical
**Phase**: P2 Hardening
**Depends On**: `B-01` through `B-09`, `C-01` through `C-05`, `C-07`
**Impacts**: Full simulation regression protection and deterministic behavior guarantees

**Deliverables**:
- `tests/unit/systems/*.test.js` — one test file per gameplay system

**Blocks**:
- A-09 (same track)

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
**Phase**: P3 Final Acceptance
**Depends On**: `A-05`, `A-06`, `A-07`, `A-08`, `C-09`, `D-11`
**Impacts**: Final audit sign-off (`AUDIT-F-19..F-21`, `AUDIT-B-06`), release readiness

**Deliverables**:
- Evidence bundle (frame stats, paint/layer traces, environment notes)
- Updated `audit-traceability-matrix.md` with all evidence links
- Final QA pass report (3-level playthrough)

**Blocks**:
- None (final ticket)

- [ ] Capture before/after size report for generated visual and audio assets.
- [ ] Collect runtime evidence notes for paint/layer behavior and audio startup timing.
- [ ] Produce evidence bundle for `AUDIT-F-17..F-21` and `AUDIT-B-01..B-06`: environment, frame stats (`p50/p95/p99`), long-task notes, paint/layer observations.
- [ ] Link evidence artifacts to `audit-traceability-matrix.md` rows.
- [ ] Final QA pass: play through all 3 levels verifying complete gameplay loop.
- [ ] Verification gate: evidence links attached and all audit matrix rows covered.

---
