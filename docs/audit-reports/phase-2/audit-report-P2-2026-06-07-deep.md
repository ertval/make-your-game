# Codebase Analysis & Audit Report - Phase 2 (Playable MVP)

**Date:** 2026-06-07
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review for Phase 2 — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes executed across the codebase:
1. **Bugs & Logic Errors** — Runtime bugs, race conditions, state machine errors, edge-case failures, memory leaks
2. **Dead Code & Unused References** — Unused exports, dead branches, stale config, orphaned code
3. **Architecture, ECS Violations & Guideline Drift** — ECS boundary breaches, DOM isolation, adapter injection, policy drift, render-intent contracts
4. **Code Quality & Security** — Unsafe sinks, forbidden tech, CSP, validation gaps, error handling, trust boundaries
5. **Tests & CI Gaps** — Missing test coverage, CI config weaknesses, audit verification gaps, phase parity

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 1 |
| 🔴 Critical | 1 |
| 🟠 High | 8 |
| 🟡 Medium | 12 |
| 🟢 Low / Info | 43 |

**Top risks:**
1. **A-12 P2 audit consolidation not started** — blocks ALL P3+ tickets; 16 tickets cannot proceed
2. **A-05/A-06 integration+e2e tests not started** — cross-system correctness unverified; audit gates lack automated coverage
3. **Event queue unbounded growth** — 5+ systems emit events per step but no consumer calls `drain()`; ~216K events/hour leak
4. **Storage adapter schema validation unused** — `safeRead()` accepts `_schema` param but never validates against it; trust boundary gap
5. **DOM isolation violations** — `hud-system.js` writes DOM directly; `board-sync-system.js` receives adapter as closure param (not via resource API)

---

## 1) Bugs & Logic Errors

### BUG-01: Event Queue Unbounded Growth — `drain()` Never Called ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03, A-11)
- `src/ecs/resources/event-queue.js` (~L30-80)
- `src/ecs/systems/collision-system.js` (~L200-220)
- `src/ecs/systems/bomb-tick-system.js` (~L90-110)
- `src/ecs/systems/explosion-system.js` (~L100-130)
- `src/ecs/systems/player-move-system.js` (~L60-80)
- `src/main.ecs.js` (bootstrap)

**Problem:** 5+ systems call `emitGameplayEvent()` each fixed step. No consumer in active game loop calls `drain()`. `audio-integration.js` consumer exists but not wired into bootstrap. Events accumulate unboundedly.

**Impact:** Memory leak — at 60 Hz simulation, ~216K events/hour accumulate. Eventually OOM.

**Fix:** Wire `drain(eventQueue)` at deterministic sync point (end of `runRenderCommit`) or register audio-cue-system that drains it.

**Tests to add:** Leak-check test: run 10K sim steps, assert `eventQueue.events.length` stays bounded.

---

### BUG-02: Map Level-3 Border Has Destructible Cells ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-02)
- `assets/maps/level-3.json` (~L21, col 0, col 14)

**Problem:** Cells `[5][0]` and `[5][14]` are DESTRUCTIBLE. Explosion destroys them → border hole. `isPassable` returns `true` for EMPTY cells at border. `getCell` clamps OOB to INDESTRUCTIBLE — movement blocked but visual desyncs.

**Impact:** Visual vs gameplay desync on border breach. Player sees hole but can't exit.

**Fix:** Change cells to INDESTRUCTIBLE(1). Add semantic validation forbidding destructible on outer perimeter.

**Tests to add:** Schema validation test for border cell integrity.

---

### BUG-03: `grid2D` Mirror Write Guard Masks Data Loss ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L507-509)

**Problem:** `setCell` writes flat grid unconditionally but guards 2D mirror with `if (map.grid2D[row])`. If `grid2D[row]` undefined, flat write succeeds but 2D mirror silently skipped.

**Impact:** Stale `grid2D` data silently consumed by debug renderers/tests.

**Fix:** Replace with `map.grid2D[row][col] = type` (remove `if` guard) or add dev-mode assertion.

**Tests to add:** Destroy cell, assert `grid2D[row][col]` matches flat `grid[index]`.

---

### BUG-04: `scoring-system` `lastProcessedFrame` Guard Dead Code ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/systems/scoring-system.js` (~L262-264)

**Problem:** Guard compares `frameIndex` vs `scoreState.lastProcessedFrame` to prevent double-scoring. System runs exactly once per step (linear dispatch). Guard unreachable — dead code.

**Impact:** None (correct behavior). Remove dead branch.

**Fix:** Remove dead guard.

**Tests to add:** None.

---

### BUG-05: `resolveExplosionTile` Per-Tile Object Allocation in Hot Loop ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/explosion-system.js` (~L518-563, callers L625-646)

**Problem:** Each explosion tile creates new 15-field object literal. With 4 arms × radius 7 = 28 objects/bomb, plus chain reactions. Short-lived → GC pressure during chain explosions.

**Impact:** GC jank during multi-bomb chain reactions on constrained devices.

**Fix:** Use pooled scratch object repopulated per tile, or inline 6 positional parameters.

**Tests to add:** GC-pressure regression test in bomb-explosion-wiring suite.

---

### BUG-06: `resetCollisionScratch` Full Fill Every Step ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L149-157)

**Problem:** Every collision step fills 5 typed arrays with `.fill()`. On 15×11 map (165 cells): 825 writes. On hypothetical 100×100: 50K writes. No dirty tracking.

**Impact:** Acceptable for shipped map sizes (15×11). Performance concern for larger maps.

**Fix:** Track dirty cells, reset only used indices. Accept as non-critical for Phase 2.

**Tests to add:** None.

---

### BUG-07: Detonation Queue Coupled to Explosion System Only ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (pushes to `bombDetonationQueue`)
- `src/ecs/systems/explosion-system.js` (drains via `takeDetonationWorkQueue`)

**Problem:** Shared `bombDetonationQueue` is plain array. If explosion-system quarantined (fault budget exhausted), queue grows unchecked. On return from quarantine, processes all accumulated detonations in single burst.

**Impact:** Burst fire entity creation could starve fire pool or cause visible visual spike.

**Fix:** Cap detonations processed per tick. Add drain-to-waste fallback when explosion-system quarantined.

**Tests to add:** Quarantine explosion-system, verify queue stays bounded.

---

### BUG-08: `runFixedStep` Iterates Empty `input` Phase ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A (Tickets: A-03)
- `src/ecs/world/world.js` (~L384)

**Problem:** `DEFAULT_PHASE_ORDER` = `['meta', 'input', 'physics', 'logic', 'render']`. `runFixedStep` skips render/meta, iterates remaining. `input` phase has zero registered systems. Wasteful empty iteration each step.

**Impact:** Negligible. Remove dead phase slot.

**Fix:** Remove `'input'` from `DEFAULT_PHASE_ORDER` or add presence check.

**Tests to add:** None.

---

## 2) Dead Code & Unused References

### DEAD-01: `changed-files.txt` Tracked Generated Artifact ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06, A-11)
- `changed-files.txt` (repo root)

**Problem:** Generated diff artifact tracked in git. Already in `.gitignore` but remains in history.

**Impact:** CI artifacts in repo history bloat.

**Fix:** `git rm --cached changed-files.txt`, regenerate at CI time.

---

### DEAD-02: Duplicate SCORE Constants in `constants.js` vs `scoring-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-01)
- `src/ecs/resources/constants.js` (~L135-153)
- `src/ecs/systems/scoring-system.js` (~L44-62)

**Problem:** `SCORE_PELLET`, `SCORE_POWER_PELLET`, `SCORE_POWER_UP`, `SCORE_GHOST_KILL`, `SCORE_STUNNED_GHOST_KILL`, `SCORE_LEVEL_CLEAR`, `SCORE_TIME_BONUS_MULTIPLIER` defined in BOTH files with identical values. `constants.js` versions never imported by any `src/` file.

**Impact:** Drift risk — one file could change without the other. Dead weight.

**Fix:** Remove scoring constants from `constants.js`, import from `scoring-system.js` where needed.

---

### DEAD-03: Legacy `renderer-dom.js` Superseded But Still in Repo ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`

**Problem:** File header says "LEGACY — Superseded by ECS-driven render-dom-system. NOT called from game loop." Still exported/importable. Only test file references it.

**Impact:** Dead code, reader confusion.

**Fix:** Remove file or move to `src/legacy/`.

---

### DEAD-04: `test:integration` Runs with `--passWithNoTests` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-06)
- `package.json` (~L21)

**Problem:** Script has `--passWithNoTests` flag, masking the gap that `tests/integration/` only has adapter tests (under `tests/integration/adapters/`), not gameplay integration tests.

**Impact:** Missed integration failures.

**Fix:** Remove `--passWithNoTests` once integration gameplay tests exist.

---

### DEAD-05: `coverage` Script Duplicates `test:coverage` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L26-27)

**Problem:** `"coverage": "npm run test:coverage"` — direct alias, no semantic difference.

**Impact:** Script list noise.

**Fix:** Remove `"coverage"` script, keep only `"test:coverage"`.

---

### DEAD-06 through DEAD-32: 27 Unused/Minor Exports Across Tracks A/B/C/D ⬆ LOW
**Origin:** 2. Dead Code & Unused References

Consolidated minor findings — unused exports marked as `@internal` or test-only, never imported by production `src/`:

| ID | File | Symbol | Track |
|----|------|--------|-------|
| DEAD-06 | `constants.js:26` | `SIMULATION_HZ` (used only to derive FIXED_DT_MS) | A |
| DEAD-07 | `event-queue.js:114` | `peek()` | A |
| DEAD-08 | `event-queue.js:130` | `clear()` | A |
| DEAD-09 | `event-queue.js:145` | `resetOrderCounter()` (deprecated test-only) | A |
| DEAD-10 | `bootstrap.js:131` | Legacy `adapterResourceKey` fallback | A |
| DEAD-11 | `registry.js:59` | `ALL_COMPONENT_MASKS` (test-only) | B |
| DEAD-12 | `spatial.js:54`, `actors.js:51`, `props.js:52`, `stats.js:36` | `*_RUNTIME_STATUS` objects (4 files) | B |
| DEAD-13 | `actors.js:45` | `UNASSIGNED_GHOST_TYPE` (internal-only) | B |
| DEAD-14 | `props.js:135,160`, `stats.js:50,78,105` | Planned store factories (5 fns) | B |
| DEAD-15 | `props.js:85,119,148,173`, `spatial.js:145` | Reset functions (test-only) | B |
| DEAD-16 | `spatial.js:44-45` | `COLLIDER_TYPE.WALL/PELLET/POWER_UP` unused values | B |
| DEAD-17 | `props.js:41` | `PROP_POWER_UP_TYPE` (never imported) | B |
| DEAD-18 | `constants.js:101-113` | Ghost AI constants (CLYDE_DISTANCE_THRESHOLD, etc) | B |
| DEAD-19 | `constants.js:121,124` | `LEVEL_GHOST_SPEED`, `LEVEL_MAX_GHOSTS` | B |
| DEAD-20 | `hud-adapter.js:58,62,66` | formatLives/formatScore/formatTimer exports | C |
| DEAD-21 | `hud-adapter.js:25` | `ARIA_LIVE_THROTTLE_MS` export | C |
| DEAD-22 | `input-adapter.js:36,50,64,84` | INPUT_INTENT, KEYBOARD bindings, normalizeKeyboardIntent | B |
| DEAD-23 | `render-intent.js:61` | `RENDER_INTENT_VERSION` | D |
| DEAD-24 | `render-intent.js:152` | `appendRenderIntent()` (test-only) | D |
| DEAD-25 | `render-intent.js:217` | `getRenderIntentView()` (test-only) | D |
| DEAD-26 | `sprite-pool-adapter.js:22` | `SPRITE_TYPE` (test-only) | D |
| DEAD-27 | `storage-adapter.js:8,18,43` | HIGH_SCORE_STORAGE_KEY, safeRead/safeWrite exports | C |
| DEAD-28 | `constants.js:63,68,212` | MAX_FIRE_RADIUS, POOL_FIRE_PER_BOMB (indirect use) | D |
| DEAD-29 | `constants.js:159` | `POWER_UP_DROP_CHANCES` (never imported) | B |

**Impact:** Low — library surface bloat, no runtime effect.

**Fix:** Remove exports or annotate `@internal`/`@private`.

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: DOM Isolation Violation — `hud-system.js` Writes DOM Directly ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md § DOM Isolation: "Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems."
**Files:** Ownership: Track C (Tickets: C-05)
- `src/ecs/systems/hud-system.js` (writes `textContent` directly to HUD elements)

**Problem:** `hud-system.js` (a `logic`-phase ECS system) directly writes `textContent` to HUD DOM elements instead of delegating to the `hud-adapter` via world resources. This violates DOM isolation — simulation systems must not touch DOM.

**Impact:** Breaks determinism guarantee. Simulation and rendering interleaved. Harder to test.

**Fix:** `hud-system.js` should write HUD data to a resource buffer. `hud-adapter.js` (render-phase) reads buffer and writes DOM.

---

### ARCH-02: Adapter Injection Violation — `board-sync-system.js` Receives Adapter as Closure Param ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md § Adapter Injection: "Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track D (Tickets: D-10)
- `src/ecs/systems/board-sync-system.js` (receives `boardAdapter` via closure)
- `src/game/bootstrap.js` (~registrations)

**Problem:** `board-sync-system.js` receives `boardAdapter` as a closure-injected parameter (second argument to factory), not via `world.getResource('boardAdapter')`. Bypasses the resource API contract.

**Impact:** Inconsistent adapter access pattern. Systems outside resource API are harder to test and audit.

**Fix:** Register `boardAdapter` as a world resource, access via `context.world.getResource('boardAdapter')`.

---

### ARCH-03: `entity-store.getActiveIds()` Returns Mutable Internal Array Reference ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md § ECS Data: "Components as data-only" / structural integrity
**Files:** Ownership: Track A (Tickets: A-02)
- `src/ecs/world/entity-store.js` (~getActiveIds)

**Problem:** `getActiveIds()` returns direct reference to internal `activeIds` array. Callers can mutate it, breaking entity tracking invariants.

**Impact:** Silent corruption of entity lifecycle — IDs could be added/removed without going through proper allocate/release path.

**Fix:** Return copy or `[...this.activeIds]`, or return frozen view.

---

### ARCH-04: `ghost-animation-system.js` Not Listed in Any Track Ownership ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** AGENTS.md / Policy ownership drift
**Files:** Ownership: Unassigned (Tickets: D-10)
- `src/ecs/systems/ghost-animation-system.js`
- `scripts/policy-gate/lib/policy-utils.mjs` (~TRACK_OWNERSHIP_RULES)

**Problem:** `ghost-animation-system.js` exists but no track's ownership patterns cover `src/ecs/systems/ghost-animation-*.js`. Not in Track B (simulation) or Track D (render). Policy gate would flag any PR touching this file as an ownership violation.

**Impact:** Policy gate prevents anyone from modifying this file without bypass (bugfix/integration branch).

**Fix:** Add `src/ecs/systems/ghost-animation-*.js` to Track D ownership patterns (it's a render/visual concern).

---

### ARCH-05: Audit-Traceability Matrix Out of Sync With Actual Tests ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A (Tickets: A-06, A-12)
- `docs/implementation/audit-traceability-matrix.md`
- `tests/e2e/audit/audit.browser.spec.js`

**Problem:** 8 audit rows marked `Pending` but actually `Executable`: F-03, F-04, F-05, F-06, F-19, F-20, F-21, B-06. Matrix not updated when tests were implemented.

**Impact:** Audit status reporting incorrect. Manual approval may be incorrectly gated.

**Fix:** Flip status from `Pending` to `Executable` for all 8 rows. Add evidence artifact links for manual items.

---

### ARCH-06: Render-Intent Contract — `classBits` Bitmask Correctly Encoded ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `render-intent.js` pre-allocates buffer with `new Array(MAX_RENDER_INTENTS)` once; `classBits` is integer bitmask (not string array); `MAX_RENDER_INTENTS` accommodates `MAX_ENTITIES` from `constants.js`.

**Status:** PASS — no violations.

---

### ARCH-07: Asset Pipeline — Naming Conventions and Validation ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track A / Track D (Tickets: A-07, D-10, D-11)
- `assets/manifests/visual-manifest.json`
- `assets/generated/visuals/128px/characters/*.webp`

**Problem:** Player sprites are WebP (lossless, 128×128), not SVG as preferred per `assets-pipeline.md` §9.2 ("Preferred format is SVG for icons, characters, and UI glyphs where feasible"). Source is raster sheet — file notes this deviation.

**Impact:** Format deviation from standard acknowledged but undocumented in asset pipeline docs.

**Fix:** Document raster-to-WebP deviation in `assets-pipeline.md` §9.2 with explicit rationale.

---

### ARCH-08: Frame Pipeline — Render Commit Phase Correctly Separated ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `render-collect-system` (computes intents) → `render-dom-system` (batched DOM commit). Render runs once per rAF, not per fixed step. No interleaved layout reads/writes.

**Status:** PASS — no violations.

---

### ARCH-09: Input Contract — Keydown/Keyup Sets, Snapshot, Blur Clear ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `input-adapter.js` tracks via `keydown`/`keyup` sets, clears on `blur`/`visibilitychange`. `input-system.js` snapshots once per fixed step. No OS key-repeat dependency.

**Status:** PASS — no violations.

---

### ARCH-10: Pause Invariants — rAF Active, Simulation Frozen ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `pause-system.js` freezes simulation while rAF continues. `clock.js` skips time advancement. Timing baseline reset on unpause. `main.js` resets `lastFrameTime`.

**Status:** PASS — no violations.

---

### ARCH-11: DOM Pooling — Offscreen Transform Hiding ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `sprite-pool-adapter.js` hides with `transform: translate(-9999px, -9999px)`. Never `display:none`.

**Status:** PASS — no violations.

---

### ARCH-12: Structural Deferral — Entity/Component Mutations Deferred ✅
**Origin:** 3. Architecture, ECS Violations & Guideline Drift

**Verified:** `world.js` defers structural mutations to sync point after system execution. Entity ID recycling with generation-based stale-handle protection in `entity-store.js`.

**Status:** PASS — no violations.

---

## 4) Code Quality & Security

### SEC-01: Storage Adapter `safeRead()` Schema Parameter Unused ⬆ HIGH
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/io/storage-adapter.js` (~L18-41)

**Problem:** `safeRead(key, _schema, defaultValue)` accepts schema parameter but never validates against it. Shape validation only checks `parsedValue !== null && typeof parsedValue === 'object' && !Array.isArray(parsedValue)`. TODO on line 34 acknowledges this.

**Impact:** AGENTS.md mandates "MUST treat localStorage/sessionStorage data as untrusted input and validate on read." Current implementation only validates current high-score shape trivially. Future uses of `safeRead` with schema assumption are exposed.

**Fix:** Implement actual schema validation — replace `_schema` with `validate(value)` callback.

---

### SEC-02: Map Runtime Validation Lacks JSON Schema Enforcement ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07, D-03)
- `src/ecs/resources/map-resource.js` (~L425-470)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** `createMapResource()` calls `validateMapSemantic()` for structural checks but NOT JSON Schema validation at runtime. Schema validation only runs in CI via `validate-schema.mjs`. Corrupted map passing CI has no runtime guard. Additionally, `validate-schema.mjs` uses `strict: false`.

**Impact:** Undefined behavior from out-of-range cell types. `Uint8Array` truncates values > 255. `CELL_TYPE_CLASSES[cellType]` returns `undefined` → unpredictable rendering.

**Fix:** Add runtime JSON Schema validation in `createMapResource()`. Use `strict: true` in CI.

---

### SEC-03: `package.json` Marked `"private": false` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `package.json` (~L5)

**Problem:** `"private": false` allows accidental `npm publish`. No `publishConfig` restriction. Defense-in-depth gap.

**Impact:** Accidental exposure of GPL-3.0 code and internal config.

**Fix:** Set `"private": true`.

---

### SEC-04: Grid Cell Type Range Not Validated at Runtime ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L320-334)

**Problem:** `validateMapSemantic()` doesn't validate that cell values are in valid `CELL_TYPE` range (0-9). Values > 9 silently truncated by `Uint8Array`. Out-of-range values treated as empty by `CELL_TYPE_CLASSES[cellType] || 'cell'` fallback.

**Impact:** Map-based exploits — cell type 255 stored as INDESTRUCTIBLE-like, breaking pellet counting/collision detection.

**Fix:** Add cell type range validation in `validateMapSemantic`.

---

### SEC-05: `isRecord()` Type Guard Accepts Arrays ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-01)
- `src/shared/type-guards.js` (~L8-10)
- `src/game/level-loader.js` (~L27-34)

**Problem:** `isRecord(value)` returns `true` for arrays (`typeof [] === 'object'`). `isRawMapPayload()` uses `isRecord(candidate.dimensions)` — arrays pass. Defense-in-depth erosion.

**Impact:** Minimal — arrays fail subsequent property checks. Could mask malicious payloads.

**Fix:** Add `!Array.isArray(value)` check.

---

### SEC-06: `validate-schema.mjs` Ajv `strict: false` Masks Schema Errors ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track A (Tickets: A-07)
- `scripts/validate-schema.mjs` (~L206)

**Problem:** `new Ajv2020({ allErrors: true, strict: false })` — `strict: false` disables warnings about unknown keywords/structural issues.

**Impact:** Schema authoring mistakes pass CI. Typos in property names not caught.

**Fix:** Change to `strict: true`.

---

### SEC-07: HUD Throttling Mixes `performance.now()` and `Date.now()` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `src/adapters/dom/hud-adapter.js` (~L28-30, L152)

**Problem:** `ARIA_LIVE_THROTTLE_MS` throttling prefers `performance.now()` but falls back to `Date.now()`. Two different time bases. Clock source change mid-session could produce incorrect intervals.

**Impact:** Accessibility: status updates may be skipped or spam.

**Fix:** Use single time base.

---

### SEC-08: `render-dom-system.js` Uses `className` Overwrite ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L224)

**Problem:** `el.className = 'sprite'` overwrites ALL classes. Future code adding classes outside render-dom-system gets silently clobbered.

**Impact:** None currently. Defense-in-depth erosion.

**Fix:** Use `classList` manipulation instead of `className` overwrite.

---

## 5) Tests & CI Gaps

### CI-01: A-12 P2 Audit Consolidation Not Started — Blocks P3+ ⬆ BLOCKING
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/implementation/ticket-tracker.md` (~L143)

**Problem:** A-12 (P2 consolidated audit + 4 deduplicated track fix reports) is `[ ]` (Not Started). Blocks B-06..B-09, C-07, A-04..A-06, A-08 (12 P3 tickets) and C-08..C-10, D-10, D-11, A-09, A-14 (7 P4 tickets). Total: 19 blocked tickets.

**Impact:** Complete P3/P4 stall. Phase 2 cannot close without A-12.

**Fix:** Complete A-12: consolidate audits, publish 4 deduplicated track reports.

---

### CI-02: A-05/A-06 Integration + E2E Tests Not Started ⬆ CRITICAL
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-05, A-06)
- `docs/implementation/track-a.md` (~L128-201)

**Problem:** A-05 (integration tests — multi-system, adapter boundaries) and A-06 (E2E Playwright audit tests) both `[ ]` (Not Started). Cross-system correctness unverified. 12 of 20 Fully Automatable audit questions lack automated browser coverage.

**Impact:** No automated verification for cross-system interaction (bomb→explosion→collision→scoring). Audit gates F-01..F-16, B-01..B-04 lack Playwright coverage.

**Fix:** Implement A-05 integration tests and A-06 E2E audit tests.

---

### CI-03: 3 Systems Without Unit Tests ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Various
- `src/ecs/systems/collision-gameplay-events.js` (Track B, B-09) — no unit test
- `src/ecs/systems/ghost-animation-system.js` (Track D, D-10) — no unit test
- `src/ecs/systems/screens-system.js` (Track C, C-05) — no unit test

**Problem:** 3 of 22 systems (14%) lack unit tests. Collision-gameplay-events and screens-system have integration/E2E only. Ghost-animation-system has zero tests.

**Impact:** No regression protection for these systems. Edge cases unexercised.

**Fix:** Add unit tests for each:
- `collision-gameplay-events.test.js`: event emission, one-shot guards, terminal state
- `ghost-animation-system.test.js`: sprite index calc, animation ticks, direction mapping
- `screens-system.test.js`: overlay class toggles, keyboard nav, screen transitions

---

### CI-04: CI Workflow Triggers on Both `pull_request` AND `pull_request_review_submitted` ⬆ HIGH
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-07)
- `.github/workflows/policy-gate.yml`

**Problem:** CI triggers on both `pull_request` (any: synchronize, opened, reopened) AND `pull_request_review_submitted`. Can fire twice on same commit. No separate lint/test:unit/validate:schema steps — everything runs inside `npm run policy`.

**Impact:** Double CI runs waste resources. No fast-fail lint/test before full policy gate.

**Fix:** Deduplicate triggers. Add separate `lint`, `test:unit`, `validate:schema` steps before `policy`.

---

### CI-05: DOM Budget Assertion 600 ≠ AGENTS.md 500 ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L311)

**Problem:** AGENTS.md: "≤ 500 total after level load." Test asserts: `toBeLessThanOrEqual(600)`. 100-element gap.

**Impact:** Performance budget not enforced against canonical standard.

**Fix:** Change to `expect(domCount).toBeLessThanOrEqual(500)`.

---

### CI-06: Phase Testing Report References Blocking Tickets That Are Now Done ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-12)
- `docs/audit-reports/phase-testing-verification-report.md` (~P2 section)

**Problem:** Report lists C-04, C-05, C-01, C-06 as blocking/pending. All now `[x]` (Done). Report stale.

**Impact:** Incorrect phase status reporting.

**Fix:** Update P2 section to reflect current ticket status.

---

### CI-07: F-13 Genre Behavior E2E Coverage Only Partial ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/audit/audit.browser.spec.js` (~L197)
- `tests/unit/systems/spawn-system.test.js`

**Problem:** F-13 E2E checks only VICTORY progression contract. Ghost-house stagger, respawn timing (game-description.md §5.4) has unit tests but no runtime browser assertion.

**Impact:** Ghost behavior visually unverified at E2E level.

**Fix:** Add Playwright step verifying ghost entities appear with correct stagger timing.

---

### CI-08: 3 E2E Tests Permanently Skipped Pending Runtime World Hook ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track A (Tickets: A-06)
- `tests/e2e/render-desync-bugs.spec.js` (~L84, L85, L104)

**Problem:** 3 tests skipped pending "runtime test-hook that exposes the ECS world". Infrastructure dependency not tracked.

**Impact:** Render desync regression coverage gap.

**Fix:** Track in A-06 ticket definition; unskip once hook available.

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Track Ownership | Description |
|----------------|---------|---------|---------|---------|---------|-----------------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | A | Event queue unbounded growth |
| BUG-02 | BUG-02 | — | — | — | — | D | Level-3 border destructible cells |
| BUG-03 | BUG-03 | — | — | — | — | D | grid2D mirror write guard |
| BUG-04 | BUG-04 | — | — | — | — | C | scoring-system dead guard |
| BUG-05 | BUG-05 | — | — | — | — | B | Explosion tile per-tick allocation |
| BUG-06 | BUG-06 | — | — | — | — | B | Collision scratch full fill |
| BUG-07 | BUG-07 | — | — | — | — | B | Detonation queue coupling |
| BUG-08 | BUG-08 | — | — | — | — | A | Empty input phase iteration |
| DEAD-01 | — | DEAD-01 | — | — | — | A | changed-files.txt tracked artifact |
| DEAD-02 | — | DEAD-24 | — | — | — | C | Duplicate SCORE constants |
| DEAD-03 | — | DEAD-25 | — | — | — | D | Legacy renderer-dom.js |
| DEAD-04 | — | DEAD-07 | — | — | — | A | test:integration --passWithNoTests |
| DEAD-05 | — | DEAD-08 | — | — | — | A | Duplicate coverage script |
| DEAD-06..32 | — | DEAD-02..32 | — | — | — | A/B/C/D | 27 minor unused exports |
| ARCH-01 | — | — | — | SEC-07* | — | C | hud-system DOM violation |
| ARCH-02 | — | — | — | — | — | D | board-sync adapter injection |
| ARCH-03 | — | — | — | — | — | A | entity-store mutable ref leak |
| ARCH-04 | — | — | — | — | — | D | ghost-animation unowned |
| ARCH-05 | — | — | — | — | CI-09 | A | Audit matrix stale status |
| ARCH-06 | — | — | ✅ | — | — | D | Render-intent contract OK |
| ARCH-07 | — | — | — | — | — | A/D | Asset pipeline format deviation |
| ARCH-08..12 | — | — | ✅ | — | — | A/B/C/D | 5 PASS confirmations |
| SEC-01 | — | — | — | SEC-02 | — | C | Storage schema validation gap |
| SEC-02 | — | — | — | SEC-03 | — | A | Map runtime JSON Schema missing |
| SEC-03 | — | — | — | SEC-01 | — | A | package.json private: false |
| SEC-04 | — | — | — | SEC-05 | — | D | Grid cell type range validation |
| SEC-05 | — | — | — | SEC-04 | — | A | isRecord accepts arrays |
| SEC-06 | — | — | — | SEC-06 | — | A | Ajv strict: false |
| SEC-07 | — | — | — | CQ-01 | — | C | HUD clock source mixing |
| SEC-08 | — | — | — | SEC-07 | — | D | className overwrite |
| CI-01 | — | — | — | — | CI-01 | A | A-12 not started ⬆ BLOCKING |
| CI-02 | — | — | — | — | CI-02 | A | A-05/A-06 not started |
| CI-03 | — | — | — | — | CI-04..06 | B/C/D | 3 systems untested |
| CI-04 | — | — | — | — | CI-11 | A | CI duplicate triggers |
| CI-05 | — | — | — | — | CI-12 | A | DOM budget 600≠500 |
| CI-06 | — | — | — | — | CI-10 | A | Phase report stale |
| CI-07 | — | — | — | — | CI-14 | A | F-13 partial E2E |
| CI-08 | — | — | — | — | CI-13 | A | 3 skipped E2E tests |

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **CI-01**: Complete A-12 P2 audit consolidation (Track A)
2. **CI-02**: Start A-05 (integration tests) and A-06 (E2E audit tests) (Track A)
3. **ARCH-01**: Fix hud-system.js DOM isolation violation (Track C)
4. **ARCH-02**: Fix board-sync-system.js adapter injection (Track D)

### Phase 2 — High Severity (immediate follow-up)
5. **SEC-01**: Implement storage schema validation (Track C)
6. **ARCH-03**: Fix entity-store mutable ref leak (Track A)
7. **ARCH-05**: Update audit-traceability-matrix stale status (Track A)
8. **CI-03**: Add unit tests for 3 untested systems (Tracks B/C/D)
9. **CI-04**: Fix CI duplicate triggers, add separate lint/test steps (Track A)

### Phase 3 — Medium Severity
10. **BUG-01**: Wire event queue drain consumer (Track A)
11. **SEC-02**: Add runtime JSON Schema validation to map-resource (Track A)
12. **SEC-03**: Set `private: true` in package.json (Track A)
13. **SEC-04**: Add cell type range validation (Track D)
14. **ARCH-04**: Add ghost-animation-system to Track D ownership (Track D)
15. **ARCH-07**: Document WebP format deviation (Track A/D)
16. **DEAD-01**: Remove changed-files.txt from tracking (Track A)
17. **DEAD-02**: Deduplicate SCORE constants (Track C)
18. **CI-05**: Fix DOM budget assertion to 500 (Track A)
19. **CI-06**: Update phase testing report (Track A)
20. **CI-07**: Add F-13 ghost stagger E2E (Track A)

### Phase 4 — Low Severity (maintenance)
21. Remainder: BUG-02..08, DEAD-03..32, SEC-05..08, CI-08

---

## Notes

- **PASS confirmations:** Frame pipeline (render collect → DOM commit), input contract (keydown/keyup + snapshot + blur clear), pause invariants (rAF active, sim frozen, timing reset), DOM pooling (offscreen transform, not display:none), structural deferral (sync point after system dispatch), render-intent buffer (pre-allocated, classBits bitmask) — all verified clean.
- **Bugfix branch bypass**: ARCH-04 (unowned ghost-animation-system) can be modified on a bugfix branch until ownership pattern is updated.
- **Duplicate SCORE constants**: C-01 scoring-system owns canonical scores; constants.js copies should be removed to prevent drift.

---

*End of report.*
