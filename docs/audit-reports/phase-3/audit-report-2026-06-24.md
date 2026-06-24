# Codebase Analysis & Audit Report - P3 (Feature Complete + Hardening)

**Date:** 2026-06-24
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review at the P3 phase-end gate (branch `main`) — 5 parallel analysis passes. The checked-in tree also carries in-flight P4 work (D-10/D-11/C-11 landed; C-08/C-09/C-10 in progress); findings reflect the actual state of `main`.

---

## Methodology

Five parallel, evidence-driven, read-only analysis passes were executed across the codebase, followed by an adversarial verification pass (one independent verifier re-opened the cited code for every finding) and a consolidation/dedup pass:

1. **Bugs & Logic Errors** — runtime bugs, race conditions, state-machine transitions, clock/timing, map validation, entity lifecycle, event-queue ordering, error-handling paths.
2. **Dead Code & Unused References** — unused exports/imports/params, unreachable branches, stale config, redundant API surface, JSDoc/header drift.
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundary rules, DOM isolation, adapter injection, structural deferral, render/intent contract, ownership-policy drift, audit-question structural coverage, asset-pipeline drift.
4. **Code Quality & Security** — unsafe sinks, forbidden tech, CSP/Trusted Types, validation fail-open/closed, storage trust boundary, error visibility, policy-gate scan coverage, DOM-sink safety.
5. **Tests & CI Gaps** — unit/integration/adapter/e2e coverage, traceability-matrix sync, phase-report parity, audit-category enforcement, coverage config, CI/policy-gate enforcement, flakiness, performance tests.

A total of 24 findings survived verification; after cross-domain deduplication 23 consolidated findings remain. 3 raw findings were dropped as unconfirmed/false-positive during the verification pass (documented under Notes). Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 9 |
| 🟢 Low / Info | 14 |
| **Total** | **23** |

**Top risks:**
1. CI governance gaps let unverified code reach production: deploy.yml runs no e2e/integration/coverage/schema/policy before publishing to Pages (CI-01), and registered owners can bypass ownership+ticket gates via integration/bugfix branch names with only a warning (CI-04).
2. Ownership-policy drift: six live, wired source files (HUD, player-animation, screens, audio-loading, security) match no track-owner pattern (ARCH-01), so any ticket branch editing them fails the gate and must route through the bypass branches of CI-04 — the two findings reinforce each other.
3. Determinism / replay-contract erosion: input is snapshotted once per rAF frame rather than once per fixed step (ARCH-03), and tickClock can freeze the sim on a backward time regression (BUG-02) — both threaten deterministic replay/hashing under catch-up or non-monotonic clocks.
4. Test-suite signal is unreliable: 3 known flaky timing e2e specs trace to an unconstrained Playwright worker config (CI-02), coverage gates mask the ~70-72% runtime entry main.ecs.js (CI-03), and the e2e gate can pass on zero collected specs (CI-06).
5. Documentation/evidence drift undermines auditability: the ticket tracker contradicts its own canonical index on D-10/D-11/C-09/C-10 (CI-05), the traceability matrix over-cites an inventory-only test as a behavioral anchor (CI-07), and manual sign-offs still read 'Phase 2 MVP' on a P3 build (CI-08).

---

## 1) Bugs & Logic Errors

### BUG-01: VICTORY auto-transition and 'Victory' event are unreachable in production (clock frozen in LEVEL_COMPLETE) — sfx-victory never fires ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: A (Tickets: C-04, C-07, C-08)
- `src/ecs/systems/level-progress-system.js` (~L106-119)
- `src/game/game-flow.js` (~L21-23)
- `src/game/game-flow.js` (~L137-147)
- `src/ecs/systems/pause-system.js` (~L100-101)
- `src/adapters/io/audio-integration.js` (~L105)

**Problem:** level-progress-system declares (docstring + code L106-119) that it transitions LEVEL_COMPLETE→VICTORY on the final level and emits GAMEPLAY_EVENT_TYPE.VICTORY ('Victory'). But that block lives in the `logic` phase, and the simulation clock is frozen for every non-PLAYING state: game-flow.shouldFreezeSimulation() returns `state !== PLAYING` (L21-23) and pause-system (meta phase) re-asserts `clock.isPaused = (currentState !== PLAYING)` every frame (L101). Once level-progress-system transitions PLAYING→LEVEL_COMPLETE on one fixed step, the next frame's meta phase sets isPaused=true, tickClock returns 0 steps, and the logic phase never runs again in LEVEL_COMPLETE. The real LEVEL_COMPLETE→VICTORY transition therefore only happens via game-flow.startGame() (L143-147, driven by 'level-next'/play-again UI), which does NOT emit the 'Victory' event. Root cause: a state-machine responsibility (final-level Victory + its event) was placed in a system the freeze semantics guarantee cannot execute in that state.
**Impact:** On a real playthrough the one-shot `Victory: 'sfx-victory'` audio cue (audio-integration.js L105) never plays, because nothing emits 'Victory' in the runtime path that reaches VICTORY. level-progress-system carries dead, untestable-in-context logic that misleads maintainers into thinking it owns the Victory transition. Any future consumer of the 'Victory' event (analytics, screen FX) silently never receives it. (VICTORY state still transitions and the victory screen still renders — state-driven — so no progression break; sole production impact is a missing victory SFX.)

**Fix:** Emit the Victory event from the path that actually performs the transition. In game-flow.js startGame() where LEVEL_COMPLETE→VICTORY is taken (the `nextLevel === null` branch, L143-147), enqueue the Victory gameplay event when movedToVictory is true (thread the eventQueue resource into createGameFlow). Then delete the dead VICTORY block in level-progress-system.js (L106-119). Prefer the game-flow emission since game-flow already owns the transition.

**Tests to add:** Integration test that drives the runtime through bootstrap.stepFrame (NOT level-progress-system.update directly): clear all pellets on the final level so PLAYING→LEVEL_COMPLETE happens, step several more frames, invoke the real gameFlow.startGame() level-complete path, then assert a 'Victory' event is present in the drained event queue and gameStatus is VICTORY. The current b-09 test passes only because it calls system update() manually, bypassing the freeze.

---

### BUG-02: tickClock freezes the simulation after a wall-clock time regression until real time exceeds the stale baseline ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: D (Tickets: D-01)
- `src/ecs/resources/clock.js` (~L79-84)
- `src/ecs/resources/clock.js` (~L71-77)

**Problem:** On a backwards time jump (now < clock.lastFrameTime), tickClock detects isTimeRegression, zeroes frameTime, and — by design at L79-84 — does NOT update clock.lastFrameTime ('stick to last known good'). But it never resynchronizes the baseline downward either, so lastFrameTime stays pinned at the old (higher) timestamp, and every subsequent frame keeps computing a negative delta (regression), returning 0 steps, until wall-clock time organically climbs back above the stale baseline. The simulation is frozen for the entire regression gap. (Self-recovers once wall time exceeds the stale baseline, so 'permanently' is overstated; trigger requires a non-monotonic time source — the primary rAF/performance.now() path is spec-monotonic, so it only bites with the Date.now() fallback or an injected nowProvider.)
**Impact:** If the now-source regresses (mixed rAF vs performance.now(), a clock adjustment, or a host/test environment feeding a lower timestamp), gameplay silently freezes for hundreds of ms with no recovery signal. The rAF loop keeps painting so it looks alive but the player can't move. resyncBaseline only fires on discrete resume/start/visibility/blur/focus events, none triggered by a mid-play backward jump.

**Fix:** On a detected regression, resynchronize the baseline to the new (lower) timestamp instead of freezing, recovering on the next frame:
```js
if (isTimeRegression) {
  clock.lastFrameTime = timestamp;
  clock.realTimeMs = timestamp;
  frameTime = 0;
}
```
before the existing forward-only update guard.

**Tests to add:** Unit test: advance the clock forward, then feed a strictly-decreasing timestamp followed by a couple of timestamps still below the old baseline; assert that after at most one frame tickClock resumes returning >=1 steps and lastFrameTime tracks the new (lower) now, rather than staying pinned and returning 0 indefinitely.

---

### BUG-03: Event queue is drained twice per frame; the rAF-loop drain is dead when audio is registered, masking a real ordering coupling ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: A (Tickets: D-01, C-07)
- `src/main.ecs.js` (~L441-451)
- `src/game/bootstrap.js` (~L137-163)
- `src/adapters/io/audio-integration.js` (~L302-308)

**Problem:** The gameplay event queue is drained in two places per frame. The audio-cue-system (registered LAST in the render phase) calls the audio runner which drains the queue (audio-integration.js L308) during runRenderCommit inside bootstrap.stepFrame. Then the rAF loop in main.ecs.js (L446-451) calls drain(eventQueue) AGAIN after stepFrame returns; because audio already drained it, the second drain returns the empty singleton — dead in the wired runtime. Its stated 'safety net' purpose is only real in a headless config that omits the audio system. (Not unconditionally dead: runner.tick() returns early when context.audio is falsy, and during the async-bootstrap window before setAudioAdapter the rAF drain is the live safety net — strengthening the fragility point.) This couples queue-lifetime correctness to render-phase registration order, which is fragile and undocumented as a hard dependency.
**Impact:** No current data loss, but brittle: if audio-cue-system is reordered earlier, removed, or another event-emitting render system is appended after it, events would be lost or accumulate unbounded with the 'safety net' drain a no-op. The single-drain-point determinism contract in the event-queue docstring becomes effectively dependent on render ordering rather than a real sync point.

**Fix:** Pick one canonical drain site. Preferred: do NOT drain inside the audio cue runner; have the audio system only read (peek, non-clearing) and keep the single authoritative drain in the rAF loop (main.ecs.js). Alternatively remove the rAF-loop drain, document that audio-cue-system is the canonical per-frame drain that MUST remain last in the render phase, and add a registration-order assertion. Either way, make the single drain point explicit and enforced.

**Tests to add:** Integration test that runs a full bootstrap.stepFrame (with audio registered) on a frame that emits events, then asserts the queue is empty AND the rAF-loop drain returns an empty array. Add a guard test asserting audio-cue-system is the last-registered render-phase system.

---

### BUG-04: drain() returns a frozen shared empty singleton; any consumer that mutates the drained array throws on empty frames ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L79-104)

**Problem:** On an empty frame, drain() returns the module-level Object.freeze([]) singleton (_EMPTY_DRAIN, L80-83, 104). On a non-empty frame it returns the live internal buffer (ownership swap, L95-100), which callers may mutate freely. The two return paths therefore have inconsistent mutability contracts: a consumer that does any in-place mutation (sort, push, splice — e.g. to merge or post-process events) works on non-empty frames but throws TypeError on empty frames because the singleton is frozen. The docstring only warns callers not to RETAIN references across frames; it does not warn that the empty result is frozen and shared. (Purely defensive today — both current consumers, main.ecs.js:449 which discards the return and audio-integration.js:308-333 which only iterates read-only, never mutate the array, so the TypeError is never triggered.)
**Impact:** Latent crash/inconsistency: a future or test consumer that mutates the drained array passes for many frames then throws intermittently exactly on empty-queue frames (the common case during menus, pauses, or quiet gameplay). Inside a system tick this would be caught by the dispatch quarantine boundary (silently skipping the consumer); in the rAF-loop drain path it would be caught by the outer try/catch and count toward the fault budget. Either way it is a hard-to-trace, frame-data-dependent fault.

**Fix:** Make both return paths share the same mutability contract. Simplest: return a fresh `[]` on the empty path (negligible alloc cost, safe default), or document the frozen-singleton contract explicitly and ensure all consumers treat the drained array as read-only. If preserving the zero-alloc optimization, also freeze the non-empty result for symmetry, or have consumers copy before mutating.

**Tests to add:** Unit test asserting drain() on an empty queue returns an array supporting the same operations as drain() on a non-empty queue (e.g. both accept .push / .sort without throwing), or explicitly asserting and documenting that the empty result is read-only and consumers never mutate the drained buffer.

---

### BUG-05: timer-system evaluates expiry before the game-state guard, relying entirely on FSM transition validity to avoid firing GAME_OVER outside PLAYING ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: C (Tickets: C-02)
- `src/ecs/systems/timer-system.js` (~L172-178)
- `src/ecs/systems/timer-system.js` (~L122-131)

**Problem:** In timer-system.update, expireIfNeeded() is called at L172 BEFORE the `gameStatus.currentState !== GAME_STATE.PLAYING` early-return at L176. expireIfNeeded → expireTimer attempts a GAME_OVER transition whenever remainingSeconds <= 0, guarded only by canTransition(gameStatus, GAME_OVER). Today this is safe purely because VALID_TRANSITIONS only allows PLAYING→GAME_OVER, so a stale 0-timer in MENU/PAUSED/LEVEL_COMPLETE is silently blocked. This is correctness-by-coincidence: the system's own state-gating is in the wrong order, and the safety depends on an external FSM table rather than the system's intent ('only expire during active play').
**Impact:** Currently no incorrect transition occurs, but the ordering is a latent trap: if the transition table is ever widened (e.g. to allow PAUSED→GAME_OVER for a future feature) the timer would spuriously end the game from a paused/non-playing state on a frame where the logic phase runs with remainingSeconds already at 0. It also runs unnecessary work and a redundant emit-once callback path on non-playing frames.

**Fix:** Move the PLAYING guard above the first expireIfNeeded call so the timer only evaluates expiry while actively playing: return early when `gameStatus?.currentState !== GAME_STATE.PLAYING` right after ensureTimerResource/setResource, then decrement and check expiry. Keep the canTransition guard as defense-in-depth, not as the primary gate.

**Tests to add:** Unit test: set levelTimer.remainingSeconds = 0 with activeLevel matching the loader and gameStatus in PAUSED (and separately LEVEL_COMPLETE), run timer-system.update, assert gameStatus stays unchanged AND no GameOver event is emitted — then add a regression test that would fail if PAUSED→GAME_OVER were ever added, proving the system gates on its own PLAYING check rather than the transition table.

---

## 2) Dead Code & Unused References

### DEAD-01: src/ symbols exported but imported by no module (redundant public API surface), several falsely listed as 'Public API' ⬆ LOW
**Origin:** 2. Dead Code & Unused References (DEAD-MULTI-04, DEAD-C-03)
**Files:** Ownership: A/B/C/D (Tickets: n/a)
- `src/game/bootstrap.js` (~L767)
- `src/debug/replay.js` (~L24)
- `src/debug/replay.js` (~L252)
- `src/debug/replay.js` (~L268)
- `src/ecs/resources/map-resource.js` (~L370)
- `src/ecs/systems/bomb-tick-system.js` (~L384)
- `src/ecs/systems/player-move-system.js` (~L178)
- `src/ecs/systems/player-move-system.js` (~L204)
- `src/adapters/io/input-adapter.js` (~L50)
- `src/adapters/io/input-adapter.js` (~L64)
- `src/adapters/dom/hud-adapter.js` (~L74)
- `src/adapters/dom/hud-adapter.js` (~L82)
- `src/adapters/dom/hud-adapter.js` (~L90)

**Problem:** Cross-referencing every named export in src/ against all import statements in src/ and tests/ shows symbols that are `export`ed but never imported anywhere (used only internally within their own file): registerSystemsByPhase (bootstrap.js L767), serializeWorldState/hashWorldState/ReplayInputAdapter (replay.js L24/L252/L268), validateMapSchema (map-resource.js L370), createBombDetonationRequest (bomb-tick-system.js L384), startMoveTowardDirection/stopAtCurrentTarget (player-move-system.js L178/L204), KEYBOARD_CODE_BINDINGS/KEYBOARD_KEY_BINDINGS (input-adapter.js L50/L64), and formatLives/formatScore/formatTimer (hud-adapter.js L74/82/90). The three hud-adapter format* functions additionally carry stale JSDoc '@internal Exported for tests only; not part of the adapter public API' — but no test imports them; the only hud-adapter test importers use createHudAdapter and ARIA_LIVE_THROTTLE_MS only. Several symbols are advertised in file-header 'Public API' blocks (replay.js, input-adapter.js, player-move-system.js) yet nothing consumes that 'API'. Biome has no cross-module dead-export rule so this slips through `npm run check`. Ownership by path: bootstrap.js+replay.js=Track A; map-resource.js=Track D; bomb-tick-system.js+player-move-system.js+input-adapter.js=Track B; hud-adapter.js=Track C.
**Impact:** Inflated, partly mislabeled public API surface. False 'Public API' / 'Exported for tests only' claims mislead maintainers about which symbols are extension points and discourage safe internal refactors (renaming/inlining appears risky). Low functional impact since the code paths are exercised internally, but it is genuine redundant API surface.

**Fix:** For each symbol, drop the `export` keyword (it stays callable internally) and remove it from the file-header 'Public API' list and the stale hud-adapter 'Exported for tests only' JSDoc — unless it is a deliberate test/extension hook, in which case add the importing test to justify the export. Keep ARIA_LIVE_THROTTLE_MS exported as-is. Concretely un-export registerSystemsByPhase, serializeWorldState, hashWorldState, ReplayInputAdapter, validateMapSchema, createBombDetonationRequest, startMoveTowardDirection, stopAtCurrentTarget, KEYBOARD_CODE_BINDINGS, KEYBOARD_KEY_BINDINGS, formatLives, formatScore, formatTimer, and trim the corresponding header API lines.

**Tests to add:** Strengthen tests/unit/dead-code/exports.test.js into a real cross-module export guard: for each src module, assert it exports only symbols imported somewhere in src/ or tests/ (or an allowlist of intentional extension points), catching future export drift automatically.

---

### DEAD-02: Three exported PR-checklist constants in policy-utils.mjs are dead and document an unimplemented contract ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: n/a)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L24-55)

**Problem:** REQUIRED_SECTIONS (L25), REQUIRED_CHECKBOXES (L36), and REQUIRED_LAYER_CHECKBOXES (L48) are exported and prefaced with the comment 'Checklist sections must stay in sync with docs/implementation/pr-template.md contract enforcement.' A repo-wide grep shows they are referenced nowhere — not imported by run-checks.mjs (which imports 30+ other symbols from this module), not used internally, not used in tests. The PR-template contract enforcement they were created for does not exist in any gate script. Root cause: the checker that was supposed to consume these arrays was never implemented or was removed, leaving the data and its 'must stay in sync' comment as dead config that misleads maintainers into thinking PR sections/checkboxes are enforced.
**Impact:** Dead exported data with a false provenance comment. Maintainers updating docs/implementation/pr-template.md will keep these arrays 'in sync' for an enforcement path that does not run, wasting effort and creating a false sense that PR checklist completeness is gated. Inflates the module's public API surface.

**Fix:** Either (preferred) wire these constants into a PR-checklist validator in run-checks.mjs so the documented contract is actually enforced, or delete the three exports plus the 'must stay in sync' comment (policy-utils.mjs L24-55). If kept temporarily, drop the `export` keyword and the sync comment until a consumer exists.

**Tests to add:** If wired into a validator, add a unit test asserting a PR body missing a REQUIRED_SECTIONS entry fails the checklist gate. If deleted, extend tests/unit/dead-code/exports.test.js to assert policy-utils.mjs does not export REQUIRED_SECTIONS/REQUIRED_CHECKBOXES/REQUIRED_LAYER_CHECKBOXES.

---

### DEAD-03: exports.test.js dead-code guard only locks 3 historical removals; does not cover the live redundant-export surface ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: n/a)
- `tests/unit/dead-code/exports.test.js` (~L1)

**Problem:** tests/unit/dead-code/exports.test.js is named/structured as the project's dead-code guard but only asserts three narrow historical facts: POWER_UP_TYPE absent from constants.js (DEAD-35), skills-lock.json untracked (DEAD-36), generate_reports.py absent (DEAD-37). All three currently pass, but the test does not actually detect new dead exports. The 13 redundant exports in DEAD-01 and the dead policy-utils exports in DEAD-02/DEAD-04 all coexist with this 'green' guard, demonstrating it does not enforce what its directory/name imply.
**Impact:** False sense of dead-code coverage. The suite reports a passing dead-code guard while real redundant/dead exports accumulate undetected, which is how the DEAD-01 surface drifted back in after the prior cleanup.

**Fix:** Expand exports.test.js (or add a sibling) to do an actual cross-module sweep: enumerate named exports under src/, grep for an importer in src/ or tests/, and fail on any export with zero importers outside an explicit allowlist. This converts the guard from a 3-item regression lock into a living dead-export detector.

**Tests to add:** A generated cross-module export-usage assertion: enumerate src/ named exports, fail when any has zero importers in src/ or tests/ (modulo an intentional-extension-point allowlist).

---

### DEAD-04: Exported getCurrentBranchName() in policy-utils.mjs is never called anywhere ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: n/a)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L899)

**Problem:** getCurrentBranchName() (L899) is an exported thin wrapper that simply returns resolveBranchName(). A repo-wide grep finds exactly one occurrence — its own definition. No gate script and no test imports or calls it. Callers that need the branch use resolveBranchName() directly (7 places), so this wrapper is orphaned dead code.
**Impact:** Redundant public API and dead code in the most-imported policy module. Minor maintenance and review overhead; provides no value over resolveBranchName().

**Fix:** Delete the function (policy-utils.mjs L899-901). Callers already use resolveBranchName() directly.

**Tests to add:** Add a case to tests/unit/dead-code/exports.test.js asserting policy-utils.mjs does not export getCurrentBranchName.

---

### DEAD-05: Orphaned, mid-sentence comment left in run-all.mjs ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: A (Tickets: n/a)
- `scripts/policy-gate/run-all.mjs` (~L155)

**Problem:** Line 155 of run-all.mjs is a truncated, dangling comment: '// The describePolicyResolution call was removed from here because run-checks.mjs' — the sentence ends abruptly with no rationale completing it. It documents a deletion that already happened and the explanation is cut off, so it conveys no actionable information. (It is also internally misleading: describePolicyResolution is in fact still imported at L12 and called at L240 in the same file.) AGENTS.md requires comments to explain the 'why', which this one fails to do.
**Impact:** Misleading/incomplete code comment in a governance-critical script. A reader cannot tell what run-checks.mjs supposedly does instead, and the comment looks like an editing accident, reducing trust in the surrounding logic.

**Fix:** Either complete the sentence (e.g. '...because run-checks.mjs now prints the resolution context itself, avoiding duplicate logs') or delete the orphaned comment at run-all.mjs L155.

**Tests to add:** None (comment hygiene).

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Six live source files have no track-owner pattern in policy-utils.mjs (ownership-policy drift) ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** implementation-plan.md / agentic-workflow-guide ownership: 'Ownership stays by track; phase sequencing controls implementation order' and policy-utils.mjs TRACK_OWNERSHIP_RULES must mirror track-a..d.md; AGENTS.md CI Governance: 'MUST enforce merge gates'.
**Files:** Ownership: A (Tickets: A-01, ARCH-01, D-10, C-09, C-05)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L315-449)
- `src/ecs/systems/hud-system.js`
- `src/ecs/systems/hud-render-system.js`
- `src/ecs/systems/player-animation-system.js`
- `src/ecs/systems/screens-system.js`
- `src/adapters/dom/audio-loading-indicator.js`
- `src/security/trusted-types.js`

**Problem:** TRACK_OWNERSHIP_RULES in policy-utils.mjs does not cover six files that are checked in on main and wired into the runtime. Running findOwnershipViolations() against any of them on a ticket branch returns them as violations because no pattern (and none of SHARED_OWNERSHIP_PATTERNS) matches. Track D patterns only list ghost-animation-*.js and render-*.js, so player-animation-system.js is unowned even though track-d.md L212 explicitly assigns it to D-10. Track C patterns only match src/adapters/dom/screens-*.js and src/ecs/systems/scoring|timer|life|spawn|pause|level-progress-*.js, so the HUD systems (actually at src/ecs/systems/hud-*.js) and the render-phase screens-system are unowned. src/security/** has no pattern at all. Root cause: ownership rules were not updated as ARCH-01/D-10/C-09 files landed, so the policy gate drifted out of sync with the track docs and the actual tree.
**Impact:** Any non-bugfix/non-integration ticket branch that touches these files fails the ownership gate, so the only way to edit core HUD/animation/screens/security/audio-loading code is to route everything through bugfix-/integration- bypass branches (which also skip ticket-format and ownership checks — see CI-07). This defeats the per-track ownership model for a large slice of the live codebase. (The check runs only on a ticket branch's changed-files diff, not on main, so the existing tree is fine; it false-positives only when a future ticket-scoped branch edits one of these files.)

**Fix:** Add the missing patterns to TRACK_OWNERSHIP_RULES so the policy mirrors the track docs — Track C: add 'src/ecs/systems/hud-*.js', 'src/ecs/systems/screens-*.js', 'src/adapters/dom/audio-loading-*.js'; Track D: add 'src/ecs/systems/player-animation-*.js' (or broaden 'ghost-animation-*' to '*-animation-*'); Track A: add 'src/security/**'. Then add a policy-utils unit test asserting every file under src/ enumerated on disk matches at least one ownership or shared pattern, so future drift fails CI.

**Tests to add:** policy-utils.test.js: walk src/ recursively and assert findOwnershipViolations across the union of A/B/C/D never leaves any src file unowned.

---

### ARCH-02: Render-intent buffer capacity (MAX_RENDER_INTENTS=425) is smaller than the world entity capacity (EntityStore default 550) ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** implementation-plan.md §5 Render Intent: buffer 'pre-allocated once (new Array(MAX_RENDER_INTENTS)) and reused every frame' and the audit requirement that 'MAX_RENDER_INTENTS must accommodate the max entity capacity declared in constants.js'; AGENTS.md Rendering/Pooling: 'MUST preallocate or pool transient entities'.
**Files:** Ownership: D (Tickets: D-04, D-01, A-02)
- `src/ecs/resources/constants.js` (~L221-226)
- `src/ecs/world/entity-store.js` (~L11)
- `src/game/bootstrap.js` (~L275-281)

**Problem:** MAX_RENDER_INTENTS evaluates to 425 (POOL_GHOSTS 4 + POOL_MAX_BOMBS 5 + POOL_FIRE 85 + POOL_PELLETS 130 + 1 + 200). EntityStore defaults maxEntities to a hardcoded literal 550 in entity-store.js (no MAX_ENTITIES constant exists in constants.js). render-collect-system emits one intent per renderable entity plus scans the full collider store for bombs/fires; if a World is constructed directly (new World()) with the 550 default rather than through bootstrap (which coincidentally clamps maxEntities to MAX_RENDER_INTENTS via normalizeEntityCapacity), more renderable entities than 425 silently drop intents (appendRenderIntentDirect early-returns on overflow), so sprites vanish. The two capacity sources are unlinked and can drift independently.
**Impact:** Latent rendering-correctness/contract bug: render intents can be silently dropped for any world whose entity capacity exceeds 425, and the canonical 'max entity capacity' the contract references does not live in constants.js as the contract assumes. The only thing preventing overflow today is bootstrap's incidental clamp of maxEntities down to MAX_RENDER_INTENTS, which itself means the world can hold fewer entities than EntityStore advertises (550). (Manifests only via direct new World() with the 550 default, not the clamped bootstrap path.)

**Fix:** Declare a single MAX_ENTITIES constant in constants.js, derive EntityStore's default and MAX_RENDER_INTENTS from it (MAX_RENDER_INTENTS >= MAX_ENTITIES, or document and assert the relationship), and remove the magic 550 from entity-store.js. Add a unit assertion that MAX_RENDER_INTENTS >= the world's max entity capacity.

**Tests to add:** constants.test.js: expect(MAX_RENDER_INTENTS).toBeGreaterThanOrEqual(MAX_ENTITIES) once MAX_ENTITIES is centralized.

---

### ARCH-03: Input is snapshotted once per rAF frame (meta phase), not once per fixed simulation step ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md Input Rules: 'Snapshot Determinism: MUST snapshot input state once per fixed simulation step and consume snapshot data in systems.' implementation-plan.md: 'World snapshots input once per fixed simulation step and systems consume only that snapshot.'
**Files:** Ownership: A (Tickets: B-02, A-02, A-03)
- `src/ecs/systems/input-system.js` (~L57-59)
- `src/game/bootstrap.js` (~L1026-1043)
- `src/ecs/world/world.js` (~L454-491)

**Problem:** input-system declares phase: 'meta'. bootstrap.stepFrame calls world.runMeta() exactly once (L1026) before the fixed-step catch-up loop, then runs world.runFixedStep N times (L1034-1043) for the accumulator. runMeta drains the input adapter (getHeldKeys + drainPressedKeys) and writes the inputState component once per rAF frame; all N catch-up fixed steps then read the same frozen snapshot. This is a once-per-frame snapshot, not once-per-fixed-step. For edge-triggered actions (bomb/pause/confirm) the press flag stays 1 across every catch-up step in the frame (runFixedStep skips 'meta' and 'render'). The literal MUST ('once per fixed simulation step') is therefore not satisfied.
**Impact:** Determinism/replay risk: a recorded run and a replayed run that batch fixed steps into frames differently sample input at different simulation boundaries, so hashWorldState can diverge under throttling/catch-up. The bomb consumer happens to be idempotent (placeBombForPlayer guards on hasActiveBombAtTile and maxBombs) and pause toggle being drained once per frame is desirable, so practical breakage is limited today — but the architecture does not structurally meet the per-fixed-step snapshot invariant, and any future per-step-sensitive action (e.g. tap-to-step movement) would misbehave during catch-up.

**Fix:** Move input snapshotting into the per-fixed-step path (run input-system at the head of each runFixedStep, e.g. as the first 'physics'/'logic' system or via a dedicated pre-step hook) so each fixed step consumes a freshly sampled snapshot, OR formally amend AGENTS.md/implementation-plan to define the contract as once-per-frame and document that edge actions are intentionally frame-scoped. Keep pause/confirm edge semantics frame-scoped regardless.

**Tests to add:** Deterministic replay test that forces a multi-step catch-up frame and asserts input is re-sampled per fixed step (or, if the contract is amended, that edge actions are applied exactly once per frame).

---

## 4) Code Quality & Security

### SEC-01: Policy-gate 'var declaration' security-sink rule only matches line-leading var, missing inline/for-loop forms ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: A (Tickets: Policy-gate (Track A: scripts/**))
- `scripts/policy-gate/lib/policy-utils.mjs` (~L122)
- `scripts/policy-gate/check-forbidden.mjs` (~L26-48)

**Problem:** The forbidden-tech enforcement for the AGENTS.md MUST-NOT-use-var rule uses pattern /^\s*var\s+[A-Za-z_$][\w$]*/m, which only matches when `var` is the first non-whitespace token on a line. Common real forms — `for (var i=0;...)`, an inline `var` after another statement (`const x=1; var y=2;`), or `var` inside a single-line function body — are NOT detected. Biome's `recommended` ruleset does not explicitly enable noVar, so the lint backstop is partial: a module-top-level non-line-leading `var` escapes both noInnerDeclarations and the policy gate. The gate's pass message ('Forbidden scan passed') would falsely certify such a file.
**Impact:** An AGENTS.md MUST ('MUST NOT use var') could be violated and merged without the security gate flagging it. No current `var` usages exist (scan is green), so impact is latent enforcement weakness, not an active defect.

**Fix:** Broaden the rule to a word-boundary, non-line-anchored regex, e.g.
```js
{ name: 'var declaration', pattern: /(^|[^.\w])var\s+[A-Za-z_$]/ }
```
(the leading non-dot/non-word guard avoids matching identifiers like `myvar`). Optionally also explicitly enable Biome `style/noVar: 'error'` in biome.json as defense-in-depth.

**Tests to add:** Add a unit test for SECURITY_SINK_RULES asserting the var rule matches `for (var i…)`, `;var x`, and inline `var` in a function body, while NOT matching `myvar`/`varietal`/`evar`.

---

### SEC-02: Critical bootstrap failure re-throws into an unhandled rejection because the unhandledrejection handler is installed after the throwable await ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: A (Tickets: Engine bootstrap (Track A: src/main.ecs.js, src/main.js))
- `src/main.ecs.js` (~L636)
- `src/main.ecs.js` (~L810)
- `src/main.ecs.js` (~L825-831)
- `src/main.js` (~L15)

**Problem:** bootstrapApplication() is async. It `await loadDefaultMaps()` at L636 (map load + schema/semantic validation, a critical path). On failure it correctly reaches the outer catch (~L825), calls renderCriticalError(overlayRoot, error) — so the AGENTS.md 'critical errors MUST be user-visible' requirement IS satisfied — but then re-throws at L831. installUnhandledRejectionHandler is only invoked at L810, i.e. AFTER the awaited throwable section and inside the same try; and the top-level caller startBrowserApplication() in main.js:15 has no `.catch`. So a critical map-load/validation failure yields an uncaught promise rejection the app's own handler is not yet positioned to intercept. (Domain tag 'security' is a misnomer — this is an error-handling robustness nit.)
**Impact:** Low: the user-visible error overlay is still rendered before the re-throw, so the hard requirement is met. The leftover is a noisy uncaught-rejection in the console at startup and reliance on the browser default rather than the app's handler. No crash of an already-running loop (loop hasn't started yet).

**Fix:** Either install the unhandledrejection handler at the very top of bootstrapApplication (before the first await), or add a `.catch()` at the call site in main.js (startBrowserApplication().catch(err => { /* already rendered; swallow to avoid uncaught rejection */ })). Installing the handler first is preferable so async preload failures route through renderCriticalError consistently.

**Tests to add:** Add a bootstrap test that makes loadDefaultMaps reject, asserting renderCriticalError is called AND no unhandledrejection escapes (handler installed before the first await).

---

## 5) Tests & CI Gaps

### CI-01: Production deploy workflow runs no e2e, integration, coverage, schema, or policy gate before publishing ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-07, A-09)
- `.github/workflows/deploy.yml` (~L51-67)

**Problem:** deploy.yml triggers on push to main and publishes to GitHub Pages after running only 'Run Biome Lint / Format Check' (npm run check) and 'Run Unit Tests' (npm run test:unit), then 'Build with Vite'. It never runs integration tests, Playwright e2e, coverage thresholds, JSON-schema validation, or the policy gate. The Policy Gate workflow that does run those (policy-gate.yml) is gated on `pull_request` only. So any merge/push to main that reaches deploy — including a fast-forward or admin push that skips PR review — ships to production without e2e/integration/coverage/schema verification. AGENTS.md ('MUST enforce merge gates (check and tests); when scripts are present CI MUST also enforce coverage and dependency lockfile policies (with SBOM)') and the phase-testing Done Criteria ('npm run ci and npm run policy pass cleanly') are not enforced on the path that actually deploys.
**Impact:** A regression caught only by e2e/integration/coverage (a broken pause loop, a failing audit browser spec, an invalid map/manifest, a coverage drop) can be deployed to production GitHub Pages undetected. The build step (npm run build) also exercises the strict PRODUCTION_CSP, which no e2e spec validates because the Playwright webServer runs `npm run dev` (development CSP). (In the normal PR-merge flow policy-gate.yml does run all gates on the PR before merge, so the gap is conditional on bypassing PR review — defense-in-depth.)

**Fix:** Add the full quality suite to deploy.yml before the Build step, or require the Policy Gate as a branch-protection status check on main. Minimal fix: insert steps running `npm run test:coverage`, `npm run validate:schema`, `npx playwright install --with-deps chromium`, and `npm run test:e2e` (or simply `npm run ci`) ahead of 'Build with Vite'. Also add a `push: branches: [main]` trigger to policy-gate.yml (or mark it a required check) so the gate runs on merge, not only on PR open/sync.

**Tests to add:** Add to deploy.yml a 'Run Full CI Suite' step (`npm run ci`, or explicit test:coverage + validate:schema + test:e2e with Playwright browser install) gating the build; and either add `push: { branches: [main] }` to policy-gate.yml or configure main branch protection to require the Policy Gate check.

---

### CI-02: Playwright config sets no worker cap / fullyParallel guard — root cause of the 3 known flaky timing e2e tests ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06, A-09)
- `playwright.config.js` (~L29-44)
- `tests/e2e/stress/race-condition.spec.js` (~L33)
- `tests/e2e/audit/audit.browser.spec.js` (~L265)

**Problem:** playwright.config.js defines testDir, timeout, retries (1 in CI), launchOptions, and webServer, but never sets `workers`, `fullyParallel`, or `forbidOnly`. With 14 e2e spec files, Playwright defaults to running multiple spec FILES concurrently (workers ≈ CPU/2). The three documented flaky tests — AUDIT-B-05 long-task perf, AUDIT-F-13 ghost-house release timing, and the pause/resume simTime race-condition stress — are all wall-clock/rAF-timing-sensitive and fail under suite contention but pass in isolation. Running CPU-bound rAF perf assertions concurrently with other browser specs starves the frame budget and inflates long-task/frame-time measurements, exactly the contention symptom recorded in project memory. AGENTS.md requires determinism/testability to outrank performance, and the perf acceptance criteria assume an uncontended sample.
**Impact:** Flaky CI: the perf and ghost-timing audit gates intermittently fail on shared runners despite the product being correct, eroding trust in the audit suite and risking either false red builds or normalization-of-deviance (ignoring real perf regressions). The single CI retry masks rather than fixes the contention. (Mechanism of 'rAF perf starvation by concurrent specs' is reasonable inference rather than directly measured.)

**Fix:** Pin determinism for the timing-sensitive suites. Either set `workers: 1` globally in CI (simplest, given the small suite and inherently serial rAF perf), or move the perf/timing specs (audit.browser.spec.js perf tests, tests/e2e/stress/*, the AUDIT-F-13 stagger test) into a dedicated Playwright project with `fullyParallel: false` and `workers: 1`, leaving the rest parallel. Also add `forbidOnly: !!process.env.CI` so a stray test.only can't silently shrink the CI run.

**Tests to add:** Add `workers: process.env.CI ? 1 : undefined` (or a serial Playwright project for perf/timing specs) and `forbidOnly: Boolean(process.env.CI)` to playwright.config.js; verify the three flaky specs pass green across repeated CI runs.

---

### CI-03: Coverage thresholds are global-aggregate only; runtime entry main.ecs.js sits at ~70-72% and is masked ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-04, A-05, A-08)
- `vitest.config.js` (~L18-23)
- `src/main.ecs.js` (~L1)

**Problem:** vitest.config.js declares a single global thresholds block (branches 85, functions 85, lines 90, statements 90) with no per-file/per-directory floors. The largest source file, src/main.ecs.js (835 lines, the runtime boot + system-registration + audio/preload wiring), reports statements 82.66, branches 72.65, functions 70.83, lines 82.43 — far below the global lines/statements floor. The global aggregate (All files: 93.5/85.84/95.08/93.49) is dominated by hundreds of small, fully-covered ECS files, so the under-tested runtime wiring passes. Global branch coverage is also only 85.84 vs the 85 floor — a 0.84-point margin, so a small future change to a low-coverage file can flip CI red for reasons unrelated to that change. The boot/runtime-integration path is precisely the code the P3/P4 'runtime wiring' tickets added and where audit-relevant integration bugs hide.
**Impact:** Untested branches in the actual app entrypoint (system registration order, audio preload wiring, error/visibility handlers) are not gated, while the headline coverage number looks healthy. The razor-thin global branch margin makes the gate brittle. Nothing is broken today but the gate under-protects the boot wiring.

**Fix:** Add per-file (or per-glob) thresholds for the runtime entry and adapters, e.g. thresholds['src/main.ecs.js'] = { branches: 70, functions: 70 } as an explicit floor and raise over time, plus a 'perFile: true' or 100-style floor for the leaf ECS modules. Alternatively add dedicated unit/integration tests for main.ecs.js boot wiring (lines ~782,788-807) to lift it above the global floor with real margin.

**Tests to add:** Add per-file coverage thresholds in vitest.config.js for src/main.ecs.js and src/adapters/io/audio-adapter.js (~83.5%), and add boot-path unit/integration tests covering the uncovered main.ecs.js wiring lines so the runtime entry is genuinely gated.

---

### CI-04: INTEGRATION/BUGFIX branch patterns bypass ownership + ticket-format gates, and only WARN ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-07)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L181)
- `scripts/policy-gate/run-checks.mjs` (~L67-72)

**Problem:** isBugfixBranch (BUGFIX_BRANCH_PATTERN /^[A-Za-z0-9._-]+\/bugfix-[A-Za-z0-9._-]+$/) and isIntegrationBranch (INTEGRATION_BRANCH_PATTERN /^[A-Za-z0-9._-]+\/integration[A-Za-z0-9._-]*$/) set bypassOwnershipMode=true, which short-circuits the track-ownership check and the strict <owner>/<TRACK>-<NN> ticket-format requirement, emitting only a GATE_WARN ('relaxed policy checks allowing multitrack edits'). The integration pattern is especially loose: the trailing slug is optional ([A-Za-z0-9._-]*), so a branch named simply '<owner>/integration' matches. This is a standing CI-governance hole (also recorded in project memory) that the audit category 'CI Governance: MUST enforce merge gates' is supposed to close. (Blast radius is narrower than 'any author': the owner prefix must be a REGISTERED dev in OWNER_TRACK_MAPPING — ekaramet/asmyrogl/chbaikas/medvall — so it is a trusted single-track owner self-escalating to cross-track edits, not an arbitrary outsider; security/forbidden-tech/header/lockfile/traceability gates still run as hard FAILs on bypass branches.)
**Impact:** Track-ownership and ticket-format enforcement — a core P-phase governance gate — is trivially bypassable by branch naming, and the bypass is a warning, not a failure. Cross-track changes by a registered owner can merge without the per-track review the workflow assumes, weakening the traceability the audit relies on.

**Fix:** Tighten INTEGRATION_BRANCH_PATTERN to require a non-empty slug and restrict the bypass to a known integration owner (e.g. /^(ekaramet)\/integration-[A-Za-z0-9._-]+$/). Keep security, forbidden-tech, header, lockfile, and traceability gates as hard FAILs on bypass branches, but require an explicit approval/label for ownership relaxation rather than auto-granting on name match. At minimum, log the bypass as a tracked annotation and require the integration branch to still carry a ticket ID.

**Tests to add:** Extend tests/unit/policy-gate/policy-utils.test.js to assert '<owner>/integration' (no slug) is NOT a bypass branch under the tightened regex, and that an unauthorized owner on an integration/bugfix branch still fails ownership; add a run-checks contract test that bypass branches still hard-fail on a forbidden-tech / cross-track-ownership violation.

---

### CI-05: Ticket-tracker phase summary contradicts the authoritative ticket index (D-10/D-11 Done vs pending; C-09/C-10 status) ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-13, A-14)
- `docs/implementation/ticket-tracker.md` (~L78)

**Problem:** The P4 phase summary (L78) lists 'D-10 ⏳, D-11 ⏳' and 'C-09 ⏳ ... C-10 ⏳', but the authoritative Ordered Tickets index marks D-10 and D-11 as [x] (Done) at L164-165 and C-09/C-10 as [-] (In Progress) at L161-162. Rule 4 of the tracker states it is the canonical source for status that policy checks and phase gating must follow, yet the file disagrees with itself (the Summary Snapshot at L38 also says 'In Progress: 0' while two tickets are [-]). Compounding this, audit-traceability-matrix.md marks AUDIT-B-05 (runtime preload = C-09) and the C-10 audio-manifest row as 'Executable' while C-09/C-10 are still [-] In Progress and explicitly 'A-13 sign-off pending'. The phase-testing report also mis-cites 'AUDIT-B-01' for the High-Scores localStorage check, which audit-question-map assigns assertionKey 'raf-active' (project-runs-quickly), and docs/audit.md says High Scores is a C-05 deliverable, not a graded audit question.
**Impact:** Phase-gating and any policy/traceability automation that reads status from the tracker (the matrix says 'Automated policy checks should read requirement coverage from this matrix') can derive contradictory completion state. An auditor cannot tell whether D-10/D-11/C-09/C-10 are actually done, undermining the P3→P4 gate (A-13) and the 'Executable only after passing artifacts exist' rule.

**Fix:** Reconcile ticket-tracker.md: make the P4 phase-summary statuses match the Ordered Tickets index (set D-10/D-11 to the same state in both places; resolve C-09/C-10 to a single status). In audit-traceability-matrix.md, downgrade the AUDIT-B-05 and C-10 rows from 'Executable' to 'Planned/Pending' until A-13 sign-off lands (per the matrix's own rule). Fix the phase-testing-report High-Scores reference from AUDIT-B-01 to the C-05 deliverable tracking entry.

**Tests to add:** Add a docs-consistency unit test (vitest) that parses ticket-tracker.md and asserts the P4 phase-summary status symbols equal the corresponding Ordered-Tickets [ ]/[-]/[x] markers, and that no audit-traceability-matrix row is marked 'Executable' for a ticket whose tracker status is not [x].

---

### CI-06: e2e gate uses --pass-with-no-tests, so a zero-spec collection passes CI silently ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06, A-07)
- `package.json` (~L24)

**Problem:** test:e2e is 'playwright test tests/e2e --pass-with-no-tests' and test:audit:e2e is 'playwright test tests/e2e/audit --pass-with-no-tests'. The CI path (policy-gate.yml → npm run policy → policy:quality → run-project-gate.mjs) runs test:e2e as the browser gate. With --pass-with-no-tests, any misconfiguration that causes Playwright to collect zero specs (wrong testDir/testMatch, a path typo, PLAYWRIGHT_IGNORE_AUDIT inadvertently set, or a future restructure) exits 0 and the e2e gate passes having run nothing. The flag is intended to tolerate the optional audit-only subset, but applying it to the whole-suite test:e2e removes the safety net that CI actually executed browser specs. (Latent: today the suite collects 12 non-audit specs plus audit specs and PLAYWRIGHT_IGNORE_AUDIT is never set in CI, so CI genuinely runs browser specs now.)
**Impact:** The browser audit gate (pause invariants, input behavior, F-17/F-18/B-05 perf, no-canvas DOM contract, ghost-stagger) could become a no-op without any red signal, defeating AGENTS.md's MUST 'maintain end-to-end/integration verification coverage for every question in docs/audit.md'.

**Fix:** Remove --pass-with-no-tests from the whole-suite test:e2e (keep specs always present) and instead assert a minimum count. Either drop the flag entirely, or add a guard step in CI that fails if Playwright reports 0 tests, e.g. `playwright test tests/e2e --list | grep -q .` before the run.

**Tests to add:** Drop --pass-with-no-tests from test:e2e; add a CI assertion (e.g. `test -n "$(npx playwright test tests/e2e --list)"`) that fails when zero browser specs are collected.

---

### CI-07: audit.e2e.test.js (the vitest 'audit' suite) only inventories IDs/thresholds — no behavioral audit assertion lives there ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-06)
- `tests/e2e/audit/audit.e2e.test.js` (~L47)

**Problem:** audit.e2e.test.js asserts only meta-properties: the 27-ID inventory and category split (20/3/4), that every question has a non-empty assertionKey string, that F-17/F-18/B-05 threshold constants equal the canonical table, that the manual-evidence manifest entries/artifacts exist, and static package.json/asset-tree shape gates. None execute game behavior — assertionKey is only checked to be a non-empty string, never dispatched to a real assertion. All real behavioral audit verification lives in audit.browser.spec.js (Playwright). That is acceptable by design, but the matrix and several REQ rows cite 'tests/e2e/audit/audit.e2e.test.js' as the Test/Evidence Anchor for behavioral questions (e.g. REQ-01/REQ-02/REQ-09 'no frame drops', 'rAF correctly', 'pause unaffected'), overstating what that file proves. If a future refactor deleted audit.browser.spec.js or removed its CI invocation, this suite would still pass and the matrix would still point at it.
**Impact:** The traceability matrix attributes behavioral coverage to an inventory-only test, creating a false sense that those audit IDs are behaviorally gated by audit.e2e.test.js. A loss of the Playwright browser spec would not be caught by the suite the matrix names.

**Fix:** Update the matrix anchors for behavioral functional IDs (F-01/F-02/F-10/F-17/F-18 etc.) to cite tests/e2e/audit/audit.browser.spec.js (the file that actually asserts behavior), reserving audit.e2e.test.js as the 'inventory/threshold/manifest contract' anchor. Optionally add a guard in audit.e2e.test.js that asserts audit.browser.spec.js exists and references each Fully/Semi-Automatable assertionKey, so the inventory test fails if the browser coverage file is removed.

**Tests to add:** Add a check in audit.e2e.test.js asserting tests/e2e/audit/audit.browser.spec.js exists and contains a test referencing each Fully/Semi-Automatable audit ID; correct the matrix Test/Evidence anchors to point behavioral IDs at the browser spec.

---

### CI-08: Manual-evidence sign-offs labelled 'Phase 2 MVP' gate a P3 codebase; audit.e2e.test.js only checks file existence ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: A (Tickets: A-09, A-13)
- `docs/audit-reports/manual-evidence.manifest.json` (~L88)
- `tests/e2e/audit/audit.e2e.test.js` (~L99)
- `docs/audit-reports/evidence/AUDIT-B-06.overall.md` (~L1)

**Problem:** The Manual-With-Evidence audit IDs (F-19 paint, F-20 layers, F-21 promotion, B-06 overall) are 'enforced' solely by audit.e2e.test.js checking that manifest entries and artifact paths exist (fs.existsSync) — it never checks recency or that the evidence reflects the audited build. The B-06 sign-off note reads 'Phase 2 MVP ready. PASS.' and all four sign-offs are dated 2026-06-06, while the codebase is now P3 feature-complete plus in-flight P4. (Note: the evidence docs themselves DO cover the P3 elements — F-19/F-20/F-21 explicitly include ghost/bomb/fire/power-up paint regions, layers, and promotion policy with a D-10 addendum — so the original 'evidence no longer describes the build' thesis is overstated; what genuinely remains is the stale 'Phase 2 MVP' prose label and the existence-only test rigor gap.)
**Impact:** A misleading 'Phase 2 MVP' label persists on sign-offs for a project well past Phase 2, and the manual audit gate passes on mere file existence rather than any recency/content check, so stale evidence would not fail closed.

**Fix:** Update sign-off notes to reference P3 not 'Phase 2 MVP' and bump manifest dates. Strengthen audit.e2e.test.js to assert each entry's signOff.date is not older than a declared 'evidence-valid-as-of' marker (or compare against the latest commit touching src/) so stale evidence fails closed rather than passing on existence alone.

**Tests to add:** Add a freshness assertion to audit.e2e.test.js comparing each signOff.date against a tracked evidence-validity date (or the newest src/ commit), failing if evidence predates the audited feature set; correct the 'Phase 2 MVP' label to P3.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | A | level-progress-system VICTORY block is unreachable under freeze semantics; 'Victory' event never emitted so sfx-victory never plays |
| BUG-02 | BUG-02 | — | — | — | — | D | tickClock pins lastFrameTime on a backward time jump, freezing the sim until wall time re-crosses the stale baseline |
| BUG-03 | BUG-03 | — | — | — | — | A | event queue drained twice per frame; rAF-loop drain dead when audio registered, coupling queue lifetime to render-phase order |
| BUG-04 | BUG-04 | — | — | — | — | D | drain() returns a frozen shared singleton on empty frames vs a mutable buffer otherwise — inconsistent mutability contract |
| BUG-05 | BUG-05 | — | — | — | — | C | timer-system checks expiry before the PLAYING guard; safe only because the FSM table blocks GAME_OVER outside PLAYING |
| DEAD-01 | — | DEAD-MULTI-04, DEAD-C-03 | — | — | — | A/B/C/D | 13 src/ symbols exported but imported nowhere (incl. stale hud-adapter format* 'for tests only' exports); inflated/mislabeled API surface |
| DEAD-02 | — | DEAD-A-01 | — | — | — | A | three PR-checklist constants in policy-utils.mjs are unused and carry a false 'must stay in sync' enforcement comment |
| DEAD-03 | — | DEAD-A-05 | — | — | — | A | dead-code guard test only locks 3 historical removals; does not detect the live redundant-export surface |
| DEAD-04 | — | DEAD-A-02 | — | — | — | A | exported getCurrentBranchName() wrapper has zero callers; resolveBranchName() is used directly everywhere |
| DEAD-05 | — | DEAD-A-06 | — | — | — | A | truncated mid-sentence comment at run-all.mjs L155 conveys no rationale and looks like an editing accident |
| ARCH-01 | — | — | ARCH-01 | — | — | A | six live wired src files (HUD/animation/screens/audio-loading/security) match no track-owner pattern; policy drifted from track docs |
| ARCH-02 | — | — | ARCH-02 | — | — | D | MAX_RENDER_INTENTS (425) < EntityStore default capacity (550); unlinked sources can silently drop render intents |
| ARCH-03 | — | — | ARCH-03 | — | — | A | input snapshotted once per rAF frame (meta phase) not per fixed step; violates per-step snapshot determinism contract |
| SEC-01 | — | — | — | SEC-01 | — | A | policy-gate var-ban regex is line-anchored; for-loop/inline/module-top var escapes both gate and Biome lint |
| SEC-02 | — | — | — | SEC-03 | — | A | unhandledrejection handler installed after the throwable map-load await; critical bootstrap failure escapes as uncaught rejection |
| CI-01 | — | — | — | — | CI-01 | A | deploy.yml publishes to Pages after only lint+unit; e2e/integration/coverage/schema/policy run only on pull_request |
| CI-02 | — | — | — | — | CI-02 | A | playwright.config sets no workers/fullyParallel/forbidOnly; suite contention is the root cause of 3 known flaky timing specs |
| CI-03 | — | — | — | — | CI-04 | A | coverage is global-aggregate only; runtime entry main.ecs.js (~70-72%) is masked and the global branch margin is 0.84pt |
| CI-04 | — | — | — | — | CI-07 | A | <owner>/integration & <owner>/bugfix-* branches bypass ownership+ticket gates with only a warning (registered owners) |
| CI-05 | — | — | — | — | CI-06 | A | ticket-tracker P4 summary contradicts the canonical Ordered Tickets index on D-10/D-11/C-09/C-10; matrix marks unfinished rows Executable |
| CI-06 | — | — | — | — | CI-03 | A | test:e2e --pass-with-no-tests lets a zero-spec collection pass the browser gate silently |
| CI-07 | — | — | — | — | CI-08 | A | matrix cites inventory-only audit.e2e.test.js as behavioral anchor; actual behavior is asserted only in the Playwright browser spec |
| CI-08 | — | — | — | — | CI-05 | A | manual-evidence sign-offs carry stale 'Phase 2 MVP' labels for a P3 build; manifest gate checks only file existence |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
_None — no Blocking or Critical findings after verification._

### Phase 2 — High Severity (immediate follow-up)
_None._

### Phase 3 — Medium Severity
1. **CI-01**: Run full CI suite before deploy (Track A)
2. **CI-04**: Tighten integration/bugfix bypass gates (Track A)
3. **ARCH-01**: Add missing track-owner patterns (Track A)
4. **ARCH-02**: Centralize and link entity capacity (Track D)
5. **ARCH-03**: Snapshot input per fixed step (Track A)
6. **CI-02**: Pin Playwright workers and forbidOnly (Track A)
7. **CI-03**: Add per-file coverage thresholds (Track A)
8. **CI-05**: Reconcile ticket-tracker status (Track A)
9. **BUG-01**: Emit Victory event from game-flow (Track A)

### Phase 4 — Low Severity (maintenance)
1. **BUG-02**: Resync clock baseline on regression (Track D)
2. **BUG-03**: Choose one canonical drain site (Track A)
3. **BUG-04**: Make drain return mutability consistent (Track D)
4. **BUG-05**: Guard timer expiry behind PLAYING (Track C)
5. **SEC-01**: Broaden var-ban regex (Track A)
6. **SEC-02**: Install rejection handler before await (Track A)
7. **CI-06**: Drop e2e pass-with-no-tests flag (Track A)
8. **CI-07**: Fix matrix behavioral test anchors (Track A)
9. **CI-08**: Refresh stale Phase-2 evidence labels (Track A)
10. **DEAD-01**: Un-export unimported src symbols (Track A/B/C/D)
11. **DEAD-02**: Wire or delete PR-checklist constants (Track A)
12. **DEAD-03**: Make dead-code guard a real sweep (Track A)
13. **DEAD-04**: Delete orphaned getCurrentBranchName (Track A)
14. **DEAD-05**: Fix dangling run-all.mjs comment (Track A)

---

## Notes

- Confirmed-safe / intentional patterns (do NOT 'fix'): clock.js 'stick to last known good time' on regression is intentional and locked by an existing single-frame test (clock.test.js:112-117); only the multi-frame freeze of BUG-02 is unguarded. The render/meta-phase applyDeferredMutations flushes (world.js L409/450/490) are the DELIBERATE accepted fix for prior CRITICAL finding BUG-15 (entity-slot leak) — no render/meta system enqueues structural ops today and the flush no-ops on an empty queue; reverting it would reintroduce the leak.
- The integration/bugfix branch bypass (CI-04) still requires a REGISTERED owner prefix (ekaramet/asmyrogl/chbaikas/medvall) and leaves all non-ownership gates — security boundaries, forbidden-tech APIs, source-header, lockfile/SBOM, traceability — running as hard FAILs; only ownership + ticket-format checks are relaxed, and only to a warning.
- ARCH-01 ownership drift is latent on main: the ownership check runs only against a ticket branch's changed-files diff, not the existing tree, so it false-positives only when a future ticket-scoped branch edits one of the six unowned files. ARCH-02 overflow and BUG-02 freeze likewise only manifest off the production-wired path (direct new World() / non-monotonic clock).
- No current data loss or crash exists for any Low bug: BUG-03/BUG-04 are quality/contract hazards whose only consumers today are read-only or discard the result; BUG-05's unsafe ordering is masked by the FSM transition table; SEC-01's var gap has zero current `var` usages; SEC-02 still renders the user-visible critical-error overlay before the uncaught rejection.
- DEAD-C-03 (stale hud-adapter format* 'exported for tests only' JSDoc) was merged into DEAD-01 (DEAD-MULTI-04), which already enumerated those three functions and explicitly delegated them — same underlying redundant-export issue, so they are reported as one finding spanning Tracks A/B/C/D. All other findings were one-to-one across domains with no cross-domain duplicates.
- 3 raw findings were dropped during adversarial verification as unconfirmed/false-positive: ARCH-04 (render-phase applyDeferredMutations — proposed reverting a previously-fixed CRITICAL leak; contract not actually violated), ARCH-05 (bugfix/integration bypass 'masks a large unowned tree' — premise refuted; only ~10% of src is unowned and the bypass is intended/tested), and SEC-02-raw (trusted-types.js 'unowned therefore weakenable' — inverted; the file is over-guarded/deny-by-default, flagged as a violation for every track, not editable-without-objection).
- Severity calibration: no Blocking or Critical findings remain after verification; the highest live severity is Medium (8 findings). Track ownership is overwhelmingly Track A (governance/CI/bootstrap), with isolated Track D (clock, render-intent, event-queue, map schema) and Track C (timer) items.

### Findings dropped during adversarial verification

The following raw findings were raised by a finder agent but **refuted** by an independent verifier that re-opened the cited code. They are recorded for transparency and are **not** counted in the totals above:

- **ARCH-04** (arch, claimed Low): applyDeferredMutations runs in render-phase commit, allowing structural mutation outside the once-per-fixed-step sync point
  - _Refuted:_ The cited code facts are accurate: world.js lines 409 (runFixedStep), 450 (runRenderCommit), and 490 (runMeta) each call applyDeferredMutations(), and no render/meta-phase system currently enqueues structural ops (only the logic-phase ghost-release-system in bootstrap.js:760 calls deferSetEntityMask). However, the interpretation that this is a defect is contradicted by the codebase's own design. These exact flushes were the DELIBERATE, accepted fix for prior finding BUG-15 (rated CRITICAL, marked DONE in docs/audit-reports/phase-2/audit-report-p2-track-a-2026-06-10.md L32-36): without them, structural ops deferred by render/meta systems sit in #pendingStructuralOps forever, leaking entity slots. ARCH-04 effectively proposes reverting that fix. The 'one sync point per tick' contract (implementation-plan.md L144/L163: 'deferred to a sync point after system execution') is NOT violated: runFixedStep/runRenderCommit/runMeta are independent dispatch phases at independent cadences (orchestrated in bootstrap.js stepFrame L1026-1060), each with exactly one post-dispatch flush; applyDeferredMutations no-ops on an empty queue (world.js:352), so the render/meta flushes do not double-apply simulation ops. No current bug exists and the suggested 'fix' would reintroduce a previously-fixed CRITICAL leak. Not a real, currently-present issue.
- **ARCH-05** (arch, claimed Low): Bugfix/integration branch ownership bypass lets any registered owner edit any track's files, masking ARCH-01 drift
  - _Refuted:_ Code mechanics cited are accurate: policy-utils.mjs:159/181 patterns match verbatim; resolvePrPolicyPath:706 merges isBugfixMode||isIntegrationMode into effectiveBugfixMode -> BUGFIX mode; in run-checks.mjs bypassOwnershipMode (bugfix||integration) makes assertTrackOwnership (l.284) and assertOwnerScopedOwnership (l.327) skip ownership entirely; integration pattern is broad (test asserts isIntegrationBranch('chbaikas/integration')===true). However this is NOT a present-state issue/drift: the bypass is intentional, documented (header l.7-16) and explicitly unit-tested in tests/unit/policy-gate/policy-utils.test.js (l.383-410), still requires a registered owner prefix, and leaves all non-ownership gates (security boundaries, forbidden APIs, traceability, lockfile) running. The finding's load-bearing premise — that it masks ARCH-01 by leaving 'a large part of the live tree' unowned — is contradicted by the actual ownership rules (TRACK_OWNERSHIP_RULES:315-449): HUD/screens/animation/storage/audio/security ARE assigned to tracks C/D. I ran matchesOwnership over all 62 git-tracked src files: only 6 (~10%) match no pattern (audio-loading-indicator.js, hud-render-system.js, hud-system.js, player-animation-system.js, screens-system.js, security/trusted-types.js). So 'routinely circumvented for a large part of the live tree' is overstated. Refuting because the substantive harm cannot be reproduced; it is an intended, narrowly-scoped, tested design tradeoff. Severity Low at most.
- **SEC-02** (security, claimed Low): src/security/trusted-types.js is unowned by any track ownership pattern in the policy gate
  - _Refuted:_ Factual substrate reproduced: src/security/trusted-types.js is checked in, is live prod code (imported by src/main.js:12), and resolves to UNOWNED against all four TRACK_OWNERSHIP_RULES (A/B/C/D) plus SHARED_OWNERSHIP_PATTERNS (policy-utils.mjs:297-449); comparison files resolve as cited (main.ecs.js->A, map-resource.js->D, storage-adapter.js->C); track-a.md also omits src/security. HOWEVER the security claim is inverted. I ran the actual gate logic (findOwnershipViolations in run-checks.mjs:303/358): ownership is deny-by-default — a changed file is a VIOLATION unless it matches the active track's patterns or SHARED. Because no track owns src/security/**, editing trusted-types.js on a normal (non-bugfix/non-integration) track branch is flagged as an ownership violation for EVERY track (empirically verified: A/B/C/D all report it as a violation). So the asserted weakness ('any owner could weaken/delete the policy and the ownership gate would not object on scope grounds') is the opposite of reality — the file is over-guarded, not unguarded; the strict TT policy CSP control is not made editable-without-objection by this gap. The genuine residual is a minor governance/workflow nit (the 'each track fixes the ones they own' phase-end assignment has no assigned owner for this file), which is a non-security cleanup, not the security control weakness described. Core load-bearing claim refuted; refute.

---

*End of report.*
