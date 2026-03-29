# 📊 Ticket Progress Tracker v2

This file tracks delivery progress for all v2 tickets in `docs/implementation/track-*-v2.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update `Status` whenever work starts, pauses, blocks, or completes.
2. Add PR and evidence links when a ticket moves to `Done`.
3. Do not mark `Done` until the ticket verification gate in the corresponding v2 track file is satisfied.
4. Keep owner changes explicit in the `Owner` column.
5. Keep `Depends On` and `Primary Impacts` synchronized with v2 track definitions.

## 🗂️ Status Legend

- ⬜ `Not Started`
- 🟨 `In Progress`
- ⛔ `Blocked`
- ✅ `Done`

## 🚦 Execution Policy (Phase-First)

1. Execute by phase across all tracks: `P0 -> P1 -> P2 -> P3`.
2. Inside a phase, claim tickets whose dependencies are complete.
3. If a higher-phase ticket is pulled early, record reason in `Evidence / Notes`.

## 📈 Summary Snapshot

- Total tickets: `31`
- Done: `0`
- In Progress: `0`
- Blocked: `0`
- Not Started: `31`

## ⚙️ Track A v2 (Dev 1)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A2-01 | P0 | Scaffolding & Toolchain Setup | Dev 1 | Critical | None | Project baseline and local/CI command parity | Not Started | - | - |
| A2-02 | P0 | ECS World Engine Core | Dev 1 | Critical | A2-01 | Deterministic world scheduling and query/mutation contracts | Not Started | - | - |
| A2-03 | P0 | Engine Assembly & Contract Governance | Dev 1 | Critical | B2-00, C2-00, D2-00 | Core integration handshake and startup determinism | Not Started | - | - |
| A2-04 | P1 | CI Governance, Security & Schema Gates | Dev 1 | Critical | A2-01 | Policy enforcement and schema validation | Not Started | - | - |
| A2-05 | P1 | Test Harness & Determinism Utilities | Dev 1 | Critical | A2-03 | Replay/hash utilities and reusable fixtures | Not Started | - | - |
| A2-06 | P2 | Unit Tests (Core + Gameplay) | Dev 1 | Critical | B2-06, C2-04, D2-06 | Core and gameplay system regression coverage | Not Started | - | - |
| A2-07 | P2 | Integration & Adapter Boundary Tests | Dev 1 | High | B2-06, C2-06, D2-05 | Cross-system and adapter integration correctness | Not Started | - | - |
| A2-08 | P3 | E2E Audit Automation | Dev 1 | Critical | A2-07 | Automated audit acceptance coverage | Not Started | - | - |
| A2-09 | P3 | QA Evidence, Final Sign-off & Deployment | Dev 1 | High | A2-08, C2-06, D2-06 | Release evidence and deployment readiness | Not Started | - | - |

## 🎮 Track B v2 (Dev 2)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B2-00 | P0 | Fixed-Step Simulation Kernel | Dev 2 | Critical | A2-02 | Simulation stepping determinism and update boundaries | Not Started | - | - |
| B2-01 | P0 | ECS Components & Data Contracts | Dev 2 | Critical | A2-02 | Gameplay data contracts for all systems | Not Started | - | - |
| B2-02 | P1 | Input Adapter & Input System | Dev 2 | Critical | B2-00, B2-01, D2-00 | Deterministic input and hold-state behavior | Not Started | - | - |
| B2-03 | P1 | Movement & Grid Collision | Dev 2 | Critical | B2-01, B2-02, D2-01 | Core movement loop and tile blocking correctness | Not Started | - | - |
| B2-04 | P1 | Collision Matrix System | Dev 2 | Critical | B2-03 | Entity interaction hierarchy and occupancy checks | Not Started | - | - |
| B2-05 | P2 | Bomb & Explosion Systems | Dev 2 | Critical | B2-03, B2-04 | Blast geometry, chain behavior, aftermath intents | Not Started | - | - |
| B2-06 | P2 | Power-Up Mechanics | Dev 2 | High | B2-04, B2-05, D2-07 | Player progression modifiers and deterministic durations | Not Started | - | - |

## 🎧 Track C v2 (Dev 3)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C2-00 | P0 | Deterministic Runtime Resources | Dev 3 | Critical | A2-02 | Shared constants/RNG/events/status determinism | Not Started | - | - |
| C2-01 | P2 | Ghost AI & Spawn System | Dev 3 | Critical | B2-03, B2-04, C2-00 | Enemy intelligence and deterministic spawn behavior | Not Started | - | - |
| C2-02 | P1 | Scoring, Timer & Lives Systems | Dev 3 | Critical | B2-04, C2-00 | Core scoring and fail-state pacing | Not Started | - | - |
| C2-03 | P1 | Pause & Level Progression | Dev 3 | Critical | C2-00, C2-02, D2-00, D2-05 | State transitions and pause/restart semantics | Not Started | - | - |
| C2-04 | P2 | Gameplay Event Hooks | Dev 3 | High | B2-05, C2-02, C2-03 | Stable cross-system event contracts | Not Started | - | - |
| C2-05 | P2 | Audio Runtime Integration | Dev 3 | Critical | C2-04 | Event-driven audio feedback and fallback behavior | Not Started | - | - |
| C2-06 | P3 | Audio Production, Preload & Manifest | Dev 3 | High | C2-05, A2-04 | Audio asset completeness and manifest governance | Not Started | - | - |

## 🎨 Track D v2 (Dev 4)

| ID | Phase | Ticket | Owner | Priority | Depends On | Primary Impacts | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D2-00 | P0 | Clock & Lifecycle Timing Core | Dev 4 | Critical | A2-02 | Pause-safe time progression and resume correctness | Not Started | - | - |
| D2-01 | P0 | Map Loading & Level Resource Ownership | Dev 4 | Critical | C2-00 | Canonical map parsing/reset and level data contract | Not Started | - | - |
| D2-02 | P0 | CSS & Render Contracts | Dev 4 | Critical | A2-01, B2-01 | ECS/DOM boundary contract and style architecture | Not Started | - | - |
| D2-03 | P1 | Render Collect & DOM Batcher | Dev 4 | Critical | D2-02, B2-03 | Frame-stable DOM commit path | Not Started | - | - |
| D2-04 | P2 | Sprite Pooling & Reuse | Dev 4 | High | D2-03 | Allocation stability via DOM pooling | Not Started | - | - |
| D2-05 | P1 | HUD & Overlay Screens | Dev 4 | Critical | D2-02, C2-03 | Keyboard-first UI flows and HUD state visibility | Not Started | - | - |
| D2-06 | P3 | Visual Asset Production & Manifest | Dev 4 | High | D2-03, D2-05, A2-04 | Visual completeness and manifest/fallback governance | Not Started | - | - |
| D2-07 | P2 | Map-State Mechanics & Drop Resolver | Dev 4 | High | D2-01, B2-05 | Explosion aftermath, drops, and pellet index mechanics | Not Started | - | - |

## 🔗 Cross-Document References

- v2 track definitions: `docs/implementation/track-a-v2.md`, `docs/implementation/track-b-v2.md`, `docs/implementation/track-c-v2.md`, `docs/implementation/track-d-v2.md`
- v2 distribution source: `docs/implementation/tickets_v2.md`
- canonical audit mapping: `docs/implementation/audit-traceability-matrix.md`
- legacy tracker (v1): `docs/implementation/ticket-tracker.md`
