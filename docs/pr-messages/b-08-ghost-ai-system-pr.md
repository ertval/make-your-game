# 🚀 B-08: Ghost AI System
> **Summary**: Adds the B-08 ghost AI system — personality-driven targeting (Blinky/Pinky/Inky/Clyde), Normal → Stunned → Dead state machine, no-reverse patrol, one-way ghost-house gate, and grid-aligned motion at level-specific speeds, with the C-03 respawn handoff gated on spawn-point arrival.

---

## 📝 Description

### 🔄 What Changed
- **`src/ecs/systems/ghost-ai-system.js`** (new): physics-phase ECS system implementing the four canonical targeting formulas from `docs/game-description.md` §5.1, the Normal/Stunned/Dead state machine, the no-reverse rule, and tile-aligned grid motion driven by the fixed-step delta.
- **Targeting** — Blinky targets the player tile; Pinky targets `PINKY_TARGET_OFFSET = 4` ahead; Inky doubles the Blinky→pivot vector around Blinky; Clyde toggles chase/retreat against the `CLYDE_DISTANCE_THRESHOLD = 8` boundary (squared compare, no `Math.sqrt`).
- **State machine** — Stunned uses `GHOST_STUNNED_SPEED = 2.0` and lifts no-reverse to flee from the player; Dead returns eyes to the ghost spawn point at the normal speed; per-entity stun timer decay is cleared back to NORMAL on expiry as a safety guard alongside B-07.
- **Ghost-house barrier (§5.4)** — `isGhostTilePassable` enforces the one-way gate: only DEAD ghosts may enter the house from outside; ghosts already inside may still move freely so the initial spawn can leave.
- **Respawn handoff** — DEAD → NORMAL transition is gated on the ghost actually being at the ghost spawn point AND present in `releasedGhostIds`, so a just-killed ghost still in `releasedGhostIds` before C-03's next-tick prune is no longer instantly revived; the 5-second penalty delay owned by C-03 is preserved.
- **Wall and bomb avoidance** — wall passability via `isPassableForGhost`; an optional `bombCellOccupancy` resource (Set, Map, or array) makes bomb cells impassable when registered.
- **`tests/unit/systems/ghost-ai-system.test.js`** (new): 29 unit tests covering all four targeting formulas, direction selection (closest/farthest tile, no-reverse, dead-end forced reverse, bomb-cell blocking, ghost-house gate with NORMAL/STUNNED blocked and DEAD allowed, in-house free movement), speed resolution (stunned floor, per-entity override, map fallback), stun timer expiry, dead eyes returning toward the spawn point, respawn handoff (positive case + regression for the early-revive bug), PAUSED gating, and a determinism trace across two seeded runs.

### 🎯 Why
- **Rationale**: B-08's verification gate requires the exact targeting math from `docs/game-description.md` §5.1, the documented state machine from §5.3, the one-way ghost-house gate from §5.4, and seeded determinism in the trace — none of which existed yet.
- **Impact**: Unblocks A-08 (full simulation runtime), B-09 (cross-system gameplay event hooks for `GhostStunned`/`GhostDefeated`), and Track C/D ghost visual wiring. The system is pure ECS — it never imports an adapter and never touches the DOM.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] `npm run check` — passed.
- [x] `npm run test:unit` — passed (716/716).
- [x] `npm run test:integration` — passed (179/179).
- [x] `npx vitest run tests/unit/systems/ghost-ai-system.test.js` — passed (29/29).

### 📋 Audit Traceability
- **AUDIT-F-13** | `Fully Automatable` | Verification: B-08 ghost AI targeting math, state machine, no-reverse rule, ghost-house barrier, and stunned/dead speed selection (`game-description.md` §5.1–§5.4) | Evidence: `tests/unit/systems/ghost-ai-system.test.js`, `src/ecs/systems/ghost-ai-system.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran the applicable local checks (`check`, `test:unit`, `test:integration`).
- [x] **Ownership**: Verified files remain within Track B ticket ownership scope (`src/ecs/systems/ghost-ai-system.js`, `tests/unit/systems/ghost-ai-system.test.js`).
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention (`asmyrogl/B-08`).
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06 is unchanged.
- [ ] **Evidence**: Manual-With-Evidence artifacts not affected by B-08.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/ghost-ai-system.js` has no DOM references.
- [x] **Adapter Injection**: The system reads everything through World resources; no adapter imports.
- [x] **Safe Sinks**: No HTML or string-sink writes introduced.
- [x] **No Bloat**: No framework imports or canvas APIs.
- [x] **Dependencies**: No package or lockfile changes.

---

## 🛡️ Security & Architecture Notes
- **Security**: No DOM, network, storage, or HTML sink changes. The system is a pure ECS simulation module reading state only through world resources. No `Date.now()` or `Math.random()` is used; all timing is driven by the injected fixed-step delta. The optional `rng` resource key is reserved for future "random element at intersections" behavior (§5.2) and is not yet read — when added, randomness will go through the injected RNG to preserve determinism.
- **Architecture**: B-08 stays in Track B ECS simulation scope. Ghost AI runs in the `physics` phase. The C-03 spawn system continues to own the 5-second eyes respawn delay; B-08 only consumes `releasedGhostIds` (read-only) plus a positional check at the spawn point to flip DEAD → NORMAL.
- **Risks**:
  - Runtime registration in `src/game/bootstrap.js` is intentionally deferred — that file is bootstrap-track-owned. This PR ships the system + tests; bootstrap wiring will land via the standard cross-track handoff process.
  - Ghost stun visuals (blue tint, slow flee speed indicator) and dead-eyes-only visual depend on Track D visual wiring downstream — this PR ships only the simulation contract.
  - The "random element at intersections" clause from §5.2 is not yet implemented; current direction choice is fully deterministic via stable tie-break order on `GHOST_AI_DIRECTIONS`. The `rngResourceKey` is wired for a follow-up.

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
