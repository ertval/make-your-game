# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran the applicable local checks
- [x] I listed the audit IDs affected by this change
- [x] I checked security sinks and trust boundaries
- [x] I checked architecture boundaries
- [x] I checked dependency and lockfile impact
- [x] I ran `npm run pr:gate -- --pr-body-file <path-to-pr-message>`
- [x] I requested human review

## What changed
- Added ECS core world primitives for A-02:
  - `src/ecs/world/entity-store.js`
  - `src/ecs/world/query.js`
  - `src/ecs/world/world.js`
- Added unit tests for ID recycling, stale-handle safety, query matching, deferred structural mutation sync, deterministic system order, and system error isolation.
- Updated ticket tracker status for A-02 execution.

## Why
- Establishes deterministic ECS world behavior and test-backed contracts required before gameplay systems and resources can be implemented.

## Tests
- `npm run check`
- `npm run test:unit`
- `npm run pr:gate -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md`

## Audit questions affected
- AUDIT-B-03

## Security notes
- No DOM APIs were introduced in simulation core.
- System-dispatch error boundary prevents loop-crash amplification from individual system exceptions.

## Architecture / dependency notes
- World phase order is explicit and deterministic (`input -> physics -> logic -> render`).
- Structural mutations are deferred and applied in one sync point after system dispatch.

## Risks
- This ticket provides ECS primitives only; fixed-step accumulator timing and lifecycle controls remain for A-03.
