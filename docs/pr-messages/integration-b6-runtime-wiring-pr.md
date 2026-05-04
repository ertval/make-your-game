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
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [ ] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [ ] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
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

- Added deterministic ECS bomb tick and explosion systems for bomb placement, fuse countdown, detonation queue processing, fire spawning, fire expiry, destructible-wall clearing, power-up drops, and chain reactions.
- Added bomb/fire component metadata, collision event support, and collision integration needed for bomb, fire, and fire-caused gameplay events.
- Wired bomb and explosion gameplay into the default runtime path through `src/game/runtime-bomb-explosion-wiring.js`, keeping `src/game/bootstrap.js` focused on orchestration.
- Registered runtime bomb/fire/collider/RNG/detonation resources and preallocated pooled bomb/fire entities before fixed-step logic systems run.
- Rebuilt bomb/fire pools after `restartLevel()` so restart does not leave stale pooled entity handles.
- Expanded the fire pool budget with `MAX_FIRE_RADIUS` so upgraded fire radius gameplay has enough pooled fire slots.
- Added integration coverage proving runtime input can place a bomb, detonate it into fire, expire fire, and still work after restart.

## Why

- B-06 system behavior existed at the ECS layer, but the browser/runtime bootstrap path did not execute bomb placement, fuse ticking, explosion resolution, or fire cleanup by default.
- Runtime wiring belongs outside the pure ECS systems so simulation modules stay deterministic and DOM-free while bootstrap remains responsible for assembly.
- Fire pools need to be sized for the maximum upgraded radius before runtime wiring lands, otherwise valid upgraded explosions can exhaust the pool.
- Restart destroys entities, so pooled bomb/fire handles must be rebuilt before the next gameplay tick.

## Tests

- `npm run check` - passed.
- `npm run test:unit` - passed.
- `npm run test:integration` - passed.
- `./node_modules/.bin/vitest run tests/integration/gameplay/a03-game-loop.test.js tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js tests/unit/game/bootstrap.test.js` - passed.
- Not run: `npm run policy`.
- Not run: `npm run test:e2e`.
- Not run: `npm run test:audit`.

## Audit questions affected

- AUDIT-F-01 | Execution type: Fully Automatable | Verification: default runtime bootstrap now registers and executes bomb/explosion logic without crashing | Evidence path/link: `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`
- AUDIT-F-06 | Execution type: Fully Automatable | Verification: bomb/explosion mechanics support the documented Pac-Man plus Bomberman genre behavior | Evidence path/link: `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js`
- AUDIT-F-09 | Execution type: Fully Automatable | Verification: restart rebuilds runtime bomb/fire pools so gameplay can continue after reset; full pause-menu restart audit remains covered by later runtime/UI checks | Evidence path/link: `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`
- AUDIT-F-13 | Execution type: Fully Automatable | Verification: runtime input-to-bomb-to-fire behavior and system-level explosion geometry/chain behavior are covered | Evidence path/link: `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`, `tests/unit/systems/explosion-system.test.js`
- AUDIT-B-03 | Execution type: Fully Automatable | Verification: bomb/fire entities use fixed pools, fire budget covers upgraded radius, and restart validates live pool handles before reuse | Evidence path/link: `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`, `tests/unit/resources/constants.test.js`
- AUDIT-B-06 | Execution type: Manual-With-Evidence | Verification: this branch contributes to overall implementation quality; final signed evidence remains project-level | Evidence path/link: `docs/handoffs/track-a-b6-runtime-wiring-handoff.md`

## Security notes

- No network, storage, HTML injection, or unsafe sink changes were introduced.
- Simulation systems remain DOM-free and access adapters/state through World resources.
- The runtime integration test uses a local document stub only to let render pool setup execute in headless Vitest.

## Architecture / dependency notes

- No dependencies or lockfiles were changed.
- Runtime resource-key defaults live in `src/game/runtime-bomb-explosion-wiring.js` because they are assembly details, not gameplay tuning constants.
- Gameplay tuning constants remain in `src/ecs/resources/constants.js`; `MAX_FIRE_RADIUS` sizes the pool independently from `DEFAULT_FIRE_RADIUS`.
- `src/game/bootstrap.js` now orchestrates runtime setup while bomb/explosion system construction and pooled prop resource setup live in the dedicated wiring module.
- The main-branch render DOM system is preserved in the render phase; headless bootstrap creates no sprite pool when `document` is unavailable, so render systems no-op safely in non-browser tests.

## Risks

- Full browser e2e and audit suites were not rerun for this PR message update.
- AUDIT-B-06 still needs final Manual-With-Evidence project sign-off.
- Runtime behavior now preallocates additional fire entities based on the upgraded radius budget, so any future entity-cap reduction must account for bomb/fire pool sizes.
