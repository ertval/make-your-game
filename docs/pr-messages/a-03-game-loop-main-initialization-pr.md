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

## Why
- Ticket A-03 requires deterministic game-loop bootstrap, pause safety, lifecycle resync, and instrumentation hooks needed by audit checks.
- Local policy checks needed a prep helper to prevent metadata false starts.
- Branch naming needed a strict unambiguous format for policy and human triage.

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

## Audit questions affected
- AUDIT-F-02
- AUDIT-F-08
- AUDIT-F-10

## Security notes
- No unsafe HTML sinks added; error overlay uses textContent.
- No framework or canvas usage introduced.
- ECS simulation remains isolated from DOM APIs.

## Architecture / dependency notes
- Runtime orchestration is kept in src/main.ecs.js and src/game/* and does not add DOM side effects to ECS systems.
- Branch naming policy now requires <owner-or-scope>/<TRACK>-<NN>.
- policy:checks:local now guarantees metadata prep before checks.

## Risks
- Full gameplay integration with Track D map resource remains dependent on D-01/D-03 assets/contracts landing.
- Frame probe API is intentionally exposed on window for test instrumentation and should be considered test/runtime diagnostic surface.
