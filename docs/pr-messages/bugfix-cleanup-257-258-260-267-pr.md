# 🔧 bugfix: dead-code & asset cleanup — #260 #257 #258 #267

> Four Track D cleanup issues (all assigned to @edvallm) on one `bugfix-*` branch. Dead CSS + a duplicated constant + unwired assets + unused higher-res tiers. `bugfix-*` bypasses ownership; all changes are within Track D areas.

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] Branch name follows `<owner>/bugfix-<slug>` (`medvall/bugfix-cleanup-257-258-260-267`).
- [x] Changed files are within Track D (constants/resources, render systems, renderer adapter, styles, visual assets/manifest).
- [x] Ran unit + e2e for the touched paths; `validate:schema` for the manifest change.
- [x] Checked security sinks, architecture boundaries, dependency impact (none).
- [x] Requested human review.

## What changed

### #260 (DEAD-12) — single source of truth for tile size
- `src/ecs/resources/constants.js`: added `export const TILE_SIZE_PX = 32`.
- `render-dom-system.js` + `renderer-adapter.js` (`FIT_DEFAULTS`) now import it instead of hardcoding `32`; `styles/variables.css` documents `--tile-size` as its mirror.
- Test: `constants.test.js` asserts `TILE_SIZE_PX === 32`.

### #257 (DEAD-09) — prune never-applied explosion CSS
- `styles/grid.css`: removed `.sprite--explosion` + `--flash/--x-bright/--x-fade/--embers` (applied by no JS; the live effect uses `.sprite--fire--0N`).
- Test: `tests/e2e/explosion-render.spec.js` activates a fire entity and asserts `.sprite--fire` still renders a real background image.

### #258 (DEAD-10) — prune 22 unwired assets
- Removed the 22 `className: null` manifest entries + their 128px `.webp` files (non-directional ghost walk frames, stun-0N, wall-destruct-*, power-pellet-0N, `player-death`, `fire-tile-center`, text-rendered HUD icons). `validate:schema` stays green.
- The `player-death` id also names a collision-intent event type — that string usage is unrelated and untouched.

### #267 (ARCH-03) — remove unused higher-res tiers
- Removed `assets/generated/visuals/256px/` (1.9M) and `512px/` (4.9M) — unreferenced by manifest/code/build; only the 128px tier ships (~6.8M saved).

## Owner scoping decisions (intentional partials)

- **Retained** the `removed_background/`, `v5`/no-background, and `original/` source-image folders (owner keeps them for future re-wiring).
- **Retained** `assets/generated/sprites/*.svg`: deleting them fails the Track A SVG-asset-pipeline audit gate (`audit.e2e.test.js` asserts an `.svg` exists under `assets/generated/`). Whether that assertion is still meaningful (gameplay is webp; only the favicon is SVG) is a Track A audit-contract question, raised separately.
- **Did not touch** the orphan `assets/generated/ui/ui-confirm.mp3` — it is a Track C audio asset, out of Track D scope even under the bugfix bypass.

## Tests

- `npx vitest run` — **1295 passed**.
- `npx playwright test tests/e2e/explosion-render.spec.js` — passes (fire renders post-cleanup).
- `npm run validate:schema` — all manifests valid after the prune.
- `npm run check` — clean. `npm run policy` — green modulo the pre-existing e2e timing-flake cluster.

## Audit questions affected

- **F-03/F-04** (no canvas/frameworks) — unaffected. SVG-pipeline audit gate stays satisfied (sprites retained).
- No behavioral/audit coverage change; pure cleanup.

## Security notes

- No sinks or dependencies touched. Asset removals only.

## Architecture / dependency notes

- `TILE_SIZE_PX` centralization removes constant drift risk. No dependency/lockfile changes.

## Risks

- Low. Removed assets are unreferenced (verified against manifest, code, styles, build, and tests). The explosion CSS was provably unapplied. The one interaction found during cleanup — the SVG audit gate — is respected by retaining `sprites/`.
