# 📊 Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation/track-*.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update the status symbol whenever work starts, pauses, or completes.
2. Keep each ticket in the line format: status + ticket ID + ticket description + dependency fields.
3. Do not set `[x]` unless the ticket verification gate in the relevant track file is satisfied.
4. Keep `Depends on` and `Blocks` synchronized with the owning track file when ticket definitions change.
5. Keep each line free of branch metadata.

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

- [-] **A-01** P0 - Project Scaffolding & Tooling (Depends on: None) | Blocks: A-02; A-07; C-06; D-05
- [-] **A-02** P0 - ECS Architecture Core (World, Entity, Query) (Depends on: A-01) | Blocks: A-03; A-04; B-01; D-01; D-04
- [ ] **A-03** P0 - Game Loop & Main Initialization (Depends on: A-02, D-01) | Blocks: A-04; A-05; A-06; B-02; C-04
- [ ] **A-04** P1 - Unit Tests - ECS Core & Resources (Depends on: A-02, A-03, D-01, D-03) | Blocks: None
- [ ] **A-05** P1 - Integration Tests - Multi-System & Adapter Boundaries (Depends on: A-03, B-03, C-02, C-04, C-05, D-08) | Blocks: A-09
- [ ] **A-06** P1 - E2E Audit Tests (Playwright) (Depends on: A-03, B-04, C-04, C-05) | Blocks: A-09
- [ ] **A-07** P2 - CI, Schema Validation & Asset Gates (Depends on: A-01, D-03) | Blocks: A-09; C-10; D-11
- [ ] **A-08** P2 - Unit Tests - All Gameplay Systems (Depends on: B-01 through B-09, C-01 through C-05, C-07) | Blocks: A-09
- [ ] **A-09** P3 - Evidence Aggregation & Final QA Polish (Depends on: A-05, A-06, A-07, A-08, C-09, D-11) | Blocks: None

## 🎮 Track B (Dev 2)

- [ ] **B-01** P0 - ECS Components (All Data Definitions) (Depends on: A-02) | Blocks: A-08; B-02; B-03; B-04; D-04
- [ ] **B-02** P1 - Input Adapter & Input System (Depends on: B-01, A-03, D-01) | Blocks: A-08; B-03
- [ ] **B-03** P1 - Movement & Grid Collision System (Depends on: B-01, B-02, D-03) | Blocks: A-05; A-08; B-04; B-06; B-08; D-07
- [ ] **B-04** P1 - Entity Collision System (Depends on: B-01, B-03, D-03) | Blocks: A-06; A-08; B-05; B-06; B-07; B-08; C-01; C-02
- [ ] **B-05** P2 - Core Gameplay Event Surface (Depends on: B-04, D-01) | Blocks: A-08; B-09
- [ ] **B-06** P2 - Bomb & Explosion Systems (Depends on: B-03, B-04, D-01, D-03) | Blocks: A-08; B-07; B-09
- [ ] **B-07** P2 - Power-Up System (Depends on: B-04, B-06, D-01) | Blocks: A-08; B-08
- [ ] **B-08** P2 - Ghost AI System (Depends on: B-03, B-04, B-07, D-01, D-03, C-03) | Blocks: A-08; B-09
- [ ] **B-09** P2 - Cross-System Gameplay Event Hooks (Depends on: C-01, C-02, B-05, B-06, B-08, D-01) | Blocks: A-08; C-07

## 🎧 Track C (Dev 3)

- [ ] **C-01** P1 - Scoring System (Depends on: B-04, D-01) | Blocks: A-08; B-09
- [ ] **C-02** P1 - Timer & Life Systems (Depends on: D-01, B-04) | Blocks: A-05; A-08; B-09; C-04; C-05
- [ ] **C-03** P1 - Spawn System (Depends on: D-01, D-03) | Blocks: A-08; B-08
- [ ] **C-04** P1 - Pause & Level Progression Systems (Depends on: D-01, D-03, C-02, A-03) | Blocks: A-05; A-06; A-08; C-05
- [ ] **C-05** P1 - HUD Adapter & Screen Overlays (Depends on: D-05, C-02, C-04) | Blocks: A-05; A-06; A-08; D-11
- [ ] **C-06** P2 - Audio Adapter Implementation (Depends on: A-01, D-01) | Blocks: C-07; C-08; C-09
- [ ] **C-07** P2 - Audio Cue Mapping & Runtime Integration (Depends on: C-06, B-09) | Blocks: A-08
- [ ] **C-08** P3 - Sound Effects & Music Production (Depends on: C-06) | Blocks: C-09; C-10
- [ ] **C-09** P3 - Audio Preloading & Performance (Depends on: C-06, C-08) | Blocks: A-09
- [ ] **C-10** P3 - Audio Manifest Schema & Validation (Depends on: C-08, A-07) | Blocks: None

## 🎨 Track D (Dev 4)

- [ ] **D-01** P0 - Resources (Time, Constants, RNG, Events, Game Status) (Depends on: A-02) | Blocks: A-03; A-04; B-02; B-05; B-06; B-07; B-08; B-09; C-01; C-02; C-03; C-04; C-06; D-02; D-03
- [ ] **D-02** P0 - Map Schema & JSON Blueprints (Depends on: D-01) | Blocks: D-03
- [ ] **D-03** P0 - Map Loading Resource (Depends on: D-01, D-02) | Blocks: A-04; A-07; B-03; B-04; B-06; B-08; C-03; C-04; D-06
- [ ] **D-04** P0 - Render Data Contracts (Depends on: A-02, B-01) | Blocks: D-06; D-07
- [ ] **D-05** P1 - CSS Layout & Grid Structure (Depends on: A-01) | Blocks: C-05; D-06
- [ ] **D-06** P1 - Renderer Adapter & Board Generation (Depends on: D-04, D-05, D-03) | Blocks: D-08; D-09; D-10
- [ ] **D-07** P1 - Render Collect System (Depends on: D-04, B-03) | Blocks: D-08
- [ ] **D-08** P1 - Render DOM System (The Batcher) (Depends on: D-06, D-07) | Blocks: A-05; D-09; D-10
- [ ] **D-09** P2 - Sprite Pool Adapter (Depends on: D-06, D-08) | Blocks: None
- [ ] **D-10** P3 - Visual Asset Production - Gameplay Sprites (Depends on: D-06, D-08) | Blocks: D-11
- [ ] **D-11** P3 - Visual Assets (UI & Screens) + Visual Manifest & Validation (Depends on: C-05, D-10, A-07) | Blocks: A-09

## 🔗 Cross-Document References

- Ticket definitions and verification gates: `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-c.md`, `docs/implementation/track-d.md`
- Track summary and milestones: `docs/implementation/implementation-plan.md`
- Coverage mapping and audit status: `audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`
