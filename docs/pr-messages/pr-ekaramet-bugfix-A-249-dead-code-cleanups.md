# 🚀 Track A: Resolve issues #254, #251, and #249 (dead code cleanups)
> **Summary**: Prunes redundant package scripts, unused checklist constants, and un-exports 13 internal symbols across the codebase. Introduces a comprehensive global unused export guard to prevent future export drift.

---

## 📝 Description

### 🔄 What Changed
- **package.json**: Removed the redundant `"prod"` script (`npm run build && npm run preview`).
- **scripts/policy-gate/lib/policy-utils.mjs**: Removed the unused checklist constants (`REQUIRED_SECTIONS`, `REQUIRED_CHECKBOXES`, `REQUIRED_LAYER_CHECKBOXES`).
- **src/game/bootstrap.js**: Un-exported `registerSystemsByPhase`.
- **src/debug/replay.js**: Un-exported `serializeWorldState`, `hashWorldState`, and `ReplayInputAdapter`. Cleaned up JSDoc headers.
- **src/ecs/resources/map-resource.js**: Un-exported `validateMapSchema`. Cleaned up JSDoc headers.
- **src/ecs/systems/bomb-tick-system.js**: Un-exported `createBombDetonationRequest`. Cleaned up JSDoc headers.
- **src/ecs/systems/player-move-system.js**: Un-exported `startMoveTowardDirection` and `stopAtCurrentTarget`. Cleaned up JSDoc headers.
- **src/adapters/io/input-adapter.js**: Un-exported `KEYBOARD_CODE_BINDINGS` and `KEYBOARD_KEY_BINDINGS`. Cleaned up JSDoc headers.
- **src/adapters/dom/hud-adapter.js**: Un-exported `formatLives`, `formatScore`, and `formatTimer`. Cleaned up JSDoc headers.
- **tests/unit/security/package-config.test.js**: Added tests checking that the redundant `prod` script is not defined, while `build` and `preview` are.
- **tests/unit/dead-code/exports.test.js**: Added tests for checklist constants removal and implemented a global recursive sweep test that dynamically inspects all files in `src/` to ensure zero redundant exports.

### 🎯 Why
- **Rationale**: Clean up dead code, redundant configurations, and unused constants to reduce maintenance overhead and prevent misleading documentation.
- **Impact**: Minimizes public API surface area, keeps modules well-encapsulated, and ensures future unused exports are caught automatically in CI via `exports.test.js`.
- **Issues Resolved**: Closes #254, Closes #251, Closes #249.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **DEAD-06** | `[Automated]` | Verification: `package-config.test.js` | Evidence: `tests/unit/security/package-config.test.js`
- **DEAD-03** | `[Automated]` | Verification: `exports.test.js` | Evidence: `tests/unit/dead-code/exports.test.js`
- **DEAD-01** | `[Automated]` | Verification: `exports.test.js` | Evidence: `tests/unit/dead-code/exports.test.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/bugfix-<slug>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (if applicable).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: The changes only remove unused variables, scripts, and exports. Sinks and security-sensitive APIs were not altered.
- **Architecture**: Enforces stricter module encapsulation. The automated global export sweep prevents future code rot.
- **Risks**: None. Refactored files were verified across both unit and E2E suites.

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
