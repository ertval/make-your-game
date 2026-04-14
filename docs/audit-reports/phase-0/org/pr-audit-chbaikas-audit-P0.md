# Codebase Analysis & Audit Report - P0

**Date:** 2026-04-13
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P0/P1 handoff — consolidated codebase audit across runtime, architecture, security, and test/CI surfaces

---

## Methodology

Five analysis passes were executed across the repository:
1. **Bugs & Logic Errors** — reviewed `src/main.ecs.js`, `src/game/**`, `src/ecs/resources/**`, and runtime tests for state-transition, restart, timing, and map-load behavior.
2. **Dead Code & Unused References** — scanned source and policy scripts for redundant branches and stale claims.
3. **Architecture, ECS Violations & Guideline Drift** — checked the implementation against `AGENTS.md`, `docs/requirements.md`, `docs/game-description.md`, `docs/audit.md`, and track/ticket docs.
4. **Code Quality & Security** — inspected DOM sinks, CSP/Trusted Types posture, browser-boundary handling, and workflow parity.
5. **Tests & CI Gaps** — ran local checks and compared actual executable coverage to the traceability and audit docs.

Executed evidence:
- `npm ci` ✅
- `npm run test:unit` ✅
- `npm run test:integration` ✅
- `npm run test:audit` ✅
- `npm run ci` ✅
- `npm run policy -- --require-approval=false` ✅
- `npm run policy:repo` ✅
- `npm run build` ✅
- `npm run test:e2e` ❌ after elevated retry: Playwright browsers are not installed in a fresh checkout

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 2 |
| 🔴 Critical | 3 |
| 🟠 High | 3 |
| 🟡 Medium | 2 |
| 🟢 Low / Info | 2 |

**Top risks:**
1. Restart flow can reset the clock with an undefined timestamp and destabilize simulation timing.
2. Level progression and map-load failure paths can enter `PLAYING` with invalid or terminal state handling.
3. The repo claims audit automation coverage that does not exist yet in executable form.
4. Browser E2E validation is not runnable from a clean checkout because Playwright browsers are not provisioned.
5. Governance/process docs are drifting: workflow parity and ticket dependency sources disagree.

---

## 1) Bugs & Logic Errors

### BUG-01: Restart resets the clock with an undefined wall-clock baseline ⬆ Blocking
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track A / D (Tickets: A-03, D-01)
- `src/game/bootstrap.js` (~L79-L82)
- `src/ecs/resources/clock.js` (~L132-L135)

**Problem:** `createBootstrap()` wires `onRestart` to `resetClock(clock, clock.realTimeMs)`, but the clock record created by `createClock()` does not expose `realTimeMs`; it only stores `lastFrameTime`, `simTimeMs`, `accumulator`, `alpha`, and `isPaused`.

**Impact:** Restart can set `clock.lastFrameTime` to `undefined`, which then poisons subsequent `tickClock()` frame delta math and can freeze or desynchronize the loop.

**Fix:** Reset against a known finite timestamp from the runtime boundary, not a non-existent clock field. The restart callback should receive `performance.now()`/`getNow()` and call `resetClock(clock, finiteNow)`.

**Tests to add:** Integration test that calls restart and then advances the runtime one frame, asserting finite `lastFrameTime`, finite `steps`, and monotonic `simTimeMs`.

---

### BUG-02: Final level completion never transitions to `VICTORY` ⬆ Critical
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/game/game-flow.js` (~L96-L105)
- `src/game/level-loader.js` (~L113-L121)

**Problem:** In the `LEVEL_COMPLETE` branch, `startGame()` always calls `advanceLevel()` and then forces a transition to `PLAYING`. When the current level is already the final level, `advanceLevel()` returns `null`, but the code still transitions back into gameplay instead of `VICTORY`.

**Impact:** Clearing the last level cannot reach the required victory path from `docs/game-description.md`; the game re-enters gameplay with no valid next-level progression.

**Fix:** Check the return value of `advanceLevel()`. If it returns `null`, transition to `GAME_STATE.VICTORY` and keep simulation paused until the victory flow proceeds.

**Tests to add:** Unit and integration tests for final-level clear -> `VICTORY`, plus Playwright coverage once the browser suite is operational.

---

### BUG-03: Start flow can enter `PLAYING` even when map loading fails ⬆ Critical
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track A / D (Tickets: A-03, D-03)
- `src/game/game-flow.js` (~L81-L93)
- `src/game/level-loader.js` (~L90-L103)

**Problem:** `startGame()` transitions to `PLAYING` before verifying that `levelLoader.loadLevel()` returned a valid map. `loadLevel()` also commits the resource to the world even when the resolved map is `null`.

**Impact:** The runtime can report an active playing state while the world has a missing map resource, which is a fail-open startup path for every downstream gameplay system.

**Fix:** Load and validate the target map first, then transition to `PLAYING` only when the load succeeded. Preserve the previous world resource on failure instead of writing `null`.

**Tests to add:** Failed-load start test asserting the game remains outside `PLAYING` and surfaces a critical failure path.

---

### BUG-04: `loadLevel()` commits the new level index before the load succeeds ⬆ High
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track A / D (Tickets: A-03, D-03)
- `src/game/level-loader.js` (~L90-L103)

**Problem:** `currentLevelIndex` is updated before `resolveMapForLevel()` is known to have succeeded.

**Impact:** A failed load can leave level bookkeeping ahead of the actual loaded resource, which makes restart/advance logic inconsistent after an error.

**Fix:** Resolve into a temporary next index and next map, then commit both only after the map is valid.

**Tests to add:** Unit test that simulates a failed next-level load and asserts the current index remains unchanged.

---

### BUG-05: Out-of-bounds map coordinates are treated as readable grid cells ⬆ High
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L393-L406)
- `src/ecs/resources/map-resource.js` (~L436-L470)
- `src/ecs/resources/map-resource.js` (~L494-L495)

**Problem:** `getCell()`, `setCell()`, `isWall()`, `isPassable()`, `isPassableForGhost()`, and `isGhostHouseCell()` perform no bounds checks before indexing the flat or 2D grid.

**Impact:** Movement and collision code can misclassify out-of-range cells near map edges, and malformed coordinates can produce silent logic corruption instead of deterministic rejection.

**Fix:** Add an `isInBounds(map, row, col)` helper and make all public grid-query helpers treat out-of-bounds as blocked or invalid.

**Tests to add:** Negative-index and overflow-index tests for passability, wall checks, and mutation rejection.

---

### BUG-06: Frame probe reports the maximum sampled frame as “latest” ⬆ Low
**Origin:** Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L53-L62)
- `src/main.ecs.js` (~L74-L87)

**Problem:** `getStats()` sorts all recorded deltas and then reports `values[values.length - 1]` as `latestFrameTime`. That is the largest frame time in the sample, not the most recently recorded one.

**Impact:** Runtime telemetry and future performance diagnostics will misreport current frame health.

**Fix:** Track the latest delta separately from percentile sorting, or reconstruct it from the ring-buffer cursor.

**Tests to add:** Unit test with non-monotonic frame deltas verifying that `latestFrameTime` differs from the maximum sample when appropriate.

---

## 2) Dead Code & Unused References

### DEAD-01: `createSyncMapLoader()` has a redundant `restart` branch ⬆ Low
**Origin:** Dead Code & Unused References
**Files:** Ownership: Track A / D (Tickets: A-03, D-03)
- `src/game/level-loader.js` (~L59-L64)

**Problem:** The `if (options.restart)` branch and the default return path both execute `cloneMap(baseMap)`. The option flag currently has no effect.

**Impact:** The branch adds surface area without behavior and can mislead future implementers into assuming restart-specific loader semantics already exist.

**Suggested action:** Collapse the branch into a single `return cloneMap(baseMap);` until restart needs distinct behavior.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: P1/P2 implementation gates are structurally incomplete, so many audit questions are still impossible to satisfy ⬆ Critical
**Origin:** Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` requires explicit automated/manual verification coverage for every audit question and preserved gameplay/HUD/pause behavior.
**Files:** Ownership: Track B / C / D / A (Tickets: D-06, B-03, D-07, D-08, D-09, C-01 through C-06, A-11)
- `src/adapters/dom/.gitkeep`
- `src/ecs/systems/.gitkeep`
- `docs/implementation/track-d.md` (~L121-L197)
- `docs/implementation/track-c.md` (~L120-L139)
- `docs/implementation/ticket-tracker.md` (~L81-L99)

**Problem:** The repo still lacks the renderer adapter, movement system, render-collect system, render-dom system, HUD/screens adapters, and audio adapter that the track docs define as the next required runtime surfaces.

**Impact:** Audit IDs tied to visible board rendering, movement, pause UI, HUD metrics, layer evidence, and runtime audio are not just unverified; they are structurally unimplementable in the current checkout.

**Suggested architectural fix:** Keep these items explicitly marked as not yet satisfiable in the matrix and phase report, and avoid language that implies executable audit coverage before the implementation surfaces exist.

---

### ARCH-02: Canonical ticket dependency sources disagree on `C-06` readiness ⬆ Medium
**Origin:** Architecture, ECS Violations & Guideline Drift
**Violated rule:** `AGENTS.md` says `AGENTS.md` is normative, while implementation docs must stay synchronized and resolve ambiguities against canonical sources.
**Files:** Ownership: Track A / C (Tickets: A-11, C-06)
- `docs/implementation/track-c.md` (~L120-L124)
- `docs/implementation/ticket-tracker.md` (~L99)

**Problem:** `track-c.md` says `C-06` depends on `A-01` and `D-01`, while the authoritative tracker adds `A-11` as an extra prerequisite.

**Impact:** Teams can plan work differently depending on which document they read, which is already causing confusion around whether Track C can begin.

**Suggested architectural fix:** Normalize the dependency set in both documents and state whether `A-11` is a hard technical prerequisite or only a phase gate.

---

## 4) Code Quality & Security

### SEC-01: Production CSP / Trusted Types posture is missing from the actual app entrypoint ⬆ High
**Origin:** Code Quality & Security
**Files:** Ownership: Track D / A (Tickets: D-06, A-07)
- `index.html` (~L1-L16)
- `docs/implementation/track-d.md` (~L131-L135)

**Problem:** The shipped HTML entrypoint has no CSP meta/header setup, no Trusted Types rollout, and no visible production hook for enforcing safe sink policy beyond code conventions.

**Impact:** The repo relies entirely on developer discipline and policy scans; it does not yet implement the documented browser-enforced security posture.

**Suggested fix:** Add a production CSP strategy and document the Vite-dev exception explicitly. If Trusted Types cannot be enforced yet, track that gap explicitly in the implementation and deployment docs.

---

### SEC-02: GitHub and Gitea policy workflows are no longer equivalent ⬆ High
**Origin:** Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07 / process governance)
- `.github/workflows/policy-gate.yml` (~L48-L51)
- `.gitea/workflows/policy-gate.yml` (~L48-L51)

**Problem:** The GitHub workflow runs `npm run policy -- --require-approval=false`, while the Gitea workflow still runs `--require-approval=true`.

**Impact:** CI behavior diverges across platforms, which breaks the repository rule in the PR audit prompt that workflow parity must hold.

**Suggested fix:** Make the workflow files identical again and document the reason for the chosen `require-approval` mode in one place.

---

## 5) Tests & CI Gaps

### CI-01: Audit automation is inventory-only, but the matrix claims broader executable coverage than actually exists ⬆ Blocking
**Origin:** Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06, A-09)
- `tests/e2e/audit/audit.e2e.test.js` (~L1-L26)
- `docs/implementation/audit-traceability-matrix.md` (~L28-L30, ~L63-L94, ~L101-L103)

**Problem:** The only audit test currently executed is an inventory count over `AUDIT_QUESTIONS`. It does not assert gameplay, performance, or browser behavior for any audit question. The matrix simultaneously claims that `tests/e2e/audit/audit.e2e.test.js` is the test anchor for all 27 audit IDs, and also references a `runAuditAssertion(question)` placeholder that does not exist in the repository.

**Impact:** Audit traceability currently overstates executable verification. Teams can incorrectly believe audit automation exists because `npm run test:audit` passes.

**Concrete fix:** Replace the inventory-only test with explicit assertion-backed audit specs or rename it to reflect that it is a metadata integrity check only. Update the matrix to distinguish inventory coverage from executable coverage.

---

### CI-02: Browser E2E suite is not runnable from a clean checkout because Playwright browsers are missing ⬆ Critical
**Origin:** Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L22-L27, ~L42-L49)
- `playwright.config.js` (~L3-L19)

**Problem:** `npm run test:e2e` fails in a fresh environment with `browserType.launch: Executable doesn't exist ... Please run npx playwright install`. The repository installs `@playwright/test`, but it does not provision browser binaries as part of setup or CI preflight.

**Impact:** Browser-level verification is effectively absent unless every environment performs undocumented extra setup.

**Concrete fix:** Add a documented `playwright install` step to onboarding/CI, or wire a bootstrap script that guarantees browsers are present before the E2E suite runs.

---

### CI-03: Playwright tests use fixed sleeps instead of state-driven synchronization ⬆ Medium
**Origin:** Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/game-loop.pause.spec.js` (~L21, ~L29, ~L38)

**Problem:** The pause E2E spec relies on three `page.waitForTimeout(200)` calls.

**Impact:** This makes the suite sensitive to machine speed, browser startup variance, and future runtime timing changes. The PR audit verifier explicitly flags fixed waits as a flakiness smell.

**Concrete fix:** Replace static timeouts with state-driven waits, for example `waitForFunction()` on frame count changes and paused snapshot invariants.

---

### CI-04: `test:e2e` and `test:audit` names suggest deeper validation than they provide ⬆ Medium
**Origin:** Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L20-L24)
- `tests/e2e/audit/audit.e2e.test.js` (~L1-L26)
- `docs/implementation/audit-traceability-matrix.md` (~L26-L31)

**Problem:** `test:audit` sounds like audit-behavior verification but currently runs only the audit inventory test. `test:e2e` runs just two browser specs, both around the game loop bootstrap, not the audit question set.

**Impact:** Script names and docs create false confidence about the verification depth.

**Concrete fix:** Either broaden the suites to match their names or rename/split them into `test:audit-metadata`, `test:e2e:runtime`, and eventual `test:e2e:audit`.

---

## Recommended Fix Order

1. Fix restart timing and level-progression fail-open paths (`BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`).
2. Correct audit/coverage truthfulness (`CI-01`, `CI-04`) so the repo stops overstating verification status.
3. Restore browser verification operability (`CI-02`) and remove fixed-wait flakiness (`CI-03`).
4. Re-sync governance docs and workflows (`ARCH-02`, `SEC-02`).
5. Add bounds safety and telemetry correctness improvements (`BUG-05`, `BUG-06`, `DEAD-01`, `SEC-01`).

---

## Command Evidence Summary

- `npm ci`: PASS
- `npm run build`: PASS
- `npm run ci`: PASS
- `npm run test:unit`: PASS
- `npm run test:integration`: PASS
- `npm run test:audit`: PASS, but inventory-only
- `npm run policy -- --require-approval=false`: PASS
- `npm run policy:repo`: PASS
- `npm run test:e2e`: FAIL in a fresh environment due to missing Playwright browser binaries

