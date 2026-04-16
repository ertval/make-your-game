# ��� Track D — Resources, Map, Rendering & Visual Assets (Dev 4)

��� Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: ECS resources (time, constants, RNG, events, game-status), map loading, renderer adapters, sprite pools, CSS layout, render systems (collect + DOM batch), gameplay sprite production, and UI visual/manifest governance. Dev 4 owns deterministic world-state infrastructure and the full DOM render/visual pipeline. All visual assets (including maps, sprites, UI, schemas) are co-owned by Track A and Track D. Track D owns scoped tests that validate Track D-owned implementation files. Track A remains the global owner for `tests/**` and QA gates.
> **Execution model**: Build resource/map/render foundations first, then lock memory-stable rendering, then finish visual polish and manifest governance.

## Phase Order (Prototype-First)

- **P0 Foundation**: `D-01` to `D-04`
- **P1 Visual Prototype**: `D-05` to `D-09`
- **P2 Playable MVP**: No new Track D tickets
- **P3 Feature Complete + Hardening**: None
- **P4 Polish and Validation**: `D-10`, `D-11`

---

#### D-01: Resources (Time, Constants, RNG, Events, Game Status)
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-02` (world engine — resource API)
**Impacts**: Determinism contract, clock/pause correctness, cross-system event ordering
**Blocks**: D-02, D-03 || A-03, A-04, B-02, B-05, B-06, B-07, B-08, B-09, C-01, C-02, C-03, C-04, C-06

**Deliverables**:
- `src/ecs/resources/constants.js` — all canonical gameplay constants
- `src/ecs/resources/clock.js` — deterministic/injectable time tracking
- `src/ecs/resources/rng.js` — seeded RNG for deterministic runs
- `src/ecs/resources/event-queue.js` — deterministic insertion-order event queue
- `src/ecs/resources/game-status.js` — FSM enum states

- [x] Add `src/ecs/resources/constants.js`: Define all canonical gameplay constants: `SIMULATION_HZ=60`, `MAX_STEPS_PER_FRAME=5`, `PLAYER_START_LIVES=3`, `BOMB_FUSE_MS=3000`, `FIRE_DURATION_MS=500`, `DEFAULT_FIRE_RADIUS=2`, `INVINCIBILITY_MS=2000`, `STUN_MS=5000`, `SPEED_BOOST_MULTIPLIER=1.5`, `SPEED_BOOST_MS=10000`, `MAX_CHAIN_DEPTH=10`.
- [x] Implement `src/ecs/resources/clock.js`: Tracks elapsed simulation time, delta, and logic pause-state vs unpaused system state.
- [x] Implement `src/ecs/resources/rng.js`: Predictable `Math.random` replacement for deterministic runs.
- [x] Implement `src/ecs/resources/event-queue.js`: Deterministic insertion-order event queue for cross-system communication.
- [x] Implement `src/ecs/resources/game-status.js`: FSM enum states: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [x] Verification gate: unit tests validate deterministic RNG sequences, event ordering, and pause-safe simulation clock progression.

---

#### D-02: Map Schema & JSON Blueprints
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `D-01` (constants for timer/ghost config)
**Impacts**: Level data contract, JSON Schema 2020-12 validation in CI
**Blocks**: D-03

**Deliverables**:
- `assets/maps/level-1.json`, `assets/maps/level-2.json`, `assets/maps/level-3.json`
- `docs/schemas/map.schema.json` (JSON Schema 2020-12)

- [x] Create 3 JSON map blueprints (Levels 1, 2, and 3) by strictly parsing the exact ASCII map layouts provided in `game-description.md` §8.1.
  - Apply the exact Level 1, Level 2, and Level 3 grid structures and entity spawn placements without manually balancing or altering the design.
  - Configure the level JSON timers per §8 (120s, 180s, 240s) and ghost limits per level (2, 3, 4 ghosts).
- [x] Implement JSON Schema 2020-12 for map validation.
- [x] Maps MUST include strict grid placement rules for: empty space (` `), indestructible walls (`���`), destructible walls (`���`), pellets (`·`), power pellets (`⚡`), bomb+ (`���+`), fire+ (`���+`), speed boost (`���`), and ghost house area.
- [x] Verification gate: schema tests (valid + invalid fixtures) pass.

---

#### D-03: Map Loading Resource
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `D-01`, `D-02`
**Impacts**: Level loading, restart determinism, progression correctness
**Blocks**: D-06 || A-04, A-07, B-03, B-04, B-06, B-08, C-03, C-04

**Deliverables**:
- `src/ecs/resources/map-resource.js` — parses map JSON, stores fixed grid representation, spawn points

- [x] Implement `map-resource.js`: Parses map on load, stores a fixed representation of the static grid cells.
- [x] Load map resources asynchronously and reject invalid data before world injection.
- [x] Verification gate (unit): unit tests for valid parse, invalid JSON rejection, spawn point extraction.
- [ ] Verification gate (e2e): Playwright e2e restart test proves canonical map reset — **DEFERRED to D-06** (board generation ticket; depends on D-03 and is the natural integration point for restart flow testing).

---

#### D-04: Render Data Contracts
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-02` (world engine), `B-01` (components)
**Impacts**: ECS/DOM boundary safety and deterministic render intent contracts
**Blocks**: D-06, D-07

**Deliverables**:
- `src/ecs/components/visual.js` additions (if not covered by B-01): render-intent structure, classBits definitions
- Render-intent buffer pre-allocation contract documentation

- [x] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components) — already shipped by B-01 in `visual.js`; D-04 respects this boundary with zero cross-track file modifications.
- [x] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js` — contract invariants documented in the `render-intent.js` file header; enforced by 16 unit tests.
- [x] Enforce `classBits`-based visual flags and strict prohibition of DOM references in ECS component data.
- [x] Verification gate: contract tests validate no adapter/DOM leakage into ECS storage (16 unit tests).

---

#### D-05: CSS Layout & Grid Structure
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `A-01` (scaffolding)
**Impacts**: Core board layout, accessibility baseline, layer policy groundwork (`AUDIT-F-20`, `AUDIT-F-21`)
**Blocks**: D-06 || C-05

**Deliverables**:
- `styles/variables.css` — color palette, spacing tokens, z-index scale, animation timing
- `styles/grid.css` — strict grid-template layouts and positioning
- `styles/animations.css` — walking pulse, bomb fuse, explosion fade, ghost stun flash, invincibility blink, speed trail

- [x] Build `styles/variables.css`: color palette, spacing tokens, z-index scale, animation timing.
- [x] Build `styles/grid.css` using strict grid-template layouts and absolute positioning over grid cells.
- [x] Apply strict **`will-change` policy**:
  - Player sprite: `will-change: transform` (always moving).
  - Ghost sprites: `will-change: transform` (always moving).
  - Bomb sprites, fire tiles, static grid cells, and HUD elements: **NO** `will-change`.
  - Target layer count baseline: ~5 promoted sprite layers (player + 4 ghosts).
- [x] Build `styles/animations.css`: walking pulse, bomb fuse animation, explosion fade, ghost stun flash, invincibility blink, speed boost trail/tint.
- [x] Respect `prefers-reduced-motion` for non-gameplay animations (menus, transitions, overlays).
- [ ] Verification gate: DevTools layer evidence confirms minimal-but-nonzero layers and policy compliance — **structural compliance verified via code inspection (will-change policy enforced in CSS); runtime DevTools layer/paint evidence deferred to D-08** where DOM rendering is active and browser DevTools Performance panel traces can be captured.

---

#### D-06: Renderer Adapter & Board Generation
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-04`, `D-05`, `D-03`
**Impacts**: Safe DOM board rendering and no-canvas compliance (`AUDIT-F-04`)
**Blocks**: D-08, D-09, D-10

**Deliverables**:
- `src/adapters/dom/renderer-adapter.js` — createElement/createElementNS, zero innerHTML

- [ ] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [ ] Use `textContent` and explicit attribute APIs for all dynamic content.
- [ ] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.
- [ ] **DEFERRED from D-03**: Playwright e2e restart test proves canonical map reset (load level, trigger restart, verify board returns to initial state with correct cell types and spawn positions).

---

#### D-07: Render Collect System
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-04`, `B-03` (movement — position data to interpolate)
**Impacts**: Smooth interpolation and deterministic intent ordering for frame commits
**Blocks**: D-08

**Deliverables**:
- `src/ecs/systems/render-collect-system.js` — interpolation, render-intent buffer

- [ ] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [ ] Use stable intent ordering for deterministic commits.
- [ ] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

---

#### D-08: Render DOM System (The Batcher)
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-06`, `D-07`, `D-09`
**Impacts**: Frame-time stability and compositor-only writes (`AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`)
**Blocks**: D-09, D-10 || A-05

**Deliverables**:
- `src/ecs/systems/render-dom-system.js` — one-pass DOM commit, transform/opacity/class writes only

- [ ] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [ ] Applies batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
  - Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] Keep commit path write-only and pool reclaim in same commit window.
- [ ] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.
- [ ] **DEFERRED from D-05**: DevTools layer/paint evidence confirms `AUDIT-F-20` (layer minimization) and `AUDIT-F-21` (layer promotion) compliance — capture DevTools Performance panel traces showing:
  - Only player + 4 ghost sprites carry `will-change: transform` (target ~5 promoted layers).
  - Bombs, fire tiles, static grid cells, and HUD elements do NOT create compositor layers.
  - Paint rectangles are minimal and confined to moving sprite bounds during normal gameplay.

---

#### D-09: Sprite Pool Adapter
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-06`
**Impacts**: Allocation stability and memory reuse (`AUDIT-B-03`)
**Blocks**: None

**Deliverables**:
- `src/adapters/dom/sprite-pool-adapter.js` — pre-allocated pools, offscreen-transform hiding, pool acquire/release API

- [ ] Implement `sprite-pool-adapter.js`:
  - Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`, `POOL_PELLETS = maxPellets`).
  - Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (triggers layout).
  - When pool exhausted: log `console.warn` in development; silently recycle oldest active element in production.
- [ ] Pool acquire/release API for render-dom-system consumption.
- [ ] Pre-warm pools during level load to avoid runtime allocation bursts.
- [ ] Verification gate: pool tests validate sizing, hiding strategy, and exhaustion behavior.

---

#### D-10: Visual Asset Production — Gameplay Sprites
**Priority**: ��� Critical
**Phase**: P4 Polish and Validation
**Depends On**: `D-06`, `D-08`
**Impacts**: In-game readability and SVG compliance (`AUDIT-B-04`)
**Blocks**: D-11

**Deliverables**:
- `assets/generated/sprites/*.svg` — all gameplay sprites (player, ghosts, bombs, fire, pellets, walls, power-ups)
- `assets/source/visual/` — source design files

- [ ] Create/export core gameplay sprites (SVG preferred, < 50 path elements each):
  - Ms. Ghostman: idle, walking frames (4 directions), death animation, invincibility blink, speed boost tint/trail.
  - 4 Ghost types: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange) — each with normal, stunned (blue), and dead (eyes-only) variants.
  - Bombs: idle, fuse ticking animation frames.
  - Fire: explosion cross tiles (animated fade).
  - Pellets: regular dot, power pellet (larger, pulsing).
  - Walls: indestructible (brick pattern), destructible (crate/box), destruction animation.
- [ ] Create/export power-up sprites/icons: Power Pellet `⚡`, Bomb+ `���+`, Fire+ `���+`, Speed Boost `���`.
- [ ] Ensure all sprites have declared dimensions in metadata for layout reservation.
- [ ] Emit a sprite metadata handoff table (`spriteId`, `width`, `height`, `className`) consumed by `D-11` manifest mapping.
- [ ] Verification gate: all sprites render correctly at target display size.

---

#### D-11: Visual Assets (UI & Screens) + Visual Manifest & Validation
**Priority**: ��� Medium
**Phase**: P4 Polish and Validation
**Depends On**: `C-05`, `D-10`, `A-07` (CI schema gates)
**Impacts**: Start/pause/game-over/victory visual polish; asset contract enforcement; CI validation
**Blocks**: A-09

**Deliverables**:
- `assets/generated/ui/*.svg` — UI screen assets
- `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12)
- `assets/manifests/visual-manifest.json` — all visual asset entries
- CSS layouts for all screen overlays
- HUD layout CSS

- [ ] Design and build CSS layouts for all screen overlays:
  - Start Screen: title treatment, button styles, high score table.
  - Pause Menu: semi-transparent overlay, button styles.
  - Level Complete: stats layout, next level button.
  - Game Over: final score display, play again button.
  - Victory: celebration treatment, final stats, play again button.
- [ ] Create HUD layout CSS: lives icons, score counter, timer, bomb/fire indicators, level number.
- [ ] Finalize `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `kind` (sprite|ui|tile|effect), `format`, `width`, `height`, `tags`, `critical`.
  - Optional fields: `maxBytes`, `notes`.
- [ ] Create/maintain `assets/manifests/visual-manifest.json` with all visual asset entries.
- [ ] Build manifest-to-renderable mapping table and define missing-asset fallback class behavior.
- [ ] Optimize SVG/raster outputs and validate against layer/paint constraints.
- [ ] Ensure responsive sizing within the game viewport.
- [ ] Verification gate: manifest validation passes CI; all screens render correctly with keyboard focus indicators visible; runtime fallback tests prove robust asset mapping.

---
