# 🎨 Track D — Visual Production & Integration (Dev 4)

📎 Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Everything visual — renderer adapters, sprite pools, HUD, screen overlays, CSS layout, render systems (collect + DOM batch), visual asset creation, visual manifest schema, and all DOM/CSS work. Fully independent from audio work.  
> **Estimate**: ~22 hours  
> **Execution model**: Build render-safe MVP visuals first, then optimize memory and polish assets.

## Phase Order (MVP First)

- **P0 Foundation**: `D-01` to `D-03`
- **P1 Playable MVP**: `D-04` to `D-07`
- **P2 Feature Complete**: `D-08`, `D-09`
- **P3 Polish and Validation**: `D-10`, `D-11`

#### D-01: Render Data Contracts
**Priority**: 🔴 Critical  
**Estimate**: 1 hour  
**Phase**: P0 Foundation  
**Depends On**: `A-02`, `B-01`  
**Impacts**: ECS/DOM boundary safety and deterministic render intent contracts

- [ ] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components).
- [ ] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js`.
- [ ] Enforce `classBits`-based visual flags and strict prohibition of DOM references in ECS component data.
- [ ] Verification gate: contract tests validate no adapter/DOM leakage into ECS storage.

#### D-02: CSS Layout & Grid Structure
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `A-01`  
**Impacts**: Core board layout, accessibility baseline, layer policy groundwork

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

#### D-03: Renderer Adapter & Board Generation
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `D-01`, `D-02`, `A-05`  
**Impacts**: Safe DOM board rendering and no-canvas compliance (`AUDIT-F-04`)

- [ ] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [ ] Use `textContent` and explicit attribute APIs for all dynamic content.
- [ ] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.

#### D-04: Render Collect System
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D-01`, `B-03`  
**Impacts**: Smooth interpolation and deterministic intent ordering for frame commits

- [ ] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [ ] Use stable intent ordering for deterministic commits.
- [ ] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

#### D-05: Render DOM System (The Batcher)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D-03`, `D-04`  
**Impacts**: Frame-time stability and compositor-only writes (`AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`)

- [ ] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [ ] Applies batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
  - Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] Keep commit path write-only and pool reclaim in same commit window.
- [ ] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.

#### D-06: HUD Adapter
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D-02`, `B-05`  
**Impacts**: Visible gameplay metrics (`AUDIT-F-14`, `AUDIT-F-15`, `AUDIT-F-16`)

- [ ] Implement `hud-adapter.js`:
  - Binds text nodes natively with `.textContent` to update:
    - Lives display: heart icons (decrement on death).
    - Score display: 5-digit counter.
    - Timer display: `M:SS` countdown format.
    - Bomb count: current max simultaneous bombs.
    - Fire radius: current explosion range.
    - Level number: current level.
  - Uses throttled `aria-live` updates for accessibility (not per-frame spam).
- [ ] Verification gate: adapter tests confirm all HUD metrics update correctly via safe sinks.

#### D-07: Screen Overlays Adapter
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D-02`, `B-06`  
**Impacts**: Keyboard-first menu flow and pause UX (`AUDIT-F-07`, `AUDIT-F-08`, `AUDIT-F-09`)

- [ ] Implement `screens-adapter.js` with fully distinct game state screens:
  - **Start Screen** (`game-description.md` §9.5): Title, Start Game button, High Scores display, control instructions. `Enter` to start.
  - **Pause Menu** (`game-description.md` §10): Continue and Restart options. Arrow keys to select, `Enter` to confirm.
  - **Level Complete Screen** (`game-description.md` §8): Level stats (score, time, ghosts killed). `Enter` for next level.
  - **Game Over Screen** (`game-description.md` §11): Final score, Play Again button.
  - **Victory Screen** (`game-description.md` §11): Final score, ghosts killed, total time, Play Again button.
- [ ] Implement keyboard focus transfer: Arrow keys for menu navigation, Enter for confirm. Focus enters overlay on open, restores to gameplay on close.
- [ ] Implement `adapters/io/storage-adapter.js`: High score saving/reading from `localStorage` with untrusted data validation on read.
- [ ] Verification gate: e2e tests confirm keyboard-only navigation across all screens.

#### D-08: Sprite Pool Adapter
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `D-03`, `D-05`  
**Impacts**: Allocation stability and memory reuse (`AUDIT-B-03`)

- [ ] Implement `sprite-pool-adapter.js`:
  - Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`, `POOL_PELLETS = maxPellets`).
  - Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (triggers layout).
  - When pool exhausted: log `console.warn` in development; silently recycle oldest active element in production.
- [ ] Pool acquire/release API for render-dom-system consumption.
- [ ] Pre-warm pools during level load to avoid runtime allocation bursts.
- [ ] Verification gate: pool tests validate sizing, hiding strategy, and exhaustion behavior.

#### D-09: Visual Asset Production — Gameplay Sprites
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `D-03`, `D-05`  
**Impacts**: In-game readability and SVG compliance (`AUDIT-B-04`)

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

#### D-10: Visual Asset Production — UI & Screens
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `D-06`, `D-07`  
**Impacts**: Start/pause/game-over/victory visual polish and responsive UI quality

- [ ] Design and build CSS layouts for all screen overlays:
  - Start Screen: title treatment, button styles, high score table.
  - Pause Menu: semi-transparent overlay, button styles.
  - Level Complete: stats layout, next level button.
  - Game Over: final score display, play again button.
  - Victory: celebration treatment, final stats, play again button.
- [ ] Create HUD layout CSS: lives icons, score counter, timer, bomb/fire indicators, level number.
- [ ] Ensure responsive sizing within the game viewport.
- [ ] Verification gate: all screens render correctly with keyboard focus indicators visible.

#### D-11: Visual Manifest & Asset Validation
**Priority**: 🟡 Medium  
**Estimate**: 1 hour  
**Phase**: P3 Polish and Validation  
**Depends On**: `D-09`, `D-10`, `A-09`  
**Impacts**: Asset contract enforcement, fallback robustness, CI validation

- [ ] Finalize `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `kind` (sprite|ui|tile|effect), `format`, `width`, `height`, `tags`, `critical`.
  - Optional fields: `maxBytes`, `notes`.
- [ ] Create/maintain `assets/manifests/visual-manifest.json` with all visual asset entries.
- [ ] Build manifest-to-renderable mapping table and define missing-asset fallback class behavior.
- [ ] Optimize SVG/raster outputs and validate against layer/paint constraints.
- [ ] Verification gate: manifest validation passes CI; runtime fallback tests prove robust asset mapping.

---