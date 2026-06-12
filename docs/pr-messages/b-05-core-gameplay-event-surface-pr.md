# B-05: Core Gameplay Event Surface

## Summary
- Adds the canonical Track B gameplay event surface on top of the D-01 `eventQueue`.
- Wires collision events for pellet, power pellet, power-up, and lethal player/ghost contact resolutions.
- Wires movement to emit semantic player tile-change events without per-tick event churn.
- Documents the payload schema and adds regression coverage for validation, ordering, and repeated-run determinism.

## What changed
- Runtime: `src/ecs/systems/collision-gameplay-events.js`, `src/ecs/systems/collision-system.js`, `src/ecs/systems/player-move-system.js`
- Tests: `tests/unit/systems/player-move-system.test.js`, `tests/unit/systems/collision-system.test.js`, `tests/integration/gameplay/b-05-gameplay-event-surface.test.js`
- Docs: `docs/implementation/gameplay-event-surface.md`, `.agents/scratch/PLAN-B-05.md`, `docs/audit-reports/pr-audit/pr-audit-b-05-core-gameplay-event-surface.md`, `docs/implementation/ticket-tracker.md`

## Why
- B-05 requires deterministic base event emission from movement and collision systems so scoring, audio, visual, and later gameplay hooks can consume a stable event stream.

## Tests / Checks run
- `npm run test:unit`
- `npm run test:integration`
- `npm run check`
- `node scripts/policy-gate/run-checks.mjs --check-set=pr --require-branch-ticket=true --changed-file=/tmp/b05-changed-files.txt`

## Security / Architecture
- No new dependencies.
- No DOM, audio, storage, canvas, or adapter imports in simulation systems.
- Systems access `eventQueue` only through the World resource API.
- No Track A bootstrap or Track D event-queue resource changes are included.
- Event payload validation rejects malformed cross-system data before enqueue.

## Risks
- Low to medium. Existing `collisionIntents` remain for current consumers, but future systems should migrate to the canonical queued events.

## Checklist
- [x] AGENTS.md constraints reviewed.
- [x] B-05 event schemas documented.
- [x] Unit and integration tests added.
- [x] Biome check passed.
- [x] ECS DOM isolation preserved.
