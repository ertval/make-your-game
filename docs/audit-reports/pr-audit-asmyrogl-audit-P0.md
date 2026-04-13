# Phase 0 Audit Report

Date: 2026-04-13

## Scope Reviewed
- Scope: Phase 0 only
- Tickets audited: `A-01`, `A-02`, `A-03`, `B-01`, `D-01`, `D-02`, `D-03`, `D-04`
- Source of truth used: `AGENTS.md`, `docs/requirements.md`, `docs/game-description.md`, `docs/audit.md`, `docs/implementation/implementation-plan.md`, `docs/implementation/track-a.md`, `docs/implementation/track-b.md`, `docs/implementation/track-d.md`, `docs/implementation/ticket-tracker.md`, `docs/implementation/audit-traceability-matrix.md`
- Explicitly ignored: branch naming, PR metadata, ticket-resolution rules for this reporting branch

## Verdict
- Status: RED
- Conclusion: Phase 0 is not end-to-end complete yet.
- Why: the foundational pieces exist and the automated P0 checks are mostly green, but the real runtime still has two critical integration failures:
  - the shipped app does not wire map loading into bootstrap, so it can enter `PLAYING` with `mapResource === null`
  - the restart path corrupts the clock state and can stall simulation after restart

## Commands Run
- `npm ci`
- `npm run check`
- `npm run build`
- `npm run validate:schema`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:coverage`
- `npm run policy:quality`
- `npm run policy:repo`
- `npm run check:forbidden`
- `npm run sbom`

## Command Results
- PASS: `npm run check`
- PASS: `npm run build`
- PASS: `npm run validate:schema`
- PASS: `npm run test:unit`
- PASS: `npm run test:integration`
- PASS: `npm run test:e2e`
- PASS: `npm run test:coverage`
- PASS: `npm run policy:quality`
- PASS: `npm run policy:repo`
- PASS: `npm run check:forbidden`
- PASS: `npm run sbom`

Notes:
- The existing `node_modules` was incomplete at the start of the audit. `npm ci` fixed the local environment.
- `npm run test:e2e` needed an unsandboxed run because Playwright had to bind a local port. That was an environment constraint, not a repo defect.

## What Is Actually Good
- A-01 baseline tooling is present and working once dependencies are installed.
- A-02 world/entity/query core is implemented and well covered.
- B-01 component stores are implemented and well covered.
- D-01 resource modules exist and their unit tests pass.
- D-02 maps and schema validate successfully.
- D-03 map parsing and cloning logic itself is implemented and unit-tested.
- D-04 render-intent contracts exist and are covered.
- A-03 pause, unhandled rejection, build, and browser smoke coverage are partially in place.

## Findings
1. Critical: the real app bootstrap does not wire Phase 0 map loading end to end, so the runtime can start gameplay with no map loaded.
   - Evidence:
     - [src/main.ecs.js](/Users/alexsmyro/dev/Z01/make-your-game/src/main.ecs.js:304) calls `createBootstrap({ now: getNow() })` and passes no `loadMapForLevel`.
     - [src/game/level-loader.js](/Users/alexsmyro/dev/Z01/make-your-game/src/game/level-loader.js:79) returns `null` when no loader function exists, and [src/game/level-loader.js](/Users/alexsmyro/dev/Z01/make-your-game/src/game/level-loader.js:94) still writes that `null` into the world resource.
     - [src/game/game-flow.js](/Users/alexsmyro/dev/Z01/make-your-game/src/game/game-flow.js:81) transitions `MENU -> PLAYING` and calls `loadLevel(...)`, but it never checks whether loading succeeded.
     - Repro from the shipped bootstrap path:
       - `createBootstrap({ now: 0 }).gameFlow.startGame()` produced `{"started":true,"mapResource":null,"state":"PLAYING","paused":false}`.
   - Why this blocks P0: D-02 and D-03 exist as isolated modules, but they are not integrated into the actual runtime. That means the phase-zero foundation is not wired end to end.
   - Required fix:
     - Add real app-level map preload/loading in `bootstrapApplication`.
     - Inject a real `loadMapForLevel` implementation into `createBootstrap`, likely via async preload + `createSyncMapLoader(...)`.
     - Fail visibly if map loading returns `null` or throws, instead of entering `PLAYING`.

2. Critical: restart corrupts the clock because bootstrap resets with a nonexistent timestamp field.
   - Evidence:
     - [src/game/bootstrap.js](/Users/alexsmyro/dev/Z01/make-your-game/src/game/bootstrap.js:79) calls `resetClock(clock, clock.realTimeMs)`.
     - [src/ecs/resources/clock.js](/Users/alexsmyro/dev/Z01/make-your-game/src/ecs/resources/clock.js:32) defines the clock shape, and there is no `realTimeMs` field on that object.
     - Repro:
       - after `restartLevel()`, the next `stepFrame(...)` returned `steps = NaN` and left the world frame frozen
       - observed state after restart path: `{"restarted":true,"lastFrameTime":33.3334,"accumulator":"NaN","alpha":"NaN","steps":"NaN","simTimeMs":16.666666666666668,"frame":1}`
   - Why this blocks P0: A-03 is supposed to provide safe lifecycle timing and restart-ready loop behavior. The actual runtime restart path is broken.
   - Required fix:
     - Reset with a real timestamp, not `clock.realTimeMs`.
     - The simplest safe fix is to resync from the runtime's current clock source during restart, just like resume/start already do.
     - Add a regression test that exercises the real runtime restart path, not only `gameFlow.restartLevel()` in isolation.

3. High: the world bootstrap does not assemble all Phase 0 runtime resources; `rng` and `event-queue` are implemented as files but never registered into the world.
   - Evidence:
     - [src/game/bootstrap.js](/Users/alexsmyro/dev/Z01/make-your-game/src/game/bootstrap.js:86) only registers `clock`, `gameFlow`, `gameStatus`, and `levelLoader`.
     - There is no runtime call site anywhere in `src/` that creates or registers `createRNG(...)` or `createEventQueue(...)`.
   - Why this matters: D-01 is marked done, but two of its core runtime resources are still library-only. For a phase-zero foundation, that is not fully assembled world state.
   - Required fix:
     - Create and register the seeded RNG resource during bootstrap.
     - Create and register the deterministic event queue during bootstrap.
     - Standardize the resource keys and cover their presence in bootstrap-level tests.

4. Medium: the existing P0 test suite misses the exact browser/runtime paths where the real integration bugs live.
   - Evidence:
     - [tests/integration/gameplay/a03-game-loop.test.js](/Users/alexsmyro/dev/Z01/make-your-game/tests/integration/gameplay/a03-game-loop.test.js:57) injects a fake `loadMapForLevel`, so it never exercises the shipped bootstrap path from `bootstrapApplication`.
     - [tests/unit/game/game-flow.test.js](/Users/alexsmyro/dev/Z01/make-your-game/tests/unit/game/game-flow.test.js:75) tests `gameFlow.restartLevel(...)` directly, but there is no test for the runtime-level restart flow that triggers `onRestart`.
     - The browser specs only cover pause and unhandled rejection.
   - Why this matters: Phase-zero verification is currently green while two actual runtime integration failures still exist.
   - Required fix:
     - Add one integration or e2e test that boots the default app path and asserts a real map resource is loaded before gameplay begins.
     - Add one runtime test that goes through the real restart control path and asserts the next frame advances normally.

## Path To Green
- Wire real map loading into `bootstrapApplication` and make failed map loads surface as a critical error instead of silently entering `PLAYING`.
- Fix restart clock resynchronization so the post-restart frame loop stays numeric and advances again.
- Register `rng` and `eventQueue` in bootstrap so D-01 is actually assembled into the runtime foundation.
- Add regression coverage for the default bootstrap map-load path and the real runtime restart path.

## Bottom Line
The P0 modules mostly exist and the direct tests are strong, but Phase 0 is still not end to end. The current runtime foundation is missing one real integration path, one broken restart path, and one incomplete bootstrap assembly step.
