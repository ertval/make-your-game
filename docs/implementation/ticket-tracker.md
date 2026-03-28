# 📊 Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation/track-*.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update `Status` whenever work starts, pauses, blocks, or completes.
2. Add the PR link and evidence link when a ticket moves to `Done`.
3. Do not set `Done` unless the ticket verification gate in the relevant track file is satisfied (`track-a.md`, `track-b.md`, `track-c.md`, or `track-d.md`).
4. Keep owner changes explicit in the `Owner` column.
5. Keep `Depends On` and `Primary Impacts` synchronized with the owning track file when ticket definitions change.

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
- In Progress: `0`
- Blocked: `0`
- Not Started: `39`

## ⚙️ Track A (Dev 1)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-01 | P0 | Project Scaffolding & Tooling | Dev 1 | Critical | None | Repo boot + CI policy gates | Not Started | - | - |
| A-02 | P0 | ECS Architecture Core (World, Entity, Query) | Dev 1 | Critical | A-01 | Deterministic ECS runtime backbone | Not Started | - | - |
| A-03 | P0 | Resources (Time, Constants, RNG, Events, Game Status) | Dev 1 | Critical | A-01, A-02 | Clock/input determinism contracts | Not Started | - | - |
| A-04 | P0 | Game Loop & Main Initialization | Dev 1 | Critical | A-02, A-03 | rAF loop, pause semantics, instrumentation | Not Started | - | - |
| A-05 | P0 | Map Loading Resource | Dev 1 | Critical | A-01, A-02, A-03 | Level loading, restart determinism | Not Started | - | - |
| A-06 | P1 | Unit Tests — ECS Core & Resources | Dev 1 | Critical | A-02, A-03, A-04, A-05 | Foundational regression safety | Not Started | - | - |
| A-07 | P1 | Integration Tests — Multi-System & Adapter Boundaries | Dev 1 | Medium | A-04, A-05, B-03, B-05, B-06, D-05, D-06, D-07 | Cross-system and adapter correctness | Not Started | - | - |
| A-08 | P1 | E2E Audit Tests (Playwright) | Dev 1 | Critical | A-04, A-05, B-06, D-07 | Automated acceptance coverage | Not Started | - | - |
| A-09 | P2 | CI, Schema Validation & Asset Gates | Dev 1 | Medium | A-01, A-05 | Merge safety and schema governance | Not Started | - | - |
| A-10 | P2 | Unit Tests — All Gameplay Systems | Dev 1 | Critical | B-01 through B-10 | Gameplay/system regression coverage | Not Started | - | - |
| A-11 | P3 | Evidence Aggregation & Final QA Polish | Dev 1 | Medium | A-07, A-08, A-09, A-10, C-04, D-11 | Manual evidence + release sign-off | Not Started | - | - |

## 🎮 Track B (Dev 2)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-01 | P0 | ECS Components (All Data Definitions) | Dev 2 | Critical | A-02, A-03 | Shared gameplay data contracts | Not Started | - | - |
| B-02 | P1 | Input Adapter & Input System | Dev 2 | Critical | B-01, A-04 | Keyboard and hold-to-move behavior | Not Started | - | - |
| B-03 | P1 | Movement & Grid Collision System | Dev 2 | Critical | B-01, B-02, A-05 | Core player movement loop | Not Started | - | - |
| B-04 | P1 | Entity Collision System | Dev 2 | Critical | B-01, B-03, A-05 | Player/ghost/pellet interaction | Not Started | - | - |
| B-05 | P1 | Scoring, Timer & Life Systems | Dev 2 | Critical | B-04, A-03, A-05 | HUD-critical metrics and failure states | Not Started | - | - |
| B-06 | P1 | Pause & Level Progression Systems | Dev 2 | Critical | B-05, A-04, A-05 | Pause menu and game-state flow | Not Started | - | - |
| B-07 | P2 | Bomb & Explosion Systems | Dev 2 | Critical | B-03, B-04, A-03, A-05 | Bomberman mechanics + chain rules | Not Started | - | - |
| B-08 | P2 | Ghost AI System & Spawning | Dev 2 | Critical | B-03, B-04, A-03, A-05 | Enemy behavior and difficulty curve | Not Started | - | - |
| B-09 | P2 | Power-Up System | Dev 2 | Medium | B-04, B-05, B-07, B-08 | Progression and timed states | Not Started | - | - |
| B-10 | P2 | Gameplay Event Hooks | Dev 2 | Medium | B-07, B-08, B-09, A-03 | Deterministic integration events | Not Started | - | - |

## 🎧 Track C (Dev 3)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-01 | P1 | Audio Adapter Implementation | Dev 3 | Critical | A-01, A-03 | Runtime audio boundary + fallback | Not Started | - | - |
| C-02 | P2 | Audio Cue Mapping & Runtime Integration | Dev 3 | Critical | C-01, B-10 | Gameplay event-to-audio coupling | Not Started | - | - |
| C-03 | P2 | Gameplay Sound Effects Production | Dev 3 | Critical | C-01 | Core gameplay sound identity | Not Started | - | - |
| C-04 | P2 | Audio Preloading & Performance | Dev 3 | Medium | C-01, C-03 | Async decode and startup performance | Not Started | - | - |
| C-05 | P3 | Audio Manifest Schema & Validation | Dev 3 | Critical | C-03, C-06, C-07, A-09 | CI asset schema integrity | Not Started | - | - |
| C-06 | P3 | UI Sound Effects Production | Dev 3 | Medium | C-01, C-02 | Menu and overlay feedback polish | Not Started | - | - |
| C-07 | P3 | Music Track Production | Dev 3 | Medium | C-01 | Ambient polish and final mix quality | Not Started | - | - |

## 🎨 Track D (Dev 4)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-01 | P0 | Render Data Contracts | Dev 4 | Critical | A-02, B-01 | ECS/DOM boundary contract | Not Started | - | - |
| D-02 | P0 | CSS Layout & Grid Structure | Dev 4 | Critical | A-01 | Base visual system and layer policy | Not Started | - | - |
| D-03 | P0 | Renderer Adapter & Board Generation | Dev 4 | Critical | D-01, D-02, A-05 | Safe DOM board rendering | Not Started | - | - |
| D-04 | P1 | Render Collect System | Dev 4 | Critical | D-01, B-03 | Interpolation and render intent ordering | Not Started | - | - |
| D-05 | P1 | Render DOM System (The Batcher) | Dev 4 | Critical | D-03, D-04 | Compositor-safe commit pipeline | Not Started | - | - |
| D-06 | P1 | HUD Adapter | Dev 4 | Critical | D-02, B-05 | Score/timer/lives visibility | Not Started | - | - |
| D-07 | P1 | Screen Overlays Adapter | Dev 4 | Critical | D-02, B-06 | Pause/start/restart/victory UX | Not Started | - | - |
| D-08 | P2 | Sprite Pool Adapter | Dev 4 | Critical | D-03, D-05 | Memory reuse and allocation stability | Not Started | - | - |
| D-09 | P2 | Visual Asset Production — Gameplay Sprites | Dev 4 | Critical | D-03, D-05 | Gameplay readability + SVG quality | Not Started | - | - |
| D-10 | P3 | Visual Asset Production — UI & Screens | Dev 4 | Medium | D-06, D-07 | UI polish and accessibility clarity | Not Started | - | - |
| D-11 | P3 | Visual Manifest & Asset Validation | Dev 4 | Medium | D-09, D-10, A-09 | Manifest governance and fallbacks | Not Started | - | - |

## 🔗 Cross-Document References

- Ticket definitions and verification gates: `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-c.md`, `docs/implementation/track-d.md`
- Track summary and milestones: `docs/implementation/implementation-plan.md`
- Coverage mapping and audit status: `audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`