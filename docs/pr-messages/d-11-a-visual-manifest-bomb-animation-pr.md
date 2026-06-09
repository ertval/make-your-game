# D-11-a: Visual Manifest v1.0 + Bomb Fuse Animation + render-dom Restart Fix

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` — branch is `medvall/D-11-manifest`.
- [x] I confirmed changed files stay within the declared ticket track ownership scope (all Track D: render-*.js, styles/, manifests/, schemas/).
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected audit ID with execution type and test output.
- [x] I confirmed full audit coverage remains mapped for F-01..F-21 and B-01..B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmations

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`.
- [x] Simulation systems access adapters only through World resources (no direct adapter imports).
- [x] `src/adapters/` owns DOM and browser I/O side effects.
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection.
- [x] No framework imports or canvas APIs were introduced in this change.

## What changed

- **D-11-a: Visual Manifest v1.0** — Populated `assets/manifests/visual-manifest.json` with 84 production sprite entries covering the full 128px tier (`visuals/128px/characters`, `enemies`, `environment`, `items`, `effects`, `ui`). Updated `docs/schemas/visual-manifest.schema.json` path regex to accept the `assets/generated/visuals/128px/` hierarchy (was missing `assets/` prefix alternative).
- **Bomb fuse-frame animation** — `render-collect-system` now computes a `spriteId` (0–3) from `bombStore.fuseMs` progress and writes it to the render-intent buffer. `render-dom-system` maps that ID to CSS classes (`sprite--bomb--idle`, `sprite--bomb--fuse-01`, `sprite--bomb--fuse-02`, `sprite--bomb--fuse-03`), matching the existing fire-tile and player walk-cycle pattern. `styles/grid.css` adds the four fuse-frame background declarations.
- **render-dom restart-cleanup correctness fix** — `context.world.renderFrame` is always `undefined` because `context.world` is a frozen worldView (`World#createSystemWorldView`) that exposes only capability methods, not the live `renderFrame` counter. The frame-0 sprite-pool map clear in render-dom-system was therefore dead code. Changed to `context.renderFrame` (the baseContext property set by `World.runRenderCommit`) so the cleanup fires correctly on restart. Regression test added that drives the real `World.runRenderCommit` path to prove the cleanup fires (previously silent failure).

## Why

- D-11-a manifest is required by the `validate:schema` gate (A-07) and closes the visual asset inventory gap for D-11 acceptance.
- Bomb animation: bombs were rendered as a static idle sprite regardless of fuse countdown progress; this adds expected visual feedback for the detonation countdown.
- Restart fix: the dead frame-0 branch meant stale sprite-pool map entries could linger across level transitions, causing pool/map desync where render-dom reuses a released (idle) element without re-acquiring it, and orphaned elements escape `spritePool.reset()` on the next restart.

## Tests

- `npm run test` — 567/567 tests pass (unit + integration).
- `npm run policy` — ALL CLEAR.
- `npm run validate:schema` — manifest validates clean against updated schema.

Specific new/updated test coverage:
- `tests/unit/systems/render-collect-system.test.js` — new bomb spriteId computation tests (idle/fuse-01/02/03 thresholds).
- `tests/unit/systems/render-dom-system.test.js` — new bomb frame class tests; new regression test `fires the restart cleanup when driven through the real World render commit` verifying the renderFrame fix under production wiring.

## Audit questions affected

- **F-01** (game runs without crashing): Fully Automatable — 567 tests pass; render-dom restart-cleanup prevents pool/map desync on level restart.
- **F-03** (game avoids canvas): Fully Automatable — no canvas APIs introduced.
- **F-04** (game avoids frameworks): Fully Automatable — no framework imports.
- **F-17 / F-18** (performance, no dropped frames): no new per-frame allocations; all new constants are hoisted module-level (ARCH-05 compliant).
- **D-11 acceptance** (visual manifest present + schema-valid): `npm run validate:schema` passes.

## Security notes

- No new DOM sinks. All bomb fuse class names are compile-time string constants; no dynamic string construction from untrusted data.
- Manifest JSON contains only static metadata (paths, dimensions, tags); no executable content.

## Architecture / dependency notes

- `render-dom-system` remains the sole DOM mutator; the bomb animation path writes only `classList` (same pattern as fire/player).
- `render-collect-system` reads `bombStore.fuseMs` and `bombStore.fuseMaxMs` (already-existing resources); no new resource dependencies.
- Manifest schema path regex broadened to accept `assets/generated/visuals/128px/` in addition to `generated/visuals/128px/`; backward-compatible (prior entries still validate).

## Risks

- Bomb fuse animation not verified live in browser (tab backgrounding halts game loop in the dev environment). CSS classes degrade gracefully: missing spriteId leaves only the base `sprite--bomb` class, which already provides sizing and idle background-image.
- renderFrame fix: the dead branch now runs; if any test environment wires `renderFrame` on `context.world` instead of `context`, it would now double-clear the map. The new regression test confirms production wiring is correct; no existing tests were broken.
