# Phase Testing and Verification Report: Ms. Ghostman

Based on the project documentation (`AGENTS.md`, `implementation-plan.md`, and `agentic-workflow-guide.md`), this report outlines the mandatory testing and verification strategies for each phase of development.

---

## 1. Core Testing Strategy Layers
Every task must pass the appropriate testing level before phase verification can begin:

*   **Unit Tests (`npm run test:unit`)**: Mocks system ticks against component pools to ensure pure functions mutate data predictably.
*   **Integration Tests (`npm run test:integration`)**: Verifies ECS world ordering, cross-system events, and adapter boundaries (using `jsdom`).
*   **E2E / Browser Tests (`npm run test:e2e`)**: Mandated via **Playwright** for verifying rendering pipelines, pause invariants, input behaviors, and the game loop.
*   **Audit Tests & Schema Checks (`npm run test:audit` & `npm run validate:schema`)**: Verifies asset mappings, `audit.md` references, and data structures.

---

## 2. Audit and Performance Acceptance Categories
Every phase milestone must satisfy three distinct audit categories:

1.  **Fully Automatable (Audit IDs: F-01 to F-16, B-01 to B-04)**: Verified via Playwright to ensure crash-free rAF loops, hold-to-move input, single-player logic, and HUD functionality.
2.  **Semi-Automatable (Audit IDs: F-17, F-18, B-05)**: Verified via `page.evaluate()` and the Performance API to guarantee no recurring long tasks (> 50ms).
3.  **Manual-With-Evidence (Audit IDs: F-19 to F-21, B-06)**: Requires a **signed evidence note** attached to the PR with:
    *   **Frame Stats**: Trace showing `p50`, `p95` (≤ 16.7 ms), and `p99` metrics.
    *   **Layer Strategy**: Verification that only player and ghost sprites carry `will-change: transform`.
    *   **Pause Invariants**: Documentation that `requestAnimationFrame` remains active while simulation time is frozen.

---

## 3. Automated Policy Gates
Completion is mathematically verified through script-driven enforcers:

*   **Local Policy Gate (`npm run policy`)**: Asserts formatting (Biome), system isolation (DOM safety), and test status.
*   **Repository Gate (`npm run policy:repo`)**: Ensures no forbidden APIs (canvas, eval, frameworks) were introduced and that lockfiles are correctly paired.

---

## 4. Phase-Specific Completion Criteria

### P0 / M1: Engine Foundation
*   **Verification**: The `World` successfully schedules deterministic ticks. Unit tests for system isolation pass. Map and render resources are accessible.
*   **Proof**: Green `test:unit` and `test:integration` suites for the core engine.

### P1 / M2: Visual Prototype
*   **Verification**: Board rendering is captured via Playwright. Input adapter correctly calculates movement and batches render intents.
*   **Proof**: First successful E2E visual capture and evidence of isolated DOM commit cycles.

### P2 / M3: Playable MVP
*   **Verification**: Scoring and life systems update deterministically. Pause UI responds without advancing simulation time.
*   **Proof**: HUD metrics update in E2E tests and manual evidence of functional pause/continue/restart.

### P3 / M4: Feature Complete + Hardening
*   **Verification**: Ghost AI, Bomb systems, and Audio hooks are fully integrated. No memory leaks or structural overlaps in high-churn scenarios.
*   **Proof**: Performance traces show sustained 60 FPS under full load.

### P4 / M5: Full Game + Polish
*   **Verification**: 60-second headless smoke test passes with randomized inputs. Audit traceability matrix is 100% complete.
*   **Proof**: Final audit report and PR messages archived in `docs/audit-reports/` and `docs/pr-messages/`.

---

## 5. Administrative Completion
A phase is only "Done" when:
1.  Tickets are marked `[x]` in `ticket-tracker.md`.
2.  `audit-traceability-matrix.md` aligns all executed code with requirement IDs.
3.  The PR audit report produced by the automated prompt is saved in the repository.
