# 🎧 Track C v2 — AI, Game Flow & Audio (Dev 3)

📎 Source plan: `docs/implementation/tickets_v2.md`

> **Scope**: Deterministic runtime resources, ghost AI/spawn behavior, scoring/timer/life logic, pause/progression flow, gameplay event hooks, and full audio integration/production.
> **Estimate**: Target ~29 hours (reality-informed ~62 hours)
> **Execution model**: Establish runtime contracts first, then implement game-flow logic and event-driven audio coupling.

## Phase Order (v2)

- **P0 Foundation**: `C2-00`
- **P1 Playable MVP**: `C2-02` to `C2-03`
- **P2 Feature Complete**: `C2-01`, `C2-04`, `C2-05`
- **P3 Polish & Validation**: `C2-06`

#### C2-00: Deterministic Runtime Resources
**Priority**: 🔴 Critical
**Estimate**: 2h target (4h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-02`
**Impacts**: Shared deterministic resources consumed by all systems
**Deliverables**: `src/ecs/resources/constants.js`, `src/ecs/resources/rng.js`, `src/ecs/resources/event-queue.js`, `src/ecs/resources/game-status.js`

- [ ] Implement constants, seeded RNG, deterministic event queue, and game-status resource modules.
- [ ] Enforce deterministic ordering and reproducibility semantics.
- [ ] Verification gate: deterministic seed and queue-order tests pass.

#### C2-01: Ghost AI & Spawn System
**Priority**: 🔴 Critical
**Estimate**: 6h target (14h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `B2-03`, `B2-04`, `C2-00`
**Impacts**: Enemy intelligence, difficulty curve, and deterministic ghost lifecycle
**Deliverables**: `src/ecs/systems/ghost-ai-system.js`, `src/ecs/systems/spawn-system.js`

- [ ] Implement Blinky/Pinky/Inky/Clyde targeting strategies.
- [ ] Implement ghost state machine (normal, stunned, dead) and movement constraints.
- [ ] Implement staggered spawn and death-return respawn timings.
- [ ] Verification gate: seeded ghost trace determinism tests pass.

#### C2-02: Scoring, Timer & Lives Systems
**Priority**: 🔴 Critical
**Estimate**: 4h target (10h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `B2-04`, `C2-00`
**Impacts**: Core win/lose pacing and HUD-critical gameplay metrics
**Deliverables**: `src/ecs/systems/scoring-system.js`, `src/ecs/systems/timer-system.js`, `src/ecs/systems/life-system.js`

- [ ] Implement canonical score rules and combo multipliers.
- [ ] Implement level countdown and timeout game-over behavior.
- [ ] Implement lives decrement and respawn behavior.
- [ ] Verification gate: scoring/timer/life value tests match requirements.

#### C2-03: Pause & Level Progression
**Priority**: 🔴 Critical
**Estimate**: 4h target (8h reality-informed)
**Phase**: P1 Playable MVP
**Depends On**: `C2-00`, `C2-02`, `D2-00`, `D2-05`
**Impacts**: Game state transitions and pause/resume/restart correctness
**Deliverables**: `src/ecs/systems/pause-system.js`, `src/ecs/systems/level-progress-system.js`, `src/game/level-loader.js`

- [ ] Implement pause freeze/resume/restart semantics.
- [ ] Implement level-complete progression, victory, and game-over transitions.
- [ ] Keep transitions deterministic and keyboard-first compatible with screen flows.
- [ ] Verification gate: pause and progression integration tests pass.

#### C2-04: Gameplay Event Hooks
**Priority**: 🟡 High
**Estimate**: 3h target (8h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `B2-05`, `C2-02`, `C2-03`
**Impacts**: Stable cross-system integration surface for audio/render consumers
**Deliverables**: `src/game/events/event-types.js`, `src/game/events/event-contracts.js`, `src/game/events/event-emitters.js`

- [ ] Emit deterministic gameplay events with frame and order fields.
- [ ] Define stable payload contracts consumed by adapters and UI logic.
- [ ] Verification gate: event schema and ordering checks pass across seeded runs.

#### C2-05: Audio Runtime Integration
**Priority**: 🔴 Critical
**Estimate**: 5h target (8h reality-informed)
**Phase**: P2 Feature Complete
**Depends On**: `C2-04`
**Impacts**: Event-driven gameplay feedback and state-aware audio behavior
**Deliverables**: `src/adapters/io/audio-adapter.js`, `src/game/audio/audio-cue-map.js`, `src/game/audio/audio-events-bridge.js`

- [ ] Implement audio adapter with cue playback and overlap-safe SFX behavior.
- [ ] Map gameplay events to audio cues with deterministic consumption.
- [ ] Handle missing asset fallbacks without loop failure.
- [ ] Verification gate: event-to-audio integration tests pass.

#### C2-06: Audio Production, Preload & Manifest
**Priority**: 🟡 High
**Estimate**: 5h target (10h reality-informed)
**Phase**: P3 Polish & Validation
**Depends On**: `C2-05`, `A2-04`
**Impacts**: Asset completeness, startup performance, and schema-compliant audio governance
**Deliverables**: `assets/generated/sfx/sfx-bomb-place.mp3`, `assets/generated/sfx/sfx-bomb-explode.mp3`, `assets/generated/sfx/sfx-pellet-collect.mp3`, `assets/generated/sfx/sfx-powerup-collect.mp3`, `assets/generated/ui/ui-confirm.mp3`, `assets/generated/ui/ui-pause-open.mp3`, `assets/generated/music/music-level-01-loop.mp3`, `assets/manifests/audio-manifest.json`, `docs/schemas/audio-manifest.schema.json`

- [ ] Produce gameplay/UI/music audio assets and metadata.
- [ ] Implement decode/preload strategy and async performance hooks.
- [ ] Finalize audio manifest/schema readiness and fallback metadata rules.
- [ ] Verification gate: manifest validation passes and decode timing evidence is captured.

---
