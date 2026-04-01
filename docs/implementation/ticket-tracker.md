# 📊 Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation/track-*.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update the status symbol whenever work starts, pauses, or completes.
2. Keep each ticket in the line format: status + ticket ID + ticket description + dependency fields + branch.
3. Do not set `[x]` unless the ticket verification gate in the relevant track file is satisfied.
4. Keep `Depends on` and `Blocked by` synchronized with the owning track file when ticket definitions change.
5. Keep branch naming consistent per ticket line.

## 🗂️ Status Legend

- `[ ]` = `Not Started`
- `[-]` = `In Progress`
- `[x]` = `Done`

## 🚦 Execution Policy (Phase-First)

1. Execute by phase across all tracks: `P0 → P1 → P2 → P3`.
2. Inside a phase, claim tickets whose dependencies are already complete.
3. If a higher phase ticket is needed early, record the reason in the ticket line text.

## 📈 Summary Snapshot

- Total tickets: `39`
- Done: `0`
- In Progress: `2`
- Not Started: `37`

## ⚙️ Track A (Dev 1)

- [-] **A-01** P0 - Project Scaffolding & Tooling (Depends on: None) | Blocked by: Repo boot + CI policy gates | Branch `ekaramet/A-01`
- [-] **A-02** P0 - ECS Architecture Core (World, Entity, Query) (Depends on: A-01) | Blocked by: Deterministic ECS runtime backbone | Branch `ekaramet/A-02`
- [ ] **A-03** P0 - Game Loop & Main Initialization (Depends on: A-02, D-01) | Blocked by: rAF loop, pause semantics, instrumentation | Branch `ekaramet/A-03`
- [ ] **A-04** P1 - Unit Tests - ECS Core & Resources (Depends on: A-02, A-03, D-01, D-03) | Blocked by: Foundational regression safety | Branch `ekaramet/A-04`
- [ ] **A-05** P1 - Integration Tests - Multi-System & Adapter Boundaries (Depends on: A-03, B-03, C-02, C-04, C-05, D-08) | Blocked by: Cross-system and adapter correctness | Branch `ekaramet/A-05`
- [ ] **A-06** P1 - E2E Audit Tests (Playwright) (Depends on: A-03, B-04, C-04, C-05) | Blocked by: Automated acceptance coverage | Branch `ekaramet/A-06`
- [ ] **A-07** P2 - CI, Schema Validation & Asset Gates (Depends on: A-01, D-03) | Blocked by: Merge safety and schema governance | Branch `ekaramet/A-07`
- [ ] **A-08** P2 - Unit Tests - All Gameplay Systems (Depends on: B-01 through B-09, C-01 through C-05, C-07) | Blocked by: Gameplay/system regression coverage | Branch `ekaramet/A-08`
- [ ] **A-09** P3 - Evidence Aggregation & Final QA Polish (Depends on: A-05, A-06, A-07, A-08, C-09, D-11) | Blocked by: Manual evidence + release sign-off | Branch `ekaramet/A-09`

## 🎮 Track B (Dev 2)

- [ ] **B-01** P0 - ECS Components (All Data Definitions) (Depends on: A-02) | Blocked by: Shared gameplay data contracts | Branch `ekaramet/B-01`
- [ ] **B-02** P1 - Input Adapter & Input System (Depends on: B-01, A-03, D-01) | Blocked by: Keyboard and hold-to-move behavior | Branch `ekaramet/B-02`
- [ ] **B-03** P1 - Movement & Grid Collision System (Depends on: B-01, B-02, D-03) | Blocked by: Core player movement loop | Branch `ekaramet/B-03`
- [ ] **B-04** P1 - Entity Collision System (Depends on: B-01, B-03, D-03) | Blocked by: Player/ghost/pellet interaction | Branch `ekaramet/B-04`
- [ ] **B-05** P2 - Core Gameplay Event Surface (Depends on: B-04, D-01) | Blocked by: Deterministic base event emission | Branch `ekaramet/B-05`
- [ ] **B-06** P2 - Bomb & Explosion Systems (Depends on: B-03, B-04, D-01, D-03) | Blocked by: Bomberman mechanics + chain rules | Branch `ekaramet/B-06`
- [ ] **B-07** P2 - Power-Up System (Depends on: B-04, B-06, D-01) | Blocked by: Progression and timed states | Branch `ekaramet/B-07`
- [ ] **B-08** P2 - Ghost AI System (Depends on: B-03, B-04, B-07, D-01, D-03, C-03) | Blocked by: Enemy behavior and difficulty curve | Branch `ekaramet/B-08`
- [ ] **B-09** P2 - Cross-System Gameplay Event Hooks (Depends on: C-01, C-02, B-05, B-06, B-08, D-01) | Blocked by: Final deterministic integration events | Branch `ekaramet/B-09`

## 🎧 Track C (Dev 3)

- [ ] **C-01** P1 - Scoring System (Depends on: B-04, D-01) | Blocked by: HUD-critical score metric | Branch `ekaramet/C-01`
- [ ] **C-02** P1 - Timer & Life Systems (Depends on: D-01, B-04) | Blocked by: HUD-critical timer/lives metrics | Branch `ekaramet/C-02`
- [ ] **C-03** P1 - Spawn System (Depends on: D-01, D-03) | Blocked by: Ghost release and respawn timing | Branch `ekaramet/C-03`
- [ ] **C-04** P1 - Pause & Level Progression Systems (Depends on: D-01, D-03, C-02, A-03) | Blocked by: Pause flow and level/game transitions | Branch `ekaramet/C-04`
- [ ] **C-05** P1 - HUD Adapter & Screen Overlays (Depends on: D-05, C-02, C-04) | Blocked by: Visible metrics and keyboard UX | Branch `ekaramet/C-05`
- [ ] **C-06** P2 - Audio Adapter Implementation (Depends on: A-01, D-01) | Blocked by: Runtime audio boundary + fallback | Branch `ekaramet/C-06`
- [ ] **C-07** P2 - Audio Cue Mapping & Runtime Integration (Depends on: C-06, B-09) | Blocked by: Event-driven audio feedback loop | Branch `ekaramet/C-07`
- [ ] **C-08** P3 - Sound Effects & Music Production (Depends on: C-06) | Blocked by: Gameplay feel and production quality | Branch `ekaramet/C-08`
- [ ] **C-09** P3 - Audio Preloading & Performance (Depends on: C-06, C-08) | Blocked by: Async decode and startup responsiveness | Branch `ekaramet/C-09`
- [ ] **C-10** P3 - Audio Manifest Schema & Validation (Depends on: C-08, A-07) | Blocked by: CI audio asset governance | Branch `ekaramet/C-10`

## 🎨 Track D (Dev 4)

- [ ] **D-01** P0 - Resources (Time, Constants, RNG, Events, Game Status) (Depends on: A-02) | Blocked by: Determinism, clock/pause correctness, event ordering | Branch `ekaramet/D-01`
- [ ] **D-02** P0 - Map Schema & JSON Blueprints (Depends on: D-01) | Blocked by: Level data contract and schema validation | Branch `ekaramet/D-02`
- [ ] **D-03** P0 - Map Loading Resource (Depends on: D-01, D-02) | Blocked by: Level loading and restart determinism | Branch `ekaramet/D-03`
- [ ] **D-04** P0 - Render Data Contracts (Depends on: A-02, B-01) | Blocked by: ECS/DOM boundary safety | Branch `ekaramet/D-04`
- [ ] **D-05** P1 - CSS Layout & Grid Structure (Depends on: A-01) | Blocked by: Layout baseline and layer policy | Branch `ekaramet/D-05`
- [ ] **D-06** P1 - Renderer Adapter & Board Generation (Depends on: D-04, D-05, D-03) | Blocked by: Safe DOM board rendering | Branch `ekaramet/D-06`
- [ ] **D-07** P1 - Render Collect System (Depends on: D-04, B-03) | Blocked by: Interpolation and intent ordering | Branch `ekaramet/D-07`
- [ ] **D-08** P1 - Render DOM System (The Batcher) (Depends on: D-06, D-07) | Blocked by: Compositor-safe commit pipeline | Branch `ekaramet/D-08`
- [ ] **D-09** P2 - Sprite Pool Adapter (Depends on: D-06, D-08) | Blocked by: Memory reuse and allocation stability | Branch `ekaramet/D-09`
- [ ] **D-10** P3 - Visual Asset Production - Gameplay Sprites (Depends on: D-06, D-08) | Blocked by: Gameplay readability + SVG quality | Branch `ekaramet/D-10`
- [ ] **D-11** P3 - Visual Assets (UI & Screens) + Visual Manifest & Validation (Depends on: C-05, D-10, A-07) | Blocked by: UI visual polish, manifest contracts, fallbacks | Branch `ekaramet/D-11`

## 🔗 Cross-Document References

- Ticket definitions and verification gates: `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-c.md`, `docs/implementation/track-d.md`
- Track summary and milestones: `docs/implementation/implementation-plan.md`
- Coverage mapping and audit status: `audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`