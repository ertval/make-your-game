# Tickets v2 - Balanced Distribution Plan

Date: 2026-03-29
Status: Proposed

## Inputs Used For This v2

This version combines:
1. The prior unbiased workload findings (Track B overloaded most, Track A also overloaded).
2. Your requested ownership split:
   - A keeps architecture engine + all Testing/QA/CI/Deployment.
   - B focuses on core physics/mechanics.
   - C owns AI/game flow/audio.
   - D owns map/world building/render/UI/visuals.
3. Final pass adjustment:
   - A2-03 is split so all tracks own a core engine slice.

## Objective

Rebalance workload so:
1. Track A retains Testing, QA, CI, and Deployment ownership.
2. Game mechanics are distributed across B, C, and D.
3. Map parsing/level loading shifts from A to D.
4. Core engine ownership is shared across A, B, C, and D.
5. Cross-track dependencies stay explicit and phase-first.

## Workload Summary (v2)

Two estimate bands are shown to preserve both planning targets and realistic implementation risk.

| Track | Primary Role | Requested Target Band | Reality-Informed Band | LOC Band (code+tests) |
|---|---|---:|---:|---:|
| A | Architecture assembly + all Testing/QA/CI/Deployment | 34-37h | 58-76h | 3900-6400 |
| B | Core physics and mechanics | 25-28h | 40-58h | 2500-4100 |
| C | AI, game flow, and audio | 27-30h | 44-62h | 2300-4000 |
| D | Map/world building, rendering, UI, visuals, and map-state mechanics | 31-35h | 48-70h | 3200-5600 |

Note: The target band is useful for sprint planning. The reality-informed band is safer for delivery commitments.

## Phase Execution Order

1. P0 Foundation
2. P1 Playable MVP
3. P2 Feature Complete
4. P3 Hardening and Release

Rule: no ticket starts unless listed dependencies are complete.

## Key Redistribution From v1

1. A -> D:
   - Map parsing and level loading ownership moved to D.
2. B -> C:
   - Ghost AI/spawning moved to C.
   - Scoring/timer/lives moved to C.
   - Pause/level progression moved to C.
   - Gameplay event hooks moved to C.
3. A stays owner of all tests:
   - Unit, integration, e2e audit automation, and evidence sign-off remain with A.
4. B remains mechanics-heavy but narrower:
   - Components, input, movement, collision, bombs/explosions, power-ups.
5. B -> D (new mechanics move):
   - Explosion aftermath map mutation (destructible cell state updates).
   - Deterministic map drop placement resolution for destroyed cells.
   - Pellet remaining index resource for progression checks.
6. A2-03 split across all tracks:
   - A2-03: assembly and integration contracts.
   - B2-00: fixed-step simulation kernel.
   - C2-00: deterministic runtime resources.
   - D2-00: clock and lifecycle timing semantics.

## Track A - Architecture Engine + All Testing/QA/CI/Deployment (Owner: Dev 1)

### A2-01 Scaffolding and Toolchain Setup
Priority: Critical
Phase: P0
Estimate (target/reality): 6h / 10h
Depends On: none
Legacy refs: A-01

- [ ] Initialize package scripts and project baseline.
- [ ] Configure Vite, Biome, Vitest, Playwright.
- [ ] Add CI entry workflow and quality gates shell.

### A2-02 ECS World Engine Core
Priority: Critical
Phase: P0
Estimate (target/reality): 8h / 14h
Depends On: A2-01
Legacy refs: A-02

- [ ] Implement world scheduler with explicit deterministic order.
- [ ] Implement entity-store recycling and stale-handle generation checks.
- [ ] Implement query masks and deferred structural mutation sync point.

### A2-03 Engine Assembly and Contract Governance
Priority: Critical
Phase: P0
Estimate (target/reality): 2h / 4h
Depends On: B2-00, C2-00, D2-00
Legacy refs: A-03 (partial), A-04 (partial)

- [ ] Freeze engine integration contracts joining core slices from B/C/D.
- [ ] Lock bootstrap and phase ordering rules for deterministic startup.

### A2-04 CI Governance, Security, and Schema Gates
Priority: Critical
Phase: P1
Estimate (target/reality): 4h / 8h
Depends On: A2-01
Legacy refs: A-09 (partial)

- [ ] Add lockfile/SBOM/policy checks.
- [ ] Wire schema validators for maps and manifests.
- [ ] Enforce static no-canvas/no-framework gate.

### A2-05 Test Harness and Determinism Utilities
Priority: Critical
Phase: P1
Estimate (target/reality): 3h / 6h
Depends On: A2-03
Legacy refs: A-06 (partial)

- [ ] Create replay input harness and world-state hash helper.
- [ ] Create fixtures for multi-system and adapter test setup.

### A2-06 Unit Tests (Core + Gameplay)
Priority: Critical
Phase: P2
Estimate (target/reality): 4h / 12h
Depends On: B2-06, C2-04, D2-06
Legacy refs: A-06, A-10

- [ ] Write/maintain unit tests for world/resources and all gameplay systems.
- [ ] Keep deterministic seed/input assertions for timing-sensitive systems.

### A2-07 Integration and Adapter Boundary Tests
Priority: High
Phase: P2
Estimate (target/reality): 3h / 10h
Depends On: B2-06, C2-06, D2-05
Legacy refs: A-07

- [ ] Validate cross-system pipelines and adapter boundaries.
- [ ] Validate pause invariants and replay determinism.

### A2-08 E2E Audit Automation
Priority: Critical
Phase: P3
Estimate (target/reality): 3h / 8h
Depends On: A2-07
Legacy refs: A-08

- [ ] Implement assertions for fully and semi-automatable audit IDs.
- [ ] Keep audit-question map synchronized with executable assertions.

### A2-09 QA Evidence, Final Sign-off, and Deployment
Priority: High
Phase: P3
Estimate (target/reality): 2h / 4h
Depends On: A2-08, C2-06, D2-06
Legacy refs: A-11, A-09 (partial)

- [ ] Produce evidence bundle for manual audit items.
- [ ] Run final 3-level QA pass.
- [ ] Execute deployment checklist and release handoff.

Track A subtotal: 35h target / 76h reality-informed

## Track B - Core Physics and Mechanics (Owner: Dev 2)

### B2-00 Fixed-Step Simulation Kernel
Priority: Critical
Phase: P0
Estimate (target/reality): 2h / 4h
Depends On: A2-02
Legacy refs: A-04 (partial)

- [ ] Implement accumulator-based fixed-step execution kernel hooks.
- [ ] Enforce max-steps-per-frame clamp and simulation-step sync behavior.

### B2-01 ECS Components and Data Contracts
Priority: Critical
Phase: P0
Estimate (target/reality): 3h / 8h
Depends On: A2-02
Legacy refs: B-01

- [ ] Implement spatial, actors, props, stats, visual components.
- [ ] Register masks and canonical defaults.

### B2-02 Input Adapter and Input System
Priority: Critical
Phase: P1
Estimate (target/reality): 4h / 8h
Depends On: B2-00, B2-01, D2-00
Legacy refs: B-02

- [ ] Keyboard adapter with deterministic hold-state tracking.
- [ ] Frame-locked input snapshot consumption in simulation.
- [ ] Blur/visibility clearing for stuck-key prevention.

### B2-03 Movement and Grid Collision
Priority: Critical
Phase: P1
Estimate (target/reality): 5h / 10h
Depends On: B2-01, B2-02, D2-01
Legacy refs: B-03

- [ ] Grid-locked motion, blocked cells, no diagonal drift.
- [ ] Deterministic movement under variable render rate.

### B2-04 Collision Matrix System
Priority: Critical
Phase: P1
Estimate (target/reality): 4h / 10h
Depends On: B2-03
Legacy refs: B-04

- [ ] Implement collision hierarchy and occupancy rules.
- [ ] Enforce ghost-house barrier and bomb-cell rules.

### B2-05 Bomb and Explosion Systems
Priority: Critical
Phase: P2
Estimate (target/reality): 5h / 10h
Depends On: B2-03, B2-04
Legacy refs: B-07

- [ ] Implement fuse tick, blast geometry, and chain queue.
- [ ] Enforce wall-stop and pellet-pass-through rules.
- [ ] Emit deterministic explosion aftermath intents consumed by D2-07.

### B2-06 Power-Up Mechanics
Priority: High
Phase: P2
Estimate (target/reality): 3h / 6h
Depends On: B2-04, B2-05, D2-07
Legacy refs: B-09 (partial)

- [ ] Apply bomb+, fire+, speed boost effects.
- [ ] Keep deterministic duration and stacking semantics.

Track B subtotal: 26h target / 58h reality-informed

## Track C - AI, Game Flow, and Audio (Owner: Dev 3)

### C2-00 Deterministic Runtime Resources
Priority: Critical
Phase: P0
Estimate (target/reality): 2h / 4h
Depends On: A2-02
Legacy refs: A-03 (partial)

- [ ] Implement constants, RNG, event queue, and game-status resource modules.
- [ ] Enforce deterministic ordering guarantees and seed reproducibility.

### C2-01 Ghost AI and Spawn System
Priority: Critical
Phase: P2
Estimate (target/reality): 6h / 14h
Depends On: B2-03, B2-04, C2-00
Legacy refs: B-08

- [ ] Implement Blinky/Pinky/Inky/Clyde targeting and state machine.
- [ ] Implement spawn stagger and death-return respawn timings.

### C2-02 Scoring, Timer, and Lives Systems
Priority: Critical
Phase: P1
Estimate (target/reality): 4h / 10h
Depends On: B2-04, C2-00
Legacy refs: B-05

- [ ] Implement canonical scoring values and combo logic.
- [ ] Implement countdown and lives/respawn/game-over rules.

### C2-03 Pause and Level Progression
Priority: Critical
Phase: P1
Estimate (target/reality): 4h / 8h
Depends On: C2-00, C2-02, D2-00, D2-05
Legacy refs: B-06

- [ ] Implement pause freeze/resume and restart semantics.
- [ ] Implement level complete, next level, victory/game-over transitions.

### C2-04 Gameplay Event Hooks
Priority: High
Phase: P2
Estimate (target/reality): 3h / 8h
Depends On: B2-05, C2-02, C2-03
Legacy refs: B-10

- [ ] Emit deterministic gameplay events with frame/order metadata.
- [ ] Maintain stable payload schema for consumers.

### C2-05 Audio Runtime Integration
Priority: Critical
Phase: P2
Estimate (target/reality): 5h / 8h
Depends On: C2-04
Legacy refs: C-01, C-02

- [ ] Implement audio adapter and cue mapping.
- [ ] Consume gameplay events and play overlapping SFX safely.

### C2-06 Audio Production, Preload, and Manifest
Priority: High
Phase: P3
Estimate (target/reality): 5h / 10h
Depends On: C2-05, A2-04
Legacy refs: C-03, C-04, C-05, C-06, C-07

- [ ] Produce gameplay/UI/music assets and metadata.
- [ ] Implement decode/preload strategy and performance hooks.
- [ ] Finalize audio manifest governance and validation readiness.

Track C subtotal: 29h target / 62h reality-informed

## Track D - Map/World Building, Rendering, UI, and Visuals (Owner: Dev 4)

### D2-00 Clock and Lifecycle Timing Core
Priority: Critical
Phase: P0
Estimate (target/reality): 2h / 4h
Depends On: A2-02
Legacy refs: A-04 (partial)

- [ ] Implement pause-safe clock semantics used by gameplay progression systems.
- [ ] Implement blur/visibility resume baseline reset and accumulator recovery rules.

### D2-01 Map Loading and Level Resource Ownership
Priority: Critical
Phase: P0
Estimate (target/reality): 6h / 12h
Depends On: C2-00
Legacy refs: A-05

- [ ] Own map parsing from canonical layouts into runtime-safe representation.
- [ ] Own level loading/reset data flow and schema-compatible map fixtures.

### D2-02 CSS and Render Contracts
Priority: Critical
Phase: P0
Estimate (target/reality): 5h / 8h
Depends On: A2-01, B2-01
Legacy refs: D-01, D-02

- [ ] Build CSS variables/grid/animation architecture.
- [ ] Define renderable and visual-state contract at ECS/DOM boundary.

### D2-03 Render Collect and DOM Batcher
Priority: Critical
Phase: P1
Estimate (target/reality): 6h / 12h
Depends On: D2-02, B2-03
Legacy refs: D-03, D-04, D-05

- [ ] Build intent collect system and one-pass DOM commit.
- [ ] Restrict runtime writes to transform/opacity/class toggles.

### D2-04 Sprite Pooling and Reuse
Priority: High
Phase: P2
Estimate (target/reality): 4h / 8h
Depends On: D2-03
Legacy refs: D-08

- [ ] Pre-allocate high-churn sprite pools.
- [ ] Use offscreen transform hiding and exhaustion strategy.

### D2-05 HUD and Overlay Screens
Priority: Critical
Phase: P1
Estimate (target/reality): 5h / 10h
Depends On: D2-02, C2-03
Legacy refs: D-06, D-07

- [ ] Implement HUD textContent updates and throttled aria-live.
- [ ] Implement start/pause/level-complete/game-over/victory overlays.
- [ ] Ensure keyboard-first focus transfer and command routing.

### D2-06 Visual Asset Production and Visual Manifest
Priority: High
Phase: P3
Estimate (target/reality): 4h / 10h
Depends On: D2-03, D2-05, A2-04
Legacy refs: D-09, D-10, D-11

- [ ] Produce gameplay/UI visual assets and variants.
- [ ] Finalize visual manifest and fallback mapping behavior.
- [ ] Verify layer/will-change policy evidence readiness.

### D2-07 Map-State Mechanics and Drop Resolver
Priority: High
Phase: P2
Estimate (target/reality): 2h / 6h
Depends On: D2-01, B2-05
Legacy refs: B-07 (partial), B-09 (partial)

- [ ] Consume explosion aftermath intents and mutate destructible map cell states.
- [ ] Resolve deterministic drop placement on cleared cells.
- [ ] Maintain pellet remaining index resource exposed to progression systems.
- [ ] Emit stable map-state change events for render and progression consumers.

Track D subtotal: 34h target / 70h reality-informed

## Cross-Track Contract Gates

### Gate G0 - Core Engine Slice Freeze (end of P0)
Owners: A, B, C, D

- [ ] A2-03 assembly contract finalized.
- [ ] B2-00, C2-00, and D2-00 runtime core contracts finalized.
- [ ] Bootstrap integration handshake documented.

### Gate G1 - Input Snapshot Contract Freeze (end of P0)
Owners: B, A

- [ ] Input snapshot shape and fixed-step read point finalized.

### Gate G2 - Map and Cell Semantics Freeze (early P1)
Owners: D, B, C, A

- [ ] Tile meanings, occupancy rules, and spawn markers finalized.

### Gate G3 - Gameplay Event Contract Freeze (early P2)
Owners: C, B, D, A

- [ ] Event IDs and payload schemas finalized with frame/order fields.

### Gate G3b - Map-State Mechanics Contract Freeze (mid P2)
Owners: D, B, C, A

- [ ] Explosion aftermath intent contract frozen.
- [ ] Drop-resolution rule contract frozen.
- [ ] Pellet-index resource contract frozen.

### Gate G4 - Pre-Release Audit Readiness (P3)
Owners: A with B/C/D

- [ ] Automated audit assertions green for runnable categories.
- [ ] Manual evidence artifacts attached for required audit IDs.

## Comprehensive Legacy Ticket Mapping (v1 -> v2)

### Track A legacy mapping

| Legacy Ticket | v2 Mapping |
|---|---|
| A-01 | A2-01 |
| A-02 | A2-02 |
| A-03 | A2-03, C2-00 |
| A-04 | A2-03, B2-00, D2-00 |
| A-05 | D2-01 |
| A-06 | A2-05, A2-06 |
| A-07 | A2-07 |
| A-08 | A2-08 |
| A-09 | A2-04, A2-09, C2-06, D2-06 |
| A-10 | A2-06 |
| A-11 | A2-09 |

### Track B legacy mapping

| Legacy Ticket | v2 Mapping |
|---|---|
| B-01 | B2-01 |
| B-02 | B2-02 |
| B-03 | B2-03 |
| B-04 | B2-04 |
| B-05 | C2-02 |
| B-06 | C2-03, D2-05 |
| B-07 | B2-05, D2-07 |
| B-08 | C2-01 |
| B-09 | B2-06, D2-07 |
| B-10 | C2-04 |

### Track C legacy mapping

| Legacy Ticket | v2 Mapping |
|---|---|
| C-01 | C2-05 |
| C-02 | C2-05 |
| C-03 | C2-06 |
| C-04 | C2-06 |
| C-05 | C2-06, A2-04 |
| C-06 | C2-06 |
| C-07 | C2-06 |

### Track D legacy mapping

| Legacy Ticket | v2 Mapping |
|---|---|
| D-01 | D2-02 |
| D-02 | D2-02 |
| D-03 | D2-03 |
| D-04 | D2-03 |
| D-05 | D2-03 |
| D-06 | D2-05 |
| D-07 | D2-05 |
| D-08 | D2-04 |
| D-09 | D2-06 |
| D-10 | D2-06 |
| D-11 | D2-06, A2-04 |

### Cross-track legacy mechanics migrations

| Legacy Ticket | New Owner + v2 Mapping |
|---|---|
| B-07 (partial) | D via D2-07 |
| B-09 (partial) | D via D2-07 |

## Execution Notes

1. Yes, this v2 explicitly integrates the previous overload findings and your requested split.
2. A remains the quality bottleneck by design, but A2-03 was split so A focuses on assembly rather than owning all runtime internals.
3. B is focused on mathematically dense simulation mechanics plus fixed-step kernel ownership.
4. C owns AI/game-flow/audio and deterministic runtime resource ownership.
5. D owns map/world/render/UI and now includes map-state mechanics plus lifecycle timing core.

## Final Balance Verification

### Workload verification (target)

| Track | Target Subtotal |
|---|---:|
| A | 35h |
| B | 26h |
| C | 29h |
| D | 34h |

Interpretation:
1. A is intentionally higher on governance/testing risk.
2. B/C/D are within an 8h spread and all carry gameplay mechanics ownership.

### ECS contact verification

| Track | ECS/Engine Contact Tickets |
|---|---|
| A | A2-02, A2-03 |
| B | B2-00, B2-01, B2-02 |
| C | C2-00, C2-04 |
| D | D2-00, D2-02, D2-03 |

### Game mechanics verification

| Track | Mechanics Contact Tickets |
|---|---|
| A | A2-06, A2-07, A2-08 (verification ownership) |
| B | B2-03, B2-04, B2-05, B2-06 |
| C | C2-01, C2-02, C2-03, C2-04 |
| D | D2-01, D2-05, D2-07 |

Conclusion:
1. All four tracks now touch ECS/engine responsibilities.
2. All four tracks now touch game mechanics directly (A through authoritative test ownership, B/C/D through implementation ownership).
