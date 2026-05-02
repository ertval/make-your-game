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

- Implements ECS systems required for pause and level progression.
- Implemented `src/ecs/systems/pause-system.js` as the C-04 FSM-only pause transition system using a dedicated `pauseIntent` world resource.
- Implemented `src/ecs/systems/pause-input-system.js` as the Track C pause-toggle intent bridge over existing input snapshots.
- Implemented `src/ecs/systems/level-progress-system.js` to detect when all pellets and power pellets are consumed and transition `PLAYING -> LEVEL_COMPLETE`.
- Added focused unit coverage in `tests/unit/systems/pause-input.test.js`, `tests/unit/systems/pause-system.test.js`, and `tests/unit/systems/level-progress-system.test.js`.
- Updated Track C implementation docs and audit traceability text so C-04 is marked partial for scoped Track C system-layer coverage only.
- C-04 is system-layer complete and ready for integration.

## Why

- C-04 owns pure gameplay feedback and level-completion logic at the ECS system layer.
- The implementation keeps pause intent, pause FSM transitions, and pellet-completion detection isolated from UI, rendering, and map loading.
- The scoped cleanup keeps this PR inside Track C ownership patterns.

## Tests

- `npm test -- tests/unit/systems/pause-input.test.js tests/unit/systems/pause-system.test.js tests/unit/systems/level-progress-system.test.js`
- `npm run check`

## Audit questions affected

- `AUDIT-F-07 | Status: PARTIAL (system-layer only) | C-04 evidence: pause intent and FSM resources in tests/unit/systems/pause-input.test.js | Deferred: visible pause menu UI and focus behavior to C-05/A-06`
- `AUDIT-F-08 | Status: PARTIAL (system-layer only) | C-04 evidence: pause continue transition covered in tests/unit/systems/pause-system.test.js | Deferred: default runtime registration/bootstrap wiring and browser validation to Track A/B integration`
- `AUDIT-F-09 | Status: PARTIAL (system-layer only) | C-04 evidence: paused restart transition is covered in tests/unit/systems/pause-system.test.js | Deferred: restart reset/reload behavior and level-flow/level-loader runtime advancement to integration/flow owner`
- `AUDIT-F-10 | Status: PARTIAL (system-layer only) | C-04 evidence: pause FSM remains resource-only and is covered in tests/unit/systems/pause-system.test.js | Deferred: browser rAF/performance/manual evidence to Track A/B integration`

## Security notes

- No unsafe DOM sinks, inline handlers, dynamic code execution, framework imports, or canvas/WebGL/WebGPU APIs were introduced.
- C-04 systems remain pure ECS logic over world resources and do not expand browser or storage trust boundaries.

## Architecture / dependency notes

- `pause-system`, `pause-input-system`, and `level-progress-system` are single-purpose systems.
- Map loading and visible pause overlays remain outside this Track C ownership scope.
- Runtime integration and UI behavior are not part of this PR.
- Restart intent production is optional/future integration and is not guaranteed by the current input resource contract.
- No dependency, lockfile, or package metadata changes were made.

## Risks

- Runtime bootstrap integration is deferred to the owning integration track after policy ownership is updated.
- Level-flow and level-loader systems were removed from this PR because current policy does not assign those filenames to Track C.
