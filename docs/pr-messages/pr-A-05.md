# 🚀 feat(tests): implement replay utility and simulation determinism tests for A-05

> **Summary**: Implements a complete replay utility and state serialization checks, adds a multi-system pipeline integration test, and verifies simulation determinism.

---

## 📝 Description

### 🔄 What Changed
- **Replay Utility ([replay.js](file:///home/ertval/code/zone-modules/make-your-game/src/debug/replay.js))**:
  - Implemented `serializeWorldState(world)` to serialize all active ECS components and logic resources (clock, score, level timer, life, ghost spawns, event queue, RNG state).
  - Implemented `hashWorldState(world)` using a stable DJB2 hashing implementation.
  - Implemented `ReplayInputAdapter`, `ReplayRecorder`, and `runReplay` to record held/pressed inputs and play them back deterministic frame-by-frame.
- **Pipeline Test ([a-05-integration.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/integration/gameplay/a-05-integration.test.js))**:
  - Added multi-system verification covering the chain: player places bomb -> fuse ticks down -> bomb detonates -> fire collides with ghost -> ghost is defeated -> scoring system awards points.
- **Determinism Test ([replay-determinism.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/integration/gameplay/replay-determinism.test.js))**:
  - Added test case checking that replay on the same seed and trace generates identical state hashes.
  - Added test case checking that running the replay on a different seed produces differing state hashes due to divergent PRNG drop chances.

### 🎯 Why
- **Rationale**: Provides the core automated validation harness for simulation drift, ensuring we can guarantee seed-based reproducibility of bugs and gameplay sessions.
- **Impact**: Hardens the ECS simulation layer boundary, verifying logic is decoupled from DOM rendering and timing.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **AUDIT-F-09** | `[Fully Automatable]` | Verification: `replay-determinism.test.js` | Evidence: [replay-determinism.test.js](file:///home/ertval/code/zone-modules/make-your-game/tests/integration/gameplay/replay-determinism.test.js)

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention.
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
- **Security**: The input trace reading and state serialization respect the strict Trusted Types and Content Security Policies, avoiding dynamic script injection or eval.
- **Architecture**: Enforces the DOM-isolation boundary by keeping replay/serialization pure and driving the simulation from standard fixed step tick clocks.
- **Risks**: None. Tests run in headless vitest suite.

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
