# 🚀 B-09: Cross-System Gameplay Event Hooks
> **Summary**: Extends the Track B gameplay event surface into the canonical, deterministic hook catalog that downstream systems (scoring, audio, HUD, lifecycle) consume — defining all event payload schemas in one Track-B-owned module and emitting Track B's in-scope events with stable `frame` + monotonic `order` ordering.

---

## 📝 Description

### 🔄 What Changed
- **`collision-gameplay-events.js`**: Promoted to the single source of truth for the full gameplay event catalog — added 7 event types (`BombPlaced`, `GhostDefeated`, `GhostStunned`, `LifeLost`, `LevelCleared`, `GameOver`, `Victory`) alongside the existing B-05 surface, plus `GAME_OVER_CAUSE`, a `SPATIAL_EVENT_TYPES` set, and `isPositiveInteger`/`isNonNegativeInteger` helpers. Restructured `requireBasePayload` to split spatial (require `entityId` + `tile`) from lifecycle payloads, with strict per-type validation branches.
- **`bomb-tick-system.js`**: Emits `BombPlaced` (`{ entityId, ownerId, radius, tile, sourceSystem }`) after a bomb is successfully placed; added `eventQueue` to write capabilities via an `eventQueueResourceKey` option.
- **`collision-system.js`**: Emits `GhostDefeated` (`{ entityId, sourceEntityId, chainDepth, ghostState, tile, sourceSystem }`) in the fire-kill ghost resolution, reading fire-chain metadata for `chainDepth`.
- **`power-up-system.js`**: Emits `GhostStunned` (`{ stunnedCount, durationMs, sourceSystem }`) when a power pellet stuns ghosts; added `eventQueue` to write capabilities.
- **Tests**: New `tests/integration/gameplay/b-09-cross-system-event-hooks.test.js` (payload contract, Track B emission, repeated-run determinism); updated `tests/unit/systems/bomb-tick-system.test.js` write-capability assertion.

### 🎯 Why
- **Rationale**: Downstream tracks (scoring, audio, HUD, lifecycle/game-status) need a single, validated, deterministically-ordered event stream rather than reaching into per-system intents. B-09 establishes that catalog and wires Track B's owned emitters.
- **Impact**: Consumers can subscribe to a stable event contract. Ordering is deterministic via the D-01 `eventQueue` (`frame` + monotonic `order`), so replays and seeded runs are reproducible. Emission is a no-op when no queue is registered, so the change is additive and non-breaking.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy` (PASS — TICKET mode, ticket `B-09`, exit 0)
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*
- [x] Full suite: **994/994 tests pass**; `npx biome check` clean on all touched files.

### 📋 Audit Traceability
- **B-09** | `Automated` | Verification: `b-09-cross-system-event-hooks.test.js` (payload contract + deterministic ordering) | Evidence: `tests/integration/gameplay/b-09-cross-system-event-hooks.test.js`
- **B-09** | `Automated` | Verification: `bomb-tick-system.test.js` (eventQueue write capability) | Evidence: `tests/unit/systems/bomb-tick-system.test.js`
- Audit report: `docs/audit-reports/pr-audit-asmyrogl-B-09.md` (Verdict: PASS)

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: Reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: All 6 changed files within Track B scope (`collision-*`, `bomb-*`, `power-up-*`, `b-*`/`bomb-*` test patterns); `findOwnershipViolations('B', ...)` → `[]`.
- [x] **Branching**: Branch renamed to `asmyrogl/B-09` to follow `<owner>/<TRACK>-<NN>` convention.
- [x] **Audit Coverage**: B-09 deliverables covered; out-of-track lifecycle emission deferred per the Ticket Audit Rule.
- [x] **Evidence**: No new F-19/F-20/F-21/B-06 manual-evidence artifacts affected by this change.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No DOM references introduced in `src/ecs/systems/`.
- [x] **Adapter Injection**: `eventQueue` accessed only via the World resource API.
- [x] **Safe Sinks**: No untrusted-content sinks touched.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: No dependency or lockfile changes.

---

## 🛡️ Security & Architecture Notes
- **Security**: Per-type payload validation rejects malformed cross-system data before enqueue; spatial events require finite `tile` + non-negative `entityId`.
- **Architecture**: All 13 schemas are defined in the Track-B-owned shared module so the future integration branch has one source of truth. Emission stays optional (no-op without a queue), preserving additive, non-breaking behavior. Ordering is delegated to the D-01 `eventQueue`.
- **Risks**: Low. Track B emits only its in-scope events (`BombPlaced`, `GhostDefeated`, `GhostStunned`). Lifecycle events (`LifeLost`, `GameOver`, `Victory`, `LevelCleared`) have schemas defined but are intentionally emitted by Track C systems + Track A bootstrap wiring on a separate **integration branch** — see handoff notes. `power-up-system` is not yet registered in the default bootstrap, so its emissions are exercised via tests until that wiring lands.

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
