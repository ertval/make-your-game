# ��� Track D — Resources, Map, Rendering & Visual Assets (Dev 4)

��� Source plan: `docs/implementation/implementation-plan-v3.md` (Section 3)

> **Scope**: ECS resources (time, constants, RNG, events, game-status), map loading, renderer adapters, sprite pools, CSS layout, render systems (collect + DOM batch), and gameplay visual sprite production. Dev 4 owns deterministic world-state infrastructure and the DOM render pipeline.
> **Estimate**: ~25 hours (10 tickets)
> **Execution model**: Build resource/map/render foundations first, then lock memory-stable rendering, then finish gameplay visual sprite production.

## Phase Order (MVP First)

- **P0 Foundation**: `D-01` to `D-04`
- **P1 Playable MVP**: `D-05` to `D-08`
- **P2 Feature Complete**: `D-09`
- **P3 Polish and Validation**: `D-10`

---

#### D-01: Resources (Time, Constants, RNG, Events, Game Status)
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P0 Foundation
**Depends On**: `A-02` (world engine — resource API)
**Impacts**: Determinism contract, clock/pause correctness, cross-system event ordering

**Deliverables**:
- `src/ecs/resources/constants.js` — all canonical gameplay constants
- `src/ecs/resources/clock.js` — deterministic/injectable time tracking
- `src/ecs/resources/rng.js` — seeded RNG for deterministic runs
- `src/ecs/resources/event-queue.js` — deterministic insertion-order event queue
- `src/ecs/resources/game-status.js` — FSM enum states

**Blocks**:
- D-02, D-03 (same track)
- A-03 (Track A — game loop needs clock/constants)
- B-02 (Track B — input needs constants)
- C-01, C-02, C-03 (Track C — scoring/timer/lives/spawn need resources)

- [ ] Add `src/ecs/resources/constants.js`: Define all canonical gameplay constants: `SIMULATION_HZ=60`, `MAX_STEPS_PER_FRAME=5`, `PLAYER_START_LIVES=3`, `BOMB_FUSE_MS=3000`, `FIRE_DURATION_MS=500`, `DEFAULT_FIRE_RADIUS=2`, `INVINCIBILITY_MS=2000`, `STUN_MS=5000`, `SPEED_BOOST_MULTIPLIER=1.5`, `SPEED_BOOST_MS=10000`, `MAX_CHAIN_DEPTH=10`.
- [ ] Implement `src/ecs/resources/clock.js`: Tracks elapsed simulation time, delta, and logic pause-state vs unpaused system state.
- [ ] Implement `src/ecs/resources/rng.js`: Predictable `Math.random` replacement for deterministic runs.
- [ ] Implement `src/ecs/resources/event-queue.js`: Deterministic insertion-order event queue for cross-system communication.
- [ ] Implement `src/ecs/resources/game-status.js`: FSM enum states: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Verification gate: unit tests validate deterministic RNG sequences, event ordering, and pause-safe simulation clock progression.

---

#### D-02: Map Schema & JSON Blueprints
**Priority**: ��� Critical
**Estimate**: 2 hours
**Phase**: P0 Foundation
**Depends On**: `D-01` (constants for timer/ghost config)
**Impacts**: Level data contract, JSON Schema 2020-12 validation in CI

**Deliverables**:
- `assets/maps/level-1.json`, `assets/maps/level-2.json`, `assets/maps/level-3.json`
- `docs/schemas/map.schema.json` (JSON Schema 2020-12)

**Blocks**:
- D-03 (same track — map resource parses these)

- [ ] Create 3 JSON map blueprints (Levels 1, 2, and 3) by strictly parsing the exact ASCII map layouts provided in `game-description.md` §8.1.
  - Apply the exact Level 1, Level 2, and Level 3 grid structures and entity spawn placements without manually balancing or altering the design.
  - Configure the level JSON timers per §8 (120s, 180s, 240s) and ghost limits per level (2, 3, 4 ghosts).
- [ ] Implement JSON Schema 2020-12 for map validation.
- [ ] Maps MUST include strict grid placement rules for: empty space (` `), indestructible walls (`���`), destructible walls (`���`), pellets (`·`), power pellets (`⚡`), bomb+ (`���+`), fire+ (`���+`), speed boost (`���`), and ghost house area.
- [ ] Verification gate: schema tests (valid + invalid fixtures) pass.

---

#### D-03: Map Loading Resource
**Priority**: ��� Critical
**Estimate**: 2 hours
**Phase**: P0 Foundation
**Depends On**: `D-01`, `D-02`
**Impacts**: Level loading, restart determinism, progression correctness

**Deliverables**:
- `src/ecs/resources/map-resource.js` — parses map JSON, stores fixed grid representation, spawn points

**Blocks**:
- D-04, D-06 (same track)
- B-03 (Track B — movement reads map grid)
- B-04 (Track B — collision reads map)
- B-08 (Track B — ghost AI reads map)
- C-03 (Track C — spawn system reads ghost spawns)

- [ ] Implement `map-resource.js`: Parses map on load, stores a fixed representation of the static grid cells.
- [ ] Load map resources asynchronously and reject invalid data before world injection.
- [ ] Verification gate: unit tests for valid parse, invalid JSON rejection, spawn point extraction; e2e restart test proves canonical map reset.

---

#### D-04: Render Data Contracts
**Priority**: ��� Critical
**Estimate**: 1 hour
**Phase**: P0 Foundation
**Depends On**: `A-02` (world engine), `B-01` (components)
**Impacts**: ECS/DOM boundary safety and deterministic render intent contracts

**Deliverables**:
- `src/ecs/components/visual.js` additions (if not covered by B-01): render-intent structure, classBits definitions
- Render-intent buffer pre-allocation contract documentation

**Blocks**:
- D-05 (same track)
- D-07 (same track)

- [ ] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components).
- [ ] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js`.
- [ ] Enforce `classBits`-based visual flags and strict prohibition of DOM references in ECS component data.
- [ ] Verification gate: contract tests validate no adapter/DOM leakage into ECS storage.

---

#### D-05: CSS Layout & Grid Structure
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P1 Playable MVP
**Depends On**: `A-01` (scaffolding)
**Impacts**: Core board layout, accessibility baseline, layer policy groundwork (`AUDIT-F-20`, `AUDIT-F-21`)

**Deliverables**:
- `styles/variables.css` — color palette, spacing tokens, z-index scale, animation timing
- `styles/grid.css` — strict grid-template layouts and positioning
- `styles/animations.css` — walking pulse, bomb fuse, explosion fade, ghost stun flash, invincibility blink, speed trail

**Blocks**:
- D-06 (same track)
- C-05 (Track C — HUD/screen adapters consume layout tokens and grid structure)

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

#### D-06: Renderer Adapter & Board Generation
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P1 Playable MVP
**Depends On**: `D-04`, `D-05`, `D-03`
**Impacts**: Safe DOM board rendering and no-canvas compliance (`AUDIT-F-04`)

**Deliverables**:
- `src/adapters/dom/renderer-adapter.js` — createElement/createElementNS, zero innerHTML

**Blocks**:
- D-07, D-08, D-09 (same track)

- [ ] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [ ] Use `textContent` and explicit attribute APIs for all dynamic content.
- [ ] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.

---

#### D-07: Render Collect System
**Priority**: ��� Critical
**Estimate**: 2 hours
**Phase**: P1 Playable MVP
**Depends On**: `D-04`, `B-03` (movement — position data to interpolate)
**Impacts**: Smooth interpolation and deterministic intent ordering for frame commits

**Deliverables**:
- `src/ecs/systems/render-collect-system.js` — interpolation, render-intent buffer

**Blocks**:
- D-08 (same track)

- [ ] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [ ] Use stable intent ordering for deterministic commits.
- [ ] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

---

#### D-08: Render DOM System (The Batcher)
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P1 Playable MVP
**Depends On**: `D-06`, `D-07`
**Impacts**: Frame-time stability and compositor-only writes (`AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`)

**Deliverables**:
- `src/ecs/systems/render-dom-system.js` — one-pass DOM commit, transform/opacity/class writes only

**Blocks**:
- D-09 (same track — sprite pool integrates with batcher)

- [ ] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [ ] Applies batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
  - Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] Keep commit path write-only and pool reclaim in same commit window.
- [ ] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.

---

#### D-09: Sprite Pool Adapter
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P2 Feature Complete
**Depends On**: `D-06`, `D-08`
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

#### D-10: Visual Asset Production — Gameplay Sprites
**Priority**: ��� Critical
**Estimate**: 3 hours
**Phase**: P3 Polish and Validation
**Depends On**: `D-06`, `D-08`
**Impacts**: In-game readability and SVG compliance (`AUDIT-B-04`)

**Deliverables**:
- `assets/generated/sprites/*.svg` — all gameplay sprites (player, ghosts, bombs, fire, pellets, walls, power-ups)
- `assets/source/visual/` — source design files

**Blocks**:
- C-11 (Track C — UI visual/manifest governance consumes sprite metadata and fallback mappings)

- [ ] Create/export core gameplay sprites (SVG preferred, < 50 path elements each):
  - Ms. Ghostman: idle, walking frames (4 directions), death animation, invincibility blink, speed boost tint/trail.
  - 4 Ghost types: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange) — each with normal, stunned (blue), and dead (eyes-only) variants.
  - Bombs: idle, fuse ticking animation frames.
  - Fire: explosion cross tiles (animated fade).
  - Pellets: regular dot, power pellet (larger, pulsing).
  - Walls: indestructible (brick pattern), destructible (crate/box), destruction animation.
- [ ] Create/export power-up sprites/icons: Power Pellet `⚡`, Bomb+ `���+`, Fire+ `���+`, Speed Boost `���`.
- [ ] Ensure all sprites have declared dimensions in metadata for layout reservation.
- [ ] Emit a sprite metadata handoff table (`spriteId`, `width`, `height`, `className`) consumed by `C-11` manifest mapping.
- [ ] Verification gate: all sprites render correctly at target display size.

---
