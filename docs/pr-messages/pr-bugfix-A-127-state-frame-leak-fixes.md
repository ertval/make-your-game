# 🚀 Track A: Resolve state, loop, mutation, and audit traceability bugs (A-127)

> **Summary**: Resolves ECS deferred mutation phase-symmetry defects, resets spawn states/bomb occupancies on level transition, clears event queue on restart, implements rAF quarantine timing improvements (setTimeout polling + frame probe reset), and updates the audit traceability matrix for AUDIT-F-13.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/world/world.js`**: Added `applyDeferredMutations()` to `runRenderCommit()` and `runMeta()` to restore phase symmetry for deferred entity/component mutations.
- **`src/game/bootstrap.js`**: 
  - Reset `ghostSpawnState`, `deadGhostIds`, and `bombCellOccupancy` immediately on level transition (`onLevelLoaded`) to prevent timing/occupancy leak between levels.
  - Reset event queue, frame counters, and sprite pool in `onRestart` callback.
  - Hoisted `eventQueueResourceKey` declaration to resolve a temporal dead zone (TDZ) ReferenceError on synchronous bootstrap restart.
- **`src/main.ecs.js`**:
  - Drains the event queue after `stepFrame()` in the main animation loop to prevent memory leak (~216K events/hour).
  - Employs `setTimeout` polling (50ms) instead of rAF loop during error quarantine, reducing CPU load.
  - Resets frame probe timestamp on quarantine exit to avoid poisoning p95 stats with the cooldown gap.
- **`docs/implementation/audit-traceability-matrix.md`**: Mapped `tests/e2e/audit/audit.browser.spec.js` to `AUDIT-F-13` to cover the new spawn-state level reset tests.

---

## 🧪 Verification & Audit

### ✅ Verification
- **`npm run check`**: Biome check passes (formatting/linting).
- **`npm run test`**: 1053 tests pass in Vitest.
- **`npm run test:e2e`**: 44 tests pass in Playwright.
- **`npm run policy -- --require-approval=false`**: Fully PASS.

### 📋 Audit Traceability
- **AUDIT-F-13**: Spawn-state reset assertions added to `audit.browser.spec.js` AUDIT-F-13 test (elapsedMs=0, releasedGhostIds=0 after level transition). Mapped in traceability matrix.

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed AGENTS.md and agentic workflow guide.
- [x] **Policy Compliance**: Ran policy checks locally; all pass.
- [x] **Ownership**: Files remain within Track A ownership scope.
- [x] **Branching**: Branch name `ekaramet/bugfix-A-127-state-frame-leak-fixes` follows convention.
- [x] **Audit Coverage**: Traceability matrix synchronized with changed test paths.
- [x] **Evidence**: Tested with Vitest and Playwright.

---

## 🛡️ Security & Architecture Notes
- **Architecture**: Deferred mutations are now flushed symmetrically across all dispatch paths (`runFixedStep`, `runRenderCommit`, `runMeta`).
- **Timing**: Clock baseline resynchronization is robustly handled on visibility/focus/unpause lifecycle transitions, keeping loop deterministic.
