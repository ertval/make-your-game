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
- Implemented `src/ecs/systems/spawn-system.js` as the C-03 ghost spawn timing authority using a dedicated `ghostSpawnState` world resource.
- Added deterministic staggered release timing at `0s`, `5s`, `10s`, and `15s`, with FIFO queueing for eligible ghosts and active-cap enforcement from `mapResource.maxGhosts`.
- Added dead-ghost respawn scheduling with `5000ms` delay handling through `respawnQueue`, with respawned ghosts re-entering the same deterministic queue while still respecting the active cap.
- Added focused unit coverage in `tests/unit/systems/spawn-system.test.js` for stagger timing, cap behavior, FIFO ordering, respawn scheduling, and duplicate protection.
- Updated Track C implementation docs and audit traceability text so C-03 is marked complete and mapped to its implementation and verification artifacts.

## Why
- C-03 owns deterministic ghost release timing and dead-return respawn scheduling at the ECS system layer, and that logic needs to exist independently of ghost AI, UI, audio, and bootstrap wiring.
- The implemented design keeps spawn progression in a single world resource so later tickets can consume stable queue state without coupling to entity mutation details prematurely.
- Audit and PR completeness required explicit documentation and traceability for the implemented system behavior, not just the code change itself.

## Tests
- `npx vitest run tests/unit/systems/spawn-system.test.js`

## Audit questions affected
- `AUDIT-F-13 | Execution type: Fully Automatable | Verification: deterministic ghost stagger timing, FIFO ordering, cap enforcement, and respawn delay coverage in tests/unit/systems/spawn-system.test.js | Evidence path/link: tests/unit/systems/spawn-system.test.js`

## Security notes
- No unsafe DOM sinks, inline handlers, dynamic code execution, framework imports, or canvas/WebGL/WebGPU APIs were introduced.
- `spawn-system.js` remains pure ECS logic over world resources and does not expand the browser or storage trust boundary.
- The documentation updates are confined to `docs/` and do not affect runtime behavior.

## Architecture / dependency notes
- The spawn system is resource-driven and currently updates `ghostSpawnState` only; it does not mutate ghost entities directly yet.
- Deterministic ghost ordering comes from a `ghostIds` resource when available and otherwise falls back to `[0..POOL_GHOSTS-1]`.
- Active ghost cap enforcement is sourced from `mapResource.maxGhosts`, keeping the runtime aligned with D-03 map metadata rather than hard-coded per-level branching.
- No dependency, lockfile, or package metadata changes were made.

## Risks
- Runtime bootstrap integration is still deferred, so this PR should be reviewed as system-logic-complete rather than fully wired gameplay-complete.
- Later tickets that consume spawn state must preserve the current deterministic queue semantics and avoid reintroducing direct entity-order dependence.
