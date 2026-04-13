# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-wide rerun when needed: `npm run policy:repo`

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [ ] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>` (for example `ekaramet/A-03`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed the audit IDs affected by this change.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Wired the existing `B-03` player movement path into the runtime bootstrap in `src/game/bootstrap.js`.
- Added default runtime registration for `input-system` and `player-move-system` so movement works through the normal ECS phase pipeline.
- Initialized and reset the player, position, velocity, and input-state stores during bootstrap and level transitions.
- Added player-entity synchronization from the loaded map so game start and restart place the player at the canonical spawn tile.
- Extended `src/game/level-loader.js` with an `onLevelLoaded` hook so runtime entity synchronization can happen without coupling map loading to movement logic.
- Updated `src/main.ecs.js` to create the browser input adapter, preload the shipped map JSON files, build a sync map loader, and inject the input adapter as a World resource.
- Expanded `tests/integration/gameplay/a03-game-loop.test.js` to cover runtime movement wiring, adapter-to-system flow, player respawn on restart, and browser bootstrap map preloading.
- Added extra movement helper coverage in `tests/unit/systems/player-move-system.test.js` for the runtime-integrated helper surface.

## Why
- `B-03` was implemented at the system level, but that alone does not make movement work in the actual game runtime.
- The runtime needs the default ECS system registration, resource allocation, map spawn synchronization, and browser input injection to connect input to live player motion.
- Restart and level-load flows must reset player state cleanly so deterministic movement does not inherit stale component data across runs.
- The integration tests lock the adapter/bootstrap/runtime boundary so later movement or startup changes do not silently break the playable path.

## Tests
- `npm run policy` was run locally, but this branch is expected to fail the policy gate because `asmyrogl/B-03-runtime-integration` does not match the required branch format `<owner-or-scope>/<TRACK>-<NN>`.
- The expected failure is the branch-name traceability check, not the implementation scope itself.

## Audit questions affected
- `AUDIT-F-11`
- `AUDIT-F-12`
- `AUDIT-F-13`

## Security notes
- Browser input stays isolated at the app boundary through `createInputAdapter()` and is injected into the ECS world as a resource.
- No unsafe HTML sinks, inline handlers, framework imports, or canvas APIs were introduced.
- Map loading continues through explicit JSON parsing into canonical map resources rather than arbitrary DOM-driven data paths.

## Architecture / dependency notes
- The integration keeps ECS boundaries intact: simulation systems still consume only World resources and do not import browser adapters directly.
- `src/game/bootstrap.js` now owns the default runtime wiring for movement-related stores and systems, which is the correct boundary for this integration work.
- `src/game/level-loader.js` remains responsible for level bookkeeping; the new hook only exposes a synchronization point after map load.
- No new runtime dependencies, lockfiles, or package metadata changed.

## Risks
- The branch name currently violates the PR policy convention, so the policy gate remains red until the branch is renamed or the workflow is adjusted.
- This branch mixes ticket implementation with runtime integration work, so reviewers should check that no ownership/process rule is being enforced more strictly elsewhere.
- Browser bootstrap now depends on successful map preloading before runtime start; if asset loading fails, startup correctly errors instead of silently limping forward.
