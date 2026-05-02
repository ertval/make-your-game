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
- [x] I ran `npm run policy` locally.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` — branch is `medvall/D-07`.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06. (Not affected by this change.)
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
- Added `src/ecs/systems/render-collect-system.js` — uses `world.query(RENDER_COLLECT_REQUIRED_MASK)` to query entities with Position + Renderable component bits, computes interpolated tile-space coordinates using the frame alpha, and writes one render intent per entity into the preallocated render-intent buffer (D-04). Runs in `phase: 'render'` via `World.runRenderCommit()`.
- Added `tests/unit/systems/render-collect-system.test.js` — unit tests covering interpolation math, deterministic ordering, buffer reset, classBits passthrough, opacity encoding, and the ECS membership contract (Position + Renderable required)
- Added `tests/integration/gameplay/d07-render-collect-scheduler.test.js` — integration tests proving the system registers in the real World scheduler, populates the intent buffer via `runRenderCommit`, runs before a downstream render system, and wires into `createBootstrap` via `systemsByPhase.render`

## Why
- D-07 is a P1 blocker required before D-08 (Render DOM Batcher) can be completed
- The collect system bridges the simulation layer and the DOM commit phase by translating ECS component state into a deterministic, allocation-free render-intent buffer each frame
- Interpolation using alpha provides sub-step visual smoothness without coupling simulation tick rate to frame rate

## Tests
- `npm run check` — passed (Biome lint + format)
- `npm run test:coverage` — 444 tests passed
- `npm run policy` — ALL CLEAR

## Audit questions affected
- No audit IDs are directly owned by D-07 in the traceability matrix. D-07 is infrastructure for D-08, which owns AUDIT-F-17, AUDIT-F-18, AUDIT-F-19, AUDIT-F-20, AUDIT-F-21, and AUDIT-B-03. Full F-01..F-21 and B-01..B-06 coverage remains mapped and intact — no audit rows added, removed, or modified.

## Security notes
- No DOM access — system is pure ECS logic operating only on typed arrays and the render-intent buffer
- No unsafe sinks, no eval, no framework imports, no canvas APIs
- File correctly placed in `src/ecs/systems/` — ECS boundary maintained

## Architecture / dependency notes
- System runs in `phase: 'render'` via `World.runRenderCommit()` — after all fixed-step simulation phases, before any DOM commit system registered later in the same render phase
- Entity selection driven by `world.query(RENDER_COLLECT_REQUIRED_MASK)` — only entities with both Position and Renderable component bits are collected
- Reads from `renderable`, `visualState`, and `position` resources; writes only to `renderIntentBuffer`
- Ascending entity ID order from query for stable, deterministic output every frame
- Invincible entities render at opacity 128 (half) so the player blinks without disappearing
- No wiring into the game loop bootstrap — that happens in D-08

## Risks
- The system is schedulable and bootstrap-wired via `systemsByPhase.render`. D-08 must register it before `render-dom-system` to maintain collect → commit ordering — this is documented in the system's file header and enforced by the scheduler integration test.
