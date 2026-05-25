# 🚀 Integration B-08: Ghost Runtime Wiring + Animation
> **Summary**: Lands the runtime integration of the B-08 ghost AI system (entity creation, staggered release at 0/5/10/15s, AI registration in the physics phase) and the matching D-10 visual wiring (ghost-animation-system + render-dom-system update) so released ghosts actually appear on the board with per-personality sprites and walk-cycle frames.

---

## 📝 Description

### 🔄 What Changed
- **`src/game/bootstrap.js`** — Imports `createGhostAiSystem`, `createGhostAnimationSystem`, and `createGhostStore`. Adds the `ghost` component store to `initializeMovementResources`. Adds `syncGhostEntitiesFromMap` (modelled on `syncPlayerEntityFromMap`) which destroys stale ghost entities and creates `mapResource.maxGhosts` new ones at the ghost spawn tile with type from `activeGhostTypes`, speed from the map, collider type `GHOST`, renderable kind `GHOST`, and an **initial mask of 0** so unreleased ghosts stay invisible and out of every ECS query. Hooked into the `onLevelLoaded` callback alongside the player sync.
- **`createGhostReleaseSystem`** (logic phase, new in `bootstrap.js`) — Bridges the C-03 spawn-timing state (`ghostSpawnState.releasedGhostIds`) with the ECS query system. On each tick it promotes each released ghost entity to the full runtime mask (`GHOST | POSITION | VELOCITY | RENDERABLE | COLLIDER`) via `world.deferSetEntityMask`. Edge-triggered: once flipped, the mask is left alone so the AI keeps processing DEAD/eyes-return frames during the respawn penalty when C-03 temporarily prunes the dead ghost from `releasedGhostIds`.
- **System registration** — `ghost-ai-system` added to the `physics` phase alongside `player-move-system`; `ghost-release-system` and the new `ghost-animation-system` added to the `logic` phase after `spawn-system` so the release-bridge and animation pass observe the freshly updated `releasedGhostIds` list before the next physics phase.
- **`src/ecs/systems/ghost-animation-system.js`** (new) — Logic-phase ECS system mirroring `player-animation-system`. Ticks a shared walk-cycle timer (`GHOST_WALK_FRAME_INTERVAL_MS = 150`), derives each ghost's direction from `velocity.rowDelta` / `colDelta`, writes the matching `renderable.spriteId` from a `WALK_FRAMES` table whose index scheme aligns with `PLAYER_SPRITE_CLASSES`, and mirrors `GHOST_STATE.STUNNED` / `DEAD` into `VISUAL_FLAGS` on `visualState.classBits`. Holds the previous `spriteId` when velocity is zero so the sprite does not flicker back to idle while a ghost snaps to a tile center.
- **`src/ecs/systems/render-dom-system.js`** — Imports `GHOST_TYPE` and adds two lookup tables: `GHOST_TYPE_SUFFIX` (`BLINKY → 'blinky'`, …) and `GHOST_SPRITE_FRAMES` (parallel to `PLAYER_SPRITE_CLASSES`). Optionally reads the `ghost` resource. When `kind === GHOST` it applies `sprite--ghost--{type}` (always) and `sprite--ghost--{type}--{walk-frame}` (only when neither `STUNNED` nor `DEAD` is set), letting the existing `.sprite--ghost--stunned` / `--dead` classes win via CSS class-order specificity in `styles/grid.css`. The ghost store is optional so existing render-dom tests that omit gameplay components keep passing.
- **Tests updated** — `tests/unit/game/bootstrap.test.js` adds `ghost-release-system` and `ghost-animation-system` to the asserted logic-phase ordering. `tests/integration/gameplay/a03-game-loop.test.js` updates the deferred-mutation-discipline expectations from `+1` to `+2` since `ghost-release-system` defers Blinky's first mask flip on step 1 alongside the test's own deferred entity create.

### 🎯 Why
- **Rationale**: B-08 shipped the ghost AI system module and its unit tests in isolation but no bootstrap path created ghost entities or registered the system, so `npm run dev` showed zero ghosts on the board through the entire 120s level — the player could time out or die only to bombs. Per `docs/game-description.md` §5.4, Blinky must spawn at 0 s, Pinky at 5 s, Inky at 10 s, and Clyde at 15 s. The render-pipeline side of the integration was also unfinished: `render-dom-system` only added the base `.sprite--ghost` class (which has no `background-image`), so even with entities created the ghosts rendered as invisible divs that still collided with the player — the player was taking damage from sprites they could not see.
- **Impact**: Closes the runtime integration gap for B-08. Ghosts now spawn on schedule, move with the documented personality targeting, render their per-personality colored sprite with two-frame directional walk-cycle animation, and switch to the stunned / dead background images when their gameplay state changes. The ghost store, `ghostIds`, and `ghostEntities` world resources are now part of the standard bootstrap contract so downstream B-09 / C-03 / D-11 work has stable entities to attach behavior to.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy` — passed (157 forbidden-scan files, 67 quality-checked files, repo + changed scopes green).
- [x] `npm run test` — passed (964/964 across 75 test files).
- [x] `npx vitest run tests/unit/game/bootstrap tests/unit/systems/ghost-ai-system tests/unit/systems/spawn-system tests/integration/gameplay/a03-game-loop` — passed.

### 📋 Audit Traceability
- **AUDIT-F-13** | `Fully Automatable` | Verification: B-08 ghost AI targeting math, state machine, no-reverse rule, ghost-house barrier, and stunned/dead speed selection (`game-description.md` §5.1–§5.4) | Evidence: `tests/unit/systems/ghost-ai-system.test.js`, `src/ecs/systems/ghost-ai-system.js`, `src/game/bootstrap.js` (runtime integration)
- **AUDIT-F-14** | `Manual-With-Evidence` | Verification: ghosts spawn at the documented staggered times (0/5/10/15 s) and render with per-personality sprites + walk-cycle animation | Evidence: `src/game/bootstrap.js` (`syncGhostEntitiesFromMap`, `createGhostReleaseSystem`), `src/ecs/systems/ghost-animation-system.js`, `src/ecs/systems/render-dom-system.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Integration work lands in bootstrap-track-owned `src/game/bootstrap.js` plus the new `src/ecs/systems/ghost-animation-system.js` and a targeted edit to `src/ecs/systems/render-dom-system.js`; the existing `src/ecs/systems/ghost-ai-system.js` is unchanged.
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention (`asmyrogl/integration-B08`).
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06 is unchanged.
- [ ] **Evidence**: Manual-With-Evidence visual capture for AUDIT-F-14 to be attached on PR review.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `ghost-animation-system.js` has no DOM references; the only DOM mutation site remains `render-dom-system.js`.
- [x] **Adapter Injection**: New systems read everything through World resources; bootstrap continues to be the single owner of adapter registration.
- [x] **Safe Sinks**: No HTML or string-sink writes introduced; render-dom uses `classList.add` and `style.transform` only.
- [x] **No Bloat**: No framework imports or canvas APIs.
- [x] **Dependencies**: No package or lockfile changes.

---

## 🛡️ Security & Architecture Notes
- **Security**: No DOM, network, storage, or HTML sink changes outside the existing `render-dom-system` mutation surface. Ghost type and walk-frame classes are composed from a closed enum lookup (`GHOST_TYPE_SUFFIX`, `GHOST_SPRITE_FRAMES`) — no string from gameplay state ever reaches `classList.add` directly. Mask mutations during a system tick go through `world.deferSetEntityMask` to honor the dispatch mutation discipline.
- **Architecture**: Phase ordering remains `meta → input → physics → logic → render`. `ghost-ai-system` runs in `physics`; `ghost-release-system` and `ghost-animation-system` run in `logic` immediately after `spawn-system` so the release set is fresh before the next physics tick. `render-dom-system` reads the optional `ghost` resource — its absence falls back to the prior `.sprite--ghost` behavior so existing tests and any non-gameplay harness keep working. The ghost store is allocated once in `initializeMovementResources`; entity slots are created and destroyed only via `syncGhostEntitiesFromMap` driven by `onLevelLoaded`, so level transitions and restart flow keep the deterministic ordering required by C-03.
- **Risks**:
  - The release-bridge is edge-triggered (mask flips 0 → full only once). DEAD ghosts during the respawn penalty rely on the AI system's existing eyes-return logic; if a future change destroys the entity instead of pruning from `releasedGhostIds`, this bridge would not re-create it.
  - `GHOST_SPRITE_FRAMES` mirrors `PLAYER_SPRITE_CLASSES` indices on purpose — keep the two tables aligned if walk-frame IDs are ever reassigned.
  - `D-10` stunned/dead variants currently use static images (`ghost-stunned.webp`, `ghost-eyes-dead.webp`); the two-frame stunned assets (`ghost-stunned-01.webp`, `-02.webp`) exist on disk but no CSS classes wire them up yet — future polish.

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
