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

- [x] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [x] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [x] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [x] Use `textContent` and explicit attribute APIs for all dynamic content.
- [x] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.
- [ ] **DEFERRED from D-03**: Playwright e2e restart test proves canonical map reset (load level, trigger restart, verify board returns to initial state with correct cell types and spawn positions). — Pending D-08 integration

---

#### D-07: Render Collect System
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-04`, `B-03` (movement — position data to interpolate)
**Impacts**: Smooth interpolation and deterministic intent ordering for frame commits
**Blocks**: D-08

**Deliverables**:
- `src/ecs/systems/render-collect-system.js` — interpolation, render-intent buffer

- [x] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [x] Use stable intent ordering for deterministic commits.
- [x] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

---

#### D-08: Render DOM System (The Batcher)
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-06` ✓, `D-07`, `D-09`
**Impacts**: Frame-time stability and compositor-only writes (`AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`)
**Blocks**: D-09, D-10 || A-05

**D-06 Dependency Note**: Board generation (`renderer-adapter.js`) is complete; D-08 integrates board rendering with entity sprite rendering.

**Deliverables**:
- `src/ecs/systems/render-dom-system.js` — one-pass DOM commit, transform/opacity/class writes only

- [x] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [x] Applies batched writes:
- [x] Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
- [x] Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
- [x] Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [x] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [x] Keep commit path write-only and pool reclaim in same commit window.
- [x] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.
- [ ] **DEFERRED to D-10**: DevTools layer/paint evidence confirms `AUDIT-F-20` (layer minimization) and `AUDIT-F-21` (layer promotion) compliance — capture DevTools Performance panel traces showing:
  - Only player + 4 ghost sprites carry `will-change: transform` (target ~5 promoted layers).
  - Bombs, fire tiles, static grid cells, and HUD elements do NOT create compositor layers.
  - Paint rectangles are minimal and confined to moving sprite bounds during normal gameplay.
- [ ] GAP-01: Verify that player and ghost entities are assigned the correct component masks and properties (including COMPONENT_MASK.RENDERABLE) in bootstrap so the render collect system sees them properly.

---

#### D-09: Sprite Pool Adapter
**Priority**: ��� Critical
**Phase**: P1 Visual Prototype
**Depends On**: `D-06`
**Impacts**: Allocation stability and memory reuse (`AUDIT-B-03`)
**Blocks**: None

**Deliverables**:
- `src/adapters/dom/sprite-pool-adapter.js` — pre-allocated pools, offscreen-transform hiding, pool acquire/release API

- [x] Implement `sprite-pool-adapter.js`:
  - Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`, `POOL_PELLETS = maxPellets`).
  - Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (triggers layout).
  - When pool exhausted: log `console.warn` in development; silently recycle oldest active element in production.
- [x] Pool acquire/release API for render-dom-system consumption.
- [x] Pre-warm pools during level load to avoid runtime allocation bursts.
- [x] Verification gate: pool tests validate sizing, hiding strategy, and exhaustion behavior.

---

#### D-10: Visual Asset Production — Gameplay Sprites
**Priority**: ��� Critical
**Phase**: P4 Polish and Validation
**Depends On**: `D-06`, `D-08` (A-13 formal gate deferred — early pull, consistent with A-04 precedent)
**Impacts**: In-game readability; walk-cycle animation; live board pellet sync
**Blocks**: D-11

**Deliverables** (delivered):
- `src/ecs/systems/player-animation-system.js` — logic-phase walk-cycle animation (8 directional frames, 100 ms interval)
- `src/ecs/systems/board-sync-system.js` — render-phase pellet/power-pellet DOM sync via board adapter
- `src/adapters/dom/renderer-adapter.js` (updated) — `updateCell(row, col, cellType)` API
- `src/ecs/systems/render-dom-system.js` (updated) — player sprite frame class application from `buffer.spriteId`
- `styles/grid.css` (updated) — 10 player sprite CSS classes (`sprite--player--idle`, `sprite--player--walk-*`)
- `assets/generated/visuals/128px/characters/` — 9 WebP (lossless, 128×128) player walk frames cropped from `player_direction_v4` sheet


- [x] Player walk-cycle animation system (`player-animation-system.js`): reads `velocity.rowDelta/colDelta` for direction; idles on delta=0 (holds last-facing frame 01, resets timer); alternates frames every 100 ms while moving.
- [x] Board-sync system (`board-sync-system.js`): fires `boardAdapter.updateCell(row, col, 0)` for `pellet-collected` and `power-pellet-collected` events in the render phase.
- [x] `renderer-adapter.js` updated with `updateCell(row, col, cellType)` — looks up pre-built cell element by index, swaps CSS classes.
- [x] `render-dom-system.js` reads `buffer.spriteId` for PLAYER-kind intents and applies one of ten `sprite--player--*` frame classes from a static allowlist.
- [x] CSS walk frame classes added to `styles/grid.css`; `sprite--player` base style sets `background-size` and `background-repeat`; individual frame classes set `background-image` to 128 px WebP paths.
- [x] 9 WebP (lossless, 128×128) player walk frames extracted from `player_direction_v4` sheet. **Format deviation**: spec says SVG preferred; WebP lossless used because source sheet is raster — preserves per-pixel accuracy, no path-element budget applies.
- [x] Bootstrap wired: `createPlayerAnimationSystem()` registered in logic phase (after explosion-system, before render-collect).
- [x] Verification gate (automated): 19 unit tests in `tests/unit/systems/player-animation-system.test.js`; 11 unit tests in `tests/unit/systems/board-sync-system.test.js`; +4 integration tests in `tests/integration/adapters/renderer-adapter.test.js`; bootstrap logic-phase order list pinned in `tests/unit/game/bootstrap.test.js`. `npm run policy` green (882 tests).
- [x] **DEFERRED from D-08**: DevTools layer/paint evidence confirms AUDIT-F-20 and AUDIT-F-21 compliance — code inspection confirms no new `will-change` declarations; `background-image` swaps repaint the already-promoted player sprite layer only. Addenda in `docs/audit-reports/evidence/AUDIT-F-20.layers.md` and `AUDIT-F-21.promotion.md`.
- [x] **DEFERRED from D-03/D-06**: Playwright e2e restart test proves canonical map reset — `tests/e2e/board-reset.spec.js` verifies pellet cell count restores after `runtime.restart()`.

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

**Deliverables deferred from D-10**:
- Ghost sprites: 4 types × 3 states (normal, stunned, dead)
- Bomb sprites: idle + fuse ticking animation
- Fire tiles: explosion cross (animated fade)
- Pellet sprites: regular dot, power pellet (pulsing)
- Wall sprites: indestructible (brick), destructible (crate), destruction animation
- Power-up sprites/icons: Bomb+, Fire+, Speed Boost
- Sprite metadata handoff table (`spriteId`, `width`, `height`, `className`) for visual manifest mapping

- [x] **DEFERRED from D-10**: Create remaining gameplay sprites (ghosts × 4 types × 3 states, bombs, fire tiles, pellets, walls, power-up icons). _(All present under `assets/generated/visuals/`.)_
- [x] **DEFERRED from D-10**: Emit sprite metadata handoff table (`spriteId`, `width`, `height`, `className`) consumed by visual manifest. _(D-10 source table `assets/source/visual/sprite-handoff.json` aligned to real render-dom CSS classes; the resolved `className` now lives on every `visual-manifest.json` entry, validated in CI.)_
- [x] Design and build CSS layouts for all screen overlays: _(delivered with C-05 — `.screen-overlay`/`.overlay__panel`/`.overlay__actions` in `styles/`; all five `data-screen` sections present in `index.html`.)_
  - Start Screen: title treatment, button styles, high score table.
  - Pause Menu: semi-transparent overlay, button styles.
  - Level Complete: stats layout, next level button.
  - Game Over: final score display, play again button.
  - Victory: celebration treatment, final stats, play again button.
- [x] Create HUD layout CSS: lives icons, score counter, timer, bomb/fire indicators, level number. _(`.hud`/`.hud__label`/`.hud__metric`/`.hud__value`.)_
- [x] Finalize `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `kind` (sprite|ui|tile|effect), `format`, `width`, `height`, `tags`, `critical`, `className` (`sprite--*`/`cell-*`, or `null` when the asset is not bound to a render class).
  - Optional fields: `maxBytes`, `notes`.
- [x] Create/maintain `assets/manifests/visual-manifest.json` with all visual asset entries. _(84 entries.)_
- [x] Build manifest-to-renderable mapping table and define missing-asset fallback class behavior. _(`className` column + `docs/implementation/assets-pipeline.md` § 8.1 Manifest → renderable mapping & fallback.)_
- [~] Optimize SVG/raster outputs and validate against layer/paint constraints. _(Per-asset `maxBytes` budget enforced by the schema validator; no separate dedicated optimization pass.)_
- [x] Ensure responsive sizing within the game viewport. _(Delivered as D-12 / #98 — `--fit-scale` board-fit scaling.)_
- [x] Verification gate: manifest validation passes CI; all screens render correctly with keyboard focus indicators visible; runtime fallback tests prove robust asset mapping. _(`validate:schema` enforces schema + on-disk asset existence + size budgets; `:focus-visible` indicators in `styles/`; renderer kind-base-class fallback covered by `render-dom-system` unit tests.)_

---
