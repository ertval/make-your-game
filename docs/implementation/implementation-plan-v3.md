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
    - [Track B — Components, Input, Movement, Bombs & Gameplay Physics (Dev 2)](track-b-v3.md)
    - [Track C — Scoring, Game Flow UI, Audio & Runtime Feedback (Dev 3)](track-c-v3.md)
    - [Track D — Resources, Map, Rendering & Visual Assets (Dev 4)](track-d-v3.md)
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
| **Track B scope** | All components + input + movement + collision + bombs + ghost AI + scoring + timer + lives + pause + progression + power-ups + events | Components + Input + Movement + Collision + Bombs/Explosions + Power-ups + Ghost AI + simulation event surface (9 tickets) |
| **Track C scope** | Audio only (7 tickets) | Scoring/Timer/Lives + Spawn + Pause/Progression + HUD/Screens + Audio pipeline + UI visual/manifest governance (11 tickets) |
| **Track D scope** | Rendering + visuals only (11 tickets) | Rendering + visuals + **Resources** + Map Loading + sprite pool + gameplay sprite production (10 tickets) |
| **Ticket metadata** | Priority/Estimate/Phase/Depends/Impacts | + **Deliverables** (exact output files) + **Blocks** (tickets this blocks) |

### Design Rationale

1. **Track A is lighter**: Resources (`constants.js`, `clock.js`, `rng.js`, `event-queue.js`, `game-status.js`) and map loading moved to Track D. A retains `world/` and `game/` folder ownership plus all testing/QA.
2. **Track B is end-to-end simulation physics and enemy behavior**: Components → input → movement → collision remain together with bombs/explosions, power-up effects, ghost AI, and gameplay event contracts, reducing hot-path handoffs.
3. **Track C is player-facing runtime feedback + UI visual governance**: Scoring/timer/lives, pause/progression, HUD/screens, audio, and UI visual manifests stay together to keep UX behavior and accessibility contracts coherent.
4. **Track D is world-state infrastructure and rendering pipeline**: Resources, map loading, render collect/commit systems, sprite pooling, and gameplay sprite production remain aligned under one deterministic render owner.
5. **Cross-track blocking is minimized**: Each track's intra-dependencies are maximized; inter-track dependencies are minimized to same-phase contracts.

---

<a id="section-1-architecture-overview"></a>
## 🏗️ 1. Architecture Overview

> Architecture detail is unchanged from V1. See `implementation-plan.md` Section 1 for the full canonical reference including ECS diagrams, frame pipeline, determinism contracts, component storage, and pause semantics.

### Source Of Truth References

1. `docs/requirements.md` + `docs/game-description.md` define project requirements and intended gameplay behavior.
2. `docs/audit.md` defines pass/fail acceptance criteria.
3. `audit-traceability-matrix.md` is the canonical requirement-to-audit-to-ticket-to-test coverage map.
4. `ticket-tracker.md` tracks live execution status for Section 3 tickets.
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

Live ticket progress is tracked in `docs/implementation/ticket-tracker.md`.

### Phase Gates (Global Execution Order)

| Phase | Goal | Primary Ticket Bands | Exit Criteria |
|---|---|---|---|
| P0 Foundation | Boot deterministic runtime and data contracts | A-01..A-03, B-01, D-01..D-04 | App boots, fixed-step world ticks, resources/map contracts available, render intent contracts defined |
| P1 Playable MVP | Deliver fully playable core loop | A-04..A-06, B-02..B-04, C-01..C-05, D-05..D-08 | Player can start, move, pause/continue/restart, score/lives/timer update, HUD/overlays |
| P2 Feature Complete | Add genre depth and integration hooks | A-07..A-08, B-05..B-09, C-06..C-07, D-09 | Bombs, ghost AI, power-ups, event contracts, audio integration, sprite pools |
| P3 Polish & Validation | Final production quality and asset governance | A-09, C-08..C-11, D-10 | Asset schemas/manifests, UI/audio polish, audit-ready evidence |

### Workload Summary (V3 Balanced Ownership)

| Track | Developer | Tickets | Estimated Hours | Scope |
|---|---|---:|---:|---|
| Track A | Dev 1 | 9 | ~22h | World engine, game flow, scaffolding, ALL testing (unit/integration/e2e/audit), CI, QA & evidence |
| Track B | Dev 2 | 9 | ~29h | ECS components, input adapter/system, movement & collision, bomb/explosion systems, power-up system, ghost AI, gameplay event integration surface |
| Track C | Dev 3 | 11 | ~30h | Scoring/timer/lives, spawn timing, pause/progression systems, HUD/screens/storage adapters, audio adapter, cue mapping, SFX/music production, UI visual/manifest governance |
| Track D | Dev 4 | 10 | ~25h | Resources, map loading, renderer + sprite pools, CSS and animation layout, gameplay sprite production |
| **Total** | **4 Devs** | **39** | **~106h** |

### Critical Path By Dev

| Dev | Critical Path Focus | Must Land Before | Depends On |
|---|---|---|---|
| Dev 1 | ECS World engine, game flow FSM, CI wiring, **ALL** testing & QA, final evidence | Any gameplay integration and final acceptance | None initially; later depends on B/C/D feature code for tests |
| Dev 2 | Components, input, movement, collision, bombs, power-ups, simulation events | Everything that consumes gameplay simulation outcomes | Dev 1 world setup; Dev 4 resource/map contracts |
| Dev 3 | Scoring/timer/lives, pause/progression, HUD/screens, audio adapter, SFX/music, UI visual manifest | MVP UX readiness and audio/feedback completeness | Dev 2 collision/event outputs; Dev 4 resources, sprite metadata, and layout primitives |
| Dev 4 | Resources, map, render pipeline, sprite pools, gameplay sprites | Deterministic world-state correctness and visual/perf evidence | Dev 1 world setup; Dev 2 movement/collision outputs |

#### Scheduling Rule

1. Execute tickets by global phase (`P0 → P1 → P2 → P3`) across all tracks.
2. Inside a phase, claim only tickets whose declared dependencies are complete.
3. Ownership stays by track; phase sequencing controls implementation order.
4. If a higher-phase ticket is pulled early, record the reason in `ticket-tracker.md`.

---

### Track Ticket Documents

- [Track A — World, Game Flow, Scaffolding, Testing & QA (Dev 1)](track-a-v3.md)
- [Track B — Components, Input, Movement, Bombs & Gameplay Physics (Dev 2)](track-b-v3.md)
- [Track C — Scoring, Game Flow UI, Audio & Runtime Feedback (Dev 3)](track-c-v3.md)
- [Track D — Resources, Map, Rendering & Visual Assets (Dev 4)](track-d-v3.md)

Live execution status: [Ticket Progress Tracker](ticket-tracker.md).

---

<a id="section-4-integration-milestones"></a>
## 🗓️ 4. Integration Milestones

### Milestone 1: Engine + Static View (Day 3)
**Requires**: A-01, A-02, A-03, B-01, D-01, D-02, D-03, D-04  
**Result**: Core ECS world schedules deterministic ticks with resources, map contracts, and render intent contracts ready.

### Milestone 2: Playable MVP (Day 4-5)
**Requires**: M1 + A-04, A-05, A-06, B-02, B-03, B-04, C-01, C-02, C-03, C-04, C-05, D-05, D-06, D-07, D-08  
**Result**: First fully playable MVP (start, move, score, lose life, pause/continue/restart, HUD/overlays).

### Milestone 3: Feature Complete (Day 6)
**Requires**: M2 + A-07, A-08, B-05, B-06, B-07, B-08, B-09, C-06, C-07, D-09  
**Result**: Feature-complete gameplay with bombs, ghost AI, power-ups, deterministic event contracts, and audio integration.

### Milestone 4: Full Game + Polish (Day 7)
**Requires**: All tracks complete + A-09, C-08, C-09, C-10, C-11, D-10  
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
| A-01 | A-01 | Scaffolding — unchanged |
| A-02 | A-02 | World engine — unchanged |
| A-03 | **D-01** | Resources → Track D |
| A-04 | A-03 | Game loop + game flow — stays in A |
| A-05 | **D-03** | Map loading → Track D |
| A-06 | A-04 | Unit tests (core) — unchanged |
| A-07 | A-05 | Integration tests — unchanged |
| A-08 | A-06 | E2E audit tests — unchanged |
| A-09 | A-07 | CI/schema gates — unchanged |
| A-10 | A-08 | Unit tests (gameplay) — unchanged |
| A-11 | A-09 | Final QA — unchanged |

### Track B (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| B-01 | B-01 | Components — unchanged |
| B-02 | B-02 | Input — unchanged |
| B-03 | B-03 | Movement — unchanged |
| B-04 | B-04 | Collision — unchanged |
| B-05 | **C-02** | Scoring/timer/lives → Track C |
| B-06 | **C-04** | Pause/progression → Track C |
| B-07 | **B-06** | Bombs/explosions retained in Track B |
| B-08 | **B-08** | Ghost AI retained in Track B |
| B-09 | **B-07** | Power-ups retained in Track B |
| B-10 | **B-09** | Gameplay event hook consolidation retained in Track B |

### Track C (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| C-01 | C-06 | Audio adapter — unchanged scope |
| C-02 | C-07 | Audio cue mapping — unchanged scope |
| C-03 | C-08 | Gameplay SFX — unchanged scope |
| C-04 | C-09 | Audio preloading — unchanged scope |
| C-05 | C-10 | Audio manifest — unchanged scope |
| C-06 | C-08 | UI SFX — merged into C-08 |
| C-07 | C-08 | Music — merged into C-08 |

Additional V3 additions in Track C: `C-01` through `C-05` absorb scoring/timer/lives/spawn/pause/HUD ownership, and `C-11` owns UI visual assets plus visual manifest governance.

### Track D (V1 → V3)

| V1 Ticket | V3 Mapping | Notes |
|---|---|---|
| D-01 | D-04 | Render data contracts — unchanged |
| D-02 | D-05 | CSS layout — unchanged |
| D-03 | D-06 | Renderer adapter — unchanged |
| D-04 | D-07 | Render collect — unchanged |
| D-05 | D-08 | Render DOM system — unchanged |
| D-06 | C-05 | HUD adapter moved to Track C |
| D-07 | C-05 | Screen overlays moved to Track C |
| D-08 | D-09 | Sprite pool — unchanged |
| D-09 | D-10 | Visual gameplay sprites — retained in Track D |
| D-10 | C-11 | Visual UI assets moved to Track C |
| D-11 | C-11 | Visual manifest moved to Track C |

Additional V3 additions in Track D: `D-01`, `D-02`, and `D-03` absorb resources and map ownership previously handled in Track A.
