# 🚀 Track A: Resolve issues #245, #232, and #266

> **Summary**: Fix clock duplicate-timestamp epsilon clamp bypass (#245), fix unreachable `LEVEL_COMPLETE → VICTORY` state transition (#232), and document missing systems in the implementation plan (#266).

---

## 📝 Description

### 🔄 What Changed

- **Clock duplicate timestamp bypass (#245)**: Added a guarded early return in `tickClock` (`src/ecs/resources/clock.js`). Previously, when `frameTime === 0` (duplicate rAF timestamp), the function always returned early — but this incorrectly skipped the accumulator drain even when the accumulator held enough leftover time to produce a fixed step. The guard now only skips if `clock.accumulator < fixedDtMs`.

- **Unreachable VICTORY transition (#232)**: Removed dead state-transition logic from `src/ecs/systems/level-progress-system.js` (`LEVEL_COMPLETE → VICTORY`). This transition was never reachable from the system because `levelFlow` required to trigger it is cleared before the second tick. Moved `Victory` event emission into `src/game/game-flow.js` inside the `startGame()` completion path (final-level guard). Updated `tests/integration/gameplay/b-09-lifecycle-event-hooks.test.js` to reflect that `LevelCleared` is now the only event emitted by `level-progress-system`; `Victory` is emitted by `game-flow`. Added integration test `tests/integration/gameplay/victory-flow.test.js`.

- **Implementation plan missing systems (#266)**: Added the 8 previously missing systems to `docs/implementation/implementation-plan.md`.

### 🎯 Rationale
- **Clock guard**: Prevents missed fixed steps in edge-case frames (leftover accumulator ≥ fixedDt but `frameTime === 0`).
- **Victory relocation**: Moves high-level lifecycle event emission to the correct layer (`game-flow.js`) rather than inside a pure ECS simulation system.
- **Documentation accuracy**: Ensures the implementation plan accurately reflects all registered systems.

---

## 🧪 Verification & Audit

### ✅ Verification
- All **1348 unit/integration tests pass** cleanly (`npm run test`).
- `npm run policy` completes with ✅ ALL CLEAR.
- PR audit saved to [`docs/audit-reports/pr-audit-ekaramet-bugfix-A-266-245-232-batch-1.md`](docs/audit-reports/pr-audit-ekaramet-bugfix-A-266-245-232-batch-1.md).

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed `AGENTS.md` and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Bugfix-mode branch — cross-track edits allowed per policy.
- [x] **Branching**: Branch name follows `<owner>/bugfix-<slug>` convention.
- [x] **Audit Coverage**: Audit report generated and committed.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `level-progress-system` no longer emits `Victory` — ECS system only transitions `PLAYING → LEVEL_COMPLETE`. High-level lifecycle handled in `game-flow.js`.
- [x] **Adapter Injection**: No direct adapter imports.
- [x] **Safe Sinks**: No DOM manipulation added.
- [x] **No Bloat**: No framework or new dependencies added.

---

Closes #245
Closes #232
Closes #266
