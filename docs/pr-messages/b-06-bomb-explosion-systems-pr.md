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

- Added the B-06 bomb tick system for fixed-step bomb placement, max-bomb enforcement, one-bomb-per-cell checks, map-bounded radius validation, fuse countdown, and detonation queue payloads.
- Added the B-06 explosion system for cross-pattern fire geometry, wall-stop behavior, destructible wall clearing, deterministic power-up drops, pellet immunity, power-up destruction, fire lifetime cleanup, and iterative chain reactions.
- Added bomb/fire chain metadata support through prop stores, `BombDetonated` gameplay events, and fire-caused ghost-death collision intents.
- Hardened explosion behavior by deriving drop thresholds from `POWER_UP_DROP_CHANCES`, reusing detonation scratch state, and covering edge/pool exhaustion cases.
- Added a Track A handoff for runtime bootstrap wiring, because `src/game/bootstrap.js` ownership is outside B-06/Track B.

## Why

- B-06 requires deterministic Bomberman-style bomb and explosion simulation in pure ECS systems.
- Chain metadata is needed so later scoring/event work can calculate combo behavior without moving scoring authority into B-06.
- Runtime wiring is intentionally documented as a Track A handoff to keep this PR inside Track B ownership.

## Tests

- `npm run check` - passed.
- `npm run test:unit` - passed.
- `npm run test:integration` - passed.
- `npm run build` - passed.
- `npx vitest run tests/unit/systems/bomb-tick-system.test.js` - passed.
- `npx vitest run tests/unit/systems/explosion-system.test.js tests/unit/systems/bomb-tick-system.test.js tests/unit/resources/constants.test.js` - passed.
- `npx vitest run tests/unit/systems/collision-system.test.js` - passed.
- `npx vitest run tests/integration/gameplay/b-04-collision-system.test.js` - passed.
- Earlier B-06 validation: `npm run test:e2e` and `npm run test:audit:e2e` passed after rerunning with required local server permissions.
- Not run: full `npm run policy`. A prior policy-quality path hit local sandbox server binding limits; the relevant e2e/audit slices above were rerun successfully.

## Audit questions affected

- AUDIT-F-01 | Execution type: Fully Automatable | Verification: B-06 systems are unit-tested and build/check/integration suites pass | Evidence path/link: `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js`
- AUDIT-F-06 | Execution type: Fully Automatable | Verification: Bomb/explosion mechanics support the documented Pac-Man plus Bomberman genre behavior | Evidence path/link: `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js`
- AUDIT-F-13 | Execution type: Fully Automatable | Verification: Bomb placement, explosion geometry, wall stops, chain reactions, and power-up interactions are covered at system level | Evidence path/link: `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js`
- AUDIT-B-03 | Execution type: Fully Automatable | Verification: Bomb/fire use preallocated entity pools and explosion chain processing reuses scratch state | Evidence path/link: `tests/unit/systems/explosion-system.test.js`, `src/ecs/systems/explosion-system.js`
- AUDIT-B-06 | Execution type: Manual-With-Evidence | Verification: This PR contributes to overall implementation quality; final manual evidence remains project-level and outside this B-06-only PR | Evidence path/link: `docs/handoffs/track-a-b6-runtime-wiring-handoff.md`

## Security notes

- No DOM, browser API, network, storage, or HTML sink changes were introduced.
- New systems are pure ECS simulation modules and access state through world resources.
- Seeded RNG is used for destructible-wall drops; no `Math.random()` path was introduced.

## Architecture / dependency notes

- No dependencies or lockfiles were changed.
- B-06 stays in Track B ECS simulation scope.
- `src/game/bootstrap.js` runtime wiring is intentionally deferred to Track A and documented in `docs/handoffs/track-a-b6-runtime-wiring-handoff.md`.
- Scoring authority remains out of B-06; B-06 only emits/stores metadata for later scoring/event systems.

## Risks

- Browser runtime will not exercise bombs until Track A wires B-06 resources, pooled entities, and logic systems into `src/game/bootstrap.js`.
- Fire pool sizing for upgraded radii is Track D-owned and documented as a required follow-up in `docs/handoffs/track-a-b6-runtime-wiring-handoff.md`.
- Full `npm run policy` still needs a local environment where the policy server checks can bind successfully.
