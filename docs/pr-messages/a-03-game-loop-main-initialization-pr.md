# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>` (for example `ekaramet/A-03`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed the audit IDs affected by this change.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmation

- [x] src/ecs/systems/ has no DOM references except render-dom-system.js
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] src/adapters/ owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (textContent / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Implemented rAF-driven ECS runtime bootstrap in src/main.ecs.js.
- Added game assembly and fixed-step frame driver in src/game/bootstrap.js.
- Added FSM game flow driver in src/game/game-flow.js.
- Added level-load orchestration stub and integration point in src/game/level-loader.js.
- Added global unhandledrejection handler and visible critical error overlay behavior.
- Added Playwright frame probe and runtime hooks for semi-automated frame metrics.
- Added integration coverage for pause invariants in tests/integration/gameplay/a03-game-loop.test.js.
- Added browser-level pause/rAF behavior check in tests/e2e/game-loop.pause.spec.js.
- Added policy helper command policy:checks:local and strict branch format enforcement updates.
- Resolved inconsistencies across all documentation by mandating `pre-gate commits` with ticket IDs before local tests.
- Re-labeled PR message and audit report archiving from 'optional' to 'mandatory' across the documentation to ensure durable audit trails.
- Appended missing descriptive header blocks to every file within `scripts/policy-gate/`, enforcing `AGENTS.md` code-quality compliance.
- Generated `scripts/policy-gate/README.md` to explicitly document the gate process boundaries and script operations.
- Fixed LEVEL_COMPLETE progression in `src/game/game-flow.js` so `startGame()` advances to and loads the next level before transitioning back to PLAYING.
- Extended lifecycle recovery in `src/main.ecs.js` to resync timing baseline on both `blur` and `focus` events, in addition to existing visibility restore handling.
- Expanded integration coverage in `tests/integration/gameplay/a03-game-loop.test.js` for next-level loading orchestration, catch-up clamping verification, and blur/focus/visibility resync behavior.
- Added runtime critical-error integration tests in `tests/integration/gameplay/a03-runtime-error-handling.test.js` for unhandled rejection overlay rendering and single-handler installation semantics.
- Added dedicated game-flow unit coverage in `tests/unit/game/game-flow.test.js` for LEVEL_COMPLETE advance, MENU load, and pause-menu restart semantics.
- Added browser-level unhandled rejection overlay check in `tests/e2e/game-loop.unhandled-rejection.spec.js`.
- Resolved policy gate blockers by formatting `scripts/policy-gate/check-forbidden.mjs` and `scripts/policy-gate/check-source-headers.mjs` and improving comment-ratio compliance in `scripts/policy-gate/lib/policy-utils.mjs` and `scripts/policy-gate/run-checks.mjs`.
- Re-ran full PR audit verification flow and generated updated GREEN evidence in `docs/audit-reports/pr-audit-ekaramet-A-03.md`.

## Why
- Ticket A-03 requires deterministic game-loop bootstrap, pause safety, lifecycle resync, and instrumentation hooks needed by audit checks.
- Local policy checks needed a prep helper to prevent metadata false starts.
- Branch naming needed a strict unambiguous format for policy and human triage.
- Workflow updates were necessary to ensure that local `npm run policy` properly triggers with accurate branch/commit contexts.
- Extraneous `.mjs` files failed the `AGENTS.md` comment criteria for required block comments defining file purpose.
- LEVEL completion needed to orchestrate the next-level loader contract rather than only toggling game state.
- Lifecycle timing recovery needed blur/focus baseline resync to prevent stale deltas and post-focus catch-up bursts.
- A-03 test coverage needed direct assertions for next-level load flow, lifecycle resync, catch-up clamping, and critical error overlay behavior.
- Policy/audit gates needed remediation to restore fully green merge-readiness evidence.

## Tests
- npm ci
- npm run sbom
- npm run check
- npm run test
- npm run test:integration
- npm run test:e2e
- npm run test:audit
- npm run policy:quality
- npm run policy
- npm run ci
- npm run policy:checks:local
- npm run build
- npm run test:unit -- tests/unit/game/game-flow.test.js
- npm run test:integration -- tests/integration/gameplay/a03-game-loop.test.js tests/integration/gameplay/a03-runtime-error-handling.test.js
- npm run test:e2e -- tests/e2e/game-loop.pause.spec.js tests/e2e/game-loop.unhandled-rejection.spec.js
- npm run policy:header
- npm run policy:headerrepo
- npm run policy:prep && npm run policy:checks
- npm run policy -- --require-approval=false
- Full PR audit command matrix executed via `.github/prompts/pr-audit-verification.prompt.md` with final GREEN verdict (see `docs/audit-reports/pr-audit-ekaramet-A-03.md`).

## Audit questions affected
- AUDIT-F-02
- AUDIT-F-08
- AUDIT-F-10
- AUDIT-F-09
- AUDIT-F-17
- AUDIT-F-18

## Security notes
- No unsafe HTML sinks added; error overlay uses textContent.
- No framework or canvas usage introduced.
- ECS simulation remains isolated from DOM APIs.

## Architecture / dependency notes
- Runtime orchestration is kept in src/main.ecs.js and src/game/* and does not add DOM side effects to ECS systems.
- Branch naming policy now requires <owner-or-scope>/<TRACK>-<NN>.
- policy:checks:local now guarantees metadata prep before checks.
- LEVEL_COMPLETE progression now consumes `levelLoader.advanceLevel()` from game-flow without violating ECS/adapter boundaries.
- Runtime lifecycle handling now explicitly covers blur/focus/visibility resync points to keep fixed-step baseline deterministic after focus transitions.

## Risks
- Full gameplay integration with Track D map resource remains dependent on D-01/D-03 assets/contracts landing.
- Frame probe API is intentionally exposed on window for test instrumentation and should be considered test/runtime diagnostic surface.
- Additional e2e coverage for unhandled rejection relies on browser event timing and should remain monitored for runner-level flakiness.
