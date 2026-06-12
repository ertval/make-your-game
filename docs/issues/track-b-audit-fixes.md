# Track B — Audit Fixes: Input & Component Wiring

Summary

This issue captures the Track B–owned fixes called out in the Phase-0 audit (deduplicated). It focuses on ensuring input adapter injection and component store wiring into the runtime world so systems can run deterministically.

Reference: [docs/audit-reports/phase-0/audit-report-p0-track-b-deduplicated-2026-04-14.md](docs/audit-reports/phase-0/audit-report-p0-track-b-deduplicated-2026-04-14.md)

Affected items (from audit)

- **ARCH-03**: Input adapter resource injection contract is not satisfied.
- **ARCH-X01**: Component stores are not wired into world/runtime bootstrap path.
- **DEAD-04**: ECS scaffolding modules are production-dead (test-only references).
- **ARCH-12**: Adapter contract leaks via fallback field probing.

Goals

- Register and inject `inputAdapter` as a `World` resource at bootstrap.
- Instantiate and register component stores in the world resource registry.
- Either integrate or explicitly mark test-only scaffolding modules.
- Harden the adapter registration API to validate interface methods (no field probing).

Tasks

- [ ] Wire `inputAdapter` into bootstrap and teardown on stop.
  - Files to check: [src/game/bootstrap.js](src/game/bootstrap.js), [src/ecs/systems/input-system.js](src/ecs/systems/input-system.js), [src/main.ecs.js](src/main.ecs.js)
- [ ] Instantiate and register component stores in bootstrap/world resource graph.
  - Files to check: [src/ecs/components/spatial.js](src/ecs/components/spatial.js), [src/ecs/components/props.js](src/ecs/components/props.js), [src/ecs/components/stats.js](src/ecs/components/stats.js), [src/ecs/world/world.js](src/ecs/world/world.js)
- [ ] Audit exported component modules; mark test-only scaffolding or wire into runtime.
- [ ] Add runtime validation at adapter registration time (assert required methods exist).
- [ ] Add/adjust unit tests that verify input system runs with a registered adapter.
- [ ] Update docs/comments to explain resource registration contract.

Acceptance criteria

- `inputAdapter` is registered during bootstrap and accessible via `world.getResource('inputAdapter')`.
- Component stores are created and registered in the world before systems run.
- No systems rely on probing adapter internals; adapters present explicit required methods.
- Relevant unit tests pass and Biome checks (lint/format) succeed for changed files.

Labels

- `area/ecs`, `track/B`, `severity/critical`

Suggested assignee

- `@track-b-team` (replace with person/team handle)

Estimated effort

- 1–2 days depending on test updates

Notes

Follow the ECS rules in AGENTS.md: components must be data-only, systems must not access DOM, and adapters must be injected via world resources.
