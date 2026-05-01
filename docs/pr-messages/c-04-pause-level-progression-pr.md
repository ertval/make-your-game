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
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Summary

- Implemented C-04 pause and level progression as pure ECS systems.
- Connected keyboard edge input to `pauseIntent` for keyboard-only pause and restart flow.
- Integrated C-04 systems in bootstrap with deterministic ordering: input intent first, FSM pause first in logic, level loader last.
- Added focused unit and adapter coverage for pause input, pause FSM, level completion, level flow, and deferred level loading.
- READY_FOR_MAIN = YES

## Systems added

- `pause-system`: consumes `pauseIntent` and performs FSM-only pause/continue/restart transitions.
- `pause-input-system`: converts edge-triggered `inputState.pause` and `inputState.restart` into `pauseIntent`.
- `level-progress-system`: detects all pellets and power pellets consumed and transitions `PLAYING -> LEVEL_COMPLETE`.
- `level-flow-system`: resolves `LEVEL_COMPLETE` into `VICTORY` or a deferred `levelFlow.pendingLevelAdvance`.
- `level-loader-system`: consumes `levelFlow` and delegates map loading to the existing `levelLoader` resource.

## FSM behavior

- `PLAYING + pauseIntent.toggle -> PAUSED`
- `PAUSED + pauseIntent.toggle -> PLAYING`
- `PAUSED + pauseIntent.restart -> PLAYING`
- `PLAYING + all pellets consumed -> LEVEL_COMPLETE`
- `LEVEL_COMPLETE + final level -> VICTORY`
- `LEVEL_COMPLETE + non-final level -> PLAYING` with `levelFlow.pendingLevelAdvance = true`

## Tests

- `npm test -- tests/unit/systems/pause-input.test.js tests/unit/systems/input-system.test.js tests/unit/components/actors.test.js tests/integration/adapters/input-adapter.test.js`
- `npm test -- tests/unit/systems/level-progress-system.test.js tests/unit/systems/level-flow-system.test.js tests/unit/systems/level-loader-system.test.js`
- `npm run check`

## Audit mapping

- `AUDIT-F-07 | Fully Automatable | Verification: pause input intent and pause FSM unit coverage`
- `AUDIT-F-08 | Fully Automatable | Verification: pause continue transition coverage`
- `AUDIT-F-09 | Fully Automatable | Verification: paused-only restart intent and transition coverage`
- `AUDIT-F-10 | Fully Automatable | Verification: pause-state handoff preserved through gameStatus/clock integration`

## Security notes

- No DOM access, unsafe sinks, inline handlers, dynamic code execution, framework imports, or canvas/WebGL/WebGPU APIs were introduced.
- C-04 systems access runtime state only through World resources.

## Architecture / dependency notes

- Pause input, pause FSM, level completion detection, level flow, and level loading are split across single-purpose systems.
- `level-loader-system` runs last in the default logic phase so no later default logic system reads the old `mapResource`.
- No dependency, lockfile, or package metadata changes were made.

## Risks

- Visible pause overlays remain owned by C-05 and are not part of this C-04 scope.
- C-04 exposes the resource contracts needed for later adapter and overlay work without introducing UI coupling.

