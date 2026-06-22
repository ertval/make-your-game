# 🚀 Fix: Power-Up pickups now increment HUD Bombs/Fire counters

> **Summary**: Power-Up pickups (💣+ / 🔥+ / 👟) applied their effects in simulation but the HUD never reflected them. The HUD system fed the adapter hardcoded `bombs: 0` / `fire: 0` and never read the player store, so the `Bombs:`/`Fire:` counters were pinned to `0`. This wires the HUD to the live player stats and locks the full pickup→effect→display chain with tests.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/systems/hud-system.js`**: Read `maxBombs` / `fireRadius` from the player store for the live player entity and forward them to the HUD adapter instead of hardcoded zeros. Added `playerResourceKey` (`'player'`) and `playerEntityResourceKey` (`'playerEntity'`) options (matching bootstrap defaults), a `readPlayerStat` helper with a safe `0` fallback when no player is registered, and the two keys to `resourceCapabilities.read`.
- **`tests/unit/systems/hud-system.test.js`** (new): Verifies the HUD forwards canonical starting stats (`bombs: 1`, `fire: 2`), reflects collected bomb/fire power-ups, and falls back to `0` when no player entity exists.
- **`tests/integration/gameplay/power-up-pickup-effect.test.js`** (new): Drives the real `createBootstrap()` loop and asserts the full chain — collision pickup → power-up effect → +100 score → HUD-readable store → rendered HUD DOM value (`Bombs:` text `1 → 2`) — for bomb, fire, and speed pickups.

### 🎯 Why
- **Rationale**: The reported defect ("Power-Up pickups don't increment counters or apply effect") was, at its root, a display bug. The collision/power-up/scoring/movement systems already applied effects correctly; only the HUD failed to surface them, making it look like nothing happened.
- **Impact**: Display-layer only — no simulation systems changed. The HUD now reads the same player store consumed by `bomb-tick-system` (bomb capacity / explosion radius) and `player-move-system` (speed), so on-screen counters stay consistent with gameplay.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*
- Full `vitest` suite: **1019 passing** (80 files). `npm run check` (Biome): clean on changed files.

### 📋 Audit Traceability
- **B-07** | `Automated` | Verification: `power-up pickup effect (runtime wiring)` | Evidence: `tests/integration/gameplay/power-up-pickup-effect.test.js`
- **D-08** | `Automated` | Verification: `hud-system` | Evidence: `tests/unit/systems/hud-system.test.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [ ] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (if applicable). *(N/A — display-layer fix covered by automated tests.)*

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`). HUD system only reads data resources; DOM writes stay in `hud-adapter.js`.
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources (HUD adapter resolved via `hudAdapter` resource key).
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs (adapter writes via `textContent` only).
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact (none).

---

## 🛡️ Security & Architecture Notes
- **Security**: No new trust boundaries or sinks. HUD values are integers read from typed-array stores and rendered via the adapter's existing `textContent` path.
- **Architecture**: HUD system now declares read capabilities on `player` and `playerEntity`; values flow store → hud-system → hud-adapter → DOM, preserving ECS/adapter separation.
- **Risks**: Low. Change is confined to the HUD render path; the non-adapter fallback path is unchanged (and unused by the live game). Out of scope and tracked separately: bomb/fire entities still lack a `RENDERABLE` component so they don't render, and there is no dedicated speed-boost HUD indicator (by design).

---

<details>
<summary>📖 <b>Local Command Reference</b> (Click to expand)</summary>

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run test:unit` | Debug: Unit tests only |
| `npm run test:integration` | Debug: Integration tests only |
| `npm run test:e2e` | Debug: Playwright browser tests |
| `npm run test:audit` | Debug: Audit map validation |
| `npm run validate:schema` | Schema validation |

</details>
