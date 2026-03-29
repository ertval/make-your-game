# ⚙️ Track A — Orchestration, Scaffolding, Testing & QA (Dev 1)

📎 Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Project scaffolding, ECS internals (World, Entity Store, Queries), core resources, game loop, map loading, CI/schema wiring, **ALL testing** (unit, integration, e2e, audit), QA, polish, and evidence aggregation.  
> **Estimate**: ~24 hours  
> **Execution model**: Phase-first delivery for fastest playable MVP, then feature-complete hardening.

## Phase Order (MVP First)

- **P0 Foundation**: `A-01` to `A-05`
- **P1 Playable MVP**: `A-06` to `A-08`
- **P2 Hardening**: `A-09` to `A-10`
- **P3 Final Acceptance**: `A-11`

#### A-01: Project Scaffolding & Tooling
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P0 Foundation  
**Depends On**: None  
**Impacts**: Repo bootstrapping, local dev velocity, policy gates (`AUDIT-F-04`, `AUDIT-F-05`, `AUDIT-B-02`)

- [ ] Initialize `package.json` with ES modules, configure Vite and Biome.
- [ ] Setup Vitest for pure system/component testing.
- [ ] Setup Playwright for e2e/audit testing.
- [ ] Configure CI merge gates (lint, tests, coverage minimums, protected branch checks).
- [ ] Implement dependency governance (strict lockfile policy and SBOM generation).
- [ ] Create `index.html` structure with core `<div>` mount points (game-board, hud, overlay containers).
- [ ] Commit basic CSS reset and variable stubs.
- [ ] Add scripts in `package.json`: `dev`, `build`, `preview`, `lint`, `format`, `test`, `test:unit`, `test:integration`, `test:e2e`, `test:audit`, `coverage`, `ci`, `sbom`.
- [ ] Add `vite.config.js`, `biome.json`, `vitest.config.js`, and `playwright.config.js` with CI-compatible defaults.
- [ ] Add a static CI scan that fails on `<canvas>` usage and banned framework dependencies (`react`, `vue`, `angular`, `svelte`).
- [ ] Verification gate: CI passes on baseline and fails when intentionally introducing a banned dependency or `<canvas>` node.

#### A-02: ECS Architecture Core (World, Entity, Query)
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P0 Foundation  
**Depends On**: `A-01`  
**Impacts**: Deterministic runtime backbone, unblocks all simulation systems (`AUDIT-B-03`)

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

#### A-03: Resources (Time, Constants, RNG, Events, Game Status)
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P0 Foundation  
**Depends On**: `A-01`, `A-02`  
**Impacts**: Determinism contract, clock/pause correctness, cross-system event ordering

- [ ] Add `src/ecs/resources/constants.js`: Define all canonical gameplay constants: `SIMULATION_HZ=60`, `MAX_STEPS_PER_FRAME=5`, `PLAYER_START_LIVES=3`, `BOMB_FUSE_MS=3000`, `FIRE_DURATION_MS=500`, `DEFAULT_FIRE_RADIUS=2`, `INVINCIBILITY_MS=2000`, `STUN_MS=5000`, `SPEED_BOOST_MULTIPLIER=1.5`, `SPEED_BOOST_MS=10000`, `MAX_CHAIN_DEPTH=10`.
- [ ] Implement `src/ecs/resources/clock.js`: Tracks elapsed simulation time, delta, and logic pause-state vs unpaused system state.
- [ ] Implement `src/ecs/resources/rng.js`: Predictable `Math.random` replacement for deterministic runs.
- [ ] Implement `src/ecs/resources/event-queue.js`: Deterministic insertion-order event queue for cross-system communication.
- [ ] Implement `src/ecs/resources/game-status.js`: FSM enum states: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Verification gate: unit tests validate deterministic RNG sequences, event ordering, and pause-safe simulation clock progression.

#### A-04: Game Loop & Main Initialization
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `A-02`, `A-03`  
**Impacts**: Runtime frame pipeline, pause semantics, FPS instrumentation (`AUDIT-F-02`, `AUDIT-F-10`, `AUDIT-F-17`, `AUDIT-F-18`)

- [ ] Implement `main.ecs.js`: Boots World, binds `window.requestAnimationFrame`.
- [ ] Connect `rAF` pipeline into World's internal accumulator update.
- [ ] Implement basic state-transition flow (playing, paused) handled by checking `clock.isPaused` to freeze simulation while keeping rAF active.
- [ ] Add resume safety and lifecycle handling: baseline reset (`lastFrameTime = now`) and accumulator clamp/clear on unpause and tab restore.
- [ ] Clamp catch-up using `MAX_STEPS_PER_FRAME` and resync clock baselines on `blur` and `visibilitychange` recovery.
- [ ] Add global `unhandledrejection` handler that logs the error and displays a visible error overlay for critical failures.
- [ ] Add instrumentation hooks for Playwright frame-time/FPS collection in semi-automated audit tests.
- [ ] Implement `src/game/bootstrap.js`: World assembly + system registration order.
- [ ] Implement `src/game/game-flow.js`: FSM driver that coordinates state transitions.
- [ ] Verification gate: integration tests prove pause invariants; e2e proves rAF continues while simulation is frozen.

#### A-05: Map Loading Resource
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `A-01`, `A-02`, `A-03`  
**Impacts**: Level data contract, restart/reset determinism, progression correctness

- [ ] Create 3 JSON map blueprints (Levels 1, 2, and 3) by strictly parsing the exact ASCII map layouts provided in `game-description.md` §8.1.
  - Apply the exact Level 1, Level 2, and Level 3 grid structures and entity spawn placements without manually balancing or altering the design.
  - Configure the level JSON timers per §8 (120s, 180s, 240s) and ghost limits per level (2, 3, 4 ghosts).
- [ ] Implement JSON Schema 2020-12 validation in CI, failing build on invalid level data.
- [ ] Implement `map-resource.js`: Parses map on load, stores a fixed representation of the static grid cells.
- [ ] Maps MUST include strict grid placement rules for: empty space (` `), indestructible walls (`🧱`), destructible walls (`📦`), pellets (`·`), power pellets (`⚡`), bomb+ (`💣+`), fire+ (`🔥+`), speed boost (`👟`), and ghost house area.
- [ ] Load map resources asynchronously and reject invalid data before world injection.
- [ ] Verification gate: schema tests (valid + invalid fixtures) and e2e restart test prove canonical map reset.

#### A-06: Unit Tests — ECS Core & Resources
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `A-02`, `A-03`, `A-04`, `A-05`  
**Impacts**: Early regression safety net for runtime foundation

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

#### A-07: Integration Tests — Multi-System & Adapter Boundaries
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `A-04`, `A-05`, `B-03`, `B-05`, `B-06`, `D-05`, `D-06`, `D-07`  
**Impacts**: Cross-system correctness, adapter boundary guarantees, deterministic replay confidence

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

#### A-08: E2E Audit Tests (Playwright)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `A-04`, `A-05`, `B-06`, `D-07`  
**Impacts**: Acceptance automation coverage (`AUDIT-F-01..F-18`, `AUDIT-B-01..B-03`)

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
- [ ] **Semi-Automatable tests** (Playwright + `page.evaluate()`):
  - F-17: No sustained frame-drop periods (Performance API measurement over a representative 60s window).
  - F-18: Game runs at ~60fps (p95 frame time ≤ 16.7ms over a representative 60s window).
- [ ] **Manual-With-Evidence** (DevTools traces as PR artifacts):
  - F-19: Paint usage minimal (evidence note with trace).
  - F-20: Layers minimal but non-zero (evidence note with layer count).
  - F-21: Layer promotion proper (evidence note with will-change policy verification).
  - B-04: SVG usage (evidence note).
  - B-05: Asynchronicity for performance (evidence note for async decode, preloading).
  - B-06: Overall project quality (signed evidence note).
- [ ] Verification gate: all automated audit tests pass; evidence artifacts attached for manual items.

#### A-09: CI, Schema Validation & Asset Gates
**Priority**: 🟡 Medium  
**Estimate**: 1 hour  
**Phase**: P2 Hardening  
**Depends On**: `A-01`, `A-05`  
**Impacts**: Merge safety, schema integrity, dependency and asset governance (`AUDIT-B-02`)

- [ ] Wire schema checks for `assets/manifests/*.json` against `docs/schemas/*.schema.json` into CI.
- [ ] Add file existence checks for manifest paths and fail CI on missing assets.
- [ ] Enforce naming and size-budget checks for generated assets.
- [ ] Verification gate: CI fails on schema mismatch, missing file, naming-rule violation, or budget overrun.

#### A-10: Unit Tests — All Gameplay Systems
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Hardening  
**Depends On**: `B-01` through `B-10`  
**Impacts**: Full simulation regression protection and deterministic behavior guarantees

- [ ] Write unit tests for `input-system.js`: snapshot consumption, direction mapping, bomb request forwarding.
- [ ] Write unit tests for `player-move-system.js`: grid boundary blocking, interpolation steps, no diagonal drift.
- [ ] Write unit tests for `ghost-ai-system.js`: each personality (Blinky/Pinky/Inky/Clyde), flee mode, dead return, no-reverse rule, seeded determinism.
- [ ] Write unit tests for `bomb-tick-system.js`: fuse countdown, one-bomb-per-cell, detonation trigger.
- [ ] Write unit tests for `explosion-system.js`: cross-pattern geometry, wall blocking, chain reactions (iterative queue), pellet immunity, power-up destruction, combo multiplier `200 * 2^(n-1)`.
- [ ] Write unit tests for `collision-system.js`: all collision permutations (fire/player, fire/ghost, player/ghost, player/pellet, player/powerup, stunned-ghost harmless).
- [ ] Write unit tests for `power-up-system.js`: stun entry/exit, speed boost entry/exit, bomb+/fire+ increment.
- [ ] Write unit tests for `scoring-system.js`: all point values match `game-description.md` §6 exactly.
- [ ] Write unit tests for `timer-system.js`: countdown, time-up triggers GAME_OVER, time bonus calculation.
- [ ] Write unit tests for `life-system.js`: life decrement, respawn, invincibility window `2000ms`, zero-lives triggers GAME_OVER.
- [ ] Write unit tests for `pause-system.js`: simulation freeze, timer freeze, fuse freeze.
- [ ] Write unit tests for `spawn-system.js`: staggered ghost release, death-return respawn.
- [ ] Write unit tests for `level-progress-system.js`: all-pellets-eaten detection, level transition, victory after level 3.
- [ ] Verification gate: all system unit tests green; determinism tests produce identical outputs for identical seed + input.

#### A-11: Evidence Aggregation & Final QA Polish
**Priority**: 🟡 Medium  
**Estimate**: 1 hour  
**Phase**: P3 Final Acceptance  
**Depends On**: `A-07`, `A-08`, `A-09`, `A-10`, `C-04`, `D-11`  
**Impacts**: Final audit sign-off (`AUDIT-F-19..F-21`, `AUDIT-B-04..B-06`), release readiness

- [ ] Capture before/after size report for generated visual and audio assets.
- [ ] Collect runtime evidence notes for paint/layer behavior and audio startup timing.
- [ ] Produce evidence bundle for `AUDIT-F-17..F-21` and `AUDIT-B-01..B-06`: environment, frame stats (`p50/p95/p99`), long-task notes, paint/layer observations.
- [ ] Link evidence artifacts to `audit-traceability-matrix.md` rows.
- [ ] Final QA pass: play through all 3 levels verifying complete gameplay loop.
- [ ] Verification gate: evidence links attached and all audit matrix rows covered.

---