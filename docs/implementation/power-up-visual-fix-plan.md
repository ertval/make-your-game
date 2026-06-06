# Power-Up Visual Fix Plan

> **Audit context**: From the `codebase-analysis-audit` pass on the power-up surface, the *mechanic* layer (B-07) is implemented and tested, but the *visual* layer is broken in three ways:
> 1. Dropped power-ups are **invisible** on the board after wall destruction.
> 2. The speed-boost player visual effect is **never rendered** (flag not set, class name mismatched).
> 3. The HUD never reflects the player's upgraded bomb count / fire radius.
>
> This plan closes all three gaps and removes the dead `powerUp` component scaffolding.

**Mode**: build (write + run tests)
**Recommended choices from the pre-build plan (all confirmed by the user)**:

1. Dropped power-ups use the **static cell route** (`::after` background) — same pattern as `cell-pellet` / `cell-power-pellet`. No new sprite-pool kind.
2. Speed-boost class added in `render-dom-system.js` is renamed to **`is-speed-boosted`** (matches the existing CSS selector) and the unused `sprite--player--speed-boost` class is removed.
3. All four steps land in **one change set** (the bug is the user-visible symptom; fixing HUD too removes a related lie).

---

## Step 1 — Make dropped power-ups visible on the board

**Files to change**

- `src/adapters/dom/renderer-adapter.js:25-33` — extend `CELL_TYPE_CLASSES` with cell types `7`, `8`, `9`:
  - `7: 'cell-powerup-bomb'`
  - `8: 'cell-powerup-fire'`
  - `9: 'cell-powerup-speed'`
- `styles/grid.css:84-115` — add three `::after` rules under the existing `cell-pellet` / `cell-power-pellet` block:
  - `.cell-powerup-bomb::after` → `assets/generated/visuals/128px/items/powerup-bomb.webp`
  - `.cell-powerup-fire::after` → `assets/generated/visuals/128px/items/powerup-fire.webp`
  - `.cell-powerup-speed::after` → `assets/generated/visuals/128px/items/powerup-speed.webp`
  - Use the same shape (76×76 background-image, 100%/100% sizing, `var(--z-items)` z-index, `var(--radius-md)` border-radius) as the existing `.sprite--powerup*` rules at lines 423-448.
- `styles/animations.css` — add a `@keyframes powerup-pulse` (mirrors `pellet-pulse` at line 22) and a `.cell-powerup-bomb::after, .cell-powerup-fire::after, .cell-powerup-speed::after` rule that applies the animation. Add a `prefers-reduced-motion` block disabling the animation (per AGENTS.md).
- `styles/grid.css:432-448` — **delete the dead `sprite--powerup`, `sprite--powerup--bomb`, `sprite--powerup--fire`, `sprite--powerup--speed` rules** (no system creates a `RENDERABLE_KIND.POWER_UP` sprite). The base `.sprite--powerup` rule is referenced in `render-dom-system.js:65` but its only consumer is dead code, so removing the CSS is safe. Keep `.sprite--powerup` removal in sync with Step 4's removal of the corresponding `KIND_TO_CLASSES` entry.

**Test additions**

- `tests/integration/adapters/renderer-adapter.test.js` — assert `updateCell(row, col, 7)` adds `cell-powerup-bomb`, `8` → `cell-powerup-fire`, `9` → `cell-powerup-speed`. Also assert prior classes (`cell-pellet`, `cell-destructible`, etc.) are removed via the existing class-stripping loop.
- `tests/integration/adapters/renderer-adapter.test.js` — add a board-sync test: start a board, mutate `mapResource.grid[cellIndex] = 7`, run board-sync-system, assert the DOM cell carries `cell-powerup-bomb` and no longer `cell-destructible`.

**Why static cell, not sprite pool**: matches the pellet pattern, no new component mask wiring, no new pool type, no render-collect-system changes. Pellets already work this way at `grid.css:87-115` — power-ups are conceptually identical (static collectible on a tile).

---

## Step 2 — Wire speed-boost visual on the player

Two sub-fixes; both required.

### 2a. Mirror the player boost flag into `visualState.classBits`

**New file**: `src/ecs/systems/player-visual-state-system.js`
- Logic-phase system.
- Reads `playerResource` and `visualStateResource`.
- Mirrors `playerStore.isSpeedBoosted[playerId]` to `visualState.classBits[playerId]`:
  - If `isSpeedBoosted === 1` → set `VISUAL_FLAGS.SPEED_BOOST` (bit 16) on the classBits byte.
  - Otherwise → clear the bit.
- Clears any bits it owns (only `SPEED_BOOST`) when transitioning.
- Pure data, no DOM access (per AGENTS.md ECS rules).
- Add a `make: { systemCapabilities: { read, write } }` so the world scheduler can manage it.

**Wiring in `src/game/bootstrap.js`**:
- Import the new factory and add it to the `logic` array right after `createPowerUpSystem(...)` (lines 318-322). The boost flag is owned by power-up-system, so this system must run **after** it in the same phase.
- Register `createPlayerVisualStateSystem({ playerResourceKey, visualStateResourceKey, playerEntityResourceKey })`.

**Tests**:
- `tests/unit/systems/player-visual-state-system.test.js` — covers: starts unset, set after boost, cleared after timer expires, only touches the SPEED_BOOST bit, does not touch STUNNED/DEAD/INVINCIBLE bits.
- `tests/integration/gameplay/...` — extend the existing b-09 harness or add a new one to assert end-to-end: power-up intent → classBits carries `SPEED_BOOST`; window expires → classBits clears the bit.

### 2b. Fix the class name in `render-dom-system.js`

- `src/ecs/systems/render-dom-system.js:148-150` — change `'sprite--player--speed-boost'` to `'is-speed-boosted'`. This makes the selector at `styles/animations.css:153` (`.sprite--player.is-speed-boosted`) actually match.
- `tests/unit/systems/render-dom-system.test.js` — add an assertion for this case (mock classBits with `VISUAL_FLAGS.SPEED_BOOST`, assert `classList.add` was called with `'is-speed-boosted'`).

**Note on the CSS selector**: the existing CSS selector is `.sprite--player.is-speed-boosted` which is what the player element will carry (`sprite` base class + `sprite--player` kind class + new `is-speed-boosted` modifier class). No CSS change needed.

---

## Step 3 — HUD bombs/fire indicators

**File to change**: `src/ecs/systems/hud-system.js:42-61`

- Read `playerStore` and `playerEntity` resources (they already exist; bootstrap already registers them).
- Resolve `playerEntity.id`.
- Pass `bombs: playerStore.maxBombs[id] ?? 0` and `fire: playerStore.fireRadius[id] ?? 0` into the `hudAdapter.update({...})` call.
- Fallback path (no `hudAdapter`, only `hudElements`) currently has no bombs/fire writes; add them too:
  - `hud.bombs && (hud.bombs.textContent = \`Bombs: ${bombs}\`)`
  - `hud.fire && (hud.fire.textContent = \`Fire: ${fire}\`)`
- Use `setTextContentIfChanged`-style guard to avoid per-frame churn (not strictly required since `hudAdapter` already does this, but consistent).

**Test additions**:
- `tests/unit/systems/hud-system.test.js` — mock hudAdapter and assert that after a `bombPlus` power-up is applied (set `playerStore.maxBombs[playerId] = 2`), the next hud update passes `bombs: 2`. Same for `fireRadius` after `firePlus`.

**Asset reminder**: `hud-adapter.js:99-101` already queries `[data-hud="bombs"]` and `[data-hud="fire"]` — confirm those slots exist in `index.html` (they should already be present per `tests/e2e/ui-layout.spec.js:23-24`).

---

## Step 4 — Cleanup of dead powerUp scaffolding

**Files to change**:

- `src/ecs/components/props.js:52-57` — remove `powerUp: 'planned'` from `PROP_STORE_RUNTIME_STATUS`. (Pellet stays `'planned'` for now — out of scope.)
- `src/ecs/components/props.js:127-150` — remove the `createPowerUpStore` / `resetPowerUp` exports and the `PROP_POWER_UP_TYPE` enum (no system consumes them; the power-up system uses the intent's `powerUpType` string from collision, not the typed store).
- `src/ecs/components/registry.js:39` — keep `COMPONENT_MASK.POWER_UP` for now (could collide with other system masks; cleanup is in scope for Step 4 only if no other file references it). If the mask is unused, also remove. (`grep -R 'POWER_UP' src/` to verify.)
- `src/ecs/components/visual.js:32-41` — remove `RENDERABLE_KIND.POWER_UP` since the only consumer is the dead-code path in `render-dom-system.js:52,65`. Mirror in `src/ecs/systems/render-dom-system.js:52,65`.
- `src/ecs/systems/render-dom-system.js:42-66` — remove the `KIND_TO_SPRITE_TYPE.POWER_UP → 'pellet'` and `KIND_TO_CLASSES.POWER_UP → ['sprite--powerup']` entries. Update the inline comment at line 41-44 that explains the "POWER_UP falls back to pellet pool since..." decision.
- `tests/unit/components/props.test.js:107-114` — remove the powerUp store tests.
- `tests/unit/systems/render-dom-system.test.js:35,413-433` — remove the `'POWER_UP: 'powerup''` test fixture entry and the "uses pellet pool for POWER_UP kind" test.

**Verification**: `grep -R 'createPowerUpStore\|resetPowerUp\|RENDERABLE_KIND.POWER_UP' src tests` should return nothing after this step.

---

## Step 5 — Verification gates

Following the **Bug-Fix Workflow** in `AGENTS.md`:

1. **Reproduce**: Playwright check that destroys a destructible wall and asserts the cell carries `cell-powerup-{bomb|fire|speed}` (Step 1).
2. **Failing test first**: add e2e/visual assertion, run red, then apply Step 1.
3. **Regression**: rerun the full Vitest + Playwright suites; in particular:
   - `tests/unit/systems/power-up-system.test.js`
   - `tests/unit/systems/ghost-animation-system.test.js`
   - `tests/unit/systems/render-dom-system.test.js`
   - `tests/unit/systems/renderer-adapter.test.js` (after extension)
   - `tests/unit/systems/hud-system.test.js` (after extension)
   - `tests/unit/systems/player-visual-state-system.test.js` (new)
   - e2e `audit-question-map.js`

**Final gates (run in this order)**:

1. `npx biome check --write src/ tests/ styles/` — fix any lint/format issues introduced by the changes.
2. `npm test` — full Vitest suite.
3. `npx playwright test` — full e2e suite.
4. `npm run policy` — policy-gate enforcement (Biome + manifest budgets + tests).
5. If any test fails, fix the regression (no skipping) and rerun from step 2.

---

## Cross-cutting notes for every subagent

- **AGENTS.md is normative**; if any rule conflicts, AGENTS.md wins.
- **No canvas / WebGL / framework** — DOM/CSS/SVG only.
- **ECS boundaries intact**: simulation systems must not call DOM APIs. The new `player-visual-state-system` writes only to a typed-array store, never to the DOM.
- **Determinism**: do not introduce `Math.random` or non-seeded timing in any new code path. Power-up drops and pellet collection are already deterministic.
- **Biome**: the project uses Biome (not ESLint/Prettier). Run `npx biome check --write` after your edits.
- **Comments**: each new file starts with a JSDoc block explaining purpose, public API, and implementation notes. Single-line `//` comments are required for non-obvious logic (per AGENTS.md "Comments" rule).
- **No `var`, `require`, or `XMLHttpRequest`**.
- **No `innerHTML` / `eval` / `document.write`** — use `textContent` and explicit attribute APIs.
- **Use `addEventListener`**, never inline handler attributes.
- **DOM pool** for hidden entities uses `transform: translate(-9999px, -9999px)`, not `display:none` (existing pattern; do not regress).
- **Reduced motion**: any new non-gameplay CSS animations must have a `prefers-reduced-motion: reduce` override.
- **Tests live next to their area**: unit tests in `tests/unit/`, integration in `tests/integration/`, e2e in `tests/e2e/`.
- **Do not commit**; main thread will handle commit/PR per AGENTS.md "Only commit when explicitly asked".
- **Do not run** `npm run policy` or Playwright — main thread runs the final verification gate. Each subagent's job ends at "tests pass locally for the files I changed".

---

## Step ownership map

| Step | Subagent role | Files (expected edit set) | Tests to add |
|---|---|---|---|
| 1 | `cavecrew-builder`-style edit agent | `src/adapters/dom/renderer-adapter.js`, `styles/grid.css`, `styles/animations.css` | extend `tests/integration/adapters/renderer-adapter.test.js` |
| 2 | `feature-dev:code-architect` style agent (new file + small fix) | new `src/ecs/systems/player-visual-state-system.js`, `src/ecs/systems/render-dom-system.js` (one line), `src/game/bootstrap.js` (one import + one factory call), `styles/animations.css` (no change — already targets `is-speed-boosted`) | new `tests/unit/systems/player-visual-state-system.test.js`, extend `tests/unit/systems/render-dom-system.test.js` |
| 3 | `cavecrew-builder` style edit agent | `src/ecs/systems/hud-system.js` | extend or new `tests/unit/systems/hud-system.test.js` |
| 4 | `cavecrew-builder` style edit agent (small) | `src/ecs/components/props.js`, `src/ecs/components/visual.js`, `src/ecs/systems/render-dom-system.js`, `tests/unit/components/props.test.js`, `tests/unit/systems/render-dom-system.test.js` | remove the now-dead tests |
| 5 | audit agent (read-only verifier) | n/a — reads all changed files, runs `git status`/`git diff`, runs `npm test` and `npx playwright test`, runs `npm run policy` | writes findings to docs/audit-reports/power-up-visual-fix-audit.md |

The 4 build steps can run in **parallel** (Steps 1, 2, 3, 4 touch disjoint files). Step 5 depends on all four finishing.
