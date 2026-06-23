# Codebase Analysis & Audit Report - P3

**Date:** 2026-06-23
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for P3 Feature Complete + Hardening — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — runtime bugs, logic errors, race conditions, state transition failures, edge-case failures in `src/`.
2. **Dead Code & Unused References** — unused functions, exports, parameters, stale configuration, redundant API surface.
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundary breaches, structural integrity issues, guideline drift against AGENTS.md and canonical docs.
4. **Code Quality & Security** — unsafe sinks, forbidden tech, CSP/TT, data validation, error handling, DOM safety.
5. **Tests & CI Gaps** — missing test coverage, CI weaknesses, flaky patterns, audit verification gaps.

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 0 |
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 7 |
| 🟢 Low / Info | 16 |

**Top risks:**
1. CI pipeline does not run integration, e2e, coverage, or audit tests — regressions reach production undetected (CI-01, CI-02)
2. Playwright tests use fixed `waitForTimeout` calls causing flaky CI runs under throttling (CI-05)
3. Branch coverage 85.84% is 0.84% above 85% threshold with 4 files below target — no CI enforcement (CI-03, CI-04)
4. Architecture structurally intact — no simulation systems call DOM APIs; components are data-only (confirmed)
5. Security posture strong — zero unsafe sinks, fail-closed validation, production-hardened CSP (all SEC checks PASS)

---

## 1) Bugs & Logic Errors

No high-severity runtime bugs found. Codebase has been well-hardened through documented BUG-01 through BUG-23 fix branches. All known edge cases (non-finite timestamps, clock regression, accumulator epsilon clamp, stale handles, event queue ordering, pause resume baseline) have explicit guards with inline commentary.

### BUG-01: Ghost animation frame index shared across all ghosts ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/ghost-animation-system.js` (~L84)

**Problem:** `frameIndex` (walk-cycle frame selector) is a single module-scoped variable shared across ALL ghosts. In single-player with 4 ghosts this creates a uniform walk cycle — every ghost swaps frame at the exact same tick. Not a correctness bug (each ghosts direction is independent), but visually unnatural.

**Impact:** Visual — all ghosts synchronised on the same walk frame. Minor aesthetic issue.

**Fix:** Derive frame index per ghost using entity ID parity: `const frameIndex = (id & 1);` No timer needed — just alternate on entity ID.

**Tests to add:** Visual determinism test: all ghosts should eventually show both walk frames in a seeded run.

### BUG-02: Player animation direction ambiguity on combined zero-velocity ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/player-animation-system.js` (~L73-78)

**Problem:** When both `rowDelta === 0 && colDelta === 0`, spriteId is set to `WALK_FRAMES[lastDirection][0]`. But `lastDirection` is never re-evaluated — it persists from previous movement. If the player collides with a wall from one direction and starts moving in the opposite direction within the same tick, the idle sprite briefly shows the wrong facing direction.

**Impact:** Single-frame visual flicker on direction reversal. Hard to notice in normal gameplay.

**Fix:** Track `intendedDirection` from input-state component (separate from velocity) and use that for idle sprite facing.

**Tests to add:** Unit test: player stops facing direction of last non-zero input, not last velocity direction.

---

## 2) Dead Code & Unused References

### DEAD-01: `COLLIDER_TYPE.PELLET`, `POWER_UP`, `WALL` — Dead enum values ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/spatial.js` (~L42-44)

**What:** `COLLIDER_TYPE.PELLET(5)`, `POWER_UP(6)`, `WALL(7)` defined but zero references outside definition. Collision/explosion systems only match `PLAYER/GHOST/BOMB/FIRE`.

**Action:** Remove unused enum members. Retain `NONE=0`..`FIRE=4`.

### DEAD-02: `commandSucceeded()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L888)

**What:** Exported but never imported by any other script.

**Action:** Unexport or remove.

### DEAD-03: `getCurrentBranchName()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L899)

**What:** One-liner delegating to `resolveBranchName()`. Never imported externally.

**Action:** Unexport or inline.

### DEAD-04: `expandBaseRefCandidate()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L903)

**What:** Only called by `resolveBaseRef()` in same module.

**Action:** Unexport.

**Audit Verification (2026-06-23):** *FALSE POSITIVE*. The function `expandBaseRefCandidate` does not use the `export` keyword and is already private/local to `policy-utils.mjs`. No action required.

### DEAD-05: `normalizePolicyPath()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L609)

**What:** Never imported by any other script.

**Action:** Unexport or remove.

### DEAD-06: `escapeRegex()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L528)

**What:** Only used by `globToRegExp()` in same module.

**Action:** Unexport.

### DEAD-07: `globToRegExp()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L803)

**What:** Only used by `pathMatchesPattern()` in same module.

**Action:** Unexport.

**Audit Verification (2026-06-23):** *FALSE POSITIVE*. The function `globToRegExp` does not use the `export` keyword and is already private/local to `policy-utils.mjs`. No action required.

### DEAD-08: `pathMatchesPattern()` — Dead export ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L812)

**What:** Only used by `matchesOwnership()` in same module.

**Action:** Unexport.

### DEAD-09: `RENDER_INTENT_VERSION` — Dead export from production code ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-04)
- `src/ecs/resources/render-intent.js` (~L61)

**What:** Exported constant, zero `src/` consumers. Only `tests/unit/render-intent/render-intent.test.js` reads it.

**Action:** Remove production export or guard with `if (isDevelopment())`.

### DEAD-10: `KEYBOARD_CODE_BINDINGS` + `KEYBOARD_KEY_BINDINGS` — Unnecessary exports ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-02)
- `src/adapters/io/input-adapter.js` (~L50, L64)

**What:** Exported but never imported by any `src/` or `tests/` file. Only used internally.

**Action:** Unexport (remove `export` keyword).

### DEAD-11: `*_STORE_RUNTIME_STATUS` (4 objects) — Unnecessary exports ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B/D (Tickets: B-01, D-04)
- `src/ecs/components/spatial.js` (~L54)
- `src/ecs/components/actors.js` (~L51)
- `src/ecs/components/props.js` (~L52)
- `src/ecs/components/stats.js` (~L36)

**What:** Exported, documented as "test/tooling-only", only consumed by corresponding `tests/unit/components/*.test.js`. Inflates production bundle with data runtime never reads.

**Action:** Guard with `if (isDevelopment())` or export from a dedicated test-harness file.

### DEAD-12: `assets/source/visual/sprite-handoff.json` — Source-only tracked artifact ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A/D (Tickets: A-01, D-11)
- `assets/source/visual/sprite-handoff.json`

**What:** 6KB JSON referenced only in JSDoc comments. Not loaded at runtime.

**Action:** Keep as design document; relocate to `docs/`.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Player animation system mutable closure state ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** No explicit rule violation — observation of mutable system-internal state pattern
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/player-animation-system.js` (~L46-48)

**Problem:** `walkTimer`, `frameIndex`, `lastDirection` are mutable variables in the system factory closure. While not a component purity violation (these are system-internal), they make the system non-reentrant and stateful across frames.

**Impact:** Systems that rely on re-creation (test isolation) must recreate the factory. Not a production issue but a test-ergonomics concern.

**Fix:** Consider storing per-entity animation state in a dedicated animation component (pure data) rather than closure variables. Or document as intentional (system timer state).

### ARCH-02: Ghost animation system shared walk timer ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** No explicit rule violation — observation
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/ghost-animation-system.js` (~L83-84)

**Problem:** Same pattern as ARCH-01: `walkTimer` and `frameIndex` shared across all ghosts in closure.

**Impact:** All ghosts' walk cycles are synchronised to the same frame index. Visually unnatural.

**Fix:** Combine with BUG-01 fix: use entity-ID-based frame alternation.

### ARCH-03: Board sync system lazy snapshot allocation ⬆ LOW
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** Preallocation (AGENTS.md: "MUST preallocate or pool transient entities and corresponding DOM nodes")
**Files:** Ownership: Track D (Tickets: D-06)
- `src/ecs/systems/board-sync-system.js` (~L61-65)

**Problem:** `snapshot = new Uint8Array(grid)` is lazily allocated on first frame. AGENTS.md says preallocate rather than allocate on first use. The snapshot is a `Uint8Array` copy of the full map grid (~165 bytes); not a hot-path allocation, but technically violates preallocation guidance.

**Impact:** Minimal — one allocation on level start.

**Fix:** Pre-allocate snapshot in factory function when map dimensions are known, or document the lazy-init pattern with a comment acknowledging the trade-off.

**Audit Verification (2026-06-23):** *PARTIAL DRIFT*. The allocation of `new Uint8Array(grid)` is performed once per level load or game restart (at frame 0), not repeatedly in the active loop updates. Since it does not allocate transient entities or run repeated hot-path allocations, it complies with the spirit and performance goals of the preallocation rule.

### ARCH-04: Ownership policy drift — Track D owns `assets/maps/**` but Track A also owns it ⬆ INFO
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** File ownership boundary clarity
**Files:** 
- `scripts/policy-gate/lib/policy-utils.mjs` (~L319-322, L427-428)
- `docs/implementation/track-a.md` (~L5)
- `docs/implementation/track-d.md` (~L5)

**Problem:** Both Track A and Track D list `assets/maps/**` in their ownership patterns. Track A doc says "All visual assets (including map schemas/raw map assets) are co-owned by Track A and Track D." Policy enforces dual ownership — no violation, but creates ambiguity for PR ownership checks.

**Impact:** Low — co-ownership intended. No action needed but worth documenting.

### ARCH-05: Render-intent contract verified compliant ⬆ INFO
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** `src/ecs/resources/render-intent.js`

**Finding:** Buffer pre-allocated once (`new Array(MAX_RENDER_INTENTS)`), `classBits` bitmask used, `MAX_RENDER_INTENTS` matches constants. Contract honored.

### ARCH-06: Audit question structural coverage verified ⬆ INFO
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Finding:** All 27 audit questions (F-01 through F-21, B-01 through B-06) can be structurally satisfied:
- rAF loop active (F-02, F-10)
- No canvas (F-04)
- No frameworks (F-05)
- DOM-only rendering (F-19, F-20, F-21)
- Input via keydown/keyup (F-11, F-12)
- Pause with rAF active (F-07, F-08, F-09, F-10)
- HUD with timer/score/lives (F-14, F-15, F-16)
- ghost-ai-system implements all 4 personalities (F-13)

### ARCH-07: ECS boundary integrity verified clean ⬆ INFO

**Finding:** No simulation system imports or calls DOM APIs. No component stores DOM nodes/listeners/browser state. Adapters injected as World resources. Pooling uses `translate(-9999px)`, not `display:none`. Input cleared on `blur`/`visibilitychange`. All structural patterns verified compliant with AGENTS.md.

---

## 4) Code Quality & Security

### SEC-01: No unsafe sinks (PASS) ✅
**Files:** All `src/`
**Result:** Zero `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string-based timers.

### SEC-02: No forbidden tech (PASS) ✅
**Files:** All `src/`
**Result:** Zero canvas/WebGL/WebGPU API calls, zero framework imports, zero `var`/`require`/`XMLHttpRequest`.

### SEC-03: No inline event handlers (PASS) ✅
**Files:** `index.html`, all `src/`
**Result:** Zero `onclick=`/`onload=` attributes. All via `addEventListener`.

### SEC-04: CSP & Trusted Types (PASS) ✅
**Files:** `vite.config.js`, `index.html`, `src/security/trusted-types.js`
**Result:** Production CSP strict (`script-src 'self'`, `require-trusted-types-for 'script'`, `trusted-types default`). Dev relaxed for Vite HMR per AGENTS.md. Trusted Types default policy installed.

### SEC-05: Map/JSON validation — fail-closed (PASS) ✅
**Files:** `src/ecs/resources/map-resource.js`, `src/game/level-loader.js`
**Result:** `validateMapSchema()` + `validateMapSemantic()` — throws on any failure. Size pre-check at fetch level.

### SEC-06: Storage trust boundary — validated on read (PASS) ✅
**Files:** `src/adapters/io/storage-adapter.js`
**Result:** `safeRead()` wraps JSON.parse in try/catch, validates structure, per-field normalize, falls back to defaults.

### SEC-07: Critical errors user-visible (PASS) ✅
**Files:** `src/main.ecs.js`
**Result:** `renderCriticalError()` renders to `#overlay-error` via `textContent`, removes `is-screen-hidden`, sets `role="alert"`.

### SEC-08: Non-critical errors logged (PASS) ✅
**Files:** Throughout `src/`
**Result:** Audio adapter failures, storage read failures, missing clips all use `console.warn()` with silent fallback.

### SEC-09: System exceptions caught at dispatch boundary (PASS) ✅
**Files:** `src/ecs/world/world.js`
**Result:** Per-system `update()` wrapped in try/catch. Faulty system quarantined after threshold. Loop survives.

### SEC-10: Global `unhandledrejection` handler installed (PASS) ✅
**Files:** `src/main.ecs.js:294-311`
**Result:** `installUnhandledRejectionHandler()` called during bootstrap, guarded against double-install.

### SEC-11: DOM safety — textContent/attribute APIs (PASS) ✅
**Files:** All `src/`
**Result:** All DOM writes use `textContent`, `setAttribute`, `classList`, `createElement`. Zero HTML injection paths.

### SEC-12: Content-Length header not mandatory for size check ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L198-207)

**Problem:** Map size validation uses `Content-Length` header. If server omits it, check is skipped (falls through to `JSON.parse` then `createMapResource` schema validation). Not exploitable since schema validation catches malformed data and JSON.parse has O(n) memory/time in payload size, but defense-in-depth gap.

**Fix:** Read full response into a buffer and check byte length before parsing:
```js
const reader = response.body.getReader();
let totalBytes = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  totalBytes += value.length;
  if (totalBytes > MAX_MAP_SIZE_BYTES) throw new Error('Map too large');
}
```

---

## 5) Tests & CI Gaps

### CI-01: CI pipeline missing integration, E2E, coverage, and audit tests ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml` (~L64-87)

**Problem:** CI runs `npm run test:unit` but NOT `test:integration`, `test:e2e`, `test:coverage`, or `test:audit`. Integration breaks (cross-system interactions, adapter boundaries) go undetected until deploy. Coverage threshold regression invisible.

**Fix:** Add steps for `npm run test:integration`, `npm run test:coverage`, and `npx playwright test tests/e2e --pass-with-no-tests` to `policy-gate.yml`.

### CI-02: Deploy workflow also misses integration + e2e gates ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/deploy.yml` (~L56-59)

**Problem:** Deploy to GitHub Pages only runs `check` + `test:unit` before `vite build`. No integration, e2e, or audit tests. Broken gameplay ships to production.

**Fix:** Add `npm run test:integration` and `npm run test:e2e` before the build step in `deploy.yml`.

### CI-03: Policy gate does not enforce coverage threshold ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml` (no coverage step)
- `vitest.config.js` (~L20-25)

**Problem:** Coverage thresholds defined (85/85/90/90) but CI never runs `npm run test:coverage`. Thresholds advisory only.

**Fix:** Add `npm run test:coverage` step to CI.

### CI-04: Branch coverage dangerously close to aggregate floor ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `vitest.config.js` (~L20-25)

**Problem:** Aggregate branch coverage = 85.84%, threshold = 85%. Only 0.84% margin. Four files below aggregate target: `bootstrap.js` (82.45%), `power-up-system.js` (84.03%), `map-resource.js` (84.44%), `ghost-ai-system.js` (81.56%). Any new uncovered branches push aggregate below threshold.

**Fix:** Either raise branch coverage in underperforming files, or add `perFile: true` thresholds.

### CI-05: Playwright `waitForTimeout` patterns create flaky CI tests ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L410, L653, L656, L661)
- `tests/e2e/stress/race-condition.spec.js` (~L47, L69, L90)
- `tests/e2e/render-desync-bugs.spec.js` (~L115, L171, L230, L276, L460)
- `tests/e2e/map-border-integrity.spec.js` (~L104)

**Problem:** 25 fixed `waitForTimeout` calls across 6 spec files. Under CI CPU throttling (GitHub Actions), fixed waits may not be enough, causing spurious failures.

**Fix:** Replace with state-driven `waitForFunction` or `expect.poll` checking concrete game-state conditions. Example: `await expect.poll(() => getGameState()).toBe('EXPLODING')`.

### CI-06: Ghost stagger E2E test has excessive wall-clock duration ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L276-302)

**Problem:** Sequential waits totaling ~30s for ghost stagger assertions. Risks CI timeout.

**Fix:** Compress test — check final state after 15s rather than incremental waits. Or move to integration/unit with fast-forward clock.

### CI-07: CI thresholds too relaxed for semi-automatable audits ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `tests/e2e/audit/audit-question-map.js` (~L52-70)

**Problem:** `CI_SEMI_AUTOMATABLE_THRESHOLDS` sets F-17 maxP95FrameTimeMs = 50ms (vs 16.7ms canonical) and F-18 minP95Fps = 20 (vs 60 canonical). CI validates the loop isn't broken but doesn't validate performance budget.

**Fix:** Add scheduled workflow with strict thresholds (CI_TOLERANCE_FACTOR=1.0) on dedicated hardware.

### CI-08: No dedicated unit test for `src/debug/replay.js` ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-08)
- `src/debug/replay.js` (354 lines) → only `tests/unit/debug/frame-stats.test.js` exists

**Problem:** `replay.js` exports 5 public APIs (`serializeWorldState`, `hashWorldState`, `ReplayInputAdapter`, `ReplayRecorder`, `runReplay`). Coverage 91.74% stmts / 63.63% branches — branches only hit via integration tests.

**Fix:** Add `tests/unit/debug/replay.test.js` covering serialize/hash/replay determinism.

### CI-09: Collision event contract not tested in isolation ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-09)
- `src/ecs/systems/collision-gameplay-events.js` → `tests/unit/systems/collision-gameplay-events.test.js`

**Problem:** Event-name constants validated only as side effect of system tests. If a constant name changes, only tests that emit that event fail.

**Fix:** Add explicit contract test: `expect(GAMEPLAY_EVENT_TYPE.BombPlaced).toBe('BombPlaced')`.

**Audit Verification (2026-06-23):** *PARTIAL DRIFT*. There is an explicit unit test block in `collision-gameplay-events.test.js` under `collision-gameplay-events canonical tables` that validates some event constants in isolation (e.g., `expect(GAMEPLAY_EVENT_TYPE.PELLET_COLLECTED).toBe('PelletCollected')`). However, this test block only covers a subset of the 11 total event constants, meaning some constants are indeed only validated as side effects.

### CI-10: Per-file coverage not configured ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-09)
- `vitest.config.js` (~L20-25)

**Problem:** Coverage thresholds are aggregate-only. `src/security/trusted-types.js` has 50% function coverage, `src/game/bootstrap.js` has 82.45% branch coverage — both below aggregate but masked.

**Fix:** Add `perFile: true` to coverage thresholds, or add policy gate for per-directory minimums.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | D | Ghost animation shared frame index |
| BUG-02 | BUG-02 | — | — | — | — | D | Player animation direction ambiguity |
| DEAD-01 | — | DEAD-01 | — | — | — | B | Dead COLLIDER_TYPE enum values |
| DEAD-02 | — | DEAD-02 | — | — | — | A | Dead export commandSucceeded() |
| DEAD-03 | — | DEAD-03 | — | — | — | A | Dead export getCurrentBranchName() |
| DEAD-04 | — | DEAD-04 | — | — | — | A | Dead export expandBaseRefCandidate() |
| DEAD-05 | — | DEAD-05 | — | — | — | A | Dead export normalizePolicyPath() |
| DEAD-06 | — | DEAD-06 | — | — | — | A | Dead export escapeRegex() |
| DEAD-07 | — | DEAD-07 | — | — | — | A | Dead export globToRegExp() |
| DEAD-08 | — | DEAD-08 | — | — | — | A | Dead export pathMatchesPattern() |
| DEAD-09 | — | DEAD-09 | — | — | — | D | RENDER_INTENT_VERSION production export unused |
| DEAD-10 | — | DEAD-10 | — | — | — | B | KEYBOARD_BINDINGS unnecessary exports |
| DEAD-11 | — | DEAD-11 | — | — | — | B/D | *_STORE_RUNTIME_STATUS test-only exports |
| DEAD-12 | — | DEAD-12 | — | — | — | A/D | sprite-handoff.json source artifact |
| ARCH-01 | — | — | ARCH-01 | — | — | D | Player animation mutable closure state |
| ARCH-02 | — | — | ARCH-02 | — | — | D | Ghost animation shared walk timer |
| ARCH-03 | — | — | ARCH-03 | — | — | D | Board sync lazy snapshot allocation |
| ARCH-04 | — | — | ARCH-04 | — | — | A/D | Ownership policy A/D overlap |
| SEC-12 | — | — | — | SEC-12 | — | A | Content-Length size check optional |
| CI-01 | — | — | — | — | CI-01 | A | CI missing integration/e2e/coverage/audit |
| CI-02 | — | — | — | — | CI-02 | A | Deploy missing integration/e2e |
| CI-03 | — | — | — | — | CI-03 | A | No coverage enforcement in CI |
| CI-04 | — | — | — | — | CI-04 | A | Branch coverage near threshold floor |
| CI-05 | — | — | — | — | CI-05 | A | waitForTimeout flaky patterns |
| CI-06 | — | — | — | — | CI-06 | A | Ghost stagger E2E duration |
| CI-07 | — | — | — | — | CI-07 | A | CI perf thresholds too relaxed |
| CI-08 | — | — | — | — | CI-08 | A | No replay.js unit test |
| CI-09 | — | — | — | — | CI-09 | B | Event contract no isolation test |
| CI-10 | — | — | — | — | CI-10 | A | No per-file coverage |

---

## Recommended Fix Order

### Phase 1 — High Severity (must fix before P3 close)
1. **CI-01**: Add integration/e2e/coverage/audit steps to CI pipeline (Track A)
2. **CI-02**: Add integration/e2e gates to deploy workflow (Track A)

### Phase 2 — Medium Severity (immediate follow-up)
3. **CI-03**: Enable coverage threshold enforcement in CI (Track A)
4. **CI-04**: Raise branch coverage or add perFile thresholds (Track A)
5. **CI-05**: Replace waitForTimeout with state-driven waits in Playwright (Track A)
6. **CI-06**: Compress ghost stagger E2E test duration (Track A)

### Phase 3 — Low Severity
7. **DEAD-01** through **DEAD-08**: Remove dead exports from policy-utils.mjs (Track A)
8. **DEAD-09**: Guard RENDER_INTENT_VERSION under dev check (Track D)
9. **DEAD-10**: Unexport KEYBOARD_BINDINGS (Track B)
10. **DEAD-11**: Guard *_STORE_RUNTIME_STATUS under dev check (Track B/D)
11. **BUG-01**: Fix shared ghost animation frame index (Track D)
12. **ARCH-01/02/03**: Consider refactoring animation timer into components (Track D)
13. **SEC-12**: Read full response for Content-Length safety (Track A)
14. **CI-07/08/09/10**: Performance threshold, replay test, contract test, per-file coverage (Track A/B)

---

## Notes (original)

- **Security posture is excellent**: All AGENTS.md security rules satisfied. Zero unsafe sinks. Fail-closed validation. Production CSP with Trusted Types.
- **ECS architecture is intact**: Agent 3 confirmed no simulation systems call DOM APIs, no component stores DOM state, adapters injected as resources, pooling uses correct offscreen transform.
- **Agent 1 (Bugs) was partially incomplete**: The subagent did not produce final findings; BUG entries are from orchestrator's own code reading and cross-referencing with other agents. A dedicated bug sweep may be warranted before P3 closure.
- **Agent 3 (Architecture) had partial findings**: Key ECS integration points were verified correct; animation system observations are low severity.
- **Main CI risk**: Without integration/e2e/coverage in CI, P3 closure verification is only as strong as manual local runs. CI-01 and CI-02 should be fixed before marking A-13 done.

---

## Audit Verification Addendum (Big Pickle) (2026-06-23)

Each finding verified by dedicated subagent checking source code, git history, and cross-references. Results appended to original report.

### Summary

| Status | Count | Implications |
|---|---|---|
| CONFIRMED (accurate) | 23 | Issues real, actionable |
| FALSE POSITIVE | 4 | Report misclassified design choices or private functions |
| PARTIAL (drift noted) | 7 | Report partially accurate; code changed or details wrong |
| UNVERIFIABLE | 1 | CI-04 coverage % requires fresh test run |

### Category 1 — Bugs & Logic Errors

| ID | Status | Audit Comment |
|---|---|---|
| BUG-01 | FALSE POSITIVE | Shared `frameIndex` is intentional. System file L21 documents: "Frame index is global across all ghosts so the walk-cycle stays in sync." Design choice, not bug. |
| BUG-02 | FALSE POSITIVE | `lastDirection` persistence on idle is explicit design. File L14-15: "When the player is idle (speed === 0), spriteId is held at frame 1 of the last direction so the player visibly faces where they were last moving." Standard game pattern. |

### Category 2 — Dead Code & Unused References

| ID | Status | Audit Comment |
|---|---|---|
| DEAD-01 | CONFIRMED | `PELLET/POWER_UP/WALL` enum values remain dormant scaffolding. Zero production references. |
| DEAD-02 | CONFIRMED | `commandSucceeded()` exported but no external consumers. |
| DEAD-03 | CONFIRMED | `getCurrentBranchName()` exported but never called — callers use `resolveBranchName()` directly. |
| DEAD-04 | FALSE POSITIVE | Function was **never exported**. Correctly module-private. Report incorrect. |
| DEAD-05 | CONFIRMED | `normalizePolicyPath()` exported, only used internally. |
| DEAD-06 | CONFIRMED | `escapeRegex()` exported, only used internally. |
| DEAD-07 | FALSE POSITIVE | Function was **never exported**. Correctly module-private. Report incorrect. |
| DEAD-08 | CONFIRMED | `pathMatchesPattern()` exported, only used internally. |
| DEAD-09 | CONFIRMED | `RENDER_INTENT_VERSION` only consumed in tests. Production export unnecessary. |
| DEAD-10 | PARTIAL | Exported but intentionally public API per JSDoc. Design choice, not accidental. |
| DEAD-11 | PARTIAL | Test-only exports are intentional (documented `@internal`). By-design pattern for component-store contract testing. |
| DEAD-12 | PARTIAL | Historical asset still referenced in docs/code comments. Not dead — superseded by `visual-manifest.json` but kept as source record. |

### Category 3 — Architecture & ECS Violations

| ID | Status | Audit Comment |
|---|---|---|
| ARCH-01 | CONFIRMED (by design) | Closure state correct. Single-entity system — per-system state is acceptable. No action needed. |
| ARCH-02 | CONFIRMED (by design) | Shared walk timer intentional per L21 comment. Ghosts in lockstep is desired visual. |
| ARCH-03 | CONFIRMED (non-issue) | Lazy allocation present. ~1KB once per level load — not hot path. AGENTS.md says SHOULD not MUST for preallocation. |
| ARCH-04 | CONFIRMED (real issue) | 8+ overlapping glob patterns between Track A and Track D. WILL cause CI ownership enforcement conflicts. Needs resolution. |
| ARCH-05 | CONFIRMED (compliant) | Render-intent contract honored: preallocated buffer, classBits bitmask, no per-frame allocations. |
| ARCH-06 | CONFIRMED (compliant) | All 27 audit questions structurally satisfiable, split 20/3/4 per AGENTS.md. |
| ARCH-07 | CONFIRMED (compliant) | Zero simulation systems call DOM APIs. Adapter injection pattern followed consistently. |

### Category 4 — Code Quality & Security

All 12 findings (SEC-01 through SEC-12) **CONFIRMED** — no false positives, no regressions. Security posture excellent.

### Category 5 — Tests & CI Gaps

| ID | Status | Audit Comment |
|---|---|---|
| CI-01 | PARTIAL | **Drift**: Pipeline now indirectly runs `test:coverage` + `test:e2e` via `npm run policy` step. Original claim that these were entirely missing is outdated. Still no explicit `test:integration` or `test:audit` step. |
| CI-02 | CONFIRMED | Deploy workflow still runs only `check` + `test:unit` before build. No drift. |
| CI-03 | PARTIAL | **Drift**: Policy gate now runs coverage through `policy:quality` sub-gate. Coverage thresholds ARE enforced in CI now. |
| CI-04 | CONFIRMED / UNVERIFIABLE | 85% branch threshold confirmed. 85.84% figure from Phase 3 run cannot be confirmed from source — requires fresh `npm run test:coverage`. |
| CI-05 | PARTIAL | **Drift**: Count reduced from 25 to 13 actual `waitForTimeout` calls across 4 files (not 6). Original report inflated. Remaining 13 calls still potential flakiness sources. |
| CI-06 | PARTIAL | **Drift**: Test uses `waitForFunction` (polling), not `waitForTimeout` (fixed wait). Original report mischaracterized. ~30s wall-clock duration still valid concern for CI runtime. |
| CI-07 | CONFIRMED | CI thresholds intentionally 3x relaxed (50ms vs 16.7ms). Documented rational in code. No drift. |
| CI-08 | CONFIRMED | `replay.js` still has zero unit test coverage. Gap unchanged. |
| CI-09 | FALSE POSITIVE | **Drift**: Comprehensive 308-line unit test exists (commit `9dfa9a1`). Tests event-name constants, emission, guards, terminal states. Added after Phase 3 report. Finding invalid. |
| CI-10 | CONFIRMED | `perFile: true` not configured. Gap unchanged. |

### Recommended Fix Order Updates

| Item | Update |
|---|---|
| BUG-01, BUG-02 | Remove from fix list. False positives — intentional design. |
| DEAD-04, DEAD-07 | Remove from fix list. Functions correctly private — report error. |
| CI-09 | Remove from fix list. Unit test exists. |
| CI-01, CI-03 | Reclassify from HIGH to MEDIUM. Partial drift — gaps partially closed by policy gate. |
| ARCH-04 | Elevate to HIGH. Dual ownership overlap across 8+ glob patterns will cause CI enforcement failures. |

### Cross-Cutting Notes

- **4 false positives** (BUG-01, BUG-02, DEAD-04, DEAD-07) are report classification errors — original subagents misread code or intent.
- **CI coverage gaps partially closed**: Policy gate now runs coverage and e2e indirectly. CI-01 HIGH should be MEDIUM. CI-02 (deploy workflow) remains the highest risk.
- **ARCH-04** is the most actionable structural issue — overlapping Track A/Track D ownership patterns guarantee PR enforcement failures.
- **CI-09 fix already merged** (commit `9dfa9a1`) — test exists, just not noted in report.
- **Security posture verified**: All SEC findings confirmed clean. No drift.
- **ECS architecture verified**: Structural integrity maintained. No new violations.

---

*End of report.*
