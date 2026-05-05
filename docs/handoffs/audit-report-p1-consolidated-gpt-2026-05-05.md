# Consolidated Codebase Analysis & Audit Report - P1 (Deduplicated)

Date: 2026-05-05
Project: make-your-game (Ms. Ghostman -- Modern JavaScript 2026 DOM + ECS Game)
Scope: Phase 1 (Visual Prototype)

Source reports merged:
- audit-report-p1-ek-2026-05-04.md
- audit-report-P1-2026-05-05.md
- audit-report-P1-chbaikas.md
- audit-report-P1-medvall.md

Methodology
- Merged findings across the four reports and removed duplicates by root cause.
- Severity reflects the highest severity noted across sources.
- PASS-only items are omitted.
- Refuted items from prior verification passes are explicitly listed to avoid reintroduction.

Executive Summary (Deduplicated)
- Critical runtime risks remain in bootstrap, clock lifecycle, and rendering pipeline wiring.
- Rendering path has two competing DOM commit writers and violates pooling rules.
- CI and audit verification coverage are incomplete or not enforced in pipeline.
- Multiple dead-code and unused-export issues remain, especially around rendering and constants.
- Security posture is generally safe but lacks CSP meta fallback, policy coverage, and trusted-types rigor.

1) Bugs and Logic Errors

BUG-01: Double bootstrap execution (HIGH)
- main.ecs.js auto-runs bootstrap while main.js also starts the app.
- Impact: duplicate worlds, duplicate rAF loops, and double listeners.

BUG-02: Clock resync resets simTimeMs to zero (HIGH)
- resetClock() used for lifecycle resync rewinds simulation time.
- Impact: pause/resume determinism breaks and timer logic can regress.

BUG-03: life-system uses restricted world view incorrectly (HIGH)
- life-system uses world.entityStore.isAlive() but restricted world view only exposes isEntityAlive().
- Impact: system can throw in normal dispatch.

BUG-04: playerHandle overwritten by setEntityMask return value (CRITICAL)
- playerHandle is assigned the boolean return value of setEntityMask().
- Impact: player handle becomes invalid and component writes target undefined IDs.

BUG-05: setEntityMask failure handling and mask=0 validation (LOW)
- Return value not checked and mask=0 lacks validation.
- Impact: silent failure or accidental hiding of entities.

BUG-06: sprite pool recycle crash when active pool empty (HIGH)
- activePool.shift() can return undefined, leading to .style access crash.
- Impact: pool exhaustion causes runtime failure.

BUG-07: world.frame not reset on level restart (MEDIUM)
- world.frame persists across restarts.
- Impact: frame-dependent logic drifts between levels.

BUG-08: render-dom-system entityElementMap leak (MEDIUM)
- entityElementMap entries not cleared on restart.
- Impact: memory growth and pool exhaustion.

BUG-09: render-intent buffer overflow drops intents (MEDIUM)
- Overflows drop intents in production without a hard failure.
- Impact: entities silently disappear.

BUG-10: pause state not cleared after level complete (MEDIUM)
- Pause flag can leak into PLAYING after LEVEL_COMPLETE.
- Impact: gameplay resumes in paused state.

BUG-11: droppedBombByCell not cleared on bomb move (HIGH)
- Old cell entries remain when bomb moves.
- Impact: collision responses reference stale bombs.

BUG-12: collectStaticPickup mutates map before emitting event (LOW)
- Map mutation occurs before event emission.
- Impact: inconsistent state if event emission fails.

BUG-13: spawn-system fallback ghost count forced to POOL_GHOSTS (MEDIUM)
- Math.max enforces 4 ghost minimum regardless of level cap.
- Impact: ghost counts exceed level design caps.

BUG-14: event queue enqueue lacks validation (LOW)
- No guard for invalid queue objects.
- Impact: avoidable throw on misuse.

BUG-15: event queue comparator overflow risk (LOW)
- Subtraction comparator can overflow on very large frame numbers.

BUG-16: render-dom-system Map mutation during iteration (LOW)
- Deletes during iteration are spec-correct but fragile.

BUG-17: clock double-invalid fallback edge case (INFO)
- Explicit timestamp fallback is clearer than implicit handling.

2) Architecture, ECS, and Performance

ARCH-01: Two render pipelines with duplicate DOM commits (MEDIUM)
- ECS render-dom-system and renderer-dom adapter both consume render intents.
- Impact: double DOM writes and bypassed sprite pooling.

ARCH-02: HIDDEN uses display:none instead of offscreen transform (CRITICAL)
- Violates pooling and compositor-only update rules.
- Impact: layout thrash during gameplay.

ARCH-03: Per-frame Set allocation in render-dom-system (MEDIUM)
- currentFrameEntityIds is created every frame.
- Impact: recurring GC pressure in hot loop.

ARCH-04: Event queue drain allocations and resetOrderCounter risk (MEDIUM)
- drain() copies arrays and returns new [] when empty.
- resetOrderCounter can break event ordering guarantees.

ARCH-05: World exposes mutable internals (MEDIUM)
- entityStore and systemsByPhase getters expose mutable structures.
- Impact: bypasses ECS invariants and deferral contracts.

ARCH-06: input-system imports adapter module directly (HIGH)
- Simulation system imports adapter code, violating adapter isolation rules.

ARCH-07: Render intent capacity mismatch with entity capacity (MEDIUM)
- MAX_RENDER_INTENTS is below potential renderable entity counts.

ARCH-08: Pause/HUD/timer/life systems not wired into default runtime (HIGH)
- Product-level HUD and pause contracts cannot be verified in real gameplay.

ARCH-09: spawn-system allocates scratch Sets per tick (LOW)
- Repeated Set allocations inside a fixed step.

ARCH-10: bootstrap uses direct DOM access for game-board (LOW)
- Uses document.getElementById in bootstrap rather than injected adapter resource.

3) Code Quality and Security

SEC-01: Trusted Types policy too permissive / missing default policy (MEDIUM)
- Default policy passes through strings; missing explicit policy creation.

SEC-02: Development CSP uses unsafe-eval/unsafe-inline (LOW)
- Known trade-off; should be documented.

SEC-03: No CSP meta tag fallback in index.html (MEDIUM)
- CSP relies solely on headers, weak for static hosting.

SEC-04: Missing Permissions-Policy and Cross-Origin headers (LOW)
- No explicit restrictions on sensitive APIs.

SEC-05: className string assignment instead of classList (LOW)
- Replaces all classes; potential accidental removal of accessibility classes.

SEC-06: response.json() without size guard (LOW)
- Large JSON responses can exhaust memory before validation.

SEC-07: Forbidden scan misses WebGL/WebGPU and inline handlers (MEDIUM)
- Policy scan does not explicitly block inline handlers or WebGL/WebGPU APIs.

SEC-08: Policy gates can be bypassed locally (MEDIUM)
- No pre-commit enforcement of policy checks.

SEC-09: Storage adapter not implemented for localStorage trust boundary (LOW)
- High-score storage requires validated read path.

4) Tests and CI Gaps

CI-01: CI pipeline missing test execution gates (BLOCKING)
- policy-gate workflow runs policy but not unit/integration/e2e/coverage checks.

CI-02: Coverage thresholds not enforced in CI (HIGH)
- vitest thresholds exist but are not run in pipeline.

CI-03: E2E tests not executed in CI (CRITICAL)
- Playwright tests are not run in the workflow.

CI-04: Audit E2E coverage incomplete (BLOCKING)
- Missing audit ID coverage for F-03, F-06, F-11, F-12, F-14, F-15, F-16, B-03.

CI-05: Semi-automatable performance thresholds too lax (HIGH)
- F-17 and F-18 thresholds do not match AGENTS.md criteria.

CI-06: Manual evidence artifacts and sign-off missing (CRITICAL)
- F-19, F-20, F-21, B-06 evidence required but not collected.

CI-07: Audit traceability matrix and question map drift (HIGH)
- audit-traceability-matrix.md outdated; audit-question-map.js lacks testFile mapping.

CI-08: Missing unit tests for critical systems and adapters (HIGH)
- Systems: pause, level-progress, ghost-ai, bomb-tick, explosion, power-up, collision-gameplay-events.
- Adapters: renderer-adapter, renderer-board-css, audio, hud, screens, storage.

CI-09: Missing integration tests for gameplay flows (BLOCKING/HIGH)
- gameplay flows, bomb chain reaction, pause invariants, event ordering.

CI-10: Missing runtime HUD tests (HIGH)
- No Playwright checks for score increment or lives decrement at runtime.

CI-11: Missing DOM element budget test (MEDIUM)
- No test ensuring <= 500 DOM nodes after level load.

CI-12: Missing sprite pool recycle test (HIGH)
- No test for un-warmed pool acquisition fallback.

CI-13: main.js and main.ecs.js coverage gaps (LOW/MEDIUM)
- entrypoint coverage is low due to auto-start side effects and untested error paths.

CI-14: Audit project gate runs audit browser specs twice (MEDIUM)
- test:audit:e2e and test:e2e both include audit specs.

CI-15: Audit report output path conflict with A-11 (MEDIUM)
- audit prompt writes to docs/audit-reports/ instead of phase-1 location.

CI-16: String-matching audit test should be replaced (LOW)
- audit.e2e.test.js checks file content rather than execution.

CI-17: Fixed setTimeout in Playwright test (LOW)
- Replace with state-based waits to avoid flakiness.

CI-18: Phase testing report out of sync with ticket tracker (MEDIUM)
- phase-testing-verification-report.md and ticket-tracker.md differ on status counts.

5) Dead Code and Unused References

DEAD-01: renderer-dom adapter duplicates render-dom-system (MEDIUM)
- Prototype renderer remains while ECS system is canonical.

DEAD-02: Unused devDependencies (MEDIUM)
- maxrects-packer and sharp are installed but unused.

DEAD-03: Duplicate readEntityTile helper (MEDIUM)
- bomb-tick-system duplicates collision-system helper.

DEAD-04: Legacy fallback in destroyAllEntitiesDeferred (MEDIUM)
- Manual iteration fallback is never used.

DEAD-05: Unused POWER_UP_TYPE enum (MEDIUM)
- props.js uses PROP_POWER_UP_TYPE instead.

DEAD-06: Unused runtime status exports (LOW)
- SPATIAL_STORE_RUNTIME_STATUS, PROP_STORE_RUNTIME_STATUS.

DEAD-07: isPlayerStart only used in tests (LOW)
- Move to test utils or mark internal.

DEAD-08: ALL_COMPONENT_MASKS unused export (LOW)

DEAD-09: resetOrderCounter unused export (MEDIUM)

DEAD-10: EntityStore getGeneration/getHandleForId unused (MEDIUM)

DEAD-11: SIMULATION_HZ unused export (LOW)

DEAD-12: Ghost AI constants unused (MEDIUM)
- CLYDE_DISTANCE_THRESHOLD, PINKY_TARGET_OFFSET, INKY_REFERENCE_OFFSET.

DEAD-13: MAX_CHAIN_DEPTH unused (LOW)

DEAD-14: GHOST_INTERSECTION_MIN_EXITS unused (LOW)

DEAD-15: KIND_TO_SPRITE_TYPE.WALL unreachable (LOW)

DEAD-16: Duplicate script entry in package.json (LOW)
- check:fix duplicates fix.

DEAD-17: README sbom.json tracking note is stale (LOW)

DEAD-18: Redundant vitest coverage exclude (LOW)

DEAD-19: Stale level-loader compatibility guard (LOW)
- assertValidMapResource now exists as a stable export.

DEAD-20: trusted-types.js excluded from coverage without tests (LOW)

6) Refuted or Corrected Items

Refuted findings from earlier verification passes:
- BUG-01-INPUT: assertValidInputAdapter typo does not exist.
- DEAD-04-MM: biome exclusion for changed-files.txt is correct (file exists).
- DEAD-08-BP: destroy is a valid adapter lifecycle method.
- DEAD-02-LEVELLOADER (createSyncMapLoader) refuted; current import is valid.
- TEST-07-BP count correction: actual ticket-tracker done count is 23 (not 21 or 16).

7) Verification Pass (Post-merge)

This consolidated report was verified in a second pass with these checks:
- Each source report was re-read and its unique findings were mapped into sections above.
- Duplicate root-cause items were merged under a single ID, preserving highest severity.
- Refuted items were excluded and listed under Refuted or Corrected Items.
- Conflicting interpretations were noted by selecting the stricter interpretation and flagging the conflict in notes.

End of consolidated report.
