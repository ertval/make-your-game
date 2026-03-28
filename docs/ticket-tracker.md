# Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation-plan.md`.

Coverage mapping remains canonical in `docs/audit-traceability-matrix.md`.

## Update Rules

1. Update `Status` whenever work starts, pauses, blocks, or completes.
2. Add the PR link and evidence link when a ticket moves to `Done`.
3. Do not set `Done` unless the ticket verification gate in `docs/implementation-plan.md` is satisfied.
4. Keep owner changes explicit in the `Owner` column.

## Status Legend

- `Not Started`
- `In Progress`
- `Blocked`
- `Done`

## Summary Snapshot

- Total tickets: `25`
- Done: `0`
- In Progress: `0`
- Blocked: `0`
- Not Started: `25`

## Track A (Dev 1)

| ID | Ticket | Owner | Priority | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|
| A-1 | Project Scaffolding & Tooling | Dev 1 | Critical | Not Started | - | - |
| A-2 | ECS Architecture Core (World, Entity, Query) | Dev 1 | Critical | Not Started | - | - |
| A-3 | Resources (Time, Constants, RNG) | Dev 1 | Critical | Not Started | - | - |
| A-4 | Game Loop & Main Initialization | Dev 1 | Critical | Not Started | - | - |
| A-5 | Map Loading Resource | Dev 1 | Critical | Not Started | - | - |
| A-6 | Shared Asset Validation Wiring | Dev 1 | Critical | Not Started | - | - |
| A-7 | Asset Evidence Aggregation | Dev 1 | Medium | Not Started | - | - |

## Track B (Dev 2)

| ID | Ticket | Owner | Priority | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|
| B-1 | Action Components | Dev 2 | Critical | Not Started | - | - |
| B-2 | Input Adapter & System | Dev 2 | Critical | Not Started | - | - |
| B-3 | Movement & Grid Collision System | Dev 2 | Critical | Not Started | - | - |
| B-4 | Bomb Components & Bomb Tick System | Dev 2 | Critical | Not Started | - | - |
| B-5 | Entity Collision System | Dev 2 | Medium | Not Started | - | - |
| B-6 | Gameplay Event Hooks for Asset Cues | Dev 2 | Medium | Not Started | - | - |

## Track C (Dev 3)

| ID | Ticket | Owner | Priority | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|
| C-1 | AI Components & Spawning Logic | Dev 3 | Critical | Not Started | - | - |
| C-2 | Ghost AI System | Dev 3 | Critical | Not Started | - | - |
| C-3 | Power Up & Stun Routines | Dev 3 | Medium | Not Started | - | - |
| C-4 | Timer System & Scoring System | Dev 3 | Critical | Not Started | - | - |
| C-5 | Pause & Progression Systems | Dev 3 | Critical | Not Started | - | - |
| C-6 | Audio Assets and Runtime Cues | Dev 3 | Critical | Not Started | - | - |

## Track D (Dev 4)

| ID | Ticket | Owner | Priority | Status | PR | Evidence / Notes |
|---|---|---|---|---|---|---|
| D-1 | Renderer Structure & CSS Layout | Dev 4 | Critical | Not Started | - | - |
| D-2 | Adapters (DOM, HUD, and Multi-Screen Overlays) | Dev 4 | Critical | Not Started | - | - |
| D-3 | Render Data Contracts | Dev 4 | Critical | Not Started | - | - |
| D-4 | Render Collect System | Dev 4 | Critical | Not Started | - | - |
| D-5 | Render DOM System (The Batcher) | Dev 4 | Critical | Not Started | - | - |
| D-6 | Visual Assets and Render Mapping | Dev 4 | Critical | Not Started | - | - |

## Cross-Document References

- Ticket definitions and verification gates: `docs/implementation-plan.md` (Section 3)
- Coverage mapping and audit status: `docs/audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`
