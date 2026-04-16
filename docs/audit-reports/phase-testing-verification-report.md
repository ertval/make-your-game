# Phase Testing and Verification Report: Ms. Ghostman

> **Purpose**: Step-by-step testing instructions, audit strategies, and exit criteria for each implementation phase of the Ms. Ghostman project.
> **Status**: Mandatory Verification Protocol
> **Source of Truth**: [AGENTS.md](file:///home/ertval/code/zone-modules/make-your-game/AGENTS.md), [README.md](file:///home/ertval/code/zone-modules/make-your-game/README.md), `docs/audit.md`, `docs/requirements.md`, `docs/game-description.md`, `docs/implementation/implementation-plan.md`

---

## 1. Core Testing Strategy Layers

Every task must pass the appropriate testing level before phase verification can begin. This layered approach ensures that pure logic is verified before complex browser interactions are tested.

| Layer | Strategy | Command |
|---|---|---|
| **Unit Tests** | Mocks system ticks against component pools to ensure pure functions mutate data predictably. No DOM required. | `npm run test:unit` |
| **Integration Tests** | Verifies ECS world ordering, cross-system events, and adapter boundaries (using `jsdom`). | `npm run test:integration` |
| **E2E / Browser Tests** | Mandated via **Playwright** for verifying rendering pipelines, pause invariants, input behaviors, and the game loop. | `npm run test:e2e` |
| **Audit Tests** | Executes non-browser audit obligations (inventory/category parity, threshold declarations, manual evidence manifest checks) and browser audit thresholds (`F-17`, `F-18`, `B-05`). | `npm run test:audit` |
| **Schema Checks** | Ensures JSON maps and manifests comply with 2020-12 schema standards. | `npm run validate:schema` |
| **Policy Gates** | Asserts check (Biome), system isolation (DOM safety), and project-wide integrity. | `npm run policy` |

---

## 2. Audit and Performance Acceptance Categories

Every phase milestone must satisfy three distinct audit categories as defined in [AGENTS.md:L178-182](file:///home/ertval/code/zone-modules/make-your-game/AGENTS.md#L178-182):

1.  **Fully Automatable (Audit IDs: F-01 to F-16, B-01 to B-04)**: Verified via Vitest and Playwright to ensure crash-free rAF loops, hold-to-move input, single-player logic, and HUD functionality.
2.  **Semi-Automatable (Audit IDs: F-17, F-18, B-05)**: Verified via `page.evaluate()` and the Performance API to guarantee no recurring long tasks (> 50ms) and stable frame timing.
3.  **Manual-With-Evidence (Audit IDs: F-19 to F-21, B-06)**: Requires a **signed evidence note** attached to the PR with specific DevTools captures.

---

## 3. Automated Policy Gates

Completion is mathematically verified through script-driven enforcers to ensure repo-wide compliance:

*   **Local Policy Gate (`npm run policy`)**: Asserts check (Biome), system isolation (DOM safety), and test status for changed files.
*   **Repository Gate (`npm run policy:repo`)**: Ensures no forbidden APIs (canvas, eval, frameworks) were introduced and that lockfiles/traceability matrices are correctly paired.

---

## 4. Phase-Specific Completion Criteria

### P0 — Foundation: Engine & Runtime
**Goal**: Deterministic ECS runtime boots and ticks.

*   **Verification**: The `World` successfully schedules deterministic ticks. Unit tests for system isolation pass. Map and render resources are accessible.
*   **How to test**:
    - **Unit tests**: `npm run test:unit` — verifies ECS world assembly, entity store, query matching, clock, RNG, event queue.
    - **Integration tests**: `npm run test:integration` — verifies system ordering and cross-system event processing.
    - **Manual smoke test**: `npm run dev` and verify app boots with rAF ticking without crashing (**AUDIT-F-01**).
    - **Fixed-step loop**: Confirm `SIMULATION_HZ` (60) drives the accumulator-based simulation loop (**AUDIT-F-02**).
*   **Proof**: App boots, world ticks deterministically, map/resource contracts load, render intent pipeline defined.

### P1 — Visual Prototype: Maze & Movement
**Goal**: First on-screen playable loop with visible board + movement.

*   **Verification**: Board rendering is captured via Playwright. Input adapter correctly calculates movement and batches render intents.
*   **How to test**:
    - **Maze renders**: Run `npm run dev` and verify the CSS Grid maze is visible on screen.
    - **Player movement**: Use arrow keys — player sprite moves smoothly via `transform: translate()` (**AUDIT-F-11, F-12**).
    - **Frame rate**: Open DevTools Performance tab → record 60s trace → verify p95 frame time ≤ 16.7ms (**AUDIT-F-17, F-18**).
    - **Paint flashing**: Enable "Paint flashing" in DevTools → verify minimal repaint areas (**AUDIT-F-19**).
    - **Layer count**: Enable "Layer borders" in DevTools → verify minimal layers (**AUDIT-F-20, F-21**).
*   **Proof**: Board renders, player movement visible, frame pipeline runs through render-collect → DOM commit with isolated commit cycles.

### P2 — Playable MVP: Game Loop & HUD
**Goal**: Core gameplay loop with scoring, timer, lives, pause, HUD.

*   **Verification**: Scoring and life systems update deterministically. Pause UI responds without advancing simulation time.
*   **How to test**:
    - **Start/Pause Flow**: Press `Enter` to start; `ESC`/`P` to pause (**AUDIT-F-07**).
    - **Pause Invariants**: While paused, rAF stays active but simulation frozen (**AUDIT-F-10**).
    - **Continue/Restart**: Verify state preservation on continue and reset on restart (**AUDIT-F-08, F-09**).
    - **HUD Updates**: Collect pellets/lose lives and watch Timer/Score/Lives update (**AUDIT-F-14, F-15, F-16**).
*   **Proof**: HUD metrics update in E2E tests and manual evidence of functional pause/continue/restart.

### P3 — Feature Complete: AI & Mechanics
**Goal**: Full gameplay depth — bombs, ghost AI, power-ups, audio pre-decoding.

*   **Verification**: Ghost AI, Bomb systems, and Audio hooks are fully integrated. No memory leaks or structural overlaps in high-churn scenarios.
*   **How to test**:
    - **Bomb mechanics**: Drop bomb (`Space`) → 3s fuse → cross-pattern explosion. Triggers chain reactions and destroys walls.
    - **Ghost AI**: Verify 4 distinct behaviors (Blinky, Pinky, Inky, Clyde) (**AUDIT-F-13**).
    - **Audio**: SFX/music plays via `decodeAudioData()` preloading — no lag on first playback.
    - **CI gates**: `npm run policy` must pass all gates (check, test, coverage, SBOM).
*   **Proof**: Performance traces show sustained 60 FPS under full load with all systems active.

### P4 — Polish & Validation
**Goal**: Production quality, asset governance, audit-ready evidence.

*   **Verification**: 60-second headless smoke test passes with randomized inputs. Audit traceability matrix is 100% complete.
*   **How to test**:
    - **Full playthrough**: Play through all 3 levels → Victory screen shows stats.
    - **High scores**: Persist in `localStorage` and validate on read (**AUDIT-B-01**).
    - **SVG assets**: All visuals use SVG sprites under 50 path elements (**AUDIT-B-04**).
    - **Memory reuse**: No GC jank after warm-up — allocation timeline flat (**AUDIT-B-03**).
*   **Proof**: Final audit report and PR messages archived in `docs/audit-reports/` and `docs/pr-messages/`.

### Manual Evidence Manifest Contract

All Manual-With-Evidence audit IDs are tracked in `docs/audit-reports/manual-evidence.manifest.json`.
Policy checks and audit tests fail if any required manual audit ID is missing, if required artifacts are empty, or if artifact paths do not exist.

---

## 5. Manual Evidence Artifacts to Collect

| Audit ID | Evidence Required | How to Capture |
|---|---|---|
| **AUDIT-F-19** | Paint flashing screenshot (minimal paints) | DevTools → Rendering → Paint flashing → screenshot during gameplay |
| **AUDIT-F-20** | Layer count screenshot (minimal layers) | DevTools → Rendering → Layer borders → screenshot |
| **AUDIT-F-21** | Layer promotion verification | DevTools → Rendering → confirm only player/ghost sprites have `will-change: transform` |
| **AUDIT-B-06** | Overall quality sign-off | Review of all evidence + code quality + review sign-off |

Manifest reference for required artifact templates:
`docs/audit-reports/manual-evidence.manifest.json`

---

## 6. Full Verification Command Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Manual playtesting and visual verification |
| `npm run test:unit` | Pure system/component logic tests |
| `npm run test:integration` | Cross-system interaction + adapter boundary tests |
| `npm run test:e2e` | Playwright browser tests (pause, input, HUD, loop) |
| `npm run test:audit` | Validation of all audit questions |
| `npm run policy` | PR merge gate (check + test + coverage + schema + SBOM) |
| `npm run policy:repo` | Repo-wide integrity and traceability check |
| `npm run ci` | Full local quality gate suite |

---

## 7. Completion & Administrative Done Criteria

The project/phase is **complete** only when ALL of the following conditions are met:

### Technical Checklist
- [ ] All tickets in `docs/implementation/ticket-tracker.md` marked `[x]` (Done).
- [ ] All audit questions in `docs/audit.md` pass (automated + manual evidence).
- [ ] `docs/implementation/audit-traceability-matrix.md` aligns all executed code with requirement IDs.
- [ ] `npm run ci` and `npm run policy` pass cleanly.
- [ ] Performance evidence meets acceptance criteria (p95 ≥ 60 FPS, p95 frame time ≤ 16.7ms).
- [ ] ECS boundaries remain intact (no forbidden DOM calls in simulation systems).
- [ ] Single-player gameplay preserved (Pause: Continue/Restart, HUD: timer/score/lives).

### Administrative Checklist
- [ ] Tickets are marked `[x]` in `ticket-tracker.md`.
- [ ] `audit-traceability-matrix.md` is updated with executable test paths.
- [ ] The PR audit report produced by the automated prompt is saved in `docs/audit-reports/`.
- [ ] PR messages are archived in `docs/pr-messages/`.
- [ ] Signed evidence notes for manual audit items are attached to the final PR.
