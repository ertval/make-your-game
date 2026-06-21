# 🧩 Integration: D-11 className resolution + power-up visibility + bomb visuals & lifecycle

> **Summary**: Completes the D-11 sprite metadata handoff by resolving a real `className` onto every visual-manifest entry, then fixes a cluster of bomb/power-up issues found while verifying it: dropped power-ups were invisible on the board, the bomb power-up used an off-style opaque image, the placed-bomb animation reused the idle frame, and a bomb placed before a level exit survived into the next level and detonated. This is a `medvall/integration-*` branch, so the cross-track edits (Track A `bootstrap.js` + policy-gate test, Track B bomb wiring) are carried under the integration ownership bypass.

---

## ✅ Required checks
- [x] Read AGENTS.md and the agentic workflow guide.
- [x] Ran `npm run policy` locally — **🏁 ALL CLEAR** (vitest, schema, forbidden-scan, source headers, ownership, traceability, and the full Playwright e2e all pass).
- [x] Branch name follows the `<owner>/integration<slug>` convention (`medvall/integration-D11-powerups-bomb`).
- [x] Cross-track edits are intentional and confined to the changes below; integration branches receive the same ownership bypass as bugfix branches.
- [x] Listed affected tests with output.
- [x] Checked security sinks, architecture boundaries, and dependency/lockfile impact (none).

## 🧱 Layer boundary confirmations
- [x] `src/ecs/systems/` has no new DOM references beyond `render-dom-system.js`.
- [x] Simulation systems reach adapters only through World resources.
- [x] Class writes use `classList` / static string constants — no HTML injection.
- [x] No framework imports or canvas APIs introduced.

---

## 📝 What changed

### 1. D-11 — sprite `className` resolved into the visual manifest *(commit `df8455b`)*
- **`assets/manifests/visual-manifest.json`**: every one of the 84 entries now carries a `className` — the CSS class `render-dom-system` actually applies (`sprite--*` / `cell-*`), or `null` for the 22 produced-but-unbound assets (non-directional ghost walk frames, `*-stunned-0N`, `wall-destruct-*`, `power-pellet-0N`, `player-death`, `fire-tile-center`, text-rendered HUD icons). Values were derived from the `styles/` background-image bindings, not the stale kebab-case placeholders in `sprite-handoff.json`; the explosion frames resolve to `sprite--fire--0N` (the class the runtime applies — `sprite--explosion--*` is CSS-only and never applied).
- **`docs/schemas/visual-manifest.schema.json`**: `className` added as a required field (string `^(sprite--|cell-)[a-z0-9-]+$`, or `null`).
- **`assets/source/visual/sprite-handoff.json`**: note updated — the validated manifest is now the authoritative spriteId→className source.
- **`docs/implementation/assets-pipeline.md`**: new §8.1 *Manifest → renderable mapping & fallback* documenting the resolution, the `null` convention, the renderer's kind-base-class fallback, and the CI on-disk asset-existence guard.
- **`docs/implementation/track-d.md`**: D-11 acceptance checklist closed out.
- **`tests/unit/policy-gate/validate-schema-asset-gates.test.js`** (Track A): fixture manifest now carries `className`.

### 2. Power-up drops were invisible — render mapping fix
- **`src/adapters/dom/renderer-adapter.js`**: `CELL_TYPE_CLASSES` only mapped cells `0–6`; power-up drops are cell types `7/8/9` (`POWER_UP_BOMB/FIRE/SPEED`), so they fell through to `cell-empty` and rendered as bare floor — even though `collision-system` still granted the pickup. Added `7/8/9 → cell-powerup-bomb/fire/speed`.
- **`styles/grid.css`**: three `cell-powerup-*` classes (collectible `::after` overlay pattern, pulsing) backed by the existing `powerup-*.webp` images.

### 3. Bomb power-up icon + placed-bomb animation rework
- **`assets/.../items/powerup-bomb.webp`**: replaced the opaque, off-style orb (no alpha) with a copy of the transparent `bomb-idle.webp` clean bomb (128×128). Manifest `powerup-bomb` dimensions updated 76→128, `className` `cell-powerup-bomb`.
- **`assets/.../items/bomb-fuse-04.webp`** *(new)*: extracted from the v5 no-background bomb sheet (row 2, col 2 — the bright detonation flash).
- **`src/ecs/systems/render-dom-system.js`**: `BOMB_SPRITE_CLASSES` is now `fuse-01 → fuse-02 → fuse-03 → fuse-04`. A placed bomb is always lit, so the unlit `bomb-idle` sprite is freed for the power-up pickup; the four lit frames give the placed bomb a clear crackle → glow → vortex → flash progression.
- **`styles/grid.css`**: added `.sprite--bomb--fuse-04`. **`visual-manifest.json`**: new `bomb-fuse-04` entry.

### 4. Bomb lifecycle — live bombs no longer carry across a level transition
- **`src/game/runtime-bomb-explosion-wiring.js`**: new exported `deactivateAllBombsAndFire(world, options)` — resets every pooled bomb/fire slot to inactive (`collider = NONE`, clears fuse/burn timers and owner/source ids), empties the pending detonation queue, and drops the looping fuse-SFX flag.
- **`src/game/bootstrap.js`**: `onLevelLoaded` now calls it. `loadLevel` reloads the map without destroying entities (unlike restart, which rebuilds the pools), so a bomb placed just before the exit kept its slot and fuse and detonated on the next level. The pool is now cleared on every transition.

---

## 🎯 Why
- **D-11 className**: the D-10 handoff carried placeholder kebab-case class names and asked D-11 to align them to the real `render-dom-system` CSS classes; this lands that alignment in the CI-validated manifest, closing the last open D-11 acceptance items.
- **Power-up visibility**: the cell-render table simply never grew to cover the `7/8/9` power-up cell types, so a fully-implemented gameplay feature (drops, pickup, scoring, audio) was invisible to players.
- **Bomb visuals**: the orb art was opaque/off-brand; reusing `bomb-idle` makes the power-up read as a bomb and frees the placed-bomb animation to be fully lit with a distinct climax frame.
- **Bomb lifecycle**: a carried-over bomb detonating on a fresh level is a clear correctness bug.

---

## 🧪 Tests
- **`npx vitest run`** — **1282 passed (95 files)**.
- **`npm run validate:schema`** — visual manifest + audio manifest + all three maps pass.
- **`npm run policy`** — **🏁 ALL CLEAR** (full Playwright e2e included; no flakes this run).

New / updated coverage:
- `tests/integration/adapters/renderer-adapter.test.js` — power-up cell types `7/8/9` render `cell-powerup-*`, and the class reverts to `cell-empty` on pickup.
- `tests/e2e/render-desync-bugs.spec.js` — drives a map cell to type `7` and asserts the rendered `::after` background-image actually contains `powerup-bomb` (proves the drop is visible, not just classed).
- `tests/integration/gameplay/level-transition-spawn-reset.test.js` — a bomb live at the exit is deactivated after the transition (`collider NONE`, `fuseMs 0`, `bombAudioActive false`).
- `tests/unit/systems/render-dom-system.test.js` / `render-collect-system.test.js` — bomb frame-class assertion + comment updated for the new fuse-01..04 mapping.

---

## 🔍 Audit questions affected
- **F-01** (runs without crashing): unaffected — 1282 tests green; the level-transition bomb reset removes a stale-entity detonation path.
- **F-03 / F-04** (no canvas / no frameworks): unaffected — DOM-only `classList`/`background-image`.
- **F-17 / F-18** (performance): no new per-frame allocations; the level-transition reset runs once per load.

## 🛡️ Security notes
- No new sinks. All class names are compile-time constants; manifest `className` is schema-constrained to `^(sprite--|cell-)[a-z0-9-]+$`.
- The CI schema validator still fails closed if any manifest `path` is missing on disk, so a referenced asset can never 404 at runtime.

## 🏗️ Architecture / dependency notes
- `deactivateAllBombsAndFire` lives beside `initializeBombExplosionResources` in the runtime bomb/explosion wiring module and only resets pooled-slot state (no entity destruction), mirroring the per-slot `deactivate*` helpers the bomb/explosion systems already use.
- No dependency or lockfile changes.

## ⚠️ Risks
- **Low.** The bomb-animation change is presentation-only (sprite-class mapping); the spriteId computation and 4-frame count are unchanged. The level-transition reset is additive and covered by a regression test. The `className` field is schema-validated and asserted by the existing asset-gate test.
- Cross-track files touched (`bootstrap.js`, `runtime-bomb-explosion-wiring.js`, the policy-gate test) are carried under the integration-branch ownership bypass; all changes are otherwise within their natural systems.

---

Completes the D-11 sprite-className acceptance items and fixes four issues found during verification: power-up drop render visibility, the bomb power-up art, the placed-bomb fuse animation, and cross-level bomb persistence. (No tracker issue numbers — the four fixes were found manually during D-11 verification.)
