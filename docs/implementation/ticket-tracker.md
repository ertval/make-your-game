# 📊 Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation/track-*-v3.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update `Status` whenever work starts, pauses, blocks, or completes.
2. Add the PR link and evidence link when a ticket moves to `Done`.
3. Do not set `Done` unless the ticket verification gate in the relevant v3 track file is satisfied.
4. Record ownership or handoff changes in `Evidence / Notes` when needed.
5. Keep `Depends On` and `Blocks` synchronized with the owning track file when ticket definitions change.

## 🗂️ Status Legend

- ⬜ `Not Started`
- 🟨 `In Progress`
- ⛔ `Blocked`
- ✅ `Done`

## 🚦 Execution Policy (Phase-First)

1. Execute by phase across all tracks: `P0 → P1 → P2 → P3`.
2. Inside a phase, claim tickets whose dependencies are already complete.
3. If a higher phase ticket is needed early, record why in `Evidence / Notes`.

## 📈 Summary Snapshot

- Total tickets: `39`
- Done: `0`
- In Progress: `2`
- Blocked: `0`
- Not Started: `37`

## ⚙️ Track A (Dev 1)

| Status | ID | Phase | Ticket | Depends On | Blocks | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|
| In Progress | A-01 | P0 | Project Scaffolding & Tooling | None | Repo boot + CI policy gates | - | Branch `ekaramet/A-01`; local policy: `npm run policy -- --pr-body-file docs/pr-messages/a-01-project-scaffolding-pr.md`; quality: `npm run policy:quality` |
| In Progress | A-02 | P0 | ECS Architecture Core (World, Entity, Query) | A-01 | Deterministic ECS runtime backbone | - | Branch `ekaramet/A-02`; local policy: `npm run policy -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md`; unit gate: `npm run test:unit` |
| Not Started | A-03 | P0 | Game Loop & Main Initialization | A-02, D-01 | rAF loop, pause semantics, instrumentation | - | - |
| Not Started | A-04 | P1 | Unit Tests — ECS Core & Resources | A-02, A-03, D-01, D-03 | Foundational regression safety | - | - |
| Not Started | A-05 | P1 | Integration Tests — Multi-System & Adapter Boundaries | A-03, B-03, C-02, C-04, C-05, D-08 | Cross-system and adapter correctness | - | - |
| Not Started | A-06 | P1 | E2E Audit Tests (Playwright) | A-03, B-04, C-04, C-05 | Automated acceptance coverage | - | - |
| Not Started | A-07 | P2 | CI, Schema Validation & Asset Gates | A-01, D-03 | Merge safety and schema governance | - | - |
| Not Started | A-08 | P2 | Unit Tests — All Gameplay Systems | B-01 through B-09, C-01 through C-05, C-07 | Gameplay/system regression coverage | - | - |
| Not Started | A-09 | P3 | Evidence Aggregation & Final QA Polish | A-05, A-06, A-07, A-08, C-09, D-11 | Manual evidence + release sign-off | - | - |

## 🎮 Track B (Dev 2)

| Status | ID | Phase | Ticket | Depends On | Blocks | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|
| Not Started | B-01 | P0 | ECS Components (All Data Definitions) | A-02 | Shared gameplay data contracts | - | - |
| Not Started | B-02 | P1 | Input Adapter & Input System | B-01, A-03, D-01 | Keyboard and hold-to-move behavior | - | - |
| Not Started | B-03 | P1 | Movement & Grid Collision System | B-01, B-02, D-03 | Core player movement loop | - | - |
| Not Started | B-04 | P1 | Entity Collision System | B-01, B-03, D-03 | Player/ghost/pellet interaction | - | - |
| Not Started | B-05 | P2 | Core Gameplay Event Surface | B-04, D-01 | Deterministic base event emission | - | - |
| Not Started | B-06 | P2 | Bomb & Explosion Systems | B-03, B-04, D-01, D-03 | Bomberman mechanics + chain rules | - | - |
| Not Started | B-07 | P2 | Power-Up System | B-04, B-06, D-01 | Progression and timed states | - | - |
| Not Started | B-08 | P2 | Ghost AI System | B-03, B-04, B-07, D-01, D-03, C-03 | Enemy behavior and difficulty curve | - | - |
| Not Started | B-09 | P2 | Cross-System Gameplay Event Hooks | C-01, C-02, B-05, B-06, B-08, D-01 | Final deterministic integration events | - | - |

## 🎧 Track C (Dev 3)

| Status | ID | Phase | Ticket | Depends On | Blocks | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|
| Not Started | C-01 | P1 | Scoring System | B-04, D-01 | HUD-critical score metric | - | - |
| Not Started | C-02 | P1 | Timer & Life Systems | D-01, B-04 | HUD-critical timer/lives metrics | - | - |
| Not Started | C-03 | P1 | Spawn System | D-01, D-03 | Ghost release and respawn timing | - | - |
| Not Started | C-04 | P1 | Pause & Level Progression Systems | D-01, D-03, C-02, A-03 | Pause flow and level/game transitions | - | - |
| Not Started | C-05 | P1 | HUD Adapter & Screen Overlays | D-05, C-02, C-04 | Visible metrics and keyboard UX | - | - |
| Not Started | C-06 | P2 | Audio Adapter Implementation | A-01, D-01 | Runtime audio boundary + fallback | - | - |
| Not Started | C-07 | P2 | Audio Cue Mapping & Runtime Integration | C-06, B-09 | Event-driven audio feedback loop | - | - |
| Not Started | C-08 | P3 | Sound Effects & Music Production | C-06 | Gameplay feel and production quality | - | - |
| Not Started | C-09 | P3 | Audio Preloading & Performance | C-06, C-08 | Async decode and startup responsiveness | - | - |
| Not Started | C-10 | P3 | Audio Manifest Schema & Validation | C-08, A-07 | CI audio asset governance | - | - |

## 🎨 Track D (Dev 4)

| Status | ID | Phase | Ticket | Depends On | Blocks | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|
| Not Started | D-01 | P0 | Resources (Time, Constants, RNG, Events, Game Status) | A-02 | Determinism, clock/pause correctness, event ordering | - | - |
| Not Started | D-02 | P0 | Map Schema & JSON Blueprints | D-01 | Level data contract and schema validation | - | - |
| Not Started | D-03 | P0 | Map Loading Resource | D-01, D-02 | Level loading and restart determinism | - | - |
| Not Started | D-04 | P0 | Render Data Contracts | A-02, B-01 | ECS/DOM boundary safety | - | - |
| Not Started | D-05 | P1 | CSS Layout & Grid Structure | A-01 | Layout baseline and layer policy | - | - |
| Not Started | D-06 | P1 | Renderer Adapter & Board Generation | D-04, D-05, D-03 | Safe DOM board rendering | - | - |
| Not Started | D-07 | P1 | Render Collect System | D-04, B-03 | Interpolation and intent ordering | - | - |
| Not Started | D-08 | P1 | Render DOM System (The Batcher) | D-06, D-07 | Compositor-safe commit pipeline | - | - |
| Not Started | D-09 | P2 | Sprite Pool Adapter | D-06, D-08 | Memory reuse and allocation stability | - | - |
| Not Started | D-10 | P3 | Visual Asset Production — Gameplay Sprites | D-06, D-08 | Gameplay readability + SVG quality | - | - |
| Not Started | D-11 | P3 | Visual Assets (UI & Screens) + Visual Manifest & Validation | C-05, D-10, A-07 | UI visual polish, manifest contracts, fallbacks | - | - |

## 🔗 Cross-Document References

- Ticket definitions and verification gates: `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-c.md`, `docs/implementation/track-d.md`
- Track summary and milestones: `docs/implementation/implementation-plan.md`
- Coverage mapping and audit status: `audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`