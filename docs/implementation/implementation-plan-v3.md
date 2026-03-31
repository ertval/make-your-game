# 📋 Ms. Ghostman — ECS Implementation Plan v3

> **Architecture**: Entity-Component-System (ECS)  
> **Stack**: Vanilla JS (ES2026) · HTML · CSS Grid · DOM API only  
> **Tooling**: Biome (lint + format) · Vite (dev server + bundler) · Vitest (unit tests) · Playwright (e2e)  
> **Target**: 60 FPS via `requestAnimationFrame` · No canvas · No frameworks

---

## Table of Contents

1. [Architecture Overview](#section-1-architecture-overview)
2. [Directory Structure](#section-2-directory-structure)
3. [Workflow Tracks (Phase-First MVP Order)](#section-3-workflow-tracks-balanced-workload)
    - [Track A — World, Game Flow, Scaffolding, Testing & QA (Dev 1)](track-a-v3.md)
    - [Track B — Components, Input & Core Movement (Dev 2)](track-b-v3.md)
    - [Track C — Ghost AI, Scoring, Audio & Game Events (Dev 3)](track-c-v3.md)
    - [Track D — Resources, Map, Bombs, Rendering & Visuals (Dev 4)](track-d-v3.md)
4. [Integration Milestones](#section-4-integration-milestones)
5. [Shared Contracts & Interfaces](#section-5-shared-contracts--interfaces)
6. [Testing Strategy](#section-6-testing-strategy)
7. [Performance Budget & Acceptance Criteria](#section-7-performance-budget--acceptance-criteria)
8. [Done Criteria](#section-8-done-criteria)
9. [Asset Creation & Pipeline](#section-9-asset-creation--pipeline)
10. [Maintenance Notes](#section-10-maintenance-notes)

---

## ⚠️ V3 Change Summary (from V1)

### What Changed

| Area | V1 | V3 |
|---|---|---|
| **Track A scope** | World + Resources + Game + Map + all testing/CI | World + Game folders only + all testing/CI (**resources and map removed**) |
| **Track B scope** | All components + input + movement + collision + bombs + ghost AI + scoring + timer + lives + pause + progression + power-ups + events | Components + Input + Movement + Collision **only** (slimmed down) |
| **Track C scope** | Audio only (7 tickets) | Audio + Ghost AI/Spawning + Scoring/Timer/Lives + Gameplay Events (10 tickets) |
| **Track D scope** | Rendering + visuals only (11 tickets) | Rendering + visuals + **Resources** + Map Loading + Bombs/Explosions + Power-ups + Pause/Level Progression (15 tickets) |
| **Ticket metadata** | Priority/Estimate/Phase/Depends/Impacts | + **Deliverables** (exact output files) + **Blocks** (tickets this blocks) |

### Design Rationale

1. **Track A is lighter**: Resources (`constants.js`, `clock.js`, `rng.js`, `event-queue.js`, `game-status.js`) and map loading moved to Track D. A retains `world/` and `game/` folder ownership plus all testing/QA.
2. **Track B is focused**: Only the core physics pipeline (components → input → movement → collision). No longer owns bombs, AI, scoring, pause, or power-ups.
3. **Track C gains mechanics**: Ghost AI, scoring/timer/lives, and gameplay event hooks pair naturally with audio cue mapping. Dev 3 owns the "game feel" systems.
4. **Track D gains mechanics**: Resources, map loading, bombs/explosions, power-ups, and pause/progression pair naturally with rendering and map state. Dev 4 owns the "world state" systems.
5. **Cross-track blocking is minimized**: Each track's intra-dependencies are maximized; inter-track dependencies are minimized to same-phase contracts.

---

<a id="section-1-architecture-overview"></a>
## 🏗️ 1. Architecture Overview

> Architecture detail is unchanged from V1. See `implementation-plan.md` Section 1 for the full canonical reference including ECS diagrams, frame pipeline, determinism contracts, component storage, and pause semantics.

### Source Of Truth References

1. `docs/requirements.md` + `docs/game-description.md` define project requirements and intended gameplay behavior.
2. `docs/audit.md` defines pass/fail acceptance criteria.
3. `audit-traceability-matrix.md` is the canonical requirement-to-audit-to-ticket-to-test coverage map.
4. `ticket-tracker-v3.md` tracks live execution status for Section 3 tickets.
5. `assets-pipeline.md` defines visual/audio authoring and optimization standards.

---

<a id="section-2-directory-structure"></a>
## 📁 2. Directory Structure

> Unchanged from V1. See `implementation-plan.md` Section 2.

---

<a id="section-3-workflow-tracks-balanced-workload"></a>
## 🧭 3. Workflow Tracks (Phase-First MVP Order)

The work is divided into **4 ownership tracks** (A, B, C, D), with execution **phase-first across all tracks**.

### 📌 Ticket Progress Tracking

Live ticket progress is tracked in `docs/implementation/ticket-tracker-v3.md`.

### Phase Gates (Global Execution Order)

| Phase | Goal | Primary Ticket Bands | Exit Criteria |
|---|---|---|---|
| P0 Foundation | Boot deterministic runtime and static board | A3-01..A3-03, B3-01, D3-01..D3-04 | App boots, fixed-step world ticks, resources available, static map renders |
| P1 Playable MVP | Deliver fully playable core loop | A3-04..A3-06, B3-02..B3-04, C3-01..C3-03, D3-05..D3-09 | Player can start, move, pause/continue/restart, score/lives/timer update, HUD/overlays |
| P2 Feature Complete | Add genre depth and integration hooks | A3-07..A3-08, C3-04..C3-07, D3-10..D3-13 | Bombs, ghost AI, power-ups, audio integration, sprite pools, all mechanics |
| P3 Polish & Validation | Final production quality and asset governance | A3-09, C3-08..C3-10, D3-14..D3-15 | Asset schemas, UI/audio polish, audit-ready evidence |

### Workload Summary (V3 Balanced Ownership)

| Track | Developer | Tickets | Estimated Hours | Scope |
|---|---|---:|---:|---|
| Track A | Dev 1 | 9 | ~22h | World engine, game flow, scaffolding, ALL testing (unit/integration/e2e/audit), CI, QA & evidence |
| Track B | Dev 2 | 5 | ~16h | ECS components (all data definitions), input adapter/system, movement & grid collision, entity collision, gameplay event integration surface |
| Track C | Dev 3 | 10 | ~28h | Ghost AI/spawning, scoring/timer/lives, gameplay event hooks, audio adapter, cue mapping, SFX/music production |
| Track D | Dev 4 | 15 | ~37h | Resources (time/constants/RNG/events/game-status), map loading, bombs/explosions, power-ups, pause/progression, renderer, HUD, overlays, sprite pools, CSS, visual assets |
| **Total** | **4 Devs** | **39** | **~103h** |

### Critical Path By Dev

| Dev | Critical Path Focus | Must Land Before | Depends On |
|---|---|---|---|
| Dev 1 | ECS World engine, game flow FSM, CI wiring, **ALL** testing & QA, final evidence | Any gameplay integration and final acceptance | None initially; later depends on B/C/D feature code for tests |
| Dev 2 | Components, input, movement, collision — the core physics pipeline | Everything else that reads entity/position data | Dev 1 world setup; Dev 4 resource/map contracts |
| Dev 3 | Ghost AI, scoring/timer/lives, event hooks, audio adapter, SFX/music | Audio/visual cue integration and final gameplay coverage | Dev 2 collision; Dev 4 resources and map |
| Dev 4 | Resources, map, bombs, explosions, power-ups, pause, progression, render, HUD, overlays, CSS, visuals | Visual completeness, world state correctness, paint/layer evidence | Dev 1 world setup |

#### Scheduling Rule

1. Execute tickets by global phase (`P0 → P1 → P2 → P3`) across all tracks.
2. Inside a phase, claim only tickets whose declared dependencies are complete.
3. Ownership stays by track; phase sequencing controls implementation order.
4. If a higher-phase ticket is pulled early, record the reason in `ticket-tracker-v3.md`.

---

### Track Ticket Documents

- [Track A — World, Game Flow, Scaffolding, Testing & QA (Dev 1)](track-a-v3.md)
- [Track B — Components, Input & Core Movement (Dev 2)](track-b-v3.md)
- [Track C — Ghost AI, Scoring, Audio & Game Events (Dev 3)](track-c-v3.md)
- [Track D — Resources, Map, Bombs, Rendering & Visuals (Dev 4)](track-d-v3.md)

Live execution status: [Ticket Progress Tracker V3](ticket-tracker-v3.md).

---

<a id="section-4-integration-milestones"></a>
## 🗓️ 4. Integration Milestones

### Milestone 1: Engine + Static View (Day 3)
**Requires**: A3-01, A3-02, A3-03, B3-01, D3-01, D3-02, D3-03, D3-04  
**Result**: Core ECS world schedules a tick with resources, static grid rendered via safe DOM.

### Milestone 2: Playable MVP (Day 4-5)
**Requires**: M1 + B3-02, B3-03, B3-04, C3-01, C3-02, C3-03, D3-05, D3-06, D3-07, D3-08, D3-09, A3-04, A3-05, A3-06  
**Result**: First fully playable MVP (start, move, score, lose life, pause/continue/restart, HUD/overlays).

### Milestone 3: Feature Complete (Day 6)
**Requires**: M2 + C3-04, C3-05, C3-06, C3-07, D3-10, D3-11, D3-12, D3-13, A3-07, A3-08  
**Result**: Feature-complete gameplay with bombs, ghost AI, power-ups, audio integration.

### Milestone 4: Full Game + Polish (Day 7)
**Requires**: All tracks complete + A3-09, C3-08, C3-09, C3-10, D3-14, D3-15  
**Result**: Playable from Start Menu through all 3 levels to Victory/Game Over. All tests passing, audit evidence collected.

---

<a id="section-5-shared-contracts--interfaces"></a>
## 🤝 5. Shared Contracts & Interfaces

> Unchanged from V1. See `implementation-plan.md` Section 5.

---

<a id="section-6-testing-strategy"></a>
## 🧪 6. Testing Strategy

> Unchanged from V1. See `implementation-plan.md` Section 6.

---

<a id="section-7-performance-budget--acceptance-criteria"></a>
## ⚡ 7. Performance Budget & Acceptance Criteria

> Unchanged from V1. See `implementation-plan.md` Section 7.

---

<a id="section-8-done-criteria"></a>
## ✅ 8. Done Criteria

> Unchanged from V1. See `implementation-plan.md` Section 8.

---

<a id="section-9-asset-creation--pipeline"></a>
## 🎨 9. Asset Creation & Pipeline

> Unchanged from V1. See `implementation-plan.md` Section 9.

---

<a id="section-10-maintenance-notes"></a>
## 🛠️ 10. Maintenance Notes

1. This repository is ECS-only; no legacy alternative-architecture workflow docs are maintained.
2. `AGENTS.md` is the normative constraints source. This plan is the execution source for ECS work.
3. Keep documentation links synchronized when adding/removing docs under `docs/`.
4. If architecture constraints change, update `AGENTS.md` first and then align this plan.

---

## Legacy Ticket Mapping (V1 → V3)

### Track A (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| A-01 | A3-01 | Scaffolding — unchanged |
| A-02 | A3-02 | World engine — unchanged |
| A-03 | **D3-01** | Resources → Track D |
| A-04 | A3-03 | Game loop + game flow — stays in A |
| A-05 | **D3-03** | Map loading → Track D |
| A-06 | A3-04 | Unit tests (core) — unchanged |
| A-07 | A3-05 | Integration tests — unchanged |
| A-08 | A3-06 | E2E audit tests — unchanged |
| A-09 | A3-07 | CI/schema gates — unchanged |
| A-10 | A3-08 | Unit tests (gameplay) — unchanged |
| A-11 | A3-09 | Final QA — unchanged |

### Track B (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| B-01 | B3-01 | Components — unchanged |
| B-02 | B3-02 | Input — unchanged |
| B-03 | B3-03 | Movement — unchanged |
| B-04 | B3-04 | Collision — unchanged |
| B-05 | **C3-02** | Scoring/timer/lives → Track C |
| B-06 | **D3-09** | Pause/progression → Track D |
| B-07 | **D3-10** | Bombs/explosions → Track D |
| B-08 | **C3-04** | Ghost AI/spawning → Track C |
| B-09 | **D3-11** | Power-ups → Track D |
| B-10 | **C3-06** | Gameplay events → Track C |

### Track C (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| C-01 | C3-05 | Audio adapter — unchanged scope |
| C-02 | C3-07 | Audio cue mapping — unchanged scope |
| C-03 | C3-08 | Gameplay SFX — unchanged scope |
| C-04 | C3-09 | Audio preloading — unchanged scope |
| C-05 | C3-10 | Audio manifest — unchanged scope |
| C-06 | C3-08 | UI SFX — merged into C3-08 |
| C-07 | C3-08 | Music — merged into C3-08 |

### Track D (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| D-01 | D3-04 | Render data contracts — unchanged |
| D-02 | D3-05 | CSS layout — unchanged |
| D-03 | D3-06 | Renderer adapter — unchanged |
| D-04 | D3-07 | Render collect — unchanged |
| D-05 | D3-08 | Render DOM system — unchanged |
| D-06 | D3-13 | HUD adapter — unchanged |
| D-07 | D3-14 (was D-07, screen overlays) | Screen overlays — unchanged |
| D-08 | D3-12 | Sprite pool — unchanged |
| D-09 | D3-14 | Visual gameplay sprites — merged |
| D-10 | D3-15 | Visual UI assets — merged |
| D-11 | D3-15 | Visual manifest — merged |
