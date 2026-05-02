# Audit Traceability Matrix

This document is the single source of truth for requirement-to-audit-to-ticket-to-test coverage.

## Purpose

1. Prevent requirement drift between requirements, implementation tickets, and tests.
2. Keep one canonical mapping for coverage status.
3. Track whether mapped coverage is executable and passing.

## Scope And Ownership

1. Requirement and audit coverage mapping lives only in this file.
2. The implementation plan defines ticket details and verification gates, then references this file for consolidated coverage mapping.
3. Ticket execution progress (owner/status/Depends on/Blocks mappings) is tracked in `docs/implementation/ticket-tracker.md`.
4. Test ownership remains in `tests/e2e/audit/` and must stay synchronized with this file.
5. Automated policy checks should read requirement coverage from this matrix, not from `docs/requirements.md` IDs.

## Status Legend

- `Mapped`: The row has an explicit mapping.
- `Planned`: Ticket ownership and a verification path are defined.
- `Executable`: Real assertions/evidence are implemented and passing.
- `Pending`: Not yet executable or not yet validated by passing artifacts.

## Current Automation Reality

- `tests/e2e/audit/audit-question-map.js` includes all 27 audit IDs plus execution metadata, threshold definitions, and manual-evidence manifest linkage.
- `tests/e2e/audit/audit.e2e.test.js` enforces executable non-browser obligations: inventory/category parity, threshold declaration checks, and manual evidence manifest/artifact existence.
- `tests/e2e/audit/audit.browser.spec.js` executes browser runtime/performance assertions, including explicit thresholds for `AUDIT-F-17`, `AUDIT-F-18`, and `AUDIT-B-05`.
- Manual evidence obligations for `AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`, and `AUDIT-B-06` are tracked through `docs/audit-reports/manual-evidence.manifest.json`.

## Alignment Verification Summary

1. REQ-01 through REQ-16 are mapped to owning tickets and audit IDs below.
2. AUDIT-F-01 through AUDIT-F-21 and AUDIT-B-01 through AUDIT-B-06 are mapped to ticket anchors and test/evidence anchors below.
3. Audit verification follows `AGENTS.md` categories: Fully Automatable, Semi-Automatable, and Manual-With-Evidence.

## Requirement Coverage Matrix (Canonical)

| Requirement ID | Requirement Summary | Owning Tickets (`docs/implementation/track-*.md`) | Covered By Audit IDs | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|
| REQ-01 | Run at least 60 FPS and avoid frame drops | A-03, A-06, D-08, A-09 | AUDIT-F-17, AUDIT-F-18, AUDIT-B-01 | `tests/e2e/audit/audit.e2e.test.js` + performance evidence artifacts | Mapped, Planned, Pending |
| REQ-02 | Use `requestAnimationFrame` correctly | A-03, A-06 | AUDIT-F-02, AUDIT-F-10 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-03 | Pause menu contains Continue and Restart | C-04, C-05, A-06 | AUDIT-F-07, AUDIT-F-08, AUDIT-F-09 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-04 | HUD shows countdown/timer | C-02, C-05, A-06 | AUDIT-F-14 | `tests/unit/systems/timer-system.test.js` | Mapped, Covered, Executable (system logic only — HUD coverage pending C-05) |
| REQ-05 | HUD shows score and score increments | C-01, C-05, A-06 | AUDIT-F-15 | `tests/e2e/audit/audit.e2e.test.js` + `tests/unit/systems/scoring-system.test.js` | Mapped, Planned, Pending (`C-01` covers deterministic scoring logic at the system-test level; HUD-visible runtime increments remain deferred to `C-05` / `A-06`) |
| REQ-06 | HUD shows lives and lives decrement | C-02, C-05, A-06 | AUDIT-F-16 | `tests/unit/systems/life-system.test.js` | Mapped, Covered, Executable (system logic only — HUD coverage pending C-05) |
| REQ-07 | Keyboard-only control path | B-02, C-05, A-06 | AUDIT-F-11, AUDIT-F-12 | `tests/e2e/audit/audit.e2e.test.js` + adapter focus tests | Mapped, Planned, Pending |
| REQ-08 | Hold-to-move without key spamming | B-02, B-03, A-06 | AUDIT-F-12 | `tests/e2e/audit/audit.e2e.test.js` + input adapter tests | Mapped, Planned, Pending |
| REQ-09 | Pause/continue/restart at any time and paused frames unaffected | A-03, C-04, C-05, A-06 | AUDIT-F-08, AUDIT-F-09, AUDIT-F-10, AUDIT-F-17 | `tests/e2e/audit/audit.e2e.test.js` + pause performance traces | Mapped, Planned, Pending |
| REQ-10 | Layers minimal but non-zero and paint usage minimized | D-05, D-08, A-09 | AUDIT-F-19, AUDIT-F-20, AUDIT-F-21 | DevTools paint/layer evidence artifacts linked in matrix updates | Mapped, Planned, Pending |
| REQ-11 | No canvas | A-01, D-06 | AUDIT-F-04 | Static scan + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-12 | No frameworks (vanilla JS/DOM only) | A-01 | AUDIT-F-05 | CI dependency gate + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-13 | Single-player only | B-02, C-04, A-06 | AUDIT-F-03 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-14 | Genre aligns with pre-approved list | B-03, B-06, B-07, B-08, D-10 | AUDIT-F-06, AUDIT-F-13 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-15 | Ghost spawn timing follows `docs/game-description.md` §5.4 with deterministic stagger, FIFO release, map-driven cap enforcement, and 5000ms respawn delay | C-03, B-08, A-06 | AUDIT-F-13 | `src/ecs/systems/spawn-system.js` + `tests/unit/systems/spawn-system.test.js` | Mapped, Covered, Executable (C-03 system logic implemented and passing; ghost-entity/runtime integration remains deferred) |
| REQ-16 | C-04 pause and level progression system contracts | C-04 | AUDIT-F-07, AUDIT-F-08, AUDIT-F-09, AUDIT-F-10 | `src/ecs/systems/pause-system.js`, `src/ecs/systems/pause-input-system.js`, `src/ecs/systems/level-progress-system.js` + `tests/unit/systems/pause-system.test.js` + focused unit tests | PARTIAL - System-layer logic implemented; runtime/UI verification out of scope for C-04 |

## Audit Coverage Matrix (Canonical)

### Functional Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation/track-*.md`) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-F-01 | Does the game run without crashing? | REQ-01, REQ-14 | Fully Automatable | A-06, B-06 | `tests/e2e/audit/audit-question-map.js` + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| AUDIT-F-02 | Does animation run using `requestAnimationFrame`? | REQ-02 | Fully Automatable | A-03, A-06 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-03 | Is the game single player? | REQ-13 | Fully Automatable | B-02, C-04 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-04 | Does the game avoid the use of canvas? | REQ-11 | Fully Automatable | A-01, D-06 | Same as above + static scan gate | Mapped, Planned, Pending |
| AUDIT-F-05 | Does the game avoid the use of frameworks? | REQ-12 | Fully Automatable | A-01 | Same as above + dependency gate | Mapped, Planned, Pending |
| AUDIT-F-06 | Is the game chosen from the pre-approved list? | REQ-14 | Fully Automatable | B-03, B-06, B-08 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-07 | Does pause menu show continue and restart? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04, C-05 | `src/ecs/systems/pause-system.js` + `src/ecs/systems/pause-input-system.js` + `tests/unit/systems/pause-input.test.js` + `tests/unit/systems/pause-system.test.js` | PARTIAL - System-layer logic implemented; runtime/UI verification out of scope for C-04 |
| AUDIT-F-08 | Does continue resume gameplay from pause? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04, A-03 | `src/ecs/systems/pause-system.js` + `tests/unit/systems/pause-system.test.js` | PARTIAL - System-layer logic implemented; runtime/UI verification out of scope for C-04 |
| AUDIT-F-09 | Does restart reset correctly from pause? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04, A-05 | `src/ecs/systems/pause-system.js` + `tests/unit/systems/pause-system.test.js` | PARTIAL - System-layer logic implemented; runtime/UI verification out of scope for C-04 |
| AUDIT-F-10 | While paused, no dropped frames and rAF unaffected? | REQ-02, REQ-09, REQ-16 | Fully Automatable | A-03, C-04, D-05, A-06 | `src/ecs/systems/pause-system.js` + `tests/unit/systems/pause-system.test.js` + existing gameStatus/clock pause integration tests | PARTIAL - System-layer logic implemented; runtime/UI verification out of scope for C-04 |
| AUDIT-F-11 | Does player obey movement commands? | REQ-07 | Fully Automatable | B-02, B-03 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-12 | Does player move without spamming keys? | REQ-07, REQ-08 | Fully Automatable | B-02, B-03 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-13 | Does game behave like pre-approved genre, including deterministic ghost-house stagger/respawn timing from `game-description.md` §5.4? | REQ-14, REQ-15 | Fully Automatable | B-03, B-06, B-07, B-08, C-03 | `tests/e2e/audit/audit.e2e.test.js` + `src/ecs/systems/spawn-system.js` + `tests/unit/systems/spawn-system.test.js` | Mapped, Covered, Executable (C-03 covers stagger timing, FIFO ordering, cap enforcement, and respawn delay at the system-test level) |
| AUDIT-F-14 | Does timer/countdown work? | REQ-04 | Fully Automatable | C-02, C-05 | `tests/unit/systems/timer-system.test.js` | Mapped, Covered, Executable (system logic only — HUD coverage pending C-05) |
| AUDIT-F-15 | Does the score HUD remain present during gameplay, with runtime-visible score increments deferred to later integration? | REQ-05 | Fully Automatable | C-01, C-05, A-06 | `tests/e2e/audit/audit.e2e.test.js` + `tests/unit/systems/scoring-system.test.js` | Mapped, Planned, Pending (`hud-contract` currently covers score HUD presence; deterministic `C-01` scoring values are verified in system tests until runtime-visible scoring lands in `C-05` / `A-06`) |
| AUDIT-F-16 | Do lives decrease on life-loss events? | REQ-06 | Fully Automatable | C-02, C-05 | `tests/unit/systems/life-system.test.js` | Mapped, Covered, Executable (system logic only — HUD coverage pending C-05) |
| AUDIT-F-17 | Can you confirm there are no frame drops? | REQ-01, REQ-09 | Semi-Automatable | A-06, D-08, A-09 | `tests/e2e/audit/audit.e2e.test.js` + Performance API (`page.evaluate`) | Mapped, Planned, Pending |
| AUDIT-F-18 | Does game run around 60 FPS? | REQ-01 | Semi-Automatable | A-06, D-08, A-09 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-19 | Is paint used as little as possible? | REQ-10 | Manual-With-Evidence | D-08, A-09 | DevTools paint evidence linked from PR artifacts | Mapped, Planned, Pending |
| AUDIT-F-20 | Are layers used as little as possible? | REQ-10 | Manual-With-Evidence | D-05, D-08, A-09 | DevTools layer evidence linked from PR artifacts | Mapped, Planned, Pending |
| AUDIT-F-21 | Is layer creation promoted properly? | REQ-10 | Manual-With-Evidence | D-05, D-08, A-09 | DevTools layer-promotion evidence linked from PR artifacts | Mapped, Planned, Pending |

### Bonus Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation/track-*.md`) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-B-01 | Does project run quickly and effectively? | REQ-01 | Fully Automatable | A-06, D-08, A-09 | `tests/e2e/audit/audit.e2e.test.js` + performance checks | Mapped, Planned, Pending |
| AUDIT-B-02 | Does code obey good practices? | REQ-12 | Fully Automatable | A-01, A-07, A-09 | CI policy gate + `npm run validate:schema` fail-closed asset gates (`scripts/validate-schema.mjs`, `tests/unit/policy-gate/validate-schema-asset-gates.test.js`) + lint/test/security check outputs | Mapped, Planned, Executable |
| AUDIT-B-03 | Does program reuse memory to avoid jank? | REQ-01 | Fully Automatable | A-02, B-06, D-09, D-08 | `tests/integration/adapters/sprite-pool-adapter.test.js` (D-09 pool allocation) + `tests/e2e/audit/audit.e2e.test.js` + allocation evidence (D-08 pending) | Mapped, Covered, Pending |
| AUDIT-B-04 | Does game use SVG? | REQ-14 | Fully Automatable | D-09, D-11 | Static SVG scan + runtime DOM/assertion checks | Mapped, Planned, Pending |
| AUDIT-B-05 | Is code using asynchronicity for performance? | REQ-01 | Semi-Automatable | C-06, C-09, A-09 | Playwright `page.evaluate()` + Performance API threshold checks | Mapped, Planned, Pending |
| AUDIT-B-06 | Is project well done overall? | REQ-01 through REQ-16 | Manual-With-Evidence | All tracks, A-09 | All audit assertions + evidence bundle + review sign-off | Mapped, Planned, Pending |

## Completion Criteria For This Matrix

1. Every requirement row must map to ticket owners, audit IDs, and a verification anchor.
2. Every audit row must map to ticket owners and a concrete execution type.
3. Every `Pending` audit row must become `Executable` only after passing artifacts exist.
4. CI must fail if any audit ID is missing from `tests/e2e/audit/audit-question-map.js`.
5. CI must fail if semi-automatable thresholds or manual-evidence manifest obligations are missing for required audit IDs.

## Maintenance Rules

1. If `docs/audit.md` changes, update this matrix and `tests/e2e/audit/audit-question-map.js` in the same PR.
2. If ticket definitions in `docs/implementation/track-*.md` change, update this matrix in the same PR.
3. Keep coverage tables out of `docs/implementation/implementation-plan.md`; that file should reference this matrix.
4. If ticket ownership or execution status changes, update `docs/implementation/ticket-tracker.md` in the same PR.
5. Do not mark any row `Executable` without a passing test run artifact or linked evidence artifact.
