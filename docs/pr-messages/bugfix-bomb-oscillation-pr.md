# Fix: Ghost AI oscillates against a bomb tile instead of re-routing

> **Summary**: Ghosts trapped in infinite back-and-forth between a bomb tile and an adjacent corridor cell. Root cause: ghost-ai-system ran before collision-system in the fixed-step pipeline, so bomb-cell occupancy was always stale. Fix publishes bomb occupancy in the logic phase, documents the 1-frame phase lag, and fences the `readBombOccupancyCells` empty-array edge case.

---

## 📝 Description

### 🔄 What Changed

- **`src/ecs/systems/collision-system.js`** (+64 lines): Registers and populates a `bombCellOccupancy` resource (`Set<number>`) in the `logic` phase — the authoritative lane for bomb lifecycle state. The physical-phase ghost-ai-system reads this resource and refuses bomb cells during path selection. Includes a block comment documenting the 1-frame phase lag and why it's acceptable (`shouldBlockGhostFromBombCell` catches same-frame walk-ins). Active bomb entities are queried by `collider.type === COLLIDER_TYPE.BOMB` matched against bomb-store row/col.

- **`src/ecs/systems/ghost-ai-system.js`** (+5/-1 lines): `readBombOccupancyCells` now always returns a (possibly empty) `Set` instead of `null` for an empty resource array. The defensive contract distinguishes "resource registered with zero bombs" from "resource not registered at all". Behavior is unchanged (`Set.has()` on an empty Set is always `false`), but the null-branch previously disabled the lookup silently, which complicated future debugging.

- **`src/main.ecs.js`** (+1 line): Registers the `bombCellOccupancy` resource key in the phase capabilities map so the collision-system can publish to it at runtime.

- **`src/game/bootstrap.js`** (+2 lines): Initializes the `bombCellOccupancy` resource as an empty array before the first system dispatch.

- **`src/ecs/systems/board-sync-system.js`**: +1 line import for `CELL_TYPE` in the new E2E-verifiable init path.

- **`src/ecs/systems/render-collect-system.js`**: +4 lines hook into the same system for render-backend verification.

- **`tests/e2e/render-desync-bugs.spec.js`** (+384 lines): New `#107` E2E test — injects a bomb into an inactive pool slot at a corridor cell, repositions Blinky adjacent to it, then samples ghost position and bomb occupancy every 100ms for 1.2s. Asserts two acceptance gates: (1) `bombCellOccupancy` contains the bomb cell in every sample, (2) ghost is never on the bomb tile. Auto-skips with a self-describing reason when the loaded map has no horizontal corridor.

- **`tests/unit/systems/ghost-ai-system.test.js`** (+22 lines): New unit test "treats an empty array bomb-occupancy resource as registered-but-empty (no avoidance, no throw)" pinning the defensive contract.

- **`tests/unit/systems/collision-system.test.js`** (+21 lines): Unit test proving the collision-system builds and publishes bomb-cell occupancy.

- **`tests/integration/gameplay/b-04-collision-system.test.js`** (+16 lines): Integration test verifying occupancy flows through the fixed-step dispatch.

- **`tests/unit/game/game-flow-extended.test.js`** (+10/-? lines): Logger injection for cleaner test output under bootstrap error paths.

- **`tests/unit/main.ecs.test.js`** (+6/-? lines): Resource key registration in the system test harness.

- **`tests/unit/systems/render-collect-system.test.js`** (+6 lines): Render-backend bomb scan coverage.

- **`tests/unit/render-intent/render-intent.test.js`** (+2 lines): Render intent mapping.

### 🎯 Why

- **Root cause**: Ghost AI runs in the `physics` phase; collision-system runs in `logic`. The phase ordering meant ghost-ai-system always read stale bomb occupancy (or none at all), causing the ghost to re-path toward the bomb tile every frame and then reverse — the infinite oscillation reported as bug #107.
- **Fix strategy**: Publish bomb occupancy from the authoritative system (collision-system, logic phase) and consume it in ghost-ai-system (physics phase). The 1-frame lag is acceptable because `shouldBlockGhostFromBombCell` in collision-system prevents same-frame walk-ins.
- **Defensive gap**: `readBombOccupancyCells` returned `null` for an empty resource array, which the caller treated as "no bomb occupancy data available" — the same path as "resource not registered". This made future debugging harder if the resource was registered but empty.
- **Addresses**: #107 (bomb-oscillation bug), plus general robustness for ghost AI navigation around hazards.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Unit tests**: 1038/1038 pass (+1 new test for empty-array edge case, +collision-system test, +integration test).
- [x] **E2E tests**: 42/42 pass (+1 new #107 test, stable across 3 consecutive runs).
- [x] **Audit tests**: 17/17 pass.
- [x] **Biome**: 0 errors, 0 warnings.
- [x] **Subagent verification**: Two independent models (minimax-m3-free + deepseek-v4-flash-free) confirm all concerns resolved with `ALL CONCERNS RESOLVED` verdict.

### 📋 Audit Traceability
- **AUDIT-F-17** (no dropped frames) | Semi-Automatable | Unaffected — no new per-frame loops or allocations in hot paths. Collision-system bomb scan is a single pass over `bombStore.activeCount` entries, already inside the existing logic-phase dispatch.
- **AUDIT-F-18** (60 FPS) | Semi-Automatable | Same reasoning as F-17.
- **AUDIT-F-03** (single-player) | Fully Automatable | Unaffected. Existing E2E assertions pass.
- **AUDIT-CI-09** (DOM element budget) | Fully Automatable | Unaffected — zero new DOM elements.
- **AUDIT-B-03** (entity/ DOM pooling) | Fully Automatable | Unaffected.

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](../../AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run check` and `npm run test` locally; all pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope (Track B / Track D boundary).
- [x] **Branching**: `ekaramet/bugfix-107` — follows the `<owner>/bugfix-<NN>` exception convention established by earlier bugfix branches.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references — collision-system reads `collider`/`bomb` typed arrays and writes to a `Set<number>` resource. Ghost-ai-system reads the same resource. Both are pure simulation systems.
- [x] **Adapter Injection**: No adapters touched.
- [x] **Safe Sinks**: No new DOM sinks.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Zero `package.json` or lockfile changes.

---

## 🛡️ Security & Architecture Notes
- **Security**: No new trust boundaries. Bomb occupancy is written by collision-system (trusted) and read by ghost-ai-system (trusted). No untrusted input on any path.
- **Architecture**: The collision-system now publishes bomb occupancy in the logic phase, consumed by ghost-ai-system in the next frame's physics phase. This creates a cross-system data dependency that is documented as a 1-frame lag — acceptable because `shouldBlockGhostFromBombCell` is the same-frame safety net.
- **Risks**: Low. The occupancy set is rebuilt every logic phase from scratch, so no stale-state accumulation. The empty-array defensive fix is pure robustness with zero behavioral change.

---

<details>
<summary>📖 <b>Local Command Reference</b> (Click to expand)</summary>

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run test:unit` | Debug: Unit tests only |
| `npm run test:e2e` | Debug: Playwright browser tests |
| `npm run test:audit` | Debug: Audit map validation |

</details>
