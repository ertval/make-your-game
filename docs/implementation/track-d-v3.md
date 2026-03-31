# 🎨 Track D — Resources, Map, Bombs, Rendering & Visuals (Dev 4)

📎 Source plan: `docs/implementation/implementation-plan-v3.md` (Section 3)

> **Scope**: ECS resources (time, constants, RNG, events, game-status), map loading, bomb & explosion systems, power-up system, pause & level progression, renderer adapters, sprite pools, HUD, screen overlays, CSS layout, render systems (collect + DOM batch), visual asset creation, visual manifest schema. Dev 4 owns the "world state" — the infrastructure and systems that run the game world.  
> **Estimate**: ~37 hours (15 tickets)  
> **Execution model**: Build resource and map foundation first, then render pipeline for MVP, then layer bombs/power-ups/progression and polish.

## Phase Order (MVP First)

- **P0 Foundation**: `D3-01` to `D3-04`
- **P1 Playable MVP**: `D3-05` to `D3-09`
- **P2 Feature Complete**: `D3-10` to `D3-13`
- **P3 Polish and Validation**: `D3-14`, `D3-15`

---

#### D3-01: Resources (Time, Constants, RNG, Events, Game Status)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `A3-02` (world engine — resource API)  
**Impacts**: Determinism contract, clock/pause correctness, cross-system event ordering

**Deliverables**:
- `src/ecs/resources/constants.js` — all canonical gameplay constants
- `src/ecs/resources/clock.js` — deterministic/injectable time tracking
- `src/ecs/resources/rng.js` — seeded RNG for deterministic runs
- `src/ecs/resources/event-queue.js` — deterministic insertion-order event queue
- `src/ecs/resources/game-status.js` — FSM enum states

**Blocks**:
- D3-02, D3-03 (same track)
- A3-03 (Track A — game loop needs clock/constants)
- B3-02 (Track B — input needs constants)
- C3-01, C3-02, C3-03 (Track C — scoring/timer/lives/spawn need resources)

- [ ] Add `src/ecs/resources/constants.js`: Define all canonical gameplay constants: `SIMULATION_HZ=60`, `MAX_STEPS_PER_FRAME=5`, `PLAYER_START_LIVES=3`, `BOMB_FUSE_MS=3000`, `FIRE_DURATION_MS=500`, `DEFAULT_FIRE_RADIUS=2`, `INVINCIBILITY_MS=2000`, `STUN_MS=5000`, `SPEED_BOOST_MULTIPLIER=1.5`, `SPEED_BOOST_MS=10000`, `MAX_CHAIN_DEPTH=10`.
- [ ] Implement `src/ecs/resources/clock.js`: Tracks elapsed simulation time, delta, and logic pause-state vs unpaused system state.
- [ ] Implement `src/ecs/resources/rng.js`: Predictable `Math.random` replacement for deterministic runs.
- [ ] Implement `src/ecs/resources/event-queue.js`: Deterministic insertion-order event queue for cross-system communication.
- [ ] Implement `src/ecs/resources/game-status.js`: FSM enum states: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Verification gate: unit tests validate deterministic RNG sequences, event ordering, and pause-safe simulation clock progression.

---

#### D3-02: Map Schema & JSON Blueprints
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P0 Foundation  
**Depends On**: `D3-01` (constants for timer/ghost config)  
**Impacts**: Level data contract, JSON Schema 2020-12 validation in CI

**Deliverables**:
- `assets/maps/level-1.json`, `assets/maps/level-2.json`, `assets/maps/level-3.json`
- `docs/schemas/map.schema.json` (JSON Schema 2020-12)

**Blocks**:
- D3-03 (same track — map resource parses these)

- [ ] Create 3 JSON map blueprints (Levels 1, 2, and 3) by strictly parsing the exact ASCII map layouts provided in `game-description.md` §8.1.
  - Apply the exact Level 1, Level 2, and Level 3 grid structures and entity spawn placements without manually balancing or altering the design.
  - Configure the level JSON timers per §8 (120s, 180s, 240s) and ghost limits per level (2, 3, 4 ghosts).
- [ ] Implement JSON Schema 2020-12 for map validation.
- [ ] Maps MUST include strict grid placement rules for: empty space (` `), indestructible walls (`🧱`), destructible walls (`📦`), pellets (`·`), power pellets (`⚡`), bomb+ (`💣+`), fire+ (`🔥+`), speed boost (`👟`), and ghost house area.
- [ ] Verification gate: schema tests (valid + invalid fixtures) pass.

---

#### D3-03: Map Loading Resource
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P0 Foundation  
**Depends On**: `D3-01`, `D3-02`  
**Impacts**: Level loading, restart determinism, progression correctness

**Deliverables**:
- `src/ecs/resources/map-resource.js` — parses map JSON, stores fixed grid representation, spawn points

**Blocks**:
- D3-04, D3-06 (same track)
- B3-03 (Track B — movement reads map grid)
- B3-04 (Track B — collision reads map)
- C3-03 (Track C — spawn system reads ghost spawns)
- C3-04 (Track C — ghost AI reads map)

- [ ] Implement `map-resource.js`: Parses map on load, stores a fixed representation of the static grid cells.
- [ ] Load map resources asynchronously and reject invalid data before world injection.
- [ ] Verification gate: unit tests for valid parse, invalid JSON rejection, spawn point extraction; e2e restart test proves canonical map reset.

---

#### D3-04: Render Data Contracts
**Priority**: 🔴 Critical  
**Estimate**: 1 hour  
**Phase**: P0 Foundation  
**Depends On**: `A3-02` (world engine), `B3-01` (components)  
**Impacts**: ECS/DOM boundary safety and deterministic render intent contracts

**Deliverables**:
- `src/ecs/components/visual.js` additions (if not covered by B3-01): render-intent structure, classBits definitions
- Render-intent buffer pre-allocation contract documentation

**Blocks**:
- D3-05 (same track)
- D3-07 (same track)

- [ ] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components).
- [ ] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js`.
- [ ] Enforce `classBits`-based visual flags and strict prohibition of DOM references in ECS component data.
- [ ] Verification gate: contract tests validate no adapter/DOM leakage into ECS storage.

---

#### D3-05: CSS Layout & Grid Structure
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `A3-01` (scaffolding)  
**Impacts**: Core board layout, accessibility baseline, layer policy groundwork (`AUDIT-F-20`, `AUDIT-F-21`)

**Deliverables**:
- `styles/variables.css` — color palette, spacing tokens, z-index scale, animation timing
- `styles/grid.css` — strict grid-template layouts and positioning
- `styles/animations.css` — walking pulse, bomb fuse, explosion fade, ghost stun flash, invincibility blink, speed trail

**Blocks**:
- D3-06 (same track)
- D3-13 (same track — HUD layout)

- [ ] Build `styles/variables.css`: color palette, spacing tokens, z-index scale, animation timing.
- [ ] Build `styles/grid.css` using strict grid-template layouts and absolute positioning over grid cells.
- [ ] Apply strict **`will-change` policy**:
  - Player sprite: `will-change: transform` (always moving).
  - Ghost sprites: `will-change: transform` (always moving).
  - Bomb sprites, fire tiles, static grid cells, and HUD elements: **NO** `will-change`.
  - Target layer count baseline: ~5 promoted sprite layers (player + 4 ghosts).
- [ ] Build `styles/animations.css`: walking pulse, bomb fuse animation, explosion fade, ghost stun flash, invincibility blink, speed boost trail/tint.
- [ ] Respect `prefers-reduced-motion` for non-gameplay animations (menus, transitions, overlays).
- [ ] Verification gate: DevTools layer evidence confirms minimal-but-nonzero layers and policy compliance.

---

#### D3-06: Renderer Adapter & Board Generation
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-04`, `D3-05`, `D3-03`  
**Impacts**: Safe DOM board rendering and no-canvas compliance (`AUDIT-F-04`)

**Deliverables**:
- `src/adapters/dom/renderer-adapter.js` — createElement/createElementNS, zero innerHTML

**Blocks**:
- D3-07, D3-08, D3-12 (same track)

- [ ] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [ ] Use `textContent` and explicit attribute APIs for all dynamic content.
- [ ] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.

---

#### D3-07: Render Collect System
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-04`, `B3-03` (movement — position data to interpolate)  
**Impacts**: Smooth interpolation and deterministic intent ordering for frame commits

**Deliverables**:
- `src/ecs/systems/render-collect-system.js` — interpolation, render-intent buffer

**Blocks**:
- D3-08 (same track)

- [ ] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [ ] Use stable intent ordering for deterministic commits.
- [ ] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

---

#### D3-08: Render DOM System (The Batcher)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-06`, `D3-07`  
**Impacts**: Frame-time stability and compositor-only writes (`AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`)

**Deliverables**:
- `src/ecs/systems/render-dom-system.js` — one-pass DOM commit, transform/opacity/class writes only

**Blocks**:
- D3-12 (same track — sprite pool integrates with batcher)

- [ ] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [ ] Applies batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
  - Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] Keep commit path write-only and pool reclaim in same commit window.
- [ ] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.

---

#### D3-09: Pause & Level Progression Systems
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-01` (clock/game-status), `D3-03` (map resource), `C3-02` (timer/lives), `A3-03` (game loop)  
**Impacts**: Pause menu behavior and level/game state transitions (`AUDIT-F-07..F-10`)

**Deliverables**:
- `src/ecs/systems/pause-system.js` — freeze simulation while rAF continues
- `src/ecs/systems/level-progress-system.js` — pellet tracking, level transitions, victory/game-over

**Blocks**:
- D3-10 (same track — bombs need game to not be paused)

- [ ] Implement `pause-system.js`: Freezes simulation timer while `rAF` continues. Fuse timers, invincibility, and stun timers all freeze.
- [ ] Implement `level-progress-system.js`:
  - All pellets eaten → `LEVEL_COMPLETE` state with stats screen.
  - Level Complete → load next level map or `VICTORY` after level 3.
  - `GAME_OVER` on timer expiry or zero lives.
- [ ] Enforce FSM: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Pause Continue: resumes exact prior simulation state.
- [ ] Pause Restart: resets current level, preserves cumulative score from previous levels.
- [ ] Verification gate: e2e pause open/continue/restart tests pass with keyboard-only flow.

---

#### D3-10: Bomb & Explosion Systems
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `B3-03` (movement/grid), `B3-04` (collision), `D3-01` (constants/rng), `D3-03` (map resource)  
**Impacts**: Bomberman mechanics, chain reactions, combo rules (`AUDIT-F-13`, `AUDIT-B-03`)

**Deliverables**:
- `src/ecs/systems/bomb-tick-system.js` — fuse countdown, detonation trigger
- `src/ecs/systems/explosion-system.js` — cross-pattern geometry, chain reactions, wall destruction, power-up drops

**Blocks**:
- D3-11 (same track — power-ups spawn from explosions)

- [ ] Implement `bomb-tick-system.js`: Decrements fuse, validates explosion radius against `map-resource`.
- [ ] Implement `explosion-system.js`: Translates detonated bombs into Fire entities mapping over map resources (destructible wall clears). Chain reactions use an **iterative detonation queue** (NOT recursive) with `MAX_CHAIN_DEPTH = 10`.
- [ ] Enforce exact Power-Up drop rates when destructible walls are destroyed based on `game-description.md` §4.4 (85% empty, 5% bomb+, 5% fire+, 5% speed boost). Use seeded RNG generator for drop logic to retain determinism.
- [ ] Enforce one-bomb-per-cell placement, `3000ms` fuse, `500ms` fire lifetime, cross-pattern propagation, and wall-stop rules.
- [ ] Enforce strict pellet pass-through mechanics (pellets are NEVER destroyed by fire).
- [ ] Enforce power-up destruction (power-ups ARE destroyed by fire without being collected).
- [ ] Apply combo explosion multipliers logic (`200 * 2^(n-1)` for `n` ghosts killed in one chain).
- [ ] Verification gate: unit tests for explosion geometry, chain determinism, pellet immunity, and wall blocking.

---

#### D3-11: Power-Up System
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `B3-04` (collision intents), `C3-02` (lives/timer context), `D3-10` (explosions spawn power-ups)  
**Impacts**: Power progression, stun windows, speed-state timing (`AUDIT-F-13`)

**Deliverables**:
- `src/ecs/systems/power-up-system.js` — power pellet, bomb+, fire+, speed boost effects

**Blocks**:
- None (consumed by scoring and event hooks independently)

- [ ] Implement `power-up-system.js` processing collection intents from collision system:
  1. **Power Pellet (`⚡`)**: Stuns all ghosts for `5000ms`. Non-stacking (resets timer).
  2. **Bomb Power-Up (`💣+`)**: Increments `maxBombs` by 1.
  3. **Fire Power-Up (`🔥+`)**: Increments `fireRadius` by 1.
  4. **Speed Boost (`👟`)**: Applies `1.5x` speed multiplier for `10000ms`. Non-stacking (resets timer). Visual trail/tint indicator.
- [ ] Manage parallel countdown timers for stun and speed boost expiry.
- [ ] Verification gate: unit/integration tests cover stun, speed boost, bomb+, fire+ effects and exact durations.

---

#### D3-12: Sprite Pool Adapter
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `D3-06`, `D3-08`  
**Impacts**: Allocation stability and memory reuse (`AUDIT-B-03`)

**Deliverables**:
- `src/adapters/dom/sprite-pool-adapter.js` — pre-allocated pools, offscreen-transform hiding, pool acquire/release API

**Blocks**:
- None

- [ ] Implement `sprite-pool-adapter.js`:
  - Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`, `POOL_PELLETS = maxPellets`).
  - Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (triggers layout).
  - When pool exhausted: log `console.warn` in development; silently recycle oldest active element in production.
- [ ] Pool acquire/release API for render-dom-system consumption.
- [ ] Pre-warm pools during level load to avoid runtime allocation bursts.
- [ ] Verification gate: pool tests validate sizing, hiding strategy, and exhaustion behavior.

---

#### D3-13: HUD Adapter & Screen Overlays
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `D3-05` (CSS layout), `C3-02` (scoring/timer/lives data), `D3-09` (pause/progression states)  
**Impacts**: Visible gameplay metrics (`AUDIT-F-14..F-16`), pause/start/restart UX (`AUDIT-F-07..F-09`)

**Deliverables**:
- `src/adapters/dom/hud-adapter.js` — textContent updates for lives, score, timer, bomb count, fire radius, level number
- `src/adapters/dom/screens-adapter.js` — start screen, pause menu, level complete, game over, victory overlays
- `src/adapters/io/storage-adapter.js` — high score localStorage with untrusted data validation

**Blocks**:
- D3-14 (same track — visual assets for screens)

- [ ] Implement `hud-adapter.js`:
  - Binds text nodes natively with `.textContent` to update: lives (heart icons), score (5-digit), timer (M:SS), bomb count, fire radius, level number.
  - Uses throttled `aria-live` updates for accessibility (not per-frame spam).
- [ ] Implement `screens-adapter.js` with fully distinct game state screens:
  - **Start Screen** (`game-description.md` §9.5): Title, Start Game button, High Scores display, control instructions. `Enter` to start.
  - **Pause Menu** (`game-description.md` §10): Continue and Restart options. Arrow keys to select, `Enter` to confirm.
  - **Level Complete Screen** (`game-description.md` §8): Level stats. `Enter` for next level.
  - **Game Over Screen** (`game-description.md` §11): Final score, Play Again button.
  - **Victory Screen** (`game-description.md` §11): Final score, ghosts killed, total time, Play Again button.
- [ ] Implement keyboard focus transfer: Arrow keys for menu navigation, Enter for confirm. Focus enters overlay on open, restores to gameplay on close.
- [ ] Implement `adapters/io/storage-adapter.js`: High score saving/reading from `localStorage` with untrusted data validation on read.
- [ ] Verification gate: adapter tests confirm HUD metrics update correctly via safe sinks; e2e tests confirm keyboard-only navigation across all screens.

---

#### D3-14: Visual Asset Production — Gameplay Sprites
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `D3-06`, `D3-08`  
**Impacts**: In-game readability and SVG compliance (`AUDIT-B-04`)

**Deliverables**:
- `assets/generated/sprites/*.svg` — all gameplay sprites (player, ghosts, bombs, fire, pellets, walls, power-ups)
- `assets/source/visual/` — source design files

**Blocks**:
- D3-15 (same track — manifest needs sprite metadata)

- [ ] Create/export core gameplay sprites (SVG preferred, < 50 path elements each):
  - Ms. Ghostman: idle, walking frames (4 directions), death animation, invincibility blink, speed boost tint/trail.
  - 4 Ghost types: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange) — each with normal, stunned (blue), and dead (eyes-only) variants.
  - Bombs: idle, fuse ticking animation frames.
  - Fire: explosion cross tiles (animated fade).
  - Pellets: regular dot, power pellet (larger, pulsing).
  - Walls: indestructible (brick pattern), destructible (crate/box), destruction animation.
- [ ] Create/export power-up sprites/icons: Power Pellet `⚡`, Bomb+ `💣+`, Fire+ `🔥+`, Speed Boost `👟`.
- [ ] Ensure all sprites have declared dimensions in metadata for layout reservation.
- [ ] Verification gate: all sprites render correctly at target display size.

---

#### D3-15: Visual Assets (UI & Screens) + Visual Manifest & Validation
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `D3-13`, `D3-14`, `A3-07` (CI schema gates)  
**Impacts**: Start/pause/game-over/victory visual polish; asset contract enforcement; CI validation

**Deliverables**:
- `assets/generated/ui/*.svg` — UI screen assets
- `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12)
- `assets/manifests/visual-manifest.json` — all visual asset entries
- CSS layouts for all screen overlays
- HUD layout CSS

**Blocks**:
- None (final track ticket)

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
