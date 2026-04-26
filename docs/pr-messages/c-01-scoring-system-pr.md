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
- Added `src/ecs/systems/scoring-system.js` as the scoring authority for C-01.
- Implemented canonical point values for pellets, power pellets, power-up pickups, normal ghost kills, stunned ghost kills, and level-clear bonus calculation.
- Added the `scoreState` world resource with `totalPoints`, `comboCounter`, and `lastProcessedFrame`.
- Consumed ordered `collisionIntents` from B-04 and applied deterministic score updates from that buffer.
- Implemented same-frame normal ghost chain scoring (`200`, `400`, `800`, ...) and fixed stunned ghost scoring (`400`) without advancing the normal chain.
- Added unit coverage in `tests/unit/systems/scoring-system.test.js` for canonical values, chain logic, duplicate-frame protection, score-state sanitization, malformed input handling, and the level-clear bonus helper.

## Why
- C-01 owns gameplay scoring and combo rules for later HUD and progression consumers.
- The implementation keeps scoring in a pure ECS logic system, which preserves deterministic behavior and maintains DOM isolation.
- The level-clear bonus is exposed as a helper now because the runtime does not yet provide the level-complete event source that will consume it later.

## Tests
- `npx vitest run tests/unit/systems/scoring-system.test.js`
  PASS: `1` file passed, `15` tests passed, `0` failed.
- `npm run policy`
  Not marked complete for this PR message. The run failed outside C-01 scope because repo-wide policy currently hits unrelated failing policy-gate tests, Playwright webServer startup failures, and sandboxed `git` permission errors in `policy:checks` / `policy:trace`.

## Audit questions affected
- `AUDIT-F-15` | Execution type: Fully Automatable | Verification: `tests/unit/systems/scoring-system.test.js` validates canonical score values, ghost chain behavior, duplicate-frame protection, and malformed-input handling | Evidence path/link: `tests/unit/systems/scoring-system.test.js`

## Security notes
- No new DOM sinks, HTML injection paths, storage reads, or network surfaces were added.
- The scoring system reads ECS world resources and mutates only the `scoreState` resource.
- Malformed or missing score-state input is sanitized before use.

## Architecture / dependency notes
- Change stays within Track C ownership: ECS gameplay scoring logic plus scoped unit coverage.
- `src/ecs/systems/scoring-system.js` remains simulation-only and does not import DOM adapters or browser APIs.
- The system depends on existing `collisionIntents`, `gameStatus`, and constants resources; it does not add new runtime dependencies or lockfile changes.
- Level-clear bonus consumption is intentionally deferred until later progression work exposes the required event/resource boundary.

## Risks
- The level-clear bonus helper is implemented but not yet wired into runtime progression, so no points are awarded for level completion until the later integration ticket lands.
- Scoring currently consumes collision intents only; if later tickets introduce new scoring event sources, they must still route final point authority through C-01 to avoid duplication.
