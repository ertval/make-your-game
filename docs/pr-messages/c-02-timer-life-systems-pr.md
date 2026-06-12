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
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (not applicable).
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
- Implemented `src/ecs/systems/timer-system.js` to initialize level countdown state from canonical level durations, decrement from `context.dtMs` during active play, clamp remaining time, and transition the shared game state to `GAME_OVER` when time expires.
- Implemented `src/ecs/systems/life-system.js` to initialize canonical starting lives, consume collision-driven player death intents, respawn the player deterministically at the map spawn, grant 2000 ms of invincibility, and transition to `GAME_OVER` when lives reach zero.
- Added focused unit coverage in `tests/unit/systems/timer-system.test.js` and `tests/unit/systems/life-system.test.js` for countdown behavior, level switching, time-up handling, respawn state reset, invincibility timing, and zero-lives game over.
- Clarified the audit traceability status for `AUDIT-F-14` and `AUDIT-F-16` to reflect that C-02 covers system logic while HUD-surface coverage remains pending under C-05.
- Added this PR message artifact at `docs/pr-messages/c-02-timer-life-systems-pr.md` to satisfy the process/documentation audit requirement.

## Why
- C-02 owns the pure ECS timer and life-state logic, and those systems need to exist independently of HUD rendering so later tickets can consume stable world resources.
- The audit failure was caused by process/documentation gaps rather than by incorrect gameplay logic, so the missing PR artifact and ambiguous audit status text needed to be fixed without changing implementation scope.
- The traceability wording now makes the split explicit: C-02 provides executable system logic coverage, while HUD presentation verification is still tracked under C-05.

## Tests
- `npx vitest run tests/unit/systems/timer-system.test.js`
- `npx vitest run tests/unit/systems/life-system.test.js`

## Audit questions affected
- `AUDIT-F-14 | Execution type: Fully Automatable | Verification: timer countdown and time-up coverage in tests/unit/systems/timer-system.test.js | Evidence path/link: tests/unit/systems/timer-system.test.js`
- `AUDIT-F-16 | Execution type: Fully Automatable | Verification: life decrement, respawn invincibility, and zero-lives coverage in tests/unit/systems/life-system.test.js | Evidence path/link: tests/unit/systems/life-system.test.js`

## Security notes
- No unsafe DOM sinks, inline handlers, dynamic code execution, framework imports, or canvas/WebGL/WebGPU APIs were introduced.
- Both gameplay systems remain pure ECS logic over world resources, so this change does not expand the browser trust boundary.
- The documentation-only follow-up changes are confined to `docs/` and do not affect runtime behavior.

## Architecture / dependency notes
- `timer-system.js` and `life-system.js` keep DOM isolation intact and do not import adapters directly.
- The life system consumes collision intents as data and resets movement/input state through existing ECS stores, preserving the intended system-to-system contract.
- `AUDIT-F-14` and `AUDIT-F-16` remain mapped to the existing unit tests; only the status text was clarified, with no change to ownership, mappings, or test references.
- No dependency, lockfile, or package metadata changes were made.

## Risks
- The PR artifact and audit wording fix the process/documentation gaps, but unrelated repository-wide quality-gate failures can still keep umbrella audit commands red until their owning work is addressed.
- HUD-visible verification for timer and lives remains partially tracked to C-05, so reviewers should evaluate this PR as system-logic-complete rather than full HUD-surface-complete.
