# Track D — Visual Production & Integration (Dev 4)

Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Everything visual — renderer adapters, sprite pools, HUD, screen overlays, CSS layout, render systems (collect + DOM batch), visual asset creation, visual manifest schema, and all DOM/CSS work. Fully independent from audio work.  
> **Estimate**: ~22 hours

#### D-1: CSS Layout & Grid Structure
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `requirements.md` (DOM-only rendering); `audit.md` F-19, F-20, F-21 (paint/layers)

- [ ] Build `styles/variables.css`: color palette, spacing tokens, z-index scale, animation timing.
- [ ] Build `styles/grid.css` using strict grid-template layouts and absolute positioning over grid cells.
- [ ] Apply strict **`will-change` policy**:
  - Player sprite: `will-change: transform` (always moving).
  - Ghost sprites: `will-change: transform` (always moving).
  - Bomb sprites: `will-change: transform` only while fuse animation is active (add/remove dynamically).
  - Fire tiles, static grid cells, HUD elements: **NO** `will-change`.
  - Target layer count: ~6 (player + 4 ghosts + active bomb group).
- [ ] Build `styles/animations.css`: walking pulse, bomb fuse animation, explosion fade, ghost stun flash, invincibility blink, speed boost trail/tint.
- [ ] Respect `prefers-reduced-motion` for non-gameplay animations (menus, transitions, overlays).
- [ ] Verification gate: DevTools layer evidence confirms minimal-but-nonzero layers and policy compliance.

#### D-2: Renderer Adapter & Board Generation
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `AGENTS.md` safe DOM sinks; `audit.md` F-04 (no canvas)

- [ ] Implement `renderer-adapter.js`: Strict `document.createElement` / `createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Generate static grid cells from `map-resource` data: walls get appropriate CSS classes, empty cells are passable.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan (relaxed for Vite dev, strict for production).
- [ ] Use `textContent` and explicit attribute APIs for all dynamic content.
- [ ] Verification gate: adapter tests confirm safe DOM sinks, no innerHTML usage.

#### D-3: Sprite Pool Adapter
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `AGENTS.md` DOM pooling rules; `audit.md` B-03 (memory reuse)

- [ ] Implement `sprite-pool-adapter.js`:
  - Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`, `POOL_PELLETS = maxPellets`).
  - Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (triggers layout).
  - When pool exhausted: log `console.warn` in development; silently recycle oldest active element in production.
- [ ] Pool acquire/release API for render-dom-system consumption.
- [ ] Pre-warm pools during level load to avoid runtime allocation bursts.
- [ ] Verification gate: pool tests validate sizing, hiding strategy, and exhaustion behavior.

#### D-4: HUD Adapter
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Covers**: `requirements.md` (score, timer, lives); `audit.md` F-14, F-15, F-16; `game-description.md` §9

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

#### D-5: Screen Overlays Adapter
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `game-description.md` §9.5, §10, §11 (all game screens)

- [ ] Implement `screens-adapter.js` with fully distinct game state screens:
  - **Start Screen** (`game-description.md` §9.5): Title, Start Game button, High Scores display, control instructions. `Enter` to start.
  - **Pause Menu** (`game-description.md` §10): Continue and Restart options. Arrow keys to select, `Enter` to confirm.
  - **Level Complete Screen** (`game-description.md` §8): Level stats (score, time, ghosts killed). `Enter` for next level.
  - **Game Over Screen** (`game-description.md` §11): Final score, Play Again button.
  - **Victory Screen** (`game-description.md` §11): Final score, ghosts killed, total time, Play Again button.
- [ ] Implement keyboard focus transfer: Arrow keys for menu navigation, Enter for confirm. Focus enters overlay on open, restores to gameplay on close.
- [ ] Implement `adapters/io/storage-adapter.js`: High score saving/reading from `localStorage` with untrusted data validation on read.
- [ ] Verification gate: e2e tests confirm keyboard-only navigation across all screens.

#### D-6: Render Data Contracts
**Priority**: 🔴 Critical  
**Estimate**: 1 hour  
**Covers**: ECS render boundary contracts

- [ ] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components).
- [ ] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js`.
- [ ] Enforce `classBits`-based visual flags and strict prohibition of DOM references in ECS component data.
- [ ] Verification gate: contract tests validate no adapter/DOM leakage into ECS storage.

#### D-7: Render Collect System
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Covers**: `AGENTS.md` render boundary rules

- [ ] Implement `render-collect-system.js`: Called after simulation but before DOM write. Matches all entities with Position + Renderable. Computes intended transforms using interpolation factor (`alpha`). Outputs a preallocated render-intent buffer.
- [ ] Use stable intent ordering for deterministic commits.
- [ ] Verification gate: unit tests validate interpolation math and deterministic intent ordering.

#### D-8: Render DOM System (The Batcher)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `AGENTS.md` DOM batching rules; `audit.md` F-19, F-20, F-21

- [ ] Implement `render-dom-system.js`: The ONLY system where DOM mutates.
- [ ] Applies batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (stunned, invincible, speed-boosted, dead).
  - Informs `sprite-pool-adapter` to reclaim/hide nodes not in current frame's render-intent set.
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] Keep commit path write-only and pool reclaim in same commit window.
- [ ] Verification gate: traces show no forced-layout thrash loops and no recurring long tasks > 50ms.

#### D-9: Visual Asset Production — Gameplay Sprites
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `game-description.md` §2-§5 (all entity visuals); `audit.md` B-04 (SVG usage)

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
**Covers**: `game-description.md` §9, §9.5, §10, §11 (all UI screens)

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
**Covers**: Asset validation pipeline from `docs/assets-pipeline.md`

- [ ] Finalize `docs/schemas/visual-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `category` (sprite|ui|effect), `file`, `format`, `width`, `height`.
  - Optional: `frames`, `animationDuration`, `fallbackClass`.
- [ ] Create/maintain `assets/manifests/visual-manifest.json` with all visual asset entries.
- [ ] Build manifest-to-renderable mapping table and define missing-asset fallback class behavior.
- [ ] Optimize SVG/raster outputs and validate against layer/paint constraints.
- [ ] Verification gate: manifest validation passes CI; runtime fallback tests prove robust asset mapping.

