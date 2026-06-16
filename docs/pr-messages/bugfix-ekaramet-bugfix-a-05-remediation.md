# 🚀 Track A: Remediation Plan for A-05
> **Summary**: Implement all fixes identified in the A-05 remediation plan, addressing DOM safety checks, innerHTML write tracking, event payload schema validation, pause freeze invariants, natural ghost AI simulation, and replay determinism edge cases.

---

## 📝 Description

### 🔄 What Changed
- **DOM Safety & active Render DOM System validation ([renderer-dom.test.js](../../tests/integration/adapters/renderer-dom.test.js))**:
  - Replaced the legacy test file with real tests for the active `render-dom-system.js` to assert zero `innerHTML` writes at runtime and static code safety.
- **Tracked setter for innerHTML in renderer adapter tests ([renderer-adapter.test.js](../../tests/integration/adapters/renderer-adapter.test.js))**:
  - Replaced the plain property mock with a getter/setter to track the count of `innerHTML` writes, asserting 0 writes after board generation.
- **Event payload schema validation ([a-05-integration.test.js](../../tests/integration/gameplay/a-05-integration.test.js))**:
  - Added strict payload shape checks using `toMatchObject` for `PLAYER_GHOST_CONTACT` and `GhostDefeated` events.
- **Enhanced Pause Invariant Verification ([a-05-integration.test.js](../../tests/integration/gameplay/a-05-integration.test.js))**:
  - Verified that placing a bomb, pausing, and advancing 15 frames correctly freezes both the bomb `fuseMs` and the `levelTimer.remainingSeconds`.
  - Asserted HUD responsiveness during paused frames by verifying scoreState and playerLife remain readable.
- **Natural Ghost AI Movement Integration Test ([a-05-integration.test.js](../../tests/integration/gameplay/a-05-integration.test.js))**:
  - Added a pipeline test where Blinky moves naturally using pathfinding from (1, 3) toward player at (1, 1), getting caught in the bomb explosion and defeated.
- **Expanded Replay Determinism Edge Cases ([a-05-replay-determinism.test.js](../../tests/integration/gameplay/a-05-replay-determinism.test.js))**:
  - Added test cases covering empty traces, dense input traces, held keys persisted across frames, and pause/resume sequences.
- **Specs update ([track-a.md](../../docs/implementation/track-a.md))**:
  - Updated line 146 to list `render-dom-system.js` (createElement) instead of legacy `renderer-dom.js` (createElementNS).
- **Cleanup ([constants.test.js](../../tests/unit/resources/constants.test.js), [level-loader.test.js](../../tests/unit/game/level-loader.test.js))**:
  - Removed unused scoring constant imports and prefixed unused callback parameter with underscore to satisfy Biome check rules.

### 🎯 Why
- **Rationale**: To close all critical and high-priority testing and specification gaps for A-05 identified during codebase audit, ensuring absolute compliance with `AGENTS.md`.
- **Impact**: High. Hardens the integration boundary, ensuring DOM safety, pause clock accuracy, and replay determinism.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npx vitest run` / `npx biome check .`
> All 1224 tests pass, and biome check reports 0 warnings/errors.

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran vitest and biome locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `ekaramet/bugfix-a-05-remediation` conventions.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts (N/A for A-05).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: The tests confirm absolute lack of unsafe DOM sinks (`innerHTML`), validating safety against injection attacks.
- **Architecture**: ECS boundaries are fully intact, and simulation systems remain decoupled from the DOM.
