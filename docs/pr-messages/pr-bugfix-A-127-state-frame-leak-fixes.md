# 🚀 Track A: Resolve state, loop, mutation, event queue, and audit traceability bugs

> **Summary**: Resolves ECS deferred mutation phase-symmetry defects, resets spawn states/bomb occupancies on level transition, clears event queue on restart, implements rAF quarantine timing improvements (setTimeout polling + frame probe reset), drains the event queue each frame to prevent unbounded memory growth, and updates the audit traceability matrix for AUDIT-F-13.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/world/world.js`**: Added `applyDeferredMutations()` to `runRenderCommit()` and `runMeta()` to restore phase symmetry for deferred entity/component mutations. (Resolves BUG-15)
- **`src/game/bootstrap.js`**: 
  - Reset `ghostSpawnState`, `deadGhostIds`, and `bombCellOccupancy` immediately on level transition (`onLevelLoaded`) to prevent timing/occupancy leak between levels. (Resolves BUG-14)
  - Reset the `eventQueue` resource inside `onRestart` callback to prevent phantom SFX replay on the first post-restart tick. (Resolves BUG-16)
  - Reset event queue, frame counters, and sprite pool in `onRestart` callback.
  - Hoisted `eventQueueResourceKey` declaration to resolve a temporal dead zone (TDZ) ReferenceError on synchronous bootstrap restart.
- **`src/main.ecs.js`**:
  - Drains the event queue after `stepFrame()` in the main animation loop to prevent memory leak (~216K events/hour). (Resolves BUG-01)
  - Employs `setTimeout` polling (50ms) instead of rAF loop during error quarantine, reducing CPU load. (Resolves BUG-19)
  - Resets frame probe timestamp on quarantine exit to avoid poisoning p95 stats with the cooldown gap.
- **`docs/implementation/audit-traceability-matrix.md`**: Mapped `tests/e2e/audit/audit.browser.spec.js` to `AUDIT-F-13` to cover the new spawn-state level reset tests.

---

## 🧪 Verification & Audit

### ✅ Verification
- **`npm run check`**: Biome check passes (formatting/linting).
- **`npm run test`**: 1053 tests pass in Vitest.
- **`npm run test:e2e`**: 44 tests pass in Playwright.
- **`npm run policy`**: Fully PASS.

---

## 🛡️ Security & Architecture Notes
- **Architecture**: Deferred mutations are now flushed symmetrically across all dispatch paths (`runFixedStep`, `runRenderCommit`, `runMeta`).
- **Timing**: Clock baseline resynchronization is robustly handled on visibility/focus/unpause lifecycle transitions, keeping loop deterministic.
- **Event Queue**: Draining occurs in the rAF loop (in `main.ecs.js`, not in simulation systems) to preserve the independence of integration tests while avoiding memory leak.

---

Closes #114
Closes #127
Closes #128
Closes #129
Closes #132
Closes #137
