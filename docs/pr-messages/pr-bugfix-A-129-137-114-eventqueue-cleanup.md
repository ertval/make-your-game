# 🚀 Track A: Fix event queue bugs (BUG-16, BUG-01, DEAD-01)

> **Summary**: Clear event queue on restart to prevent phantom SFX replay, drain queue each frame to prevent unbounded memory growth, and verify `changed-files.txt` is already gitignored and untracked.

---

## 📝 Description

### 🔄 What Changed
- **`src/game/bootstrap.js`**: Reset `eventQueue` resource in `onRestart` callback so stale events (e.g., `BombDetonated`, `GhostDefeated`, `LevelCleared`) are not replayed on the first post-restart tick.
- **`src/main.ecs.js`**: Call `drain()` on the event queue after `stepFrame()` in the game runtime loop to prevent unbounded event accumulation (~216K events/hour at 60 Hz).
- **`tests/unit/game/bootstrap-extended.test.js`**: Added test verifying event queue is empty after restart (BUG-16).
- **`tests/unit/main.ecs.test.js`**: Added test verifying event queue is drained each frame through the game runtime (BUG-01).

### 🎯 Why
- **BUG-16 (HIGH)**: Phantom sounds play on restart because previously enqueued events are replayed by the audio cue runner. The fix clears the event queue during restart, ensuring a clean slate.
- **BUG-01 (MEDIUM)**: Five simulation systems emit events each fixed step but no consumer calls `drain()`, causing a memory leak. The fix drains the queue in the rAF loop after each frame's simulation completes.
- **DEAD-01 (MEDIUM)**: `changed-files.txt` was already added to `.gitignore` and is no longer tracked; verified to confirm the issue is resolved.

---

## 🧪 Verification & Audit

### ✅ Verification
- **`npm run check`**: Biome lint passes with 0 errors.
- **`npm run test`**: 1047 tests pass (81 test files).
- **`npm run policy:checks`**: Policy checks pass (bugfix mode).
- **`npm run policy:forbidden`**: No forbidden patterns found.
- **`npm run policy:header`**: Source headers compliant.

### 📋 Audit Traceability
- N/A — Bug fixes and cleanup, no direct AUDIT mapping.

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed AGENTS.md and agentic workflow guide.
- [x] **Policy Compliance**: Ran policy checks locally; all pass.
- [x] **Ownership**: Files remain within Track A ownership scope (bootstrap.js, main.ecs.js, test files).
- [x] **Branching**: Branch name follows `ekaramet/bugfix-A-<NN>-<short-description>` convention.
- [x] **Audit Coverage**: No new AUDIT requirements introduced.
- [x] **Evidence**: Not applicable (no Manual-With-Evidence items).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No DOM references in systems. Event queue accessed through world resource API.
- [x] **Adapter Injection**: No direct adapter imports. `drain()` is called in the runtime orchestrator (`main.ecs.js`), not in simulation systems.
- [x] **Safe Sinks**: Only `textContent` and safe attribute APIs used.
- [x] **No Bloat**: No framework imports or canvas APIs.
- [x] **Dependencies**: No dependency changes.

---

## 🛡️ Security & Architecture Notes
- **Architecture**: Event queue drain is correctly placed in the rAF loop (not in `bootstrap.stepFrame()`) so integration tests that inspect drained events can still call `stepFrame` directly.
- **Risks**: Low — the changes are narrow and well-scoped. Existing integration tests continue to pass.

---

Closes #129
Closes #114
Closes #137
