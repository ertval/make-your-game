# 🎮 Track B v2 — Core Physics & Mechanics (Dev 2)

📎 Source plan: `docs/implementation/tickets_v2.md`

> **Scope**: Core simulation mechanics with deterministic fixed-step behavior: components, input consumption, movement, collision, bombs/explosions, and power-up rules. This track owns the mathematically dense gameplay internals.
> **Estimate**: Target ~26 hours (reality-informed ~58 hours)
> **Execution model**: Implement deterministic simulation core first, then expand combat/power-up depth.

## Phase Order (v2)

- **P0 Foundation**: `B2-00` to `B2-01`
- **P1 Playable MVP**: `B2-02` to `B2-04`
- **P2 Feature Complete**: `B2-05` to `B2-06`

#### B2-00: Fixed-Step Simulation Kernel
**Priority**: 🔴 Critical
**Estimate**: 2h target (4h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-02`
**Impacts**: Deterministic fixed-timestep execution and simulation-step boundaries
**Deliverables**: `src/ecs/world/fixed-step-kernel.js`

- [ ] Implement accumulator-based fixed-step execution hooks.
- [ ] Implement max-steps-per-frame clamping behavior.
- [ ] Define simulation-step sync boundaries for structural mutations.
- [ ] Verification gate: fixed-step kernel determinism tests pass.

#### B2-01: ECS Components & Data Contracts
**Priority**: 🔴 Critical
**Estimate**: 3h target (8h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-02`
**Impacts**: Canonical gameplay data model and query compatibility
**Deliverables**: `src/ecs/components/spatial.js`, `src/ecs/components/actors.js`, `src/ecs/components/props.js`, `src/ecs/components/stats.js`, `src/ecs/components/visual.js`

- [ ] Implement component modules for spatial, actors, props, stats, and visual data.
- [ ] Register component mask contracts and defaults.
- [ ] Enforce data-only component policy (no DOM/browser state).
- [ ] Verification gate: component shape and mask registration checks pass.

#### B2-02: Input Adapter & Input System
**Priority**: 🔴 Critical
**Estimate**: 4h target (8h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `B2-00`, `B2-01`, `D2-00`
**Impacts**: Hold-to-move behavior and deterministic per-step input sampling
**Deliverables**: `src/adapters/io/input-adapter.js`, `src/ecs/systems/input-system.js`

- [ ] Implement keyboard hold-state tracking through adapter boundary.
- [ ] Snapshot input once per fixed simulation step.
- [ ] Enforce blur/visibility clearing to prevent stuck input.
- [ ] Verification gate: hold-to-move and focus-loss tests pass.

#### B2-03: Movement & Grid Collision
**Priority**: 🔴 Critical
**Estimate**: 5h target (10h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `B2-01`, `B2-02`, `D2-01`
**Impacts**: Core controllable movement loop and wall-blocking correctness
**Deliverables**: `src/ecs/systems/player-move-system.js`

- [ ] Implement deterministic player movement on grid.
- [ ] Prevent diagonal drift and invalid tile traversal.
- [ ] Preserve interpolation-friendly position transitions.
- [ ] Verification gate: movement continuity and blocked-path tests pass.

#### B2-04: Collision Matrix System
**Priority**: 🔴 Critical
**Estimate**: 4h target (10h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `B2-03`
**Impacts**: Entity interaction correctness across combat and pickups
**Deliverables**: `src/ecs/systems/collision-system.js`

- [ ] Implement collision hierarchy and occupancy map checks.
- [ ] Enforce ghost-house barriers and bomb-cell constraints.
- [ ] Emit collision intents for downstream systems.
- [ ] Verification gate: collision permutation integration tests pass.

#### B2-05: Bomb & Explosion Systems
**Priority**: 🔴 Critical
**Estimate**: 5h target (10h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `B2-03`, `B2-04`
**Impacts**: Bomberman-style chain reactions and deterministic explosion intent flow
**Deliverables**: `src/ecs/systems/bomb-tick-system.js`, `src/ecs/systems/explosion-system.js`

- [ ] Implement fuse countdown and detonation triggers.
- [ ] Implement cross-pattern blast geometry and iterative chain queue.
- [ ] Enforce wall-stop and pellet pass-through rules.
- [ ] Emit deterministic explosion aftermath intents for map-state processing.
- [ ] Verification gate: explosion geometry and chain determinism tests pass.

#### B2-06: Power-Up Mechanics
**Priority**: 🟡 High
**Estimate**: 3h target (6h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `B2-04`, `B2-05`, `D2-07`
**Impacts**: Player capability progression and deterministic buff behavior
**Deliverables**: `src/ecs/systems/power-up-system.js`

- [ ] Implement bomb+, fire+, and speed boost rule application.
- [ ] Preserve deterministic duration and stacking semantics.
- [ ] Consume map-state outcomes from D2-07 for final power-up state transitions.
- [ ] Verification gate: power-up timing and state transition tests pass.

---
