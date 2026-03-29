# 🎨 Track D v2 — Map/World, Rendering, UI, Visuals & Map-State Mechanics (Dev 4)

📎 Source plan: `docs/implementation/tickets_v2.md`

> **Scope**: Clock/lifecycle timing core, map loading ownership, render contracts, DOM batching, sprite pooling, HUD/screens, visual production, and map-state mechanics (explosion aftermath and drop resolution).
> **Estimate**: Target ~34 hours (reality-informed ~70 hours)
> **Execution model**: Establish world/render boundaries first, then scale map-state and visual systems for full gameplay responsiveness.

## Phase Order (v2)

- **P0 Foundation**: `D2-00` to `D2-02`
- **P1 Playable MVP**: `D2-03` and `D2-05`
- **P2 Feature Complete**: `D2-04` and `D2-07`
- **P3 Polish & Validation**: `D2-06`

#### D2-00: Clock & Lifecycle Timing Core
**Priority**: 🔴 Critical
**Estimate**: 2h target (4h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-02`
**Impacts**: Pause-safe timing semantics and lifecycle recovery correctness
**Deliverables**: `src/ecs/resources/clock.js`

- [ ] Implement simulation clock behavior for pause-safe progression.
- [ ] Implement blur/visibility resume baseline reset and accumulator recovery.
- [ ] Verification gate: lifecycle timing integration checks pass.

#### D2-01: Map Loading & Level Resource Ownership
**Priority**: 🔴 Critical
**Estimate**: 6h target (12h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `C2-00`
**Impacts**: Canonical level topology and deterministic map reset behavior
**Deliverables**: `src/ecs/resources/map-resource.js`, `src/game/maps/level-01.json`, `src/game/maps/level-02.json`, `src/game/maps/level-03.json`

- [ ] Parse canonical map layouts into runtime-safe map resources.
- [ ] Own level loading/reset data contract and fixture set.
- [ ] Expose map query APIs used by movement, collision, and map-state mechanics.
- [ ] Verification gate: map load/reset integration tests pass for all levels.

#### D2-02: CSS & Render Contracts
**Priority**: 🔴 Critical
**Estimate**: 5h target (8h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-01`, `B2-01`
**Impacts**: ECS-to-DOM render boundaries, layer policy, and style architecture
**Deliverables**: `styles/variables.css`, `styles/grid.css`, `styles/animations.css`, `src/game/render/render-intent.js`

- [ ] Build CSS variables/grid/animation architecture.
- [ ] Define renderable and visual-state contract for deterministic rendering.
- [ ] Establish will-change policy and reduced-motion handling constraints.
- [ ] Verification gate: render contract checks and layer policy review pass.

#### D2-03: Render Collect & DOM Batcher
**Priority**: 🔴 Critical
**Estimate**: 6h target (12h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `D2-02`, `B2-03`
**Impacts**: Frame-stable render commits and strict DOM mutation isolation
**Deliverables**: `src/ecs/systems/render-collect-system.js`, `src/ecs/systems/render-dom-system.js`, `src/adapters/dom/renderer-adapter.js`

- [ ] Implement render intent collection from ECS state.
- [ ] Implement write-only DOM commit pipeline using transform/opacity/class updates.
- [ ] Prevent forced reflow loops in hot render path.
- [ ] Verification gate: render pipeline tests and trace checks pass.

#### D2-04: Sprite Pooling & Reuse
**Priority**: 🟡 High
**Estimate**: 4h target (8h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `D2-03`
**Impacts**: Allocation stability and DOM reuse under high entity churn
**Deliverables**: `src/adapters/dom/sprite-pool-adapter.js`

- [ ] Implement pool acquire/release mechanics for sprites.
- [ ] Enforce offscreen transform hiding policy.
- [ ] Define pool exhaustion behavior compatible with gameplay continuity.
- [ ] Verification gate: pool reuse and exhaustion tests pass.

#### D2-05: HUD & Overlay Screens
**Priority**: 🔴 Critical
**Estimate**: 5h target (10h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `D2-02`, `C2-03`
**Impacts**: Keyboard-first UI flow and state visibility for pause/progression
**Deliverables**: `src/adapters/dom/hud-adapter.js`, `src/adapters/dom/screens-adapter.js`, `src/adapters/io/storage-adapter.js`

- [ ] Implement HUD updates for score/timer/lives and related status fields.
- [ ] Implement start/pause/level-complete/game-over/victory overlays.
- [ ] Implement focus transfer and keyboard command routing.
- [ ] Verification gate: keyboard-only overlay navigation tests pass.

#### D2-06: Visual Asset Production & Manifest
**Priority**: 🟡 High
**Estimate**: 4h target (10h reality-informed)
**Phase**: P3 Polish & Validation
**Depends On**: `D2-03`, `D2-05`, `A2-04`
**Impacts**: Visual completeness, manifest governance, and runtime fallback behavior
**Deliverables**: `assets/generated/sprites/player-idle.svg`, `assets/generated/sprites/ghost-blinky-normal.svg`, `assets/generated/sprites/bomb-idle.svg`, `assets/generated/sprites/fire-center.svg`, `assets/generated/ui/screen-start.svg`, `assets/generated/ui/screen-victory.svg`, `assets/manifests/visual-manifest.json`, `docs/schemas/visual-manifest.schema.json`

- [ ] Produce gameplay and UI visual assets with metadata.
- [ ] Finalize visual manifest/schema and fallback mapping behavior.
- [ ] Validate layer and promotion evidence readiness.
- [ ] Verification gate: visual manifest validation and runtime fallback tests pass.

#### D2-07: Map-State Mechanics & Drop Resolver
**Priority**: 🟡 High
**Estimate**: 2h target (6h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `D2-01`, `B2-05`
**Impacts**: Deterministic world mutation after explosions and progression data integrity
**Deliverables**: `src/ecs/systems/map-state-system.js`, `src/ecs/resources/pellet-index.js`, `src/game/maps/drop-resolver.js`

- [ ] Consume explosion aftermath intents and mutate destructible map cells.
- [ ] Resolve deterministic drop placement for destroyed cells.
- [ ] Maintain pellet-remaining index resource for progression systems.
- [ ] Emit stable map-state change events for render/progression consumers.
- [ ] Verification gate: map-state determinism tests pass for seeded scenarios.

---
