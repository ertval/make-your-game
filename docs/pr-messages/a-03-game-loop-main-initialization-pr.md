# A-03 — Game Loop & Main Initialization PR Message

## What changed
- Implemented rAF-driven ECS runtime bootstrap in src/main.ecs.js.
- Added game assembly and fixed-step frame driver in src/game/bootstrap.js.
- Added FSM game flow driver in src/game/game-flow.js.
- Added level-load orchestration stub/integration point in src/game/level-loader.js.
- Added global unhandledrejection handler and visible critical error overlay behavior.
- Added Playwright frame probe/runtime hooks for semi-automated frame metrics.
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
- AUDIT-F-17
- AUDIT-F-18
- AUDIT-B-01

## Security notes
- No unsafe HTML sinks added; error overlay uses textContent.
- No framework or canvas usage introduced.
- ECS simulation remains isolated from DOM APIs.

## Architecture / dependency notes
- Runtime orchestration is kept in src/main.ecs.js + src/game/* and does not add DOM side effects to ECS systems.
- Branch naming policy now requires <owner-or-scope>/<TRACK>-<NN>.
- policy:checks:local now guarantees metadata prep before checks.

## Risks
- Full gameplay integration with Track D map resource remains dependent on D-01/D-03 assets/contracts landing.
- Frame probe API is intentionally exposed on window for test instrumentation and should be considered test/runtime diagnostic surface.
