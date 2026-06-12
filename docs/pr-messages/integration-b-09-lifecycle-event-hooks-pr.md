# 🚀 Integration B-09: Cross-System Lifecycle Event Hooks

> **Summary**: Completes the B-09 cross-system gameplay event contract by wiring the four remaining Track C emitters — `LifeLost` + `GameOver(lives)` (life-system), `GameOver(time)` (timer-system), and `LevelCleared` + `Victory` (level-progress-system) — through the D-01 event queue, and registering `power-up-system` in the default bootstrap logic phase so its `GhostStunned` (and power-up effects) actually fire in the real game loop. The shared event module already owned all 13 schemas; this branch only adds emission and runtime wiring.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/systems/life-system.js`** — Emits `LifeLost` then `GameOver(cause: lives)`. Adds the `eventQueueResourceKey` option (default `'eventQueue'`), declared in the system's `write` capabilities. On a consumed death it captures the player's tile **before** respawn snaps the entity back to spawn, then emits the spatial `LifeLost` payload (`entityId` + `tile` + `livesRemaining` after decrement). When the final life is consumed it follows with the lifecycle `GameOver(lives)` so consumers observe the canonical `LifeLost → GameOver` ordering. The spatial emit is guarded on a concrete entity at a finite tile (the validator rejects NaN tiles, and a throw inside `update` would quarantine the system); `emitGameplayEvent` is itself a no-op when no queue is registered.
- **`src/ecs/systems/timer-system.js`** — Emits `GameOver(cause: time)`. Adds `eventQueueResourceKey` (write capability). Emission is threaded through `expireTimer`/`expireIfNeeded` via an `onGameOver` callback that fires **only on the real `PLAYING → GAME_OVER` transition**, so a blocked or repeated expiry never spams `GameOver` across subsequent frames.
- **`src/ecs/systems/level-progress-system.js`** — Emits `LevelCleared` on the `PLAYING → LEVEL_COMPLETE` transition and `Victory` on the final-level `LEVEL_COMPLETE → VICTORY` transition, each gated on `tryTransition` actually succeeding (fires once per transition). Adds `eventQueueResourceKey` (write capability) and a `resolveLevelNumber` helper that guarantees the positive-integer `level` the payload schema requires. Because `LevelCleared` fires for every level completion including the final one, the last level naturally produces the canonical `LevelCleared → Victory` sequence.
- **`src/game/bootstrap.js`** — Threads `eventQueueResourceKey` into the `timer-system`, `life-system`, `level-progress-system`, and `power-up-system` factories (the queue resource is already created/registered by D-01). **Registers `power-up-system` in the default logic phase**, placed immediately after `collision-system` so it observes the same frame's power-pellet / power-up collision intents; resolves `playerEntityResourceKey` and passes the load-bearing resource keys into `life-system` for the death-tile read.
- **Tests** — New `tests/integration/gameplay/b-09-lifecycle-event-hooks.test.js` drives real `World.runFixedStep` dispatch (full resource-capability enforcement) and asserts the `LifeLost → GameOver` and `LevelCleared → Victory` sequences drain in deterministic `(frame, order)` order, plus repeat-run determinism and timer single-emission (no re-emit once settled in `GAME_OVER`). `tests/unit/game/bootstrap.test.js` adds `power-up-system` to the asserted logic-phase ordering.

### 🎯 Why
- **Rationale**: The Track B portion of B-09 finalized the shared event surface (`src/ecs/systems/collision-gameplay-events.js`: all 13 types, payload validators, `GAMEPLAY_EVENT_SOURCE`, `GAME_OVER_CAUSE`) and emitted the nine collision/movement/bomb events, but the four lifecycle events owned by Track C systems (`LifeLost`, `GameOver`, `LevelCleared`, `Victory`) had a canonical schema with no runtime emitter. Separately, `power-up-system` was never registered in the bootstrap logic phase, so its `GhostStunned` emission — and the power-pellet stun / power-up pickup effects themselves — never ran in the real game loop.
- **Impact**: Closes the cross-system event contract end-to-end: audio cues, visual effects, and telemetry consumers now receive the full ordered event stream for life loss, game over (both causes), level clear, and victory. Registering `power-up-system` also activates power-pellet stun and power-up pickups in the real loop for the first time — a deliberate gameplay behavior change beyond pure event emission. Spanning bootstrap (Track A) and the three Track C systems, this work lands on an integration branch rather than a single-track ticket branch.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] `npm run test` — passed (1000/1000 across 78 test files).
- [x] `npm run check` (biome) — clean on all changed files.
- [ ] **Master Check**: `npm run policy` — recommended before merge (runs linting, all test suites, and policy-gate validations).
> *Note: branch uses the hyphenated ticket form (`asmyrogl/integration-B-09`) so the policy gate resolves TICKET mode and enforces ownership.*

### 📋 Audit Traceability
- **AUDIT-B-09** | `Fully Automatable` | Verification: cross-system lifecycle event emission (`LifeLost`, `GameOver(lives|time)`, `LevelCleared`, `Victory`) with deterministic `(frame, order)` ordering | Evidence: `tests/integration/gameplay/b-09-lifecycle-event-hooks.test.js`, `src/ecs/systems/life-system.js`, `src/ecs/systems/timer-system.js`, `src/ecs/systems/level-progress-system.js`, `src/game/bootstrap.js`
- **AUDIT-B-07** | `Fully Automatable` | Verification: power-up effects (`GhostStunned`, bomb/fire/speed power-ups) now execute in the runtime loop via bootstrap registration | Evidence: `src/game/bootstrap.js`, `tests/unit/game/bootstrap.test.js`, `tests/unit/systems/power-up-system.test.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [ ] **Policy Compliance**: Run `npm run policy` locally before merge; `npm run test` and `npm run check` already pass.
- [x] **Ownership**: Cross-track integration — bootstrap is Track A and the three emitters are Track C — landed on an integration branch as intended. The shared event module was not modified (schemas/validation already complete on the B-09 Track B portion).
- [x] **Branching**: Branch name uses the hyphenated ticket form (`asmyrogl/integration-B-09`) so the policy gate resolves TICKET mode.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06 is unchanged.
- [x] **Evidence**: No Manual-With-Evidence artifacts required — coverage is `Fully Automatable` and verified by `npm run test`.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No DOM references introduced in any `src/ecs/systems/` file; emitters mutate only the World event-queue resource.
- [x] **Adapter Injection**: Systems access the event queue solely through `world.getResource`; bootstrap remains the single owner of resource/key wiring.
- [x] **Safe Sinks**: No HTML or string-sink writes introduced.
- [x] **No Bloat**: No framework imports or canvas APIs.
- [x] **Dependencies**: No package or lockfile changes.

---

## 🛡️ Security & Architecture Notes
- **Security**: No DOM, network, storage, or HTML-sink changes. Event payloads are validated by `validateGameplayEventPayload` before entering the queue; the `LifeLost` spatial emit is finiteness-guarded so a malformed tile can never throw inside the dispatch loop.
- **Architecture**: Phase ordering is unchanged (`meta → input → physics → logic → render`). All four emitters run in the `logic` phase. `power-up-system` is registered immediately after `collision-system` so it consumes the same frame's intents; its existing `lastProcessedFrame` guard prevents double-application. Events receive `frame` from `context.frame` (= `World.frame`) and a monotonic `order` from the queue, so registration order only affects `order` within a single frame — emission stays deterministic and replay-stable. Each emitter declares `eventQueueResourceKey` under `write` capabilities, matching the established `collision-system` / `power-up-system` pattern (`world.getResource` is permitted for keys in read **or** write).
- **Risks**:
  - Registering `power-up-system` activates power-pellet stun and power-up pickup effects in the real loop for the first time — intended, but a real gameplay behavior change; watch for balance/timing surprises during playtesting.
  - `GameOver` is emitted by both `life-system` (cause `lives`) and `timer-system` (cause `time`); each is gated on its own state transition, but a single frame in which both the timer expires and the last life is lost could enqueue two `GameOver` events with different causes — acceptable per the schema (`cause` discriminates) but consumers should treat the first as authoritative.
  - The integration test deliberately drains once after two frames, so `Victory` carries `order: 1` (the queue's order counter is monotonic until drained). In the real runtime the queue is drained per frame, which resets the counter — the test comment documents this distinction.

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
