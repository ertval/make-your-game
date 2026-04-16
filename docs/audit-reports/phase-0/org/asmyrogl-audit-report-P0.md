# Codebase Analysis & Audit Report - Phase 0

**Date:** 2026-04-14
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 0 (P0) — 5 parallel analysis passes

P0 tickets in scope (all `[x]` Done per `docs/implementation/ticket-tracker.md`):
`A-01, A-02, D-01, B-01, D-02, D-03, D-04, A-03, A-10`.

---

## Methodology

Five parallel analysis passes were executed against the Phase 0 codebase. Each pass was evidence-driven, read-only, and equipped with file-reading, grep, and terminal tooling. Findings were then consolidated, deduplicated, and re-numbered under a unified ID scheme.

1. **Bugs & Logic Errors** — State machines (`game-flow.js`, `level-loader.js`), clock/timing (`clock.js`, `main.ecs.js`), map validation & bounds (`map-resource.js`), entity lifecycle, event queue ordering, error handling paths.
2. **Dead Code & Unused References** — Unused exports/imports, unreachable branches, redundant options in `src/`, `scripts/policy-gate/`, `package.json`, config files; tracked generated artifacts; stale JSDoc.
3. **Architecture, ECS Violations & Guideline Drift** — AGENTS.md conformance (structural deferral, opaque entities, DOM isolation, adapter injection, component purity, input/pause contracts, render separation, event determinism), ownership policy drift, Render-Intent contract integrity, asset pipeline conformance, audit-question behavioral coverage (F-01..F-21, B-01..B-06).
4. **Code Quality & Security** — Unsafe sinks, forbidden tech, inline handlers, CSP/Trusted Types, data/storage trust boundaries, error handling, policy-gate coverage, DOM safety, supply chain.
5. **Tests & CI Gaps** — Unit/integration/adapter/E2E coverage, audit traceability matrix sync, phase-testing parity, audit-category enforcement, coverage config, CI workflows, flaky-wait patterns, performance testing.

Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 2 |
| 🔴 Critical | 2 |
| 🟠 High | 3 |
| 🟡 Medium | 8 |
| 🟢 Low / Info | 7 |
| **Total** | **22** |

**Top risks:**
1. **Audit verification is non-executable** — `tests/e2e/audit/audit.e2e.test.js` inventories the 27 audit questions (F-01..F-21, B-01..B-06) but contains no behavioral assertions, and CI does not gate on audit coverage. Phase 0 cannot *prove* it meets `docs/audit.md` acceptance criteria. (`CI-01`, `CI-05`)
2. **Safety-critical map accessors lack bounds validation** — `getCell`/`setCell` in `map-resource.js` will read stale bytes or corrupt adjacent cells if callers pass out-of-range indices, breaking determinism for all downstream movement/collision work. (`BUG-01`)
3. **Ghost passability is semantically incorrect** — `isPassableForGhost()` in `map-resource.js` allows ghosts to traverse destructible walls, directly contradicting `docs/game-description.md §5.2`. Any B-08 AI built on this will be wrong by default. (`BUG-02`)
4. **Content Security Policy is absent** — `index.html` ships with no CSP meta tag and the dev/production pipeline injects no CSP headers. This is a P0 hardening gap against the AGENTS.md "defence in depth" security posture and blocks audit question B-05 evidence. (`SEC-01`, `SEC-02`)
5. **Fixed-step timing edge cases** — Percentile computation uses `Math.ceil` (biased p50/p95), and the spiral-of-death clamp relies on a fragile `0.0001` magic constant. Accuracy of audit evidence (F-17, F-18, B-05) is compromised. (`BUG-03`, `BUG-04`)

---

## 1) Bugs & Logic Errors

### BUG-01: Missing bounds checking in map cell accessors ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L393–L409)

**Problem:** `getCell(map, row, col)` and `setCell(map, row, col, type)` index directly into the flat `Uint8Array` grid without validating that `row`/`col` fall inside `map.rows × map.cols`. Out-of-range reads return stale bytes; out-of-range writes corrupt adjacent grid cells or memory. No caller in the current P0 code can pass out-of-bounds values, but P1 movement/collision systems will, and the fail-open behaviour breaks determinism.

**Impact:** Memory corruption risk, non-deterministic simulation under edge-case movement, silent failure in destructible-wall destruction (D-03 / B-03 / B-06).

**Fix:**
```javascript
export function getCell(map, row, col) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    return CELL_TYPE.INDESTRUCTIBLE; // fail-closed: out-of-bounds treated as wall
  }
  return map.grid[row * map.cols + col];
}
export function setCell(map, row, col, type) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return;
  map.grid[row * map.cols + col] = type;
  map.grid2D[row][col] = type;
}
```

**Tests to add:** `getCell/setCell` with negative and `>= rows|cols` arguments; property-based test ensuring `setCell` never mutates memory outside the declared grid.

---

### BUG-02: `isPassableForGhost` permits ghosts to enter destructible walls ⬆ High
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L468–L471)

**Problem:** The function only rejects `CELL_TYPE.INDESTRUCTIBLE`. Per `docs/game-description.md §5.2` ghosts must also be blocked by destructible walls (and, eventually, active bombs). Built on top of this, Track B-08 ghost AI will pathfind straight through destructible walls.

**Impact:** Breaks core gameplay, invalidates any B-08 AI built on top of the helper, contradicts the game-description source of truth.

**Fix:**
```javascript
export function isPassableForGhost(map, row, col) {
  const cell = getCell(map, row, col);
  return cell !== CELL_TYPE.INDESTRUCTIBLE && cell !== CELL_TYPE.DESTRUCTIBLE;
}
```

**Tests to add:** Unit tests asserting `isPassableForGhost` returns `false` for `INDESTRUCTIBLE` and `DESTRUCTIBLE`, `true` for empty / pellet / power-pellet cells.

---

### BUG-03: Percentile index uses `Math.ceil` instead of `Math.floor` ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L64–L72)

**Problem:** `percentile()` computes `index = Math.ceil((p/100) * n) - 1`, which biases the chosen element upward on even-sized samples. Standard definition is `floor((p/100) * n)` clamped to `[0, n-1]`.

**Impact:** Frame-time p95/p50 reported to audit evidence is slightly off — relevant to audit questions F-17, F-18, B-05.

**Fix:**
```javascript
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const raw = Math.floor((p / 100) * sortedValues.length);
  const idx = Math.max(0, Math.min(raw, sortedValues.length - 1));
  return sortedValues[idx];
}
```

**Tests to add:** Unit tests on `[0..99]` input asserting p50 == 50, p95 == 95; empty array returns 0.

---

### BUG-04: Accumulator clamp relies on fragile `0.0001` constant ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/clock.js` (~L88–L108)

**Problem:** After the spiral-of-death clamp truncates `steps`, the residual accumulator can still exceed `fixedDtMs`. Code papers over this with `clock.accumulator = fixedDtMs - 0.0001`, a magic number that is not a proven bound under all FP conditions. `alpha` can momentarily drift ≥ 1.0 in interpolation.

**Impact:** Render alpha may exceed `[0, 1)` contract, causing sub-frame jitter; violates D-07 render-collect interpolation contract.

**Fix:** Compute the alpha from an explicitly clamped accumulator using `Number.EPSILON` or modulo arithmetic, not a sentinel constant:
```javascript
clock.accumulator -= steps * fixedDtMs;
if (clock.accumulator < 0) clock.accumulator = 0;
else if (clock.accumulator >= fixedDtMs) clock.accumulator = fixedDtMs - Number.EPSILON;
clock.alpha = clock.accumulator / fixedDtMs;
```

**Tests to add:** Property-based test: for any `frameTime ∈ [0, 10 * fixedDtMs]`, `alpha ∈ [0, 1)`; regression test with `frameTime = 11 * fixedDtMs` and `maxStepsPerFrame = 5`.

---

### BUG-05: `nowProvider` not validated for finite numeric values ⬆ Medium
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L141–L162, ~L199)

**Problem:** `onAnimationFrame(frameNowMs)` uses the timestamp directly. A caller-supplied `nowProvider` returning `NaN`/`Infinity` propagates through the accumulator, freezing the loop or advancing infinitely. `bootstrap.js`'s `toFiniteTimestamp()` guard is not applied at this boundary.

**Impact:** Runtime resilience against misbehaving `nowProvider`; trust boundary weakness at the frame-entry edge.

**Fix:**
```javascript
function onAnimationFrame(frameNowMs) {
  if (!isRunning) return;
  if (!Number.isFinite(frameNowMs)) frameNowMs = getNow();
  try { frameProbe.recordFrame(frameNowMs); bootstrap.stepFrame(frameNowMs, ...); }
  catch (err) { console.error('Game frame error.', err); }
  finally { frameHandle = scheduleFrame(onAnimationFrame); }
}
```

**Tests to add:** Unit tests injecting `NaN`, `Infinity`, negative, and non-monotonic timestamps; verify clock remains monotonic and bounded.

---

### BUG-06: Event queue `orderCounter` is unbounded and `frame` parameter unvalidated ⬆ Low
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L67–L82)

**Problem:** `enqueue()` accepts any `frame` value without validation, and `orderCounter` grows across the session without reset. In long-running sessions (million-event scale) this approaches `Number.MAX_SAFE_INTEGER`; a caller passing a non-current `frame` can silently reorder events.

**Impact:** Non-deterministic event ordering if the caller contract is violated. Hypothetical overflow risk over extremely long sessions.

**Fix:** Reset `orderCounter` on each `drain()`; validate `frame` is a finite number or default to 0. Document that `frame` MUST equal the current fixed-step frame.

**Tests to add:** Drain-after-drain determinism test; invariants for `orderCounter` reset; fuzzed enqueue with random `frame` values.

---

## 2) Dead Code & Unused References

### DEAD-01: Unreachable branch in `createSyncMapLoader` ⬆ Medium
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/game/level-loader.js` (~L60–L64)

**Problem:** The `options.restart` branch returns `cloneMap(baseMap)` and the fallback also returns `cloneMap(baseMap)` — the flag has no effect. Callers in `bootstrap.js` pass `restart` assuming semantics the function does not implement.

**Impact:** Misleading API; callers cannot distinguish restart vs non-restart loads.

**Fix:** Either implement restart semantics (reset non-cloned mutable pieces) or remove the parameter entirely and return `cloneMap(baseMap)` unconditionally.

**Tests to add:** Assert that `restart: true` produces a distinctly-initialized map (e.g., zeroed dynamic fields) or document the no-op.

---

### DEAD-02: `createFrameProbe` internal helpers are duplicated utilities ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-03)
- `src/main.ecs.js` (~L53–L71)

**Problem:** `toSortedArray` and `percentile` are declared as module-internal helpers inside `main.ecs.js`. Once `BUG-03` is fixed, these are candidates for promotion into `src/shared/stats.js` so that A-04/A-05 tests can exercise them directly.

**Impact:** Minor; reduces test surface area and readability.

**Fix:** Move to `src/shared/` and import; or inline into `createFrameProbe` if keeping local.

**Tests to add:** Direct unit tests on the shared utility (covers `BUG-03`).

---

### DEAD-03: `peek()` export in `event-queue.js` currently test-only ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L91–L98)

**Problem:** Exported only for tests; no runtime caller. Documented as reserved for debug/replay tooling.

**Impact:** None — reserved API.

**Fix:** Keep; re-review after B-05 (event surface) and A-04 (unit tests) land to confirm utility.

---

### DEAD-04: `resetOrderCounter()` export in `event-queue.js` currently test-only ⬆ Low
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L119–L121)

**Problem:** Only invoked from tests. If `BUG-06` is fixed by resetting on drain, this export becomes fully redundant.

**Impact:** Redundant surface once `BUG-06` is addressed.

**Fix:** Remove after `BUG-06` or after event-queue retention policy is finalized.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: No ECS/architecture violations detected in Phase 0 ⬆ Info
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: All tracks (A, B, C, D)
- `src/ecs/world/*`, `src/ecs/resources/*`, `src/ecs/components/*`, `src/ecs/render-intent.js`, `src/game/*`, `src/main.ecs.js`, `scripts/policy-gate/lib/policy-utils.mjs`

**Summary of architecture conformance checks (all PASS):**

- **Structural deferral:** `world.applyDeferred()` is the single mutation sync point; systems enqueue through `world.addEntity`/`world.removeEntity` stubs.
- **Opaque entities:** Entity handles carry generation counters; direct store access is not exposed to systems.
- **DOM isolation:** No simulation system under `src/ecs/systems/` (none exist yet in P0) touches DOM. `src/game/bootstrap.js` initialises DOM surfaces before loop start.
- **Adapter injection:** Adapters are registered as World resources. No direct imports from simulation systems.
- **Mutable internal exposure:** `world.query()` returns iterator shapes; entity stores never return internal arrays.
- **Render separation:** Render commit runs once per rAF after catch-up; fixed-step sim is isolated.
- **Component purity:** All components are TypedArray-backed SoA; no DOM / closures / listeners stored.
- **Input contract:** Keydown/keyup set snapshot per fixed step, blur/visibility clears.
- **Pause invariants:** rAF remains active, simulation frozen, timing baseline reset on unpause.
- **DOM pooling:** No pooling in P0 (D-09); follow-up audit required at P1.
- **Event determinism:** `event-queue.js` drains in `(frame, order)` order.
- **Render-Intent contract (`implementation-plan.md §5`):** `src/ecs/render-intent.js` pre-allocates `new Array(MAX_RENDER_INTENTS)` once, reuses every frame, encodes visual state as `classBits` bitmask integer, and `MAX_RENDER_INTENTS` exceeds the `MAX_ENTITIES` capacity in `constants.js` (headroom > 400).
- **Ownership policy parity:** `scripts/policy-gate/lib/policy-utils.mjs` matches ownership prose in `track-a.md`..`track-d.md` and `implementation-plan.md`.
- **Asset pipeline:** No P0 assets yet; manifest validation gates are placeholders per `assets-pipeline.md`.

**Impact:** None — foundation is clean.

**Fix:** No change required. Minor non-blocking recommendations:

- Add tighter `MAX_RENDER_INTENTS` capacity calculation once D-02 locks final map dimensions.
- Add a dev-mode startup assertion in `src/ecs/world/entity-store.js` validating `MAX_ENTITIES <= MAX_RENDER_INTENTS`.
- Document the `-0.0001` constant in `clock.js` once `BUG-04` is resolved.

---

### ARCH-02: Audit-question behavioural gaps (structural) ⬆ Medium
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-06, A-07, A-10)
- `tests/e2e/audit/audit.e2e.test.js`, `docs/implementation/audit-traceability-matrix.md`, `docs/audit.md`

**Problem:** Several audit questions (F-02, F-03, F-12 for example) require behaviours that are architecturally *enabled* in P0 (rAF loop present, no canvas in `index.html`), yet cannot be verified because the downstream system (e.g., timer, movement, collisions) is not yet implemented. This is expected per the phased plan but needs to be explicitly tracked so the test suite does not green-wash.

**Impact:** Risk of "structurally satisfied" being confused with "behaviorally verified" in audit evidence.

**Fix:** In `audit-traceability-matrix.md`, add a column distinguishing `Structural (P0)` vs `Behavioral (P1..P3)` coverage so each audit question records when the assertion is actually wired. See also `CI-01`.

---

## 4) Code Quality & Security

### SEC-01: Missing Content Security Policy meta tag ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `index.html` (top of `<head>`)

**Problem:** `index.html` declares no `<meta http-equiv="Content-Security-Policy" ...>`. `AGENTS.md` security posture requires defence-in-depth; B-05 audit evidence expects CSP to be present.

**Impact:** Zero baseline mitigation against injected scripts if a future XSS primitive is introduced. Fails audit question B-05 partially.

**Fix:** Add dev-friendly CSP compatible with Vite HMR:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; object-src 'none'; base-uri 'self'; form-action 'none';">
```

---

### SEC-02: No CSP headers configured in Vite dev or production build ⬆ Medium
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `vite.config.js`, deployment pipeline (if any)

**Problem:** Dev server and static build emit no CSP headers; `vite.config.js` has no `configureServer` hook setting `res.setHeader('Content-Security-Policy', ...)`.

**Impact:** Transport-level defence missing; SEC-01 meta alone is a weaker fallback. Blocks full B-05 evidence.

**Fix:** Add a `configureServer` middleware emitting `Content-Security-Policy` on every response; repeat for the production adapter (Cloudflare Pages / Netlify / static host).

---

### SEC-03: RNG seed constant lacks explanatory docstring ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/rng.js`

**Problem:** Mulberry32 / SplitMix constants appear without a doc comment explaining provenance and why the seed derivation is deterministic. Auditors reviewing RNG quality (B-05) have no breadcrumbs.

**Impact:** Maintainability; audit evidence friction.

**Fix:** Add a JSDoc block citing the algorithm and linking to the derivation. No behavioural change.

---

### SEC-04: `sbom.json` is committed but not validated by CI ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `sbom.json`, `.github/workflows/policy-gate.yml`

**Problem:** SBOM file exists in the repo but no CI job regenerates it from the lockfile or fails on drift. Supply-chain evidence is static and cannot be trusted.

**Impact:** Stale SBOM silently ships; B-05 supply-chain evidence is unreliable.

**Fix:** Add CI step `npx @cyclonedx/cyclonedx-npm --output-file sbom.json && git diff --exit-code sbom.json` or equivalent.

---

### SEC-05: `biome.json` ruleset not proven against `AGENTS.md` forbidden-tech list ⬆ Low
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `biome.json`

**Problem:** Linter config is present but no test/CI job asserts that the `noVar`, `noRestrictedGlobals`, and security rules enabled actually map to the AGENTS.md banned list (canvas, WebGL, frameworks, `var`, `require`, `XMLHttpRequest`).

**Impact:** Drift risk — lint rules could weaken silently.

**Fix:** Extend `scripts/policy-gate/check-forbidden.mjs` to cross-check `biome.json` rule IDs against a canonical banlist file (e.g., `scripts/policy-gate/data/forbidden-tech.json`).

---

### SEC-06: Tracked CI artifacts (`changed-files.txt`, `dist/`, `coverage/`, `test-results/`) ⬆ Low
**Origin:** 4. Code Quality & Security (also flagged by 2. Dead Code)
**Files:** Ownership: Track A (Tickets: A-01, A-07)
- `changed-files.txt`, `dist/`, `coverage/`, `test-results/`

**Problem:** Generated artifacts are present in the working tree and not consistently gitignored. These inflate diffs, confuse policy-gate ownership checks, and risk leaking local-only state.

**Impact:** Noise in code review, potential leakage of local environment state, policy-gate ownership false positives.

**Fix:** Add a top-level `.gitignore` (or enrich the existing one) covering `changed-files.txt`, `dist/`, `coverage/`, `test-results/`; remove from tracking with `git rm --cached`. Gate: add a CI check that fails if these paths appear in `git ls-files`.

---

## 5) Tests & CI Gaps

### CI-01: `tests/e2e/audit/audit.e2e.test.js` is an ID inventory, not behavioral coverage ⬆ Blocking
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.e2e.test.js`

**Problem:** The spec iterates the 27 audit questions (F-01..F-21, B-01..B-06) and asserts only that each ID is "registered." There are no DOM, rAF, performance, or state-transition assertions. Phase 0 passes this file trivially while proving nothing about the actual audit gate.

**Impact:** Phase 0 completion is unprovable against `docs/audit.md`. Risk of shipping a green-washed P0 that fails an external audit.

**Fix:** Replace the inventory with per-question Playwright assertions, starting with the 16 Fully Automatable gates (F-01..F-16, B-01..B-04). Provide a `test.fixme()` for not-yet-implemented behavior and flag those in `audit-traceability-matrix.md`. Example for F-02:
```js
test('F-02 uses requestAnimationFrame for main loop', async ({ page }) => {
  await page.goto('/');
  const usesRAF = await page.evaluate(() => /* instrumentation hook */ window.__diag.rafActive);
  expect(usesRAF).toBe(true);
});
```

**Tests to add:** Real per-question specs; CI failure on any `test.fixme()` left beyond its scheduled phase.

---

### CI-02: 20 Fully Automatable audit tests (F-01..F-16, B-01..B-04) are missing ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/*` (new files to create)

**Problem:** Per `AGENTS.md` category table, 20 of the 27 audit questions must be fully automated. None are currently wired.

**Impact:** Cannot self-audit in CI; external audit cannot rely on test output.

**Fix:** Add per-question Playwright specs; instrument `src/main.ecs.js` with a dev-only `window.__diag` surface exposing frame counters, rAF state, pause state, and game-flow phase (removed from production bundle).

---

### CI-03: 3 Semi-Automatable Performance-API tests (F-17, F-18, B-05) are missing ⬆ Critical
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/perf/*` (new)

**Problem:** Long-task detection, frame-time p95, and allocation/GC sampling are not wired. `docs/audit.md` requires them.

**Impact:** F-17, F-18, B-05 cannot be evidenced.

**Fix:** Add Playwright specs using `PerformanceObserver` for long-task/paint, and `performance.measureUserAgentSpecificMemory()` (behind flag) for allocation. Use `frame-probe` hooks from `main.ecs.js`.

---

### CI-04: Manual-with-evidence harness (F-19..F-21, B-06) not implemented ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06, A-09)
- `tests/manual/*` (new), `docs/audit-reports/phase-testing-verification-report.md`

**Problem:** Four audit questions require human evidence (paint stability, layer count, quality sign-off, accessibility). No harness captures screenshots, layer snapshots, or evidence manifests.

**Impact:** Cannot complete A-09 aggregation; audit sign-off impossible.

**Fix:** Create a `tests/manual/README.md` + Playwright harness that captures `page.screenshot()`, `page.evaluate(() => performance.getEntriesByType('paint'))`, and a JSON manifest committed under `docs/audit-reports/evidence/`.

---

### CI-05: Policy gate does not enforce audit coverage completeness ⬆ Blocking
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`, `scripts/policy-gate/run-checks.mjs`

**Problem:** `policy-gate.yml` runs Biome, unit tests, and header checks, but not a check that every audit-question ID in `docs/audit.md` has a corresponding executable assertion. Without this gate, CI-01/CI-02/CI-03 regressions will ship silently.

**Impact:** Green CI despite unwired audit coverage.

**Fix:** Add `scripts/policy-gate/check-audit-coverage.mjs` that parses `docs/audit.md`, `audit-traceability-matrix.md`, and the Playwright spec tree, and fails if any live-phase question has no wired spec.

---

### CI-06: Playwright specs use fixed `waitForTimeout(...)` ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/**`

**Problem:** Fixed timeouts are the leading cause of flake. `AGENTS.md` mandates state-driven waits (`waitForFunction`, `waitForSelector`).

**Impact:** Test flake, wasted CI minutes, false negatives under load.

**Fix:** Replace `page.waitForTimeout(n)` with `page.waitForFunction(() => window.__diag.frame >= target)` or selector-based waits. Add a grep-based CI guard prohibiting `waitForTimeout`.

---

### CI-07: `vitest.config.js` coverage targets not scoped to `src/` + no minimum threshold ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-04)
- `vitest.config.js`

**Problem:** Coverage collection either omits an explicit `include: ['src/**']` or lacks `coverage.thresholds` gates. A-04 unit tests pass trivially without a floor.

**Impact:** Coverage can silently drop; audit evidence B-02/B-03 weakens.

**Fix:**
```js
coverage: {
  include: ['src/**/*.{js,mjs}'],
  exclude: ['src/**/*.test.js', 'src/debug/**'],
  thresholds: { lines: 85, statements: 85, branches: 75, functions: 85 },
}
```

---

### CI-08: Phase-testing-verification report is not synced to `ticket-tracker.md` ⬆ Medium
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-10)
- `docs/audit-reports/phase-testing-verification-report.md`, `docs/implementation/ticket-tracker.md`

**Problem:** The verification report's phase-gate status does not align with ticket-tracker entries. Several P0 tickets are `[x]` Done in the tracker but the corresponding gate rows are still "pending," and vice versa.

**Impact:** Consolidation tickets (A-10..A-14) cannot reconcile phase status; external readers are misled.

**Fix:** Treat ticket-tracker as the single source of truth; generate the verification-report status rows from the tracker via a small script executed in CI. Add a parity CI check.

---

### CI-09: `docs/implementation/audit-traceability-matrix.md` lacks per-phase behavior column ⬆ Medium
**Origin:** 5. Tests & CI Gaps (related to `ARCH-02`)
**Files:** Ownership: Track A (Tickets: A-06, A-10)
- `docs/implementation/audit-traceability-matrix.md`

**Problem:** Matrix columns track which Playwright spec claims coverage but not whether the spec actually asserts behavior or merely catalogs the ID.

**Impact:** Traceability illusion; blocks `CI-01` verification.

**Fix:** Add `Assertion Type` column: `Structural` / `Behavioral` / `Evidence` / `Pending`. CI script fails on regressions.

---

### CI-10: Unit-test coverage gap for `map-resource.js`, `clock.js`, `event-queue.js` ⬆ High
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-04)
- `tests/unit/ecs/resources/*` (new or expanded)

**Problem:** The six bugs in Section 1 map to gaps in unit coverage — no out-of-bounds tests for `map-resource.js`, no spiral-of-death stress test for `clock.js`, no drain/peek/order-counter invariant test for `event-queue.js`.

**Impact:** Regressions on foundation resources will not be caught before P1 adoption.

**Fix:** Land the tests enumerated in `BUG-01..BUG-06` as `A-04` scope before any P1 ticket claims a dependency on the resource.

---

### CI-11: No frame-time / long-task / allocation acceptance tests wired ⬆ High
**Origin:** 5. Tests & CI Gaps (related `SEC-04`, `CI-03`)
**Files:** Ownership: Track A (Tickets: A-04, A-06)
- `tests/perf/*` (new)

**Problem:** `AGENTS.md` performance acceptance criteria (frame-time p95, zero long tasks, stable allocation) have no wired harness.

**Impact:** P1 cannot prove performance regressions; P3 hardening has no baseline.

**Fix:** Add a Vitest `bench` or Playwright perf spec running the loop for N seconds and asserting the AGENTS.md thresholds. Gate in CI.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|---|---|---|---|---|---|---|---|
| BUG-01 | BUG-01 | — | — | — | — | Track D (D-03) | Missing bounds in `getCell`/`setCell` |
| BUG-02 | BUG-02 | — | — | — | — | Track D (D-03) | Ghost passability allows destructible walls |
| BUG-03 | BUG-03 | — | — | — | — | Track A (A-03) | Percentile uses `Math.ceil` |
| BUG-04 | BUG-04 | — | — | — | — | Track D (D-01) | Accumulator clamp fragile `0.0001` |
| BUG-05 | BUG-05 | — | — | — | — | Track A (A-03) | `nowProvider` not validated |
| BUG-06 | BUG-06 | — | — | — | — | Track D (D-01) | Event queue ordering/overflow |
| DEAD-01 | — | DEAD-01 | — | — | — | Track D (D-03) | Unreachable `restart` branch in `level-loader` |
| DEAD-02 | — | DEAD-02 | — | — | — | Track A (A-03) | Frame-probe helpers as shared utilities |
| DEAD-03 | — | DEAD-03 | — | — | — | Track D (D-01) | `peek()` reserved export |
| DEAD-04 | — | DEAD-04 | — | — | — | Track D (D-01) | `resetOrderCounter()` reserved export |
| ARCH-01 | — | — | ARCH-pass | — | — | All tracks | No ECS/architecture violations detected |
| ARCH-02 | — | — | ARCH-audit | — | CI-09 | Track A (A-06, A-07, A-10) | Audit-question behavioral gaps (structural only) |
| SEC-01 | — | — | — | SEC-M-001 | — | Track A (A-01, A-07) | Missing CSP meta tag |
| SEC-02 | — | — | — | SEC-M-002 | — | Track A (A-01, A-07) | No CSP server headers |
| SEC-03 | — | — | — | SEC-L-001 | — | Track D (D-01) | RNG constant docstring |
| SEC-04 | — | — | — | SEC-L-002 | CI-perf | Track A (A-07) | `sbom.json` not CI-validated |
| SEC-05 | — | — | — | SEC-L-003 | — | Track A (A-01) | `biome.json` ruleset vs forbidden list |
| SEC-06 | — | DEAD-art | — | SEC-L-004 | — | Track A (A-01, A-07) | Tracked generated artifacts |
| CI-01 | — | — | ARCH-audit | — | CI-01 | Track A (A-06) | `audit.e2e.test.js` inventory-only |
| CI-02 | — | — | — | — | CI-02 | Track A (A-06) | 20 Fully Automatable tests missing |
| CI-03 | — | — | — | — | CI-03 | Track A (A-06) | 3 Semi-Automatable Performance API tests missing |
| CI-04 | — | — | — | — | CI-04 | Track A (A-06, A-09) | Manual-with-evidence harness missing |
| CI-05 | — | — | — | — | CI-05 | Track A (A-07) | Policy gate does not enforce audit coverage |
| CI-06 | — | — | — | — | CI-06 | Track A (A-06) | Flaky `waitForTimeout` |
| CI-07 | — | — | — | — | CI-07 | Track A (A-04) | `vitest.config.js` coverage gaps |
| CI-08 | — | — | — | — | CI-08 | Track A (A-10) | Phase-testing report not synced |
| CI-09 | — | — | ARCH-audit | — | CI-09 | Track A (A-06, A-10) | Traceability matrix lacks behavior column |
| CI-10 | BUG-01..06 | — | — | — | CI-10 | Track A (A-04) | Unit coverage gap on P0 resources |
| CI-11 | — | — | — | — | CI-11 | Track A (A-04, A-06) | Performance acceptance harness missing |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge into P1)
1. **CI-01**: Replace audit-question inventory spec with real behavioral assertions for the 16 Fully Automatable audit gates (Track A, A-06).
2. **CI-05**: Add `check-audit-coverage.mjs` into `policy-gate.yml` so silent regressions on CI-01 fail CI (Track A, A-07).
3. **CI-02**: Land the 20 Fully Automatable Playwright specs behind a `test.fixme()` plan (Track A, A-06).
4. **CI-03**: Wire the 3 Semi-Automatable Performance API specs (F-17, F-18, B-05) (Track A, A-06).

### Phase 2 — High Severity (immediate follow-up)
5. **BUG-01**: Add bounds validation to `getCell`/`setCell` in `map-resource.js` (Track D, D-03).
6. **BUG-02**: Fix `isPassableForGhost` to reject `DESTRUCTIBLE` cells (Track D, D-03).
7. **CI-04**: Build manual-with-evidence harness for F-19..F-21, B-06 (Track A, A-06, A-09).
8. **CI-10**: Backfill unit tests covering BUG-01..BUG-06 (Track A, A-04).
9. **CI-11**: Wire performance acceptance harness against AGENTS.md thresholds (Track A, A-04, A-06).

### Phase 3 — Medium Severity
10. **BUG-03**: Switch percentile to `Math.floor`-based indexing in `main.ecs.js` (Track A, A-03).
11. **BUG-04**: Replace `0.0001` clamp with `Number.EPSILON` / modulo in `clock.js` (Track D, D-01).
12. **BUG-05**: Validate `nowProvider` in `onAnimationFrame` (Track A, A-03).
13. **SEC-01**: Add CSP meta to `index.html` (Track A, A-01, A-07).
14. **SEC-02**: Emit CSP headers from Vite config + production adapter (Track A, A-01, A-07).
15. **DEAD-01**: Resolve unreachable `restart` branch in `level-loader.js` (Track D, D-03).
16. **ARCH-02**: Add `Assertion Type` column to `audit-traceability-matrix.md` (Track A, A-06, A-10).
17. **CI-06**: Replace `waitForTimeout` with state-driven waits + CI guard (Track A, A-06).
18. **CI-07**: Tighten `vitest.config.js` coverage include + thresholds (Track A, A-04).
19. **CI-08**: Auto-generate phase-testing verification report from ticket-tracker (Track A, A-10).
20. **CI-09**: Add assertion-type column to traceability matrix (Track A, A-06, A-10).

### Phase 4 — Low Severity (maintenance)
21. **BUG-06**: Reset `orderCounter` on `drain()`; validate `frame` parameter (Track D, D-01).
22. **DEAD-02**: Promote frame-probe helpers to `src/shared/stats.js` (Track A, A-03).
23. **DEAD-03 / DEAD-04**: Re-review event-queue exports after B-05 lands (Track D, D-01).
24. **SEC-03**: Docstring Mulberry32 / SplitMix constants (Track D, D-01).
25. **SEC-04**: CI step to regenerate and diff `sbom.json` (Track A, A-07).
26. **SEC-05**: Cross-check Biome ruleset against canonical forbidden-tech list (Track A, A-01).
27. **SEC-06**: Untrack generated artifacts; add gitignore + CI guard (Track A, A-01, A-07).

---

## Notes

- **Architecture conformance is strong.** Agent 3 found zero blocking ECS violations. The render-intent contract (pre-allocated buffer + `classBits` bitmask + capacity headroom) is honored, adapter-via-resource injection is uniform, and the ownership rules in `scripts/policy-gate/lib/policy-utils.mjs` match the track documents.
- **The critical gap is verifiability, not correctness.** Phase 0 code is clean, but the audit harness proves essentially nothing. CI-01/CI-02/CI-05 must land before P1 consumers come to rely on P0 invariants.
- **Map-resource has two real bugs.** `BUG-01` and `BUG-02` will bite P1 (B-03 movement) and P3 (B-08 ghost AI) if left unfixed. These are small patches but high blast radius.
- **Timing/stats accuracy matters.** `BUG-03` and `BUG-04` are minor in normal play but directly affect the audit evidence you submit for F-17, F-18, B-05.
- **CSP is a P0 security deliverable.** The absence of a CSP meta and header is the only real security finding. Everything else (forbidden sinks, inline handlers, unsafe globals, DOM safety) is clean.
- **Generated artifacts in the tree.** `changed-files.txt`, `dist/`, `coverage/`, `test-results/`, `sbom.json` appear tracked. Untrack, gitignore, and gate.
- **Agents 2 and 4 wrote scratchpad reports into the workspace (`DEAD-CODE-AUDIT-REPORT.md`, `PHASE_0_SECURITY_AUDIT.md`).** These were not part of the requested deliverable and should be deleted manually — the canonical consolidated report is this file.

---

*End of report.*
