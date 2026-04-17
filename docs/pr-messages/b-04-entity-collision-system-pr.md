# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run fix`, `npm run test`, `npm run policy`
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
 - [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
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
- Implemented `src/ecs/systems/collision-system.js` for B-04 using a deterministic cell-occupancy approach for player, ghost, bomb, and fire collisions.
- Added static pickup collection for pellets, power pellets, and map power-ups, clearing collected cells immediately and recording collision intents instead of mutating score/lives directly.
- Implemented the collision priority required by the ticket: invincibility over fire, and fire over ghost contact.
- Implemented fire vs player, fire vs ghost, normal ghost contact vs player, and harmless stunned-ghost contact handling.
- Enforced ghost-house occupancy rules: player blocked from `G`, ghosts allowed to exit, and only dead ghosts allowed to re-enter.
- Enforced bomb-cell rules, including path-around blocking and shared-cell bomb push-back when a bomb is dropped on a ghost's current tile.
- Added focused unit coverage in `tests/unit/systems/collision-system.test.js`.
- Added gameplay integration coverage in `tests/integration/gameplay/b-04-collision-system.test.js` to validate ECS phase ordering and mixed collision scenarios through `World.runFixedStep()`.

## Why
- B-04 owns the gameplay-correct overlap rules between player, ghosts, bombs, fire, pellets, and power-ups.
- The collision system needs deterministic ordering so later scoring, lives, audio, and event-surface tickets can consume stable intent output.
- Ghost-house and bomb-cell rules are part of the gameplay contract, not optional polish, so they need to live in simulation rather than being left to later runtime wiring.
- The integration tests lock the `physics -> logic` collision path so future movement or system-registration changes do not silently break gameplay behavior.

## Tests
- User-reported: all applicable tests were run locally and passed.
- Focused collision verification also passed for:
  - `npx vitest run tests/unit/systems/collision-system.test.js tests/integration/gameplay/b-04-collision-system.test.js`
  - `npm run test:unit`
  - `npm run test:integration`
  - `npx biome check src/ecs/systems/collision-system.js tests/unit/systems/collision-system.test.js tests/integration/gameplay/b-04-collision-system.test.js`

## Audit questions affected
- `AUDIT-F-13 | Execution type: Fully Automatable | Verification: collision permutations and gameplay interaction coverage in tests/unit/systems/collision-system.test.js and tests/integration/gameplay/b-04-collision-system.test.js | Evidence path/link: tests/unit/systems/collision-system.test.js, tests/integration/gameplay/b-04-collision-system.test.js`

## Security notes
- No unsafe DOM sinks, inline event handlers, framework imports, canvas APIs, or dynamic code execution were introduced.
- The change stays inside ECS simulation and test code, so it does not expand the browser trust boundary.
- Collision results are recorded as intents in plain data structures rather than dispatched through DOM or adapter side effects.

## Architecture / dependency notes
- `src/ecs/systems/collision-system.js` remains a simulation system with no DOM access and no direct adapter imports.
- The system reads and writes only World resources and ECS component stores.
- Score/life authority is intentionally left to later consumers of collision intents, which keeps B-04 within its ownership boundary.
- Runtime registration of the collision system and downstream intent consumers are still owned by other tickets/tracks.
- `docs/implementation/ticket-tracker.md` still lists `A-11` as a blocker for `B-04`; if your team has explicitly approved proceeding anyway, reviewers should note that exception in PR discussion.

## Risks
- Runtime wiring is still pending outside this ticket, so this PR completes the collision system itself but not full in-game registration.
- `ghostStore.state` is updated to `DEAD` immediately on fire kill to prevent repeated death intents; if B-08 later centralizes ghost state transitions, that contract may need to be revisited.
- Ghost-house entry is currently enforced as "dead ghosts only" based on the existing map geometry; if future maps expose additional ghost-house perimeter shapes, the rule may need to become a more explicit gate model.
