# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-only troubleshooting rerun: `npm run policy:repo`

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [ ] I ran `npm run policy` locally.
- [ ] I confirmed changed files stay within the declared ticket ownership scope.
- [ ] I ran `npm run policy` locally.
- [ ] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [ ] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [ ] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Hardened the Track B input adapter contract in `src/adapters/io/input-adapter.js` by adding `getHeldKeys()` and `assertValidInputAdapter()` plus explicit `Set`-shape validation for held and pressed input.
- Updated `src/ecs/systems/input-system.js` to consume only the explicit adapter API instead of probing adapter fields, while keeping the contract check local to the ECS layer.
- Added runtime-status metadata in `src/ecs/components/actors.js`, `src/ecs/components/props.js`, `src/ecs/components/spatial.js`, and `src/ecs/components/stats.js` so active stores versus planned scaffolding are documented explicitly.
- Implemented the Track A-side runtime wiring for this issue in `src/game/bootstrap.js` by pre-registering the adapter resource slot, unifying custom adapter-resource-key handling, and adding `setInputAdapter()` / `getInputAdapter()` lifecycle helpers.
- Updated `src/main.ecs.js` so browser bootstrap registers adapters through `bootstrap.setInputAdapter()`, clears the adapter resource on runtime stop, and fails loudly if blur handling encounters a malformed adapter that bypassed registration.
- Added focused bootstrap/runtime coverage in `tests/unit/game/bootstrap.test.js`, `tests/integration/adapters/runtime-adapter-boundary.test.js`, and `tests/integration/gameplay/a03-game-loop.test.js` for custom resource keys, registration-time validation, blur clearing, stop-time teardown, and default runtime movement flow.
- Added/updated Track B-owned tests in `tests/integration/adapters/input-adapter.test.js`, `tests/unit/systems/input-system.test.js`, and the component metadata tests.

## Why
- Issue `#16` called out a cross-track contract gap: the input adapter contract had been hardened on the ECS side, but bootstrap/runtime registration and teardown were still inconsistent.
- The runtime needed one explicit adapter registration path so malformed adapters fail at injection time instead of later during gameplay.
- Removing adapter field probing was necessary to fully close `ARCH-12`; systems should consume a public adapter contract, not internal object shape.
- The component-store exports needed a clear active-versus-planned status so `ARCH-X01` is resolved honestly for the current runtime path without pretending that later gameplay stores are already wired.
- This branch includes both the Track B-owned contract work and the Track A-owned bootstrap/runtime side because the issue spans both surfaces and the Track A owner requested that implementation here.

## Tests
- `npm run check` (passed)
- `npm run test -- tests/unit/game/bootstrap.test.js tests/integration/adapters/runtime-adapter-boundary.test.js tests/integration/gameplay/a03-game-loop.test.js tests/integration/adapters/input-adapter.test.js tests/unit/systems/input-system.test.js` (passed)

## Audit questions affected
- `AUDIT-F-11` | Execution type: Fully Automatable | Verification: bootstrap/runtime movement path and custom adapter resource key coverage in `tests/integration/gameplay/a03-game-loop.test.js` | Evidence path/link: `tests/integration/gameplay/a03-game-loop.test.js`
- `AUDIT-F-12` | Execution type: Fully Automatable | Verification: adapter boundary, focus-loss clearing, and explicit contract checks in `tests/integration/adapters/runtime-adapter-boundary.test.js` and `tests/integration/adapters/input-adapter.test.js` | Evidence path/link: `tests/integration/adapters/runtime-adapter-boundary.test.js`
- `AUDIT-F-13` | Execution type: Fully Automatable | Verification: runtime bootstrap integration, restart-safe movement flow, and adapter teardown behavior in `tests/integration/gameplay/a03-game-loop.test.js` and `tests/unit/game/bootstrap.test.js` | Evidence path/link: `tests/unit/game/bootstrap.test.js`

## Security notes
- Browser keyboard input remains isolated behind the adapter boundary and is injected into ECS through World resources.
- No unsafe HTML sinks, inline handlers, framework imports, or canvas APIs were introduced.
- No new package dependencies or lockfile changes were required.

## Architecture / dependency notes
- `src/ecs/systems/input-system.js` intentionally keeps its adapter contract check local instead of importing the adapter module, preserving the ECS/adapters boundary.
- `src/game/bootstrap.js` now owns the adapter-resource lifecycle for the runtime path, but simulation systems still only consume World resources.
- The new component runtime-status exports are descriptive metadata only; they do not register stores by themselves.
- Remaining planned stores outside the active runtime path stay deferred to their later owning tickets.

## Risks
- `assertValidInputAdapter()` validates `drainPressedKeys()` by calling it, so adapter validation is not side-effect free and would discard one buffered press if an adapter were hot-swapped mid-game.
- The branch currently uses `asmyrogl/bugfix-input-runtime-tests`, which does not match the normal `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` branch policy format.
- Before opening the final PR, unrelated doc-only diffs should be removed so the final scope reflects only the issue implementation.
