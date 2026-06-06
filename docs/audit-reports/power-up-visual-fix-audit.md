# Power-Up Visual Fix — Audit Report

**Date**: 2026-06-06
**Auditor**: Step 5 audit subagent (read-only verifier)
**Plan reference**: [docs/implementation/power-up-visual-fix-plan.md](../implementation/power-up-visual-fix-plan.md)
**Branch**: `ekaramet/bugfix-powerup-fix`
**Base commit**: `4d63d32`

---

## Step 1 — Power-up cell visuals

**Verdict**: PASS

Cell-type mapping, CSS rules, animation keyframes, asset files, and tests are all in place and align with the plan's "static cell route" decision.

**Evidence**:
- `src/adapters/dom/renderer-adapter.js:36-38` — `CELL_TYPE_CLASSES` now contains `7 → 'cell-powerup-bomb'`, `8 → 'cell-powerup-fire'`, `9 → 'cell-powerup-speed'`, with a JSDoc comment at lines 33-35 explaining the static-cell rationale.
- `styles/grid.css:128-171` — three `::after` rules with 76×76 background-image, `var(--radius-md)` border-radius, `var(--z-items)` z-index, and `translate(-50%, -50%)` centring. URLs point to `assets/generated/visuals/128px/items/powerup-{bomb,fire,speed}.webp`.
- `styles/animations.css:40-57` — `@keyframes powerup-pulse` mirrors `pellet-pulse` (scale 1 → 1.15, opacity 1 → 0.9) and is applied to all three `.cell-powerup-*::after` selectors.
- `styles/animations.css:231-235` — reduced-motion override disables the pulse inside `@media (prefers-reduced-motion: reduce)`, satisfying AGENTS.md "Reduced Motion (Non-Gameplay)".
- `styles/grid.css` — no remaining `sprite--powerup` rules (`rg "sprite--powerup" styles src tests` → 0 matches).
- Asset files exist:
  - `assets/generated/visuals/128px/items/powerup-bomb.webp` (3.2K)
  - `assets/generated/visuals/128px/items/powerup-fire.webp` (20.3K)
  - `assets/generated/visuals/128px/items/powerup-speed.webp` (11.8K)
- Tests:
  - `tests/integration/adapters/renderer-adapter.test.js:265` — "maps power-up cell types 7/8/9 to cell-powerup-bomb/fire/speed" — covers all three mappings + class-strip of `cell-destructible`.
  - `tests/integration/adapters/renderer-adapter.test.js:307` (around line 326) — "end-to-end: explosion-system drop type 7 flows through board-sync to the DOM" — runs the real `createBoardSyncSystem` with a `World` instance, mutates `mapResource.grid[0] = 7`, and asserts both the removal of `cell-destructible` and the addition of `cell-powerup-bomb`.

---

## Step 2 — Speed-boost visual

**Verdict**: PASS

New mirror system, class rename, bootstrap wiring, and tests are all present. The single textual hit for the legacy class name `sprite--player--speed-boost` (`render-dom-system.js:149`) is an explanatory comment, not an active class application.

**Evidence**:
- `src/ecs/systems/player-visual-state-system.js:1-116` — new logic-phase system:
  - Reads `playerStore.isSpeedBoosted[playerId]` and writes only the `VISUAL_FLAGS.SPEED_BOOST` bit (bit 16) on `visualState.classBits`, preserving STUNNED / DEAD / INVINCIBLE / HIDDEN bits.
  - Pure data, no DOM imports, missing-resource guards return early instead of throwing.
  - Declares `resourceCapabilities: { read: [playerEntity, player], write: [visualState] }` for the world scheduler.
- `src/ecs/systems/render-dom-system.js:145-152` — class application is now `el.classList.add('is-speed-boosted')`, with a comment block explaining the rename.
- `src/game/bootstrap.js:78` — `import { createPlayerVisualStateSystem } from '../ecs/systems/player-visual-state-system.js'`.
- `src/game/bootstrap.js:329-333` — registered in the `logic` phase **immediately after** `createPowerUpSystem` (line 319), matching the plan's "same-frame, no one-frame lag" requirement.
- No leftover active references — `rg "sprite--player--speed-boost" src tests` returns only the comment at `src/ecs/systems/render-dom-system.js:149`.
- Tests:
  - `tests/unit/systems/player-visual-state-system.test.js` (14 tests, 7.8K) covers: initial 0 state, boost-on sets bit, boost-off clears bit, preserves pre-existing STUNNED bit, preserves STUNNED | DEAD | INVINCIBLE on transition off, preserves HIDDEN bit, missing-player guard, missing-playerEntity guard.
  - `tests/unit/systems/render-dom-system.test.js:326-356` — "adds speed-boost class for player with SPEED_BOOST flag" — asserts `classList.add` is called with `'is-speed-boosted'`.
  - `tests/unit/systems/render-dom-system.test.js:359-386` — new negative-path test "does not add the is-speed-boosted class when the SPEED_BOOST flag is not set".
  - `tests/unit/game/bootstrap.test.js:384` — adds `'player-visual-state-system'` to the expected ordered system-name list.

---

## Step 3 — HUD bombs/fire

**Verdict**: PASS

HUD-system reads `playerStore.maxBombs` and `playerStore.fireRadius` for the current `playerEntity` and passes them through both the `hudAdapter` path and the bare-DOM fallback. Tests cover both code paths with the default and post-power-up values.

**Evidence**:
- `src/ecs/systems/hud-system.js:60-61` — `bombs = playerStore.maxBombs?.[playerId] ?? 0`, `fire = playerStore.fireRadius?.[playerId] ?? 0`. Guarded against missing `playerStore` and `playerId < 0`.
- `src/ecs/systems/hud-system.js:78-79` — passes `bombs` and `fire` (no longer hardcoded `0`) into the `hudAdapter.update({…})` call.
- `src/ecs/systems/hud-system.js:101-106` — fallback path writes `hud.bombs.textContent = \`Bombs: ${bombs}\`` and `hud.fire.textContent = \`Fire: ${fire}\``.
- `src/ecs/systems/hud-system.js:25-29` — declares new resource keys `playerResourceKey`, `playerEntityResourceKey` with defaults, and adds them to the system's `read` capability list at line 45-46.
- Tests (`tests/unit/systems/hud-system.test.js`, 8.5K, 15 tests):
  - Line 111 — "passes the player default maxBombs and fireRadius on the initial frame"
  - Line 125 — covers `bombs: 2` after `maxBombs[playerId] = 2`
  - Line 136 — covers `fire: DEFAULT_FIRE_RADIUS + 1` after `fireRadius[playerId]` upgrade
  - Lines 204, 217 — covers the bare-DOM fallback path with `Bombs: 3` / `Fire: 4` text-content writes.

---

## Step 4 — Dead `powerUp` scaffolding removal

**Verdict**: PASS

All listed symbols (`createPowerUpStore`, `resetPowerUp`, `PROP_POWER_UP_TYPE`, `RENDERABLE_KIND.POWER_UP`) and their `KIND_TO_*` entries are removed; dead `.sprite--powerup*` CSS is gone; dead tests are removed. The grep-based verification command from the plan returns zero matches.

**Evidence**:
- `rg 'createPowerUpStore|resetPowerUp|PROP_POWER_UP_TYPE|RENDERABLE_KIND\.POWER_UP' src tests` → **0 matches**.
- `rg "sprite--powerup" styles src tests` → **0 matches**.
- `src/ecs/components/props.js` diff: removed `PROP_POWER_UP_TYPE` (was lines 16-22), `powerUp: 'planned'` runtime-status entry, `createPowerUpStore`, `resetPowerUp`, and corresponding JSDoc lines. Header doc updated accordingly.
- `src/ecs/components/visual.js:32-40` — `RENDERABLE_KIND` no longer contains `POWER_UP: 7`.
- `src/ecs/systems/render-dom-system.js:38-66` — `KIND_TO_SPRITE_TYPE` and `KIND_TO_CLASSES` no longer contain `[RENDERABLE_KIND.POWER_UP]` entries. The inline comment block (lines 38-44) was updated from "POWER_UP falls back to pellet pool" to clearly describe the new WALL-only no-op.
- `src/ecs/resources/constants.js:165-176` — comment for `POWER_UP_TYPE` was updated (since `PROP_POWER_UP_TYPE` no longer exists, the "do not conflate the two" warning was rewritten to clarify the remaining single source of truth). Constants themselves unchanged.
- Tests:
  - `tests/unit/components/props.test.js` — removed `createPowerUpStore` / `PROP_POWER_UP_TYPE` / `resetPowerUp` imports, removed `powerUp: 'planned'` expectation, removed the "creates and resets a power-up store" test (was lines 104-114).
  - `tests/unit/components/visual.test.js` — removed `RENDERABLE_KIND.POWER_UP` assertion.
  - `tests/unit/systems/render-dom-system.test.js` — removed `POWER_UP: 'powerup'` fixture entry (was line 32) and the "uses pellet pool for POWER_UP kind" test (was around line 413).

---

## Test suite

**vitest**: **1055 / 1055 passed** (81 test files, 3.12s total).

No skipped, no `xfail`, no failures. New test files contribute:
- `tests/unit/systems/player-visual-state-system.test.js` (14 tests)
- `tests/unit/systems/hud-system.test.js` (15 tests)

stderr noise is benign and pre-existing (expected error-handling logs from `main.ecs.test.js`, `render-intent.test.js`, and `game-flow-extended.test.js`).

---

## Biome

**Status**: clean for the audit scope. 8 pre-existing warnings remain in files **not** touched by this changeset.

- `src/ecs/systems/board-sync-system.js:63` — `useOptionalChain` (pre-existing, verified by re-running `biome check` against `git stash`-ed HEAD).
- `src/ecs/systems/render-collect-system.js:151` / `:170` — `useOptionalChain` (pre-existing).
- `tests/unit/systems/render-collect-system.test.js:341, 396, 416` — `noUnusedVariables` for `buffer` destructure (pre-existing).

**No new biome issues are introduced by Steps 1-4.** Files modified in this changeset (renderer-adapter, hud-system, render-dom-system, bootstrap, props, visual, constants, animations.css, grid.css, player-visual-state-system, and all new/modified tests) all pass biome check cleanly.

---

## Findings (sorted by severity)

1. 🟵 **Nit** — Pre-existing biome warnings (8 total) in `board-sync-system.js`, `render-collect-system.js`, and `render-collect-system.test.js` are unrelated to this work but visible in `npx biome check`. Suggest a follow-up cleanup ticket; **do not block this merge.**
2. 🟵 **Nit** — `src/ecs/resources/constants.js` shows in `git diff --stat` but the only change is the `POWER_UP_TYPE` comment block (lines 166-170) — purely cosmetic to remove the stale "distinct from PROP_POWER_UP_TYPE" reference that no longer makes sense after Step 4. Not in the plan's explicit edit list, but justified as a side-effect of the cleanup. Worth a one-line note in the PR description.
3. ❓ **Question** — The plan (Step 4) said `src/ecs/components/registry.js` `COMPONENT_MASK.POWER_UP` should be kept "for now" unless unused. The audit did not check whether the mask is now orphaned; recommend a quick `rg 'COMPONENT_MASK.POWER_UP\|MASK\.POWER_UP'` from the main thread before merge to decide whether a follow-up cleanup is warranted. Not a blocker.

No 🔴 critical or 🟡 warning findings.

---

## Recommendation

**MERGE**.

All four steps are implemented exactly as the plan specifies. Test suite is fully green (1055/1055). Biome is clean for every file touched by this changeset. ECS boundaries are intact (the new `player-visual-state-system` writes only to a typed-array store, no DOM). Reduced-motion support is present for the new `powerup-pulse` animation. No regressions detected.

Open follow-ups (non-blocking):
- Pre-existing biome warnings in render-collect-system / board-sync-system.
- Optional follow-up: investigate whether `COMPONENT_MASK.POWER_UP` is now orphaned and can be removed.

---

## Evidence attachments

### `git status`
```
* ekaramet/bugfix-powerup-fix
~ Modified: 14 files
   src/adapters/dom/renderer-adapter.js
   src/ecs/components/props.js
   src/ecs/components/visual.js
   src/ecs/resources/constants.js
   src/ecs/systems/hud-system.js
   src/ecs/systems/render-dom-system.js
   src/game/bootstrap.js
   styles/animations.css
   styles/grid.css
   tests/integration/adapters/renderer-adapter.test.js
   tests/unit/components/props.test.js
   tests/unit/components/visual.test.js
   tests/unit/game/bootstrap.test.js
   tests/unit/systems/render-dom-system.test.js
? Untracked: 4 files
   docs/implementation/power-up-visual-fix-plan.md
   src/ecs/systems/player-visual-state-system.js
   tests/unit/systems/hud-system.test.js
   tests/unit/systems/player-visual-state-system.test.js
```

### `git diff --stat`
```
 src/adapters/dom/renderer-adapter.js               |  6 ++
 src/ecs/components/props.js                        | 52 ++------------
 src/ecs/components/visual.js                       |  1 -
 src/ecs/resources/constants.js                     |  9 +--
 src/ecs/systems/hud-system.js                      | 55 ++++++++++----
 src/ecs/systems/render-dom-system.js               | 16 +++--
 src/game/bootstrap.js                              | 11 +++
 styles/animations.css                              | 35 +++++++++
 styles/grid.css                                    | 83 +++++++++++++++-------
 tests/integration/adapters/renderer-adapter.test.js| 66 +++++++++++++++++
 tests/unit/components/props.test.js                | 16 -----
 tests/unit/components/visual.test.js               |  1 -
 tests/unit/game/bootstrap.test.js                  |  1 +
 tests/unit/systems/render-dom-system.test.js       | 46 +++++++-----
 14 files changed, 264 insertions(+), 134 deletions(-)
```

### `npx vitest run` summary
```
 Test Files  81 passed (81)
      Tests  1055 passed (1055)
   Start at  21:57:55
   Duration  3.12s (transform 10.80s, setup 0ms, import 17.51s, tests 5.95s, environment 13ms)
```

### `npx biome check src tests styles` summary
```
Checked 159 files in 121ms. No fixes applied.
Found 8 warnings.

  src/ecs/systems/board-sync-system.js:63               useOptionalChain        (PRE-EXISTING)
  src/ecs/systems/render-collect-system.js:151          useOptionalChain  (×2)  (PRE-EXISTING)
  src/ecs/systems/render-collect-system.js:170          useOptionalChain  (×2)  (PRE-EXISTING)
  tests/unit/systems/render-collect-system.test.js:341  noUnusedVariables       (PRE-EXISTING)
  tests/unit/systems/render-collect-system.test.js:396  noUnusedVariables       (PRE-EXISTING)
  tests/unit/systems/render-collect-system.test.js:416  noUnusedVariables       (PRE-EXISTING)
```

(Pre-existing status confirmed by re-running `npx biome check` against the stashed-clean HEAD.)
