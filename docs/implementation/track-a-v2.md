# ⚙️ Track A v2 — Architecture Assembly, Testing, QA, CI & Deployment (Dev 1)

📎 Source plan: `docs/implementation/tickets_v2.md`

> **Scope**: Project scaffolding, ECS world assembly contracts, CI governance, and **ALL testing ownership** (unit, integration, e2e/audit), plus final QA evidence and deployment readiness. This track deliberately avoids owning feature-heavy gameplay implementations.
> **Estimate**: Target ~35 hours (reality-informed ~76 hours)
> **Execution model**: Build stable platform first, then centralize verification for all gameplay work from Tracks B, C, and D.

## Phase Order (v2)

- **P0 Foundation**: `A2-01` to `A2-03`
- **P1 Platform Quality**: `A2-04` to `A2-05`
- **P2 Validation Depth**: `A2-06` to `A2-07`
- **P3 Final Acceptance**: `A2-08` to `A2-09`

#### A2-01: Scaffolding & Toolchain Setup
**Priority**: 🔴 Critical
**Estimate**: 6h target (10h reality-informed)
**Phase**: P0 Foundation
**Depends On**: None
**Impacts**: Repo bootstrapping, lint/test automation baseline, policy gate foundation
**Deliverables**: `package.json`, `vite.config.js`, `biome.json`, `vitest.config.js`, `playwright.config.js`, `.gitea/workflows/ci-v2.yml`

- [ ] Initialize scripts and package workflow baseline.
- [ ] Configure Vite, Biome, Vitest, and Playwright.
- [ ] Create CI entry workflow skeleton and local parity scripts.
- [ ] Verification gate: local lint/test commands execute successfully on scaffold.

#### A2-02: ECS World Engine Core
**Priority**: 🔴 Critical
**Estimate**: 8h target (14h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `A2-01`
**Impacts**: Deterministic ECS orchestration backbone and query/mutation contracts
**Deliverables**: `src/ecs/world/world.js`, `src/ecs/world/entity-store.js`, `src/ecs/world/query.js`

- [ ] Implement world scheduler registration with explicit, stable system order.
- [ ] Implement entity recycling and stale-handle protection semantics.
- [ ] Implement bitmask query layer and deferred structural mutation sync boundary.
- [ ] Verification gate: deterministic order and stale-handle tests pass.

#### A2-03: Engine Assembly & Contract Governance
**Priority**: 🔴 Critical
**Estimate**: 2h target (4h reality-informed)
**Phase**: P0 Foundation
**Depends On**: `B2-00`, `C2-00`, `D2-00`
**Impacts**: Cross-track engine integration handshake and deterministic startup order
**Deliverables**: `src/game/bootstrap.js`, `src/game/system-order.js`, `src/game/engine-contracts.js`

- [ ] Freeze core integration contracts joining runtime slices from B/C/D.
- [ ] Lock bootstrap order and lifecycle constraints for deterministic startup.
- [ ] Verification gate: core contract gate (`G0`) signed by all track owners.

#### A2-04: CI Governance, Security & Schema Gates
**Priority**: 🔴 Critical
**Estimate**: 4h target (8h reality-informed)
**Phase**: P1 Platform Quality
**Depends On**: `A2-01`
**Impacts**: Merge safety, policy compliance, schema validation gatekeeping
**Deliverables**: `.gitea/workflows/policy-gates-v2.yml`, `scripts/ci/check-banned-apis.mjs`, `scripts/ci/validate-schemas.mjs`, `scripts/ci/generate-sbom.mjs`

- [ ] Add lockfile and SBOM governance checks.
- [ ] Wire schema validation for map and asset manifests.
- [ ] Enforce static no-canvas and no-framework checks.
- [ ] Verification gate: CI fails on intentional policy violations.

#### A2-05: Test Harness & Determinism Utilities
**Priority**: 🔴 Critical
**Estimate**: 3h target (6h reality-informed)
**Phase**: P1 Platform Quality
**Depends On**: `A2-03`
**Impacts**: Repeatable regression testing and deterministic replay verification
**Deliverables**: `tests/helpers/replay-harness.js`, `tests/helpers/hash-world-state.js`, `tests/helpers/world-fixtures.js`

- [ ] Build replay harness for seed + input trace.
- [ ] Build world-state hashing utility for deterministic comparisons.
- [ ] Build shared fixtures for cross-track integration tests.
- [ ] Verification gate: replay and hash utilities reproduce identical states for seeded runs.

#### A2-06: Unit Test Suite (Core + Gameplay)
**Priority**: 🔴 Critical
**Estimate**: 4h target (12h reality-informed)
**Phase**: P2 Validation Depth
**Depends On**: `B2-06`, `C2-04`, `D2-06`
**Impacts**: System-level correctness guarantees across all implementation tracks
**Deliverables**: `tests/unit/world/entity-store.test.js`, `tests/unit/world/query.test.js`, `tests/unit/world/world.test.js`, `tests/unit/resources/clock.test.js`, `tests/unit/resources/rng.test.js`, `tests/unit/resources/event-queue.test.js`, `tests/unit/systems/player-move-system.test.js`, `tests/unit/systems/collision-system.test.js`, `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js`, `tests/unit/systems/power-up-system.test.js`, `tests/unit/systems/ghost-ai-system.test.js`, `tests/unit/systems/scoring-system.test.js`, `tests/unit/systems/timer-system.test.js`, `tests/unit/systems/life-system.test.js`, `tests/unit/systems/pause-system.test.js`, `tests/unit/systems/level-progress-system.test.js`, `tests/unit/systems/map-state-system.test.js`

- [ ] Implement unit tests for world/resources and all gameplay systems.
- [ ] Validate deterministic behavior for timing-sensitive and RNG-dependent logic.
- [ ] Keep coverage aligned with audit-critical behavior.
- [ ] Verification gate: unit test matrix green for all gameplay systems.

#### A2-07: Integration & Adapter Boundary Tests
**Priority**: 🟡 High
**Estimate**: 3h target (10h reality-informed)
**Phase**: P2 Validation Depth
**Depends On**: `B2-06`, `C2-06`, `D2-05`
**Impacts**: Cross-system correctness, adapter boundary safety, regression containment
**Deliverables**: `tests/integration/gameplay/core-loop.integration.test.js`, `tests/integration/gameplay/bomb-chain.integration.test.js`, `tests/integration/gameplay/pause-invariants.integration.test.js`, `tests/integration/adapters/input-adapter.integration.test.js`, `tests/integration/adapters/renderer-adapter.integration.test.js`, `tests/integration/adapters/hud-adapter.integration.test.js`, `tests/integration/adapters/screens-adapter.integration.test.js`, `tests/integration/adapters/audio-adapter.integration.test.js`, `tests/integration/adapters/storage-adapter.integration.test.js`

- [ ] Implement gameplay pipeline integration tests.
- [ ] Implement adapter-boundary tests for input, renderer, HUD, screens, audio, and storage.
- [ ] Validate pause invariants and deterministic replay integration behavior.
- [ ] Verification gate: integration matrix green and deterministic replay checks stable.

#### A2-08: E2E Audit Automation
**Priority**: 🔴 Critical
**Estimate**: 3h target (8h reality-informed)
**Phase**: P3 Final Acceptance
**Depends On**: `A2-07`
**Impacts**: Automated acceptance proof for functional and semi-automatable audit checks
**Deliverables**: `tests/e2e/audit/run-audit-assertion.js`, `tests/e2e/audit/audit.e2e.test.js`, `tests/e2e/audit/audit-question-map.js`

- [ ] Implement executable checks for fully automatable audit questions.
- [ ] Implement semi-automatable performance checks for frame stability and FPS.
- [ ] Keep audit question inventory synchronized with executable assertions.
- [ ] Verification gate: audit automation run completes with passing assertions.

#### A2-09: QA Evidence, Final Sign-off & Deployment
**Priority**: 🟡 High
**Estimate**: 2h target (4h reality-informed)
**Phase**: P3 Final Acceptance
**Depends On**: `A2-08`, `C2-06`, `D2-06`
**Impacts**: Final release readiness, manual evidence completion, deployment handoff
**Deliverables**: `docs/implementation/evidence-v2.md`, `docs/deployment/release-checklist-v2.md`, `.gitea/workflows/deploy-v2.yml`

- [ ] Produce final evidence bundle for manual audit categories.
- [ ] Validate complete 3-level gameplay pass and final regression sweep.
- [ ] Execute release checklist and deployment handoff.
- [ ] Verification gate: release checklist and evidence package approved.

---
