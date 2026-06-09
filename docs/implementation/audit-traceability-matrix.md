# Audit Traceability Matrix
<!-- Last modified: 2026-06-09 (stagger tests updates) -->

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

## Ticket Audit Rule

1. Ticket audits validate only the scope explicitly assigned to the audited ticket in `docs/implementation/track-*.md`.
2. If a ticket is intentionally system-layer-only, contract-layer-only, or otherwise partial by plan, that ticket may PASS without runtime wiring, UI, browser-visible behavior, or other later-ticket integration work.
3. Product-level audit questions in `docs/audit.md` remain the source of truth for final integrated project acceptance, not for every individual ticket branch.
4. Ticket audits must not fail due to incomplete features owned by other tickets or tracks.

## Status Legend

- `Mapped`: The row has an explicit mapping.
- `Planned`: Ticket ownership and a verification path are defined.
- `Executable`: Real assertions/evidence are implemented and passing.
- `Pending`: Not yet executable or not yet validated by passing artifacts.

## Current Automation Reality

- `tests/e2e/audit/audit-question-map.js` includes all 27 audit IDs plus execution metadata, threshold definitions, and manual-evidence manifest linkage. `SEMI_AUTOMATABLE_THRESHOLDS` stores canonical AGENTS.md values (16.7ms p95 frame time, 60 FPS p95).
- `tests/e2e/audit/audit.e2e.test.js` enforces executable non-browser obligations: inventory/category parity, threshold declaration checks, and manual evidence manifest/artifact existence.
- `tests/e2e/audit/audit.browser.spec.js` executes browser runtime/performance assertions, including explicit thresholds for `AUDIT-F-17`, `AUDIT-F-18`, and `AUDIT-B-05`, runtime input behavior for `AUDIT-F-11` and `AUDIT-F-12`, and the platform DOM contract (no `<canvas>` element, HUD shell visible). A `CI_TOLERANCE_FACTOR` env var relaxes thresholds for headless rAF noise (default 1.05 locally, 1.3 in CI); set to 1.0 for strict canonical check.
- Manual evidence obligations for `AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`, and `AUDIT-B-06` are tracked through `docs/audit-reports/manual-evidence.manifest.json` (all 4 entries signed off by ekaramet 2026-05-06).

## Alignment Verification Summary

1. REQ-01 through REQ-16 are mapped to owning tickets and audit IDs below.
2. AUDIT-F-01 through AUDIT-F-21 and AUDIT-B-01 through AUDIT-B-06 are mapped to ticket anchors and test/evidence anchors below.
3. Audit verification follows `AGENTS.md` categories: Fully Automatable, Semi-Automatable, and Manual-With-Evidence.

## Requirement Coverage Matrix (Canonical)

| Requirement ID | Requirement Summary | Owning Tickets (`docs/implementation/track-*.md`) | Covered By Audit IDs | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|
| REQ-01 | Run at least 60 FPS and avoid frame drops | A-03, A-06, D-08, A-09 | AUDIT-F-17, AUDIT-F-18, AUDIT-B-01 | `tests/e2e/audit/audit.e2e.test.js` + performance evidence artifacts | Mapped, Planned, Executable |
| REQ-02 | Use `requestAnimationFrame` correctly | A-03, A-06 | AUDIT-F-02, AUDIT-F-10 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| REQ-03 | Pause menu contains Continue and Restart | C-04, C-05, A-06 | AUDIT-F-07, AUDIT-F-08, AUDIT-F-09 | `tests/e2e/c-05-screens-navigation.spec.js` + `tests/integration/adapters/screens-adapter.test.js` | Mapped, PARTIAL (`C-05` currently proves adapter-level overlay and keyboard behavior only; full product/runtime wiring remains shared with later integration tickets.) |
| REQ-04 | HUD shows countdown/timer | C-02, C-05, A-06 | AUDIT-F-14 | `tests/unit/systems/timer-system.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, PARTIAL (`C-02` owns timer logic; `C-05` currently proves adapter-level HUD formatting only.) |
| REQ-05 | HUD shows score and score increments | C-01, C-05, A-06 | AUDIT-F-15 | `tests/unit/systems/scoring-system.test.js` + `tests/integration/gameplay/c-01-level-clear-bonus.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, Covered, Executable (`C-01` owns scoring logic including the runtime-integrated level-clear award via the `scoring-system` LEVEL_COMPLETE observer; `C-05` owns adapter-level score presentation mounted through bootstrap.) |
| REQ-06 | HUD shows lives and lives decrement | C-02, C-05, A-06 | AUDIT-F-16 | `tests/unit/systems/life-system.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, PARTIAL (`C-02` owns life logic; `C-05` currently proves adapter-level lives presentation only.) |
| REQ-07 | Keyboard-only control path | B-02, C-05, A-06 | AUDIT-F-11, AUDIT-F-12 | `tests/e2e/audit/audit.browser.spec.js` (runtime keyboard checks) + adapter focus tests | Mapped, Covered, Executable (browser runtime check exercises arrow keydown advancing the player sprite) |
| REQ-08 | Hold-to-move without key spamming | B-02, B-03, A-06 | AUDIT-F-12 | `tests/e2e/audit/audit.browser.spec.js` (sustained-hold runtime check) + input adapter tests | Mapped, Covered, Executable (browser runtime check holds a key across multiple frames and asserts continuous transform updates) |
| REQ-09 | Pause/continue/restart at any time and paused frames unaffected | A-03, C-04, C-05, A-06 | AUDIT-F-08, AUDIT-F-09, AUDIT-F-10, AUDIT-F-17 | `tests/e2e/audit/audit.e2e.test.js` + pause performance traces | Mapped, Planned, Executable |
| REQ-10 | Layers minimal but non-zero and paint usage minimized | D-05, D-08, A-09 | AUDIT-F-19, AUDIT-F-20, AUDIT-F-21 | [AUDIT-F-19.paint.md](../audit-reports/evidence/AUDIT-F-19.paint.md) + [AUDIT-F-20.layers.md](../audit-reports/evidence/AUDIT-F-20.layers.md) + [AUDIT-F-21.promotion.md](../audit-reports/evidence/AUDIT-F-21.promotion.md) | Mapped, Planned, Executable |
| REQ-11 | No canvas | A-01, D-06 | AUDIT-F-04 | Static scan + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| REQ-12 | No frameworks (vanilla JS/DOM only) | A-01 | AUDIT-F-05 | CI dependency gate + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| REQ-13 | Single-player only | B-02, C-04, A-06 | AUDIT-F-03 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| REQ-14 | Genre aligns with pre-approved list | B-03, B-06, B-07, B-08, D-10 | AUDIT-F-06, AUDIT-F-13 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| REQ-15 | Ghost spawn timing follows `docs/game-description.md` §5.4 with deterministic stagger, FIFO release, map-driven cap enforcement, and 5000ms respawn delay | C-03, B-08, A-06 | AUDIT-F-13 | `src/ecs/systems/spawn-system.js` + `tests/unit/systems/spawn-system.test.js` | Mapped, Covered, Executable (C-03 spawn-state system logic implemented and passing; ghost-entity creation, AI, and movement deferred to `B-08 Ghost AI System (Track B, P3)` by design) |
| REQ-16 | C-04 pause and level progression ECS system-layer contracts only | C-04 | AUDIT-F-07, AUDIT-F-08, AUDIT-F-09, AUDIT-F-10 | `REQ-03 -> src/ecs/systems/pause-system.js + tests/unit/systems/pause-system.test.js`; `REQ-09 -> src/ecs/systems/pause-input-system.js + tests/unit/systems/pause-input.test.js`; `REQ-16 -> src/ecs/systems/level-progress-system.js + tests/unit/systems/level-progress-system.test.js` | Executable for ticket-scope audit; product-level audit remains PARTIAL until later runtime/UI integration tickets land |
| REQ-17 | HUD shows bomb and fire power-up counts, incrementing on pickup (`game-description.md` §2, §4.4, §6) | B-07, D-08, C-05 | AUDIT-F-13 | `tests/integration/gameplay/power-up-pickup-effect.test.js` + `tests/unit/systems/hud-system.test.js` + `tests/unit/systems/hud-render-system.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, Covered, Executable (`B-07` owns the power-up effect on the player store; `D-08` owns reading those stats into the HUD render; `C-05` owns adapter-level presentation. Per ARCH-01, `hud-system` (logic phase) writes all six fields into the `hudState` buffer and `hud-render-system` (render phase) is the sole HUD→DOM boundary. Bugfix: `hud-system` previously fed hardcoded `bombs:0`/`fire:0`; runtime-integrated pickup→effect→HUD-DOM chain now verified end-to-end.) |

## Audit Coverage Matrix (Canonical)

### Functional Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation/track-*.md`) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-F-01 | Does the game run without crashing? | REQ-01, REQ-14 | Fully Automatable | A-06, B-06 | `tests/e2e/audit/audit-question-map.js` + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Executable |
| AUDIT-F-02 | Does animation run using `requestAnimationFrame`? | REQ-02 | Fully Automatable | A-03, A-06 | Same as above | Mapped, Planned, Executable |
| AUDIT-F-03 | Is the game single player? | REQ-13 | Fully Automatable | B-02, C-04 | Same as above | Mapped, Planned, Executable |
| AUDIT-F-04 | Does the game avoid the use of canvas? | REQ-11 | Fully Automatable | A-01, D-06 | Same as above + static scan gate | Mapped, Planned, Executable |
| AUDIT-F-05 | Does the game avoid the use of frameworks? | REQ-12 | Fully Automatable | A-01 | Same as above + dependency gate | Mapped, Planned, Executable |
| AUDIT-F-06 | Is the game chosen from the pre-approved list? | REQ-14 | Fully Automatable | B-03, B-06, B-08 | Same as above | Mapped, Planned, Executable |
| AUDIT-F-07 | Does pause menu show continue and restart? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04, C-05 | `tests/integration/adapters/screens-adapter.test.js` + `tests/e2e/c-05-screens-navigation.spec.js` + `tests/e2e/game-loop.pause.spec.js` + `tests/unit/systems/pause-input.test.js` + `tests/unit/systems/pause-system.test.js` | Mapped, Covered, Executable - C-04 pause systems registered in the default bootstrap `meta` phase; C-05 pause menu (Continue + Restart) mounted via `screens-adapter` in the live runtime shell. |
| AUDIT-F-08 | Does continue resume gameplay from pause? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04, A-03 | `src/ecs/systems/pause-system.js` + `tests/unit/systems/pause-system.test.js` + `tests/e2e/game-loop.pause.spec.js` | Mapped, Covered, Executable - resource-layer `PAUSED -> PLAYING` contract plus runtime continue flow through the pause menu. |
| AUDIT-F-09 | Does restart reset correctly from pause? | REQ-03, REQ-09, REQ-16 | Fully Automatable | C-04 | `tests/integration/gameplay/restart-flow.test.js` + `tests/e2e/stress/race-condition.spec.js` | Mapped, Covered, Executable - restart is owned by game-flow's `restartLevel()` path (not the pause FSM; BUG-12), and the bootstrap restart path resets score/timer/lives/ghost-spawn/sprite pool/intents end-to-end. |
| AUDIT-F-10 | While paused, no dropped frames and rAF unaffected? | REQ-02, REQ-09, REQ-16 | Fully Automatable | A-03, C-04, D-05, A-06 | `src/ecs/systems/pause-system.js` + `tests/unit/systems/pause-system.test.js` + existing gameStatus/clock pause integration tests | Mapped, Covered, Executable |
| AUDIT-F-11 | Does player obey movement commands? | REQ-07 | Fully Automatable | B-02, B-03 | `tests/e2e/audit/audit.browser.spec.js` (`AUDIT-F-11 input handling meets requirements` runtime check) + `tests/e2e/audit/audit-question-map.js` | Mapped, Covered, Executable |
| AUDIT-F-12 | Does player move without spamming keys? | REQ-07, REQ-08 | Fully Automatable | B-02, B-03 | `tests/e2e/audit/audit.browser.spec.js` (`AUDIT-F-12 hold-input mechanism is robust` sustained-hold runtime check) + `tests/e2e/audit/audit-question-map.js` | Mapped, Covered, Executable |
| AUDIT-F-13 | Does game behave like pre-approved genre, including deterministic ghost-house stagger/respawn timing from `game-description.md` §5.4? | REQ-14, REQ-15 | Fully Automatable | B-03, B-06, B-07, B-08, C-03 | `tests/e2e/audit/audit.browser.spec.js` + `tests/e2e/audit/audit.e2e.test.js` + `src/ecs/systems/spawn-system.js` + `tests/unit/systems/spawn-system.test.js` | Mapped, Covered, Executable (C-03 covers stagger timing, FIFO ordering, cap enforcement, and respawn delay at the system-test level) |
| AUDIT-F-14 | Does timer/countdown work? | REQ-04 | Fully Automatable | C-02, C-05 | `tests/unit/systems/timer-system.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, Covered, Executable - `C-02` validates countdown logic; `C-05` validates adapter-level M:SS HUD rendering and the HUD is mounted at runtime via the `hud-system` (logic) producer + `hud-render-system` (render) consumer + `hud-adapter` in the default bootstrap. |
| AUDIT-F-15 | Does the score HUD remain present during gameplay with runtime score increments (collision-driven point awards and the level-clear bonus)? | REQ-05 | Fully Automatable | C-01, C-05, A-06 | `tests/unit/systems/scoring-system.test.js` + `tests/integration/gameplay/c-01-level-clear-bonus.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, Covered, Executable - `C-01` validates deterministic score logic and the runtime-integrated level-clear award (1000 + remainingSeconds × 10, one-shot guarded); `C-05` validates the bootstrap-mounted score HUD via the `hud-system` (logic) producer + `hud-render-system` (render) consumer + `hud-adapter`. |
| AUDIT-F-16 | Do lives decrease on life-loss events? | REQ-06 | Fully Automatable | C-02, C-05 | `tests/unit/systems/life-system.test.js` + `tests/integration/adapters/hud-adapter.test.js` | Mapped, Covered, Executable - `C-02` validates life-loss logic; `C-05` validates adapter-level lives HUD presentation and the HUD is mounted at runtime via the `hud-system` (logic) producer + `hud-render-system` (render) consumer + `hud-adapter` in the default bootstrap. |
| AUDIT-F-17 | Can you confirm there are no frame drops? | REQ-01, REQ-09 | Semi-Automatable | A-06, D-08, A-09 | `tests/e2e/audit/audit.browser.spec.js` + Performance API (`page.evaluate`) | Mapped, Planned, Executable |
| AUDIT-F-18 | Does game run around 60 FPS? | REQ-01 | Semi-Automatable | A-06, D-08, A-09 | Same as above | Mapped, Planned, Executable |
| AUDIT-F-19 | Is paint used as little as possible? | REQ-10 | Manual-With-Evidence | D-08, A-09 | [AUDIT-F-19.paint.md](../audit-reports/evidence/AUDIT-F-19.paint.md) + [playwright-trace.zip](../audit-reports/evidence/playwright-trace.zip) | Mapped, Planned, Executable |
| AUDIT-F-20 | Are layers used as little as possible? | REQ-10 | Manual-With-Evidence | D-05, D-08, A-09 | [AUDIT-F-20.layers.md](../audit-reports/evidence/AUDIT-F-20.layers.md) + [playwright-trace.zip](../audit-reports/evidence/playwright-trace.zip) | Mapped, Planned, Executable |
| AUDIT-F-21 | Is layer creation promoted properly? | REQ-10 | Manual-With-Evidence | D-05, D-08, A-09 | [AUDIT-F-21.promotion.md](../audit-reports/evidence/AUDIT-F-21.promotion.md) + [playwright-trace.zip](../audit-reports/evidence/playwright-trace.zip) | Mapped, Planned, Executable |

### Bonus Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation/track-*.md`) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-B-01 | Does project run quickly and effectively? | REQ-01 | Fully Automatable | A-06, D-08, A-09 | `tests/e2e/audit/audit.e2e.test.js` + performance checks | Mapped, Planned, Pending |
| AUDIT-B-02 | Does code obey good practices? | REQ-12 | Fully Automatable | A-01, A-07, A-09 | CI policy gate + `npm run validate:schema` fail-closed asset gates (`scripts/validate-schema.mjs`, `tests/unit/policy-gate/validate-schema-asset-gates.test.js`) + lint/test/security check outputs | Mapped, Planned, Executable |
| AUDIT-B-03 | Does program reuse memory to avoid jank? | REQ-01 | Fully Automatable | A-02, B-06, D-09, D-08 | `tests/integration/adapters/sprite-pool-adapter.test.js` (D-09 pool allocation) + `tests/e2e/audit/audit.e2e.test.js` + allocation evidence (D-08 pending) | Mapped, Covered, Pending |
| AUDIT-B-04 | Does game use SVG? | REQ-14 | Fully Automatable | D-09, D-11 | Static SVG scan + runtime DOM/assertion checks | Mapped, Planned, Pending |
| AUDIT-B-05 | Is code using asynchronicity for performance? | REQ-01 | Semi-Automatable | C-06 ✅ (adapter), C-07 ✅ (cue runner), C-09, A-09 | `src/adapters/io/audio-adapter.js` runs `fetch → arrayBuffer → decodeAudioData` off the main thread and caches `AudioBuffer`s in internal Maps for instant playback; `tests/integration/adapters/audio-adapter.test.js` validates the async decode path, buffer caching, missing-clip resilience, and visibility lifecycle. `src/adapters/io/audio-integration.js` ships the C-07 cue runner that drains the D-01 event queue each tick and dispatches mapped cues without blocking the simulation phase; `tests/integration/adapters/audio-integration.test.js` validates queue-order playback, overlapping cue dispatch, and music-state debounce across all `GAME_STATE` values. Runtime wiring (Track A integration handoff PR) registers the C-06 adapter at `world.resources.audio` and the C-07 runner as a `render`-phase system wrapper. Playwright `page.evaluate()` + Performance API threshold checks remain the final gate (covered by C-09/A-09). | Mapped, Planned, Executable |
| AUDIT-B-06 | Is project well done overall? | REQ-01 through REQ-16 | Manual-With-Evidence | All tracks, A-09, C-08 (audio production) | [AUDIT-B-06.overall.md](../audit-reports/evidence/AUDIT-B-06.overall.md) + [playwright-trace.zip](../audit-reports/evidence/playwright-trace.zip) + audio production quality evidence (C-08 candidate SFX/music in `assets/generated/{sfx,music}/` + `assets/manifests/audio-manifest.json`, audible end-to-end via C-06/C-07) | Mapped, Planned, Executable (audio candidates shipped; final audio sign-off pending complete SFX set + loudness normalization + A-13) |

## Additional Invariant & Traceability Coverage

The following tests verify constraints defined in [AGENTS.md](../../AGENTS.md) that do not directly map to a single user-facing audit question in `docs/audit.md`, but are required invariant verification gates for Track A.

| Invariant / Feature | Owning Ticket | Test File / Reference | Purpose / Coverage Description |
|---|---|---|---|
| Simulation Determinism | A-05 | `tests/integration/gameplay/a-05-replay-determinism.test.js` | Replays recorded input trace on same seed (identical hash) and different seed (divergent hash + rng.state). |
| Multi-System Pipeline | A-05 | `tests/integration/gameplay/a-05-integration.test.js` | Verifies end-to-end data pipeline from player placing bomb to scoring points. |
| package.json private flag (SEC-03) | A-01 | `tests/e2e/audit/audit.e2e.test.js` enforces package.json private flag | Prevents accidental npm publish of GPL-3.0 code. |
| No duplicate npm scripts (DEAD-05) | A-01 | `tests/e2e/audit/audit.e2e.test.js` enforces no duplicate aliased scripts | Ensures each script entry is unique to maintain a clean `scripts` block. |

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
