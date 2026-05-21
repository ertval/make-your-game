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
- [x] I ran `npm run policy:checks` locally.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (this branch: `asmyrogl/B-07`).
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [ ] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06. (Not affected by B-07.)
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

- Added the B-07 power-up system (`src/ecs/systems/power-up-system.js`) as a logic-phase ECS system that consumes B-04 collision intents and applies the four canonical power-up effects against the existing B-01 player and ghost component stores.
- **Power Pellet (`⚡`)**: stuns every NORMAL ghost for `STUN_MS = 5000ms` and refreshes already-stunned ghosts non-stackingly. DEAD ghosts mid-respawn are intentionally excluded.
- **Bomb Power-Up (`💣+`)**: increments `playerStore.maxBombs` by 1 (clamped against `Uint8Array` wraparound).
- **Fire Power-Up (`🔥+`)**: increments `playerStore.fireRadius` by 1 (same clamp).
- **Speed Boost (`👟`)**: sets `playerStore.speedBoostMs = SPEED_BOOST_MS (10000ms)` and `isSpeedBoosted = 1`, with non-stacking reset on re-collection.
- Added a `powerUpState` world resource exposing `stunRemainingMs`, `speedBoostRemainingMs`, and a `lastProcessedFrame` duplicate-frame guard. The system owns parallel countdown timers for both stun (per ghost) and speed boost (per player) and decrements them with the fixed-step delta only while gameplay is PLAYING.
- The duplicate-frame guard sits above timer ticks so a second `update()` call in the same fixed frame is a true no-op for both intents and timers.
- Added unit tests in `tests/unit/systems/power-up-system.test.js` covering all four effects, exact canonical durations, non-stacking semantics, timer expiry, PAUSED gating, DEAD-ghost exclusion, the spike-delta clamp, the duplicate-frame guard, and the no-eligible-ghost case.

## Why

- B-07 verification gate requires deterministic application of the four canonical power-up effects from `docs/game-description.md` §4.4 and §3.2 against canonical durations defined in `src/ecs/resources/constants.js`.
- Owning the stun and speed-boost countdown timers in a single system keeps the parallel timer rules deterministic and unit-testable, with no cross-system coupling beyond the existing `collisionIntents` buffer and player/ghost component stores.
- Effects are applied through component stores so future Track B/C wiring (ghost AI state machine, HUD speed-boost trail) reads the same canonical fields without re-deriving timing rules.

## Tests

- `npm run check` — passed.
- `npm run test:unit` — passed (687/687).
- `npm run test:integration` — passed (179/179).
- `npm run policy:checks` — passed.
- `npx vitest run tests/unit/systems/power-up-system.test.js` — passed (16/16).

## Audit questions affected

- AUDIT-F-13 | Execution type: Fully Automatable | Verification: B-07 power-up effects, exact durations, and parallel countdown timers are covered at system level (`game-description.md` §4.4, §3.2, §5.3) | Evidence path/link: `tests/unit/systems/power-up-system.test.js`, `src/ecs/systems/power-up-system.js`

## Security notes

- No DOM, browser API, network, storage, or HTML sink changes were introduced.
- The new system is a pure ECS simulation module that accesses state only through world resources.
- No `Date.now()` or `Math.random()` is used; all timing is driven by the injected fixed-step delta.

## Architecture / dependency notes

- No dependencies or lockfiles were changed.
- B-07 stays in Track B ECS simulation scope.
- Stun-window writes only mutate `ghostStore.state` / `ghostStore.timerMs`. The DEAD respawn lifecycle remains owned by other systems and is intentionally not overwritten on stun expiry.
- Scoring authority (Power Pellet `+50`, Power-Up `+100`, stunned-ghost-kill `+400`) stays in C-01 / `scoring-system.js`; B-07 only applies the effects.
- Runtime registration of `power-up-system` inside `src/game/bootstrap.js` is intentionally deferred — that file is bootstrap-track-owned. This PR ships the system + tests; bootstrap wiring will land via the standard cross-track handoff process.

## Risks

- Browser runtime will not exercise B-07 effects end-to-end until the system is registered in `src/game/bootstrap.js` (Track A / bootstrap follow-up).
- Ghost stun visuals (blue color, slow flee speed) and speed-boost trail/tint indicator depend on Track D visual wiring downstream — this PR ships only the simulation contract, not the visual surface.
