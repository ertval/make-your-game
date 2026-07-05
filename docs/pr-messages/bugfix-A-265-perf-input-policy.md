# 🚀 Track A: Resolve issues #265, #264, and #262
> **Summary**: Optimize query allocation performance, relocate input system to physics phase, and fix overlapping glob patterns.

---

## 📝 Description

### 🔄 What Changed
- **Query Optimization (#265)**: Added a versioned cache Map inside `QueryIndex` (`src/ecs/world/query.js`) that caches matching entities per query mask. The cache is invalidated on mask changes or entity destruction, guaranteeing zero-allocation matching for repeated queries on unchanged worlds.
- **Input System Relocation (#264)**: Relocated `input-system` from the `meta` phase to the beginning of the `physics` phase (`src/ecs/systems/input-system.js`, `src/game/bootstrap.js`) to ensure inputs are snapshotted and consumed exactly once per fixed simulation step (satisfying the AGENTS.md snapshot determinism rule). Registered a lightweight `meta-input-system` wrapper in the `meta` phase that only runs when the simulation is paused to handle pause menu transitions cleanly. Added a frame latch (`system.metaUpdated`) to prevent input loss during pause-to-resume transition frames when a logic step runs in the same frame.
- **Overlapping Glob Patterns (#262)**: Removed overlapping assets/maps and visual-related globs from Track A's ownership list in `scripts/policy-gate/lib/policy-utils.mjs`, delegating them exclusively to Track D. Added a unit test in `tests/unit/policy-gate/policy-utils.test.js` asserting that the intersection of Track A, B, C, and D rules is empty (excluding `SHARED_OWNERSHIP_PATTERNS` and the dual-layer `tests/` directory).

### 🎯 Rationale
- **Query Cache**: Reduces garbage collection pressure in the hot path.
- **Input Snapshotting**: Guarantees input correctness and determinism during catch-up steps of slow frames.
- **Frame Latch**: Avoids input loss on pause-to-resume frames by ensuring inputs are not drained twice.
- **Glob Overlaps**: Resolves track governance boundaries between Track A and Track D.

---

## 🧪 Verification & Audit

### ✅ Verification
- All 1300 unit/integration/E2E tests pass cleanly.
- Added a regression test verifying pause-to-resume input preservation with non-zero accumulator.
- Running `npm run policy` completes with PASS.

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/bugfix-<slug>` convention.
- [x] **Audit Coverage**: Confirmed full coverage.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No gameplay simulation code accesses DOM APIs.
- [x] **Adapter Injection**: No direct adapter imports.
- [x] **Safe Sinks**: Safe DOM elements intact.
- [x] **No Bloat**: No framework dependencies added.
- [x] **Dependencies**: No dependencies added.

---

Closes #265
Closes #264
Closes #262
