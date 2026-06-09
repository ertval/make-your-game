# 📊 Ticket Progress Tracker

This file tracks delivery progress for all Section 3 tickets in `docs/implementation/track-*.md`.

Coverage mapping remains canonical in `audit-traceability-matrix.md`.

## 🧾 Update Rules

1. Update the status symbol whenever work starts, pauses, or completes.
2. Keep each ticket in the line format: status + ticket ID + ticket description + dependency fields.
3. Do not set `[x]` unless the ticket verification gate in the relevant track file is satisfied.
4. Treat this tracker as the canonical source for `Depends on` and `Blocks`; track files may summarize or lag, but phase gating and policy checks must follow this tracker.
5. Keep each line free of branch metadata.
6. At each phase end, require all tracks to run prompt `codebase-analysis-audit` (repository prompt file: `.github/prompts/code-analysis-audit.prompt.md`), then require Track A to run `.github/prompts/phase-deduplicate-track-audits.prompt.md` and publish 4 deduplicated track reports before phase closure.
7. A phase is not considered closed until each track has resolved every issue assigned in its deduplicated track report.

## 🗂️ Status Legend

- `[ ]` = `Not Started`
- `[-]` = `In Progress`
- `[x]` = `Done`

## 🚦 Execution Policy (Prototype-First)

1. Execute by phase across all tracks: `P0 → P1 (Visual Prototype) → P2 (Playable MVP) → P3 (Feature Complete + Hardening) → P4 (Polish)`.
2. During P1/P2, prioritize tickets that produce immediate on-screen feedback and controllable gameplay.
3. Defer broad hardening tickets (A-04, A-05, A-06, A-07, A-08) until after the playable MVP loop is visible and interactive.
4. Inside each phase, claim tickets whose dependencies are already complete.
5. If a higher phase ticket is needed early, record the reason in the ticket line text.
6. Track ticket phase labels (P0-P4) remain unchanged; the claim queue below is the active sequencing rule.

> Note: `A-11` is referenced for audit traceability only and does not block Track C ticket execution.

## 📈 Summary Snapshot

- Total tickets: `44`
- Done: `28`
- In Progress: `0`
- Not Started: `16`

## ✅ Phase 0 — Fully Implemented and Audited

All P0 tickets complete. Audit reports published and remediation verified.

- **Reports published:**
  - `docs/audit-reports/phase-0/audit-report-p0-track-a-deduplicated-2026-04-14.md`
  - `docs/audit-reports/phase-0/audit-report-p0-track-b-deduplicated-2026-04-14.md`
  - `docs/audit-reports/phase-0/audit-report-p0-track-c-deduplicated-2026-04-14.md`
  - `docs/audit-reports/phase-0/audit-report-p0-track-d-deduplicated-2026-04-14.md`
- **Remediation status:** All Track A/B/C/D issues mapped and resolved. Loader fallback removed (`level-loader.js`), strict map-resource validation active. CI gates (CI-01 through CI-X03) enforced via policy-gate and executable audit suites.

## ✅ Phase 1 — Visual Prototype (P1)

**Status:** Complete — all P1 tickets done.

- **Audit reports published:** A-11 consolidation complete; per-track P1 fix reports under `docs/audit-reports/phase-1/`.
- **Remediation status:** D-05 ✅, D-06 ✅, B-02 ✅, B-03 ✅, D-07 ✅, D-09 ✅, D-08 ✅, A-11 ✅

## 🔲 Phase 2 — Playable MVP (P2)

**Status:** In Progress — A-12 (P2 consolidation) remains.

- **Audit reports published:** _Pending A-12 completion_
- **Remediation status:** B-04 ✅, C-02 ✅, C-01 ✅, C-03 ✅, B-05 ✅, A-07 ✅, C-04 ✅, C-05 ✅, C-06 ✅, A-12 ⏳

## 🔲 Phase 3 — Feature Complete + Hardening (P3)

**Status:** Not Started — Blocks on P2 completion (A-12).

- **Audit reports published:** _Pending A-13 completion_
- **Remediation status:** A-04 ✅, B-06 ⏳, B-07 ⏳, B-08 ⏳, B-09 ⏳, C-07 ✅ (driver), A-05 ⏳, A-06 ⏳, A-08 ⏳, A-13 ⏳

## 🔲 Phase 4 — Polish + Validation (P4)

**Status:** Not Started — Blocks on P3 completion (A-13).

- **Audit reports published:** _Pending A-14 completion_
- **Remediation status:** C-08 ⏳ (draft: candidate assets shipped + pipeline integration-validated), C-09 ⏳, C-10 ⏳, D-10 ⏳, D-11 ⏳, A-09 ⏳, A-14 ⏳

## 🛣️ Prototype-First Claim Queue (Global)

Use this queue as the default claim order for fastest visual feedback:

1. **Q0 Foundation Completion**: D-03, D-04
2. **Q1 Visual Prototype First**: D-05, B-02, D-06, D-09, B-03, D-07, D-08
3. **Q2 Playable MVP Core**: C-03, B-04, C-02, C-01, B-05, C-04, C-05, A-07, C-06
4. **Q3 Feature Depth + Hardening**: B-06, B-07, B-08, B-09, C-07, A-04, A-05, A-06, A-08
5. **Q4 Polish + Validation**: C-08, C-09, C-10, D-10, D-11, A-09

Definition of done for Q1 Visual Prototype:

- Board is visible and updates every frame.
- Player can move via keyboard with stable hold-to-move behavior.
- Render collect + render DOM commit path is active (no placeholder static mock).

## 🧩 Ticket ID Index (Merged)

`docs/implementation/tickets.md` is merged into this tracker.

Canonical ticket ID ranges used by policy checks:

- Track A: `A-01` through `A-14` -> **Ownership**: `ekaramet`
- Track B: `B-01` through `B-09` -> **Ownership**: `asmyrogl`
- Track C: `C-01` through `C-10` -> **Ownership**: `chbaikas`
- Track D: `D-01` through `D-11` -> **Ownership**: `medvall`

## 📋 Ordered Tickets (Authoritative Claim Order)

### Q0 / P0 Foundation

- [x] **A-01** P0 - Project Scaffolding & Tooling (Depends on: None) | Blocks: A-02; A-03; A-07; C-06; D-05; A-10
- [x] **A-02** P0 - ECS Architecture Core (World, Entity, Query) (Depends on: A-01) | Blocks: A-03; A-04; B-01; D-01; D-04; A-10
- [x] **D-01** P0 - Resources (Time, Constants, RNG, Events, Game Status) (Depends on: A-02) | Blocks: D-02; D-03; A-03; A-04; B-02; B-05; B-06; B-07; B-08; B-09; C-01; C-02; C-03; C-04; C-06; A-10
- [x] **B-01** P0 - ECS Components (All Data Definitions) (Depends on: A-02) | Blocks: A-08; B-02; B-03; B-04; D-04; A-10
- [x] **D-02** P0 - Map Schema & JSON Blueprints (Depends on: D-01) | Blocks: D-03; A-10
- [x] **D-03** P0 - Map Loading Resource (Depends on: D-01, D-02) | Blocks: D-06; A-04; A-07; B-03; B-04; B-06; B-08; C-03; C-04; A-10
- [x] **D-04** P0 - Render Data Contracts (Depends on: A-02, B-01) | Blocks: D-06; D-07; A-10
- [x] **A-03** P0 - Game Loop & Main Initialization (Depends on: A-02, D-01) | Blocks: A-04; A-05; A-06; B-02; C-04; A-10
- [x] **A-10** P0 - Consolidate P0 audits + publish 4 deduplicated track fix reports (Depends on: A-01, A-02, D-01, B-01, D-02, D-03, D-04, A-03) | Blocks: D-05; D-06; B-02; B-03; D-07; D-09; D-08

### Q1 / P1 Visual Prototype

- [x] **D-05** P1 - CSS Layout & Grid Structure (Depends on: A-01, A-10) | Blocks: C-05; D-06; A-11
- [x] **D-06** P1 - Renderer Adapter & Board Generation (Depends on: D-04, D-05, D-03, A-10) | Blocks: D-08; D-09; D-10; A-11
- [x] **B-02** P1 - Input Adapter & Input System (Depends on: B-01, A-03, D-01, A-10) | Blocks: A-08; B-03; A-11
- [x] **B-03** P1 - Movement & Grid Collision System (Depends on: B-01, B-02, D-03, A-10) | Blocks: A-05; A-08; B-04; B-06; B-08; D-07; A-11
- [x] **D-07** P1 - Render Collect System (Depends on: D-04, B-03, A-10) | Blocks: D-08; A-11
- [x] **D-09** P1 - Sprite Pool Adapter (Depends on: D-06, A-10) | Blocks: D-08; A-11
- [x] **D-08** P1 - Render DOM System (The Batcher) (Depends on: D-06, D-07, D-09, A-10) | Blocks: A-05; D-10; A-11
- [x] **A-11** P1 - Consolidate P1 audits + publish 4 deduplicated track fix reports (Depends on: D-05, D-06, B-02, B-03, D-07, D-09, D-08) | Blocks: B-04; B-05; A-07

### Q2 / P2 Playable MVP

- [x] **B-04** P2 - Entity Collision System (Depends on: B-01, B-03, D-03, A-11) | Blocks: A-06; A-08; B-05; B-06; B-07; B-08; C-01; C-02; A-12
- [x] **C-02** P2 - Timer & Life Systems (Depends on: D-01, B-04, A-11 audit gate, non-blocking) | Blocks: A-05; A-08; B-09; C-01; C-04; C-05; A-12
- [x] **C-01** P2 - Scoring System — Runtime-integrated. Collision-driven point awards and the level-clear bonus (`1000 + remainingSeconds × 10`) are live in the default bootstrap via `scoring-system`, with one-shot protection on `scoreState.levelClearBonusAwarded` (re-armed when gameplay returns to PLAYING). Verification: `tests/unit/systems/scoring-system.test.js` + `tests/integration/gameplay/c-01-level-clear-bonus.test.js`. Remaining event-driven scoring scope (explosion events, cross-system event hooks) stays with `B-09` / `C-07` (Depends on: B-04, C-02, D-01, A-11 audit gate, non-blocking) | Blocks: A-05; A-06; A-08; B-09; A-12
- [x] **C-03** P2 - Spawn System — Implementation complete and within scope. Owns `ghostSpawnState` (absolute stagger timing, FIFO queueing, `mapResource.maxGhosts` cap, `5000ms` respawn). Resource-only by design; ghost-entity creation, AI, and movement are deferred to `B-08 Ghost AI System (Track B, P3)` — not a Track C gap (Depends on: D-01, D-03, A-11 audit gate, non-blocking) | Blocks: A-06; A-08; B-08; A-12
- [x] **C-04** P2 - Pause & Level Progression Systems — READY_FOR_MAIN: YES. `pause-input-system`, `pause-system`, and `level-progress-system` are registered in the default bootstrap (`meta` + `logic` phases). Pause menu, restart reset/reload, and level-flow advancement are runtime-integrated through the C-05 adapters; covered by `tests/e2e/game-loop.pause.spec.js`, `tests/e2e/c-05-screens-navigation.spec.js`, and `tests/e2e/stress/race-condition.spec.js`. Runtime integration landed in `ekaramet/integration-track-D-C-followups` (Depends on: D-01, D-03, C-02, A-03, A-11 audit gate, non-blocking) | Blocks: A-05; A-06; A-08; B-09; C-05; A-12
- [x] **C-05** P2 - HUD Adapter & Screen Overlays — READY_FOR_MAIN: YES. `hud-adapter`, `screens-adapter`, and `storage-adapter` are mounted via bootstrap injection slots. Per ARCH-01 (DOM isolation), the HUD is split into a DOM-free `hud-system` producer in the `logic` phase (writes the `hudState` buffer) and a `hud-render-system` consumer in the `render` phase (the sole HUD→DOM boundary, delegating to `hud-adapter`); `screens-system` is registered in the default `render` phase. Overlays (start/pause/level-complete/game-over/victory), keyboard-only navigation, focus restore, and validated high-score localStorage reads are live. Verification: `tests/integration/adapters/*`, `tests/integration/gameplay/restart-flow.test.js`, `tests/e2e/c-05-screens-navigation.spec.js`, and `tests/e2e/track-c-integration.spec.js`. Runtime integration landed in `ekaramet/integration-track-D-C-followups` (Depends on: D-05, C-02, C-04, A-11 audit gate, non-blocking) | Blocks: A-05; A-06; A-08; D-11; A-12
- [x] **B-05** P2 - Core Gameplay Event Surface (Depends on: B-04, D-01, A-11) | Blocks: A-08; B-09; A-12
- [x] **A-07** P2 - CI, Schema Validation & Asset Gates (Depends on: A-01, D-03, A-11) | Blocks: A-09, C-10, D-11, A-12
- [x] **C-06** P2 - Audio Adapter Implementation — Adapter contract complete. `src/adapters/io/audio-adapter.js` owns the Web Audio boundary (autoplay-safe AudioContext unlock on first `pointerdown`/`keydown`, `decodeAudioData` pre-decode + cached `AudioBuffer`s, master/music/sfx/ui gain graph, BufferSource-per-playback for overlapping SFX, missing-clip warn-and-no-op, `visibilitychange` suspend/resume). The adapter docstring specifies that ECS systems MUST consume it via `world.getResource('audio')` and MUST NOT import the module directly. Verification: `tests/integration/adapters/audio-adapter.test.js` (30 deterministic tests across decode flow, buffer caching, overlapping playback, missing-clip fallback, visibility lifecycle, gain updates, music replacement, failed-fetch resilience). Runtime wiring (bootstrap `setAudioAdapter` slot, manifest module, level-load preload, app-boundary construction in `main.ecs.js`) is delivered by a separate Track A integration PR (`ekaramet/integration-track-C-audio-wiring`) because those files are out of Track C ownership scope (Depends on: A-01, D-01, A-11 audit gate, non-blocking) | Blocks: C-07; C-08; C-09; A-12
- [ ] **A-12** P2 - Consolidate P2 audits + publish 4 deduplicated track fix reports (Depends on: B-04, C-02, C-01, C-03, C-04, C-05, B-05, A-07, C-06) | Blocks: B-06; B-07; B-08; B-09; C-07; A-04; A-05; A-06; A-08

### Q3 / P3 Feature Complete + Hardening

- [x] **B-06** P3 - Bomb & Explosion Systems (Depends on: B-02, B-03, B-04, D-01, D-03, A-12) | Blocks: A-05; A-06; A-08; B-07; B-09; A-13
- [x] **B-07** P3 - Power-Up System (Depends on: B-04, B-06, D-01, A-12) | Blocks: A-06; A-08; B-08; A-13
- [x] **B-08** P3 - Ghost AI System (Depends on: B-03, B-04, B-07, C-03, D-01, D-03, A-12) | Blocks: A-06; A-08; B-09; A-13
- [x] **B-09** P3 - Cross-System Gameplay Event Hooks (Depends on: B-05, B-06, B-08, C-01, C-02, C-04, D-01, A-12) | Blocks: A-05; A-06; A-08; C-07; A-13
- [x] **C-07** P3 - Audio Cue Mapping & Runtime Integration — Driver contract complete. `src/adapters/io/audio-integration.js` ships the canonical `AUDIO_CUE_MAPPING` event→cue table (11 mappings: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`), the `MUSIC_STATE_MAPPING` game-state→track table, and `createAudioCueRunner({ warnUnknownEvents })` factory. The runner drains the D-01 event queue each tick in deterministic `(frame, order)` sequence, dispatches `audio.playSfx(cueId)` for every mapped event (overlapping playback supported via BufferSource-per-call from C-06), and debounces music transitions across `MENU / PLAYING / PAUSED / LEVEL_COMPLETE / GAME_OVER / VICTORY`. Unknown events warn once per type in dev and drop in production; adapter errors are isolated so the game loop survives. Verification: `tests/integration/adapters/audio-integration.test.js` (20 deterministic tests across mapping coverage, queue-order, overlapping playback, music-state debounce, terminal transitions, malformed events, pre-wiring no-op). Runtime system registration (thin wrapper that resolves world resources and forwards to `runner.tick`) is delivered by the same Track A integration handoff PR that wires C-06's `setAudioAdapter` — out of Track C ownership scope per `scripts/policy-gate/lib/policy-utils.mjs`. Forward-compatible: `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory` events depend on `B-09` event emitters before they reach the runner at runtime (Depends on: B-09, C-06, A-12) | Blocks: A-08; A-13
- [x] **A-04** P3 - Unit Tests - ECS Core & Resources (Depends on: A-02, A-03, D-01, D-03, A-12; Early pull reason: foundational regression gate landed ahead of phase gate) | Blocks: A-13
- [x] **A-05** P3 - Integration Tests - Multi-System & Adapter Boundaries (Depends on: A-03, B-03, B-04, B-06, B-09, C-01, C-02, C-04, C-05, D-08, A-12) | Blocks: A-09; A-13
- [ ] **A-06** P3 - E2E Audit Tests (Playwright) (Depends on: A-03, B-04, B-06, B-07, B-08, B-09, C-01, C-02, C-03, C-04, C-05, A-12) | Blocks: A-09; A-13
- [x] **A-08** P3 - Unit Tests - All Gameplay Systems (Depends on: B-01 through B-09, C-01 through C-05, C-07, A-12) | Blocks: A-09; A-13
- [ ] **A-13** P3 - Consolidate P3 audits + publish 4 deduplicated track fix reports (Depends on: B-06, B-07, B-08, B-09, C-07, A-04, A-05, A-06, A-08) | Blocks: C-08; C-09; C-10; D-10; D-11; A-09

### Q4 / P4 Polish + Validation

- [ ] **C-08** P4 - Sound Effects & Music Production — Draft / integration-validated on `chbaikas/integration-C-08`. 11 SFX + 1 loop-safe music track shipped under `assets/generated/{sfx,music}/` and registered in `assets/manifests/audio-manifest.json`; full audio pipeline (C-06 adapter → C-07 cue runner → C-08 assets) exercised end-to-end in the bootstrap loop and `npm run validate:schema` passes. NOT yet closed: remaining SFX set (chain-reaction, power-up-collect, speed-boost-off, ghost-stun/return, player-respawn, menu-navigate, cancel, pause open/close, game-over sting, victory fanfare), loudness-normalization sign-off, optional `.ogg`, and the `A-13` P3 gate. PR message: `docs/pr-messages/C-08-sound-effects-music-production-pr.md` (Depends on: C-06, A-13) | Blocks: C-09; C-10; A-14
- [-] **C-09** P4 - Audio Preloading & Performance — Preloading infrastructure landed in the audio adapter: `preloadAudioAssets(cueIds, options)` async pre-decodes gameplay-critical SFX (`fetch → arrayBuffer → decodeAudioData`) in parallel into the existing buffer cache, reuses already-decoded buffers, deduplicates concurrent/duplicate requests via an in-flight map, and tolerates decode failures (warn, no crash). Music/ambience are excluded — only `sfx`-category cues are candidates. Verification: `tests/integration/adapters/audio-adapter.test.js` (C-09 suite: successful preload, cache reuse, dedup, decode-failure handling, music exclusion). Remaining C-09 scope (loading-state UI for slow decode >200ms, runtime preload-on-level-load wiring, performance evidence artifact) is deferred (Depends on: C-06, C-08, A-13) | Blocks: A-09; A-14
- [ ] **C-10** P4 - Audio Manifest Schema & Validation (Depends on: C-08, A-07, A-13) | Blocks: A-14
- [x] **D-10** P4 - Visual Asset Production - Gameplay Sprites (Depends on: D-06, D-08, A-13) | Blocks: D-11; A-14
- [ ] **D-11** P4 - Visual Assets (UI & Screens) + Visual Manifest & Validation (Depends on: C-05, D-10, A-07, A-13) | Blocks: A-09; A-14
- [ ] **A-09** P4 - Evidence Aggregation & Final QA Polish (Depends on: A-05, A-06, A-07, A-08, C-09, D-11, A-13) | Blocks: A-14
- [ ] **A-14** P4 - Consolidate P4 audits + publish 4 deduplicated track fix reports (Depends on: C-08, C-09, C-10, D-10, D-11, A-09) | Blocks: None

## 🔗 Cross-Document References

- Ticket definitions and verification gates: `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-c.md`, `docs/implementation/track-d.md`
- Track summary and milestones: `docs/implementation/implementation-plan.md`
- Coverage mapping and audit status: `audit-traceability-matrix.md`
- Audit question source of truth: `docs/audit.md`
