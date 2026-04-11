# Codebase Analysis & Audit Report - Final Deduplicated

**Date:** 2026-04-11
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — merged findings from independent parallel audits (Deduplicated with total verification)
**Total Issues Counted:** 64

---

## Methodology

The repository was scanned in two independent audit suites. The output of those two reports has been merged into this final, canonical deduplicated version holding unique constraints and deduplicated tickets, capturing any code snippets and specific line details identically to their original listing.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 4 |
| 🔴 Critical | 5 |
| 🟠 High | 16 |
| 🟡 Medium | 22 |
| 🟢 Low / Info | 17 |

**Top risks:**
1. Structural ECS mutation and entity-store leakage in restart flow.
2. Audit CI gates being pass-with-no-tests because behavioral metrics and E2E verifications are structurally missing or mocked.
3. Final-level progression pathways failing to transition into VICTORY, instead reloading the current state.
4. Production security pipelines fail-open on schema validations and Trust type setups with easily bypassable constraints on scanning.

---

## 1) Bugs & Logic Errors

### BUG-01: Restart corrupts clock baseline with undefined timestamp ⬆ Blocking
**Origin:** Agent 1 (BUG-01)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/game/bootstrap.js` (~L81, ~L98, ~L100)
- `src/ecs/resources/clock.js` (~L89)

**Problem:** Restart passes `clock.realTimeMs` into `resetClock`, but this field is undefined in the active clock resource model.
**Impact:** `lastFrameTime` becomes invalid, causing NaN step math and potential simulation freeze/desync after restart.

**Fix:** Use a finite timestamp source (`performance.now()` wrapper) on restart and resync timing baseline immediately after successful restart.

**Tests to add:** Restart integration test asserting finite step count and monotonic sim-time progress in subsequent frames.

---

### BUG-02: Final level completion does not transition to VICTORY ⬆ Critical
**Origin:** Agent 1 (BUG-02), Codex H-01, Qwen H-02 (Track A: A-03, A-08)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/level-loader.js` (~L114, ~L115)
- `src/game/game-flow.js` (~L82-89, ~L96-L104)
- `docs/game-description.md` (~L348)

**Problem:** When on the last level and achieving `LEVEL_COMPLETE`, `advanceLevel()` returns `null` (no next level exists), but the game transitions to `PLAYING` instead of `VICTORY`. The last level simply restarts instead of showing the victory screen.
**Impact:** Endgame path can incorrectly re-enter gameplay with no valid level progression. Players completing the final level never see the victory screen — the game loops the last level.

**Fix:** In the `startGame()` LEVEL_COMPLETE flow, check the result of `advanceLevel()`; if `null`, transition to `VICTORY` instead of `PLAYING`.
```js
if (gameStatus.currentState === GAME_STATE.LEVEL_COMPLETE) {
  const nextLevel = levelLoader.advanceLevel({ reason: 'level-complete' });
  if (nextLevel === null) {
    return safeTransition(gameStatus, GAME_STATE.VICTORY);
  }
  applyPauseFromState(clock, gameStatus);
  return gameStatus.currentState === GAME_STATE.PLAYING;
}
```

**Tests to add:** Unit test in `tests/unit/game/game-flow.test.js` (advanceLevel -> null must transition to VICTORY), integration test in `tests/integration/gameplay/game-flow.level-loader.test.js`, Playwright E2E for last-level → VICTORY transition.

---

### BUG-03: Map-load failures are accepted as successful game start / Game can enter PLAYING with invalid/null map resource ⬆ Critical
**Origin:** Agent 1 (BUG-03), Codex H-03 (Track A: A-03)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/bootstrap.js` (~L70)
- `src/game/level-loader.js` (~L80, ~L95, ~L103)
- `src/game/game-flow.js` (~L81, ~L87, ~L93)

**Problem:** `loadLevel` can return `null`, but start flow still returns success and transitions to `PLAYING`. No validation that the map resource is valid before transitioning to `PLAYING` state. Future gameplay systems may crash or behave unpredictably if the map resource is missing.
**Impact:** Active gameplay can start with missing map resource and undefined downstream behavior. Runtime crash or undefined behavior path for systems that depend on a valid map.

**Fix:** Load and validate map before PLAYING transition; fail closed on null map load (throw/return false) and keep state out of `PLAYING` until map resource is valid, preserving last known-good map.

**Tests to add:** Failed-load start path test and map preservation test; Unit test where loader returns null, asserting game remains in non-playing state and surfaces critical failure.

---

### BUG-04: `startGame()` is non-idempotent when already PLAYING — clock reset ⬆ High
**Origin:** Codex H-02, Qwen H-01 (Track A: A-03)
**Files:**
- `src/game/game-flow.js` (~L90-92, ~L109)
- `src/main.ecs.js` (~L156-160, ~L185-186)

**Problem:** When `startGame()` is called while the game is already in `PLAYING` state, it returns `true`. The caller in `main.ecs.js` uses this return value to decide whether to call `resyncTime(getNow())`, which resets the timing baseline mid-gameplay causing frame skips or stutters.

**Impact:** UI double-clicks or race conditions calling `startGame()` during active gameplay would reset the clock baseline, causing the next frame to see a very small delta and not advance simulation steps.

**Fix:**
```js
// In game-flow.js startGame():
if (gameStatus.currentState === GAME_STATE.PLAYING) {
  return false; // Already playing, no action needed
}
```
**Tests to add:** Repeated-start no-op unit test, integration timing assertion.

---

### BUG-05: Out-of-bounds map access can be treated as passable ⬆ High
**Origin:** Agent 1 (BUG-04), Codex H-04, Qwen L-08 (Track D: D-03)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/ecs/resources/map-resource.js` (~L393-L394, ~L449, ~L456, ~L468-L470)

**Problem:** `isPassable()` and related wall queries do not perform strict bounds checking. Out-of-range row/col values can escape the grid and produce downstream logic corruption. Additionally, `dimensions.width/height` could disagree with `grid.length`, enabling out-of-bounds access.
**Impact:** Movement/pathing can query invalid positions as traversable near map edges, allowing actors to escape the grid and creating downstream logic corruption.

**Fix:** Add explicit strict bounds helper and short-circuit `false` for out-of-range in passability/wall queries. Treat OOB as blocked. Add dimension-to-grid validation in `validateMapSemantic`.

**Tests to add:** Negative and overflow coordinate passability tests in `tests/unit/resources/map-resource.test.js` for player/ghost checks; fuzz tests for malformed input.

---

### BUG-06: Non-positive frame deltas force artificial simulation progress ⬆ Medium
**Origin:** Agent 1 (BUG-05)
**Files:** Ownership: Track D (`src/ecs/resources/**`)
- `src/ecs/resources/clock.js` (~L67)
- `src/ecs/resources/clock.js` (~L68)

**Problem:** When frame delta is `<= 0`, logic substitutes fixed dt instead of no-op.
**Impact:** Timing anomalies can inject synthetic simulation steps and harm determinism.

**Fix:** Clamp to zero, update baseline safely, and return zero steps for zero-delta frames.

**Tests to add:** Clock unit test for equal timestamps expecting no simulation advancement.

---

### BUG-07: Semantic validator can throw TypeError on malformed map payloads ⬆ Medium
**Origin:** Codex M-01, Codex H-08 (Track D: D-03)
**Files:**
- `src/ecs/resources/map-resource.js` (~L146, ~L157, ~L175, ~L231, ~L232, ~L336)

**Problem:** Hard crash path (TypeError) instead of deterministic validation error reporting when map payload is malformed.
**Impact:** Runtime crash risk from malformed map payloads instead of controlled rejection.

**Fix:** Add strict structural preflight and in-bounds guards before semantic traversal; accumulate validation errors rather than throwing.

---

### BUG-08: `loadLevel` commits level index before successful map resolve ⬆ Medium
**Origin:** Codex M-02 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L91, ~L95)

**Problem:** Failed load can desynchronize level index and world resource state.

**Fix:** Resolve into temporary variable first, commit index/resource only on success.

---

### BUG-09: `tickClock` maxDelta uses hardcoded multiplier instead of `maxStepsPerFrame` ⬆ Medium
**Origin:** Qwen M-03 (Track D: D-01)
**Files:**
- `src/ecs/resources/clock.js` (~L68-71)

**Problem:** `maxDelta = fixedDtMs * 10` is hardcoded, but `maxStepsPerFrame` defaults to 5. This mismatch causes unnecessary accumulator accumulation that must later be clamped.

**Fix:**
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

---

### BUG-10: Event queue `orderCounter` never auto-reset between frames ⬆ Medium
**Origin:** Qwen M-04 (Track D: D-01)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Counter grows monotonically during gameplay and is only reset on level restart. JSDoc claims it's "called once per fixed simulation step" but no such automatic call exists. Over very long play sessions, the counter could approach `Number.MAX_SAFE_INTEGER`.

**Fix:** Add automatic reset in `runFixedStep` world method, or document that systems must drain events each frame.

---

### BUG-11: Frame probe "latest" metric reports max sample instead of most recent ⬆ Low
**Origin:** Agent 1 (BUG-06)
**Files:** Ownership: Track A (`src/main.ecs.js`)
- `src/main.ecs.js` (~L82)

**Problem:** Latest frame metric is derived from sorted percentile array rather than ring-buffer cursor.
**Impact:** Telemetry/debug data can misrepresent current frame health.

**Fix:** Track latest delta separately or compute from cursor index before sorting.

**Tests to add:** Probe unit test with non-monotonic deltas ensuring latest != max behavior.

---

### BUG-12: `clock.js` `resyncTime` does not clamp accumulator to zero ⬆ Low
**Origin:** Qwen L-10 (Track D: D-01)
**Files:**
- `src/ecs/resources/clock.js`

**Problem:** If accumulator has leftover time from before resync, it could cause a burst step on next tick.

**Fix:** Add `this.accumulator = 0` in `resyncTime`.

---

### BUG-13: `clampLevelIndex` redundant `Math.floor` after bounds check ⬆ Low
**Origin:** Qwen L-02 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L12-19)

**Problem:** `Math.floor` could theoretically produce a value > maxLevel if input is a float just below an integer boundary.

**Fix:** Add final `Math.min(result, maxLevel)` guard.

---


## 2) Dead Code & Unused References

### DEAD-01: Unreachable `package.json` dependency-ban branch in policy checks ⬆ High
**Origin:** Codex H-05 (Track A: A-01, A-07)
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L477, ~L515, ~L553)

**Problem:** Intended dependency-ban logic for `package.json` is effectively dead because it falls inside a source-only scan gate. Produces false confidence that dependencies are checked.

**Fix:** Move `package.json` checks outside source-only scan gate, or explicitly include `package.json` in scanned targets.

---

### DEAD-02: Unreachable fallback branch in ticket-association logic ⬆ Medium
**Origin:** Agent 2 (DEAD-01)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/run-checks.mjs` (~L116, ~L127, ~L137)

**Problem:** Conditional branches already fully partition zero-ticket cases; trailing zero-ticket branch is unreachable.
**Impact:** Redundant control flow obscures intent in policy-critical logic.

**Fix:** Remove unreachable branch and keep two explicit mode-specific zero-ticket outcomes.

---

### DEAD-03: Dead conditional in `createSyncMapLoader` restart path ⬆ Medium
**Origin:** Agent 2 (DEAD-02), Codex M-03, Qwen M-01 (Track A: A-03)
**Files:** Ownership: Track A (`src/game/**`)
- `src/game/level-loader.js` (~L51-L64)

**Problem:** `options.restart` and default path execute identical return logic (`cloneMap(baseMap)`). Both branches do the same thing — misleads readers into thinking restart vs. non-restart loads behave differently.
**Impact:** Redundant API surface implies unsupported mode distinction.

**Fix:** Collapse to one return path, or implement truly different restart semantics.

---

### DEAD-04: ECS scaffolding modules are production-dead (test-only references) ⬆ Medium
**Origin:** Agent 2 (DEAD-04)
**Files:** Ownership: Track B (`src/ecs/components/**`), Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`)
- `src/ecs/components/spatial.js` (~L48)
- `src/ecs/components/props.js` (~L49)
- `src/ecs/components/stats.js` (~L33)
- `src/ecs/resources/event-queue.js` (~L32)
- `src/ecs/resources/rng.js` (~L32)
- `src/ecs/render-intent.js` (~L49)

**Problem:** Several exported modules are exercised in unit tests but not wired into active runtime bootstrap graph.
**Impact:** Maintained production API surface with no runtime effect increases drift risk.

**Fix:** Either integrate modules into runtime paths or clearly isolate as planned scaffolding/non-runtime contracts.

---

### DEAD-05: Ownership rules contain stale patterns for non-existent files ⬆ Medium
**Origin:** Agent 2 (DEAD-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L182, ~L260-L261, ~L280-L281)

**Problem:** Track policies reference files not present in repository.
**Impact:** Dead metadata reduces trust in ownership enforcement precision.

**Fix:** Remove stale patterns or create the referenced files before ownership declaration.

---

### DEAD-06: Redundant `cachedMapResource` option plumbing ⬆ Medium
**Origin:** Codex M-04 (Track A: A-03)
**Files:**
- `src/game/level-loader.js` (~L86, ~L100)
- `tests/unit/resources/map-resource.test.js` (~L489)

**Problem:** API surface grows without runtime usage.

**Fix:** Remove option until needed, or document as intentionally reserved.

---

### DEAD-07: `getSystemOrder` return value rarely consumed ⬆ Low
**Origin:** Qwen (Dead Code table) (Track A: A-02)
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** External code rarely calls this, increasing API surface with minimal value.

**Fix:** Evaluate removal or document internal-only usage.

---

### DEAD-08: `advanceLevel` options object only uses `reason` property ⬆ Low
**Origin:** Qwen L-06 (Track A: A-03)
**Files:**
- `src/game/level-loader.js`

**Problem:** Dead API surface — accepts options object but only uses `reason`.

**Fix:** Simplify to `advanceLevel(reason)` or document future extensibility.

---

### DEAD-09: Generated artifacts are committed but excluded from active checks ⬆ Low
**Origin:** Agent 2 (DEAD-06)
**Files:** Ownership: Track A (`coverage/**`, `biome.json`), Shared (`**/.gitkeep`)
- `coverage/index.html` (~L1)
- `test-results/.last-run.json` (~L1)
- `biome.json` (~L27, ~L29)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L51, ~L53)

**Problem:** Generated coverage/test-result files are tracked yet skipped by lint/policy scanning.
**Impact:** Stale, noisy artifacts with low governance signal.

**Fix:** Untrack generated outputs or enforce freshness checks if committed by policy.

---

### DEAD-10: JSDoc signatures drift from implementation ⬆ Low
**Origin:** Agent 2 (DEAD-07), Qwen M-02, Qwen Dead Code table
**Files:** Ownership: Track D (`src/ecs/resources/**`, `src/ecs/render-intent.js`)
- `src/ecs/resources/map-resource.js` (~L26 vs implementation ~L449)
- `src/ecs/resources/event-queue.js` (unimplemented `resetOrderCounter` claims)
- `src/ecs/render-intent.js` (~L16, ~L127)

**Problem:** Documented function signatures mismatch actual exported parameter lists. For example, JSDoc claims `isPassable(map, row, col, isGhost)` but implementation is `isPassable(map, row, col)`. `resetOrderCounter` claims to be called per-frame but isn't.
**Impact:** Incorrect API expectations and onboarding confusion. Callers passing `isGhost=true` will get incorrect results silently.

**Fix:** Align JSDoc with current code contracts (or restore documented parameters if intended).

---

### DEAD-11: Duplicate npm scripts for same policy command ⬆ Low
**Origin:** Codex L-01 (Track A: A-01)
**Files:**
- `package.json` (~L17, ~L35)

**Problem:** Script drift and maintenance overhead.

**Fix:** Keep one canonical script and deprecate alias.

---

### DEAD-12: Tracked `changed-files.txt` artifact appears stale ⬆ Low
**Origin:** Codex L-02 (Track A: A-01)
**Files:**
- `changed-files.txt` (~L1)
- `.gitignore` (~L42)

**Problem:** Noise and confusion in repository state.

**Fix:** Remove tracked artifact from version control and regenerate only in CI/local gate runs.

---


## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Render commit architecture is not wired into runtime ⬆ Blocking
**Origin:** Agent 3 (ARCH-01)
**Violated rule:** "Batching: MUST batch DOM writes in a dedicated render commit phase once per frame." and "Commit Phases: MUST separate render read/compute from DOM write commit phases."
**Files:** Ownership: Track A (`src/main.ecs.js`, `src/game/**`), Track D (`src/ecs/render-intent.js`)
- `src/main.ecs.js` (~L304)
- `src/game/bootstrap.js` (~L91)
- `src/ecs/render-intent.js` (~L4)

**Problem:** Runtime bootstrap starts loop without explicit render-collect/render-commit system wiring.
**Impact:** Performance and architecture drift; render intent remains contract-only rather than enforced phase behavior.

**Fix:** Register ordered phases in bootstrap: input snapshot -> simulation -> render collect -> single DOM commit per rAF.

---

### ARCH-02: Restart flow performs immediate structural mutation and breaks entity opacity ⬆ Blocking
**Origin:** Agent 3 (ARCH-03), Codex C-01 (Track A: A-02, A-03)
**Violated rule:** "Structure: MUST structure gameplay with ECS: entities as opaque IDs, components as data-only, systems as behavior." and "Structural Deferral: MUST defer entity/component add/remove operations to a controlled sync point."
**Files:** Ownership: Track A (`src/game/**`, `src/ecs/world/**`)
- `src/game/game-flow.js` (~L41-61)
- `src/ecs/world/world.js` (~L83, ~L93, ~L103, ~L114)

**Problem:** `destroyAllEntities` during restart logic reaches into entity-store internals and performs immediate structural mutation. This violates the ECS requirement that structural changes must be deferred. Additionally leaks the entity store reference outside the world boundary.
**Impact:** Order-sensitive bugs, determinism risk, and encapsulation leakage. Allocation during game restart via `getActiveIds()` creating new arrays every call.

**Fix:** Add world-level deferred teardown API/command that schedules structural mutations for sync-point application; remove direct `entityStore` access from `game-flow`. Consider batch destroy API on entity store.

---

### ARCH-03: Input adapter resource injection contract is not satisfied ⬆ Critical
**Origin:** Agent 3 (ARCH-02), Agent 2 (DEAD-03)
**Violated rule:** "Adapter Injection: Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly."
**Files:** Ownership: Track A (`src/game/**`), Track B (`src/ecs/systems/input-system.js`)
- `src/game/bootstrap.js` (~L86, ~L89, ~L126)
- `src/ecs/systems/input-system.js` (~L37)

**Problem:** Input system expects `inputAdapter` resource, but bootstrap does not register/inject it.
**Impact:** Deterministic input contract cannot be structurally guaranteed in active runtime.

**Fix:** Instantiate input adapter at bootstrap, register as world resource, and teardown in lifecycle stop path.

---

### ARCH-04: Deterministic cross-system event ordering is defined but not integrated ⬆ High
**Origin:** Agent 3 (ARCH-04)
**Violated rule:** "Event Ordering: MUST process cross-system events in deterministic insertion order."
**Files:** Ownership: Track D (`src/ecs/resources/**`), Track A (`src/game/**`)
- `src/ecs/resources/event-queue.js` (~L32, ~L67)
- `src/game/bootstrap.js` (~L86)

**Problem:** Event queue resource exists but is not registered/consumed in active world step.
**Impact:** Required deterministic event pipeline is not enforced in runtime behavior.

**Fix:** Register event queue resource, reset sequence per fixed-step boundary, and define producer/consumer phases.

---

### ARCH-05: World API allows immediate structural mutation during dispatch ⬆ High
**Origin:** Codex H-06 (Track A: A-02)
**Violated rule:** Structural changes must be deferred
**Files:**
- `src/ecs/world/world.js` (~L55, ~L61, ~L141)

**Problem:** Mid-dispatch mutation can create hidden nondeterminism and ordering bugs. The world's `addEntity`/`removeComponent`/etc. methods are callable during system dispatch without any guard.

**Fix:** Enforce dispatch guard that rejects immediate mutators during `runFixedStep`; require defer APIs for runtime/system paths.

---

### ARCH-06: ECS World exposes mutable internal state — `entityStore` and `systemOrder` ⬆ High
**Origin:** Qwen H-03 (Track A: A-02)
**Files:**
- `src/ecs/world/create-world.js`

**Problem:** `getEntityStore()` and `getSystemOrder()` return direct references to internal arrays/objects. External code can mutate these without going through the world API, breaking ECS encapsulation.

**Impact:** Any system or external code holding a reference to the entity store could corrupt entity tracking, causing crashes or silent data corruption.

**Fix:** Return immutable views or safe proxy objects:
```js
getEntityStore() {
  return {
    hasComponent: (entity, componentType) =>
      this.entityStore.hasComponent(entity, componentType),
    getComponent: (entity, componentType) =>
      this.entityStore.getComponent(entity, componentType),
    // ... expose only safe read methods
  };
}
```

---

### ARCH-07: `EntityStore` missing boundary validation in `hasComponent`/`getComponent` ⬆ High
**Origin:** Qwen H-04 (Track A: A-02)
**Files:**
- `src/ecs/world/entity-store.js` (~L55-66)

**Problem:** No bounds checking on entity ID access. An invalid or stale entity ID can cause array out-of-bounds access or return garbage data. No stale-handle protection via generation checking.

**Impact:** Silent data corruption or crashes when systems query destroyed entities.

**Fix:**
```js
hasComponent(entityHandle, componentType) {
  const { id, generation } = entityHandle;
  if (id < 0 || id >= this.generations.length) return false;
  if (this.generations[id] !== generation) return false;
  const mask = this.componentMasks[id];
  return mask !== undefined && (mask & (1 << componentType)) !== 0;
}
```

---

### ARCH-08: Render phase coupled to fixed-step simulation loop ⬆ High
**Origin:** Codex H-07 (Track A: A-02, A-03)
**Violated rule:** One dedicated DOM commit per frame with clear read/compute vs write boundaries
**Files:**
- `src/ecs/world/world.js` (~L16, ~L141)
- `src/game/bootstrap.js` (~L100)

**Problem:** During catch-up, render-related systems may run more than once per frame, increasing DOM pressure. Render should be decoupled from fixed-step simulation and run once per `requestAnimationFrame`.

**Fix:** Split simulation stepping and render commit; keep DOM commit once per `requestAnimationFrame`.

---

### ARCH-09: Render-intent contract drifts from implementation-plan specification ⬆ Medium
**Origin:** Agent 3 (ARCH-06)
**Violated rule:** Implementation contract mismatch between `docs/implementation/implementation-plan.md` §5 and `src/ecs/render-intent.js`.
**Files:** Ownership: Shared (`docs/**`), Track D (`src/ecs/render-intent.js`)
- `docs/implementation/implementation-plan.md` (~L536-L544)
- `src/ecs/render-intent.js` (~L52-L60)

**Problem:** Planned object-array/string-kind/row-col contract differs from typed-array/enum/x-y implementation.
**Impact:** Encapsulation and cross-track contract ambiguity.

**Fix:** Choose one canonical contract and align both docs and code (including tests and adapter consumers).

---

### ARCH-10: Asset-pipeline runtime contract is not implemented in bootstrap path ⬆ Medium
**Origin:** Agent 3 (ARCH-07)
**Violated rule:** "Runtime loads assets from manifests only." and "Critical startup assets are preloaded."
**Files:** Ownership: Shared (`docs/**`), Track A (`src/game/**`), Track D (`src/ecs/render-intent.js`)
- `docs/implementation/assets-pipeline.md` (~L86-L89)
- `src/game/bootstrap.js` (~L86)
- `src/ecs/render-intent.js` (~L55)

**Problem:** Manifest-backed visual/audio preload resources are not wired in active runtime bootstrap.
**Impact:** Performance/startup contract drift and potential runtime inconsistency with documented pipeline.

**Fix:** Register manifest loaders/resources in bootstrap and preload critical assets prior to gameplay start.

---

### ARCH-11: Track ownership policy drift between docs and policy-utils rules ⬆ Medium
**Origin:** Agent 3 (ARCH-08)
**Violated rule:** Track boundary ownership declarations in track docs versus policy gate ownership map.
**Files:** Ownership: Shared (`docs/**`), Track A (`scripts/policy-gate/**`)
- `docs/implementation/track-b.md` (~L30, ~L52)
- `docs/implementation/track-d.md` (~L89)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L192, ~L261)

**Problem:** Shared/single-owner expectations for specific component paths are inconsistent across canonical docs and enforcement code.
**Impact:** Encapsulation/governance ambiguity and avoidable gate noise.

**Fix:** Normalize ownership in one authoritative mapping and mirror exactly in policy-utils.

---

### ARCH-12: Input adapter contract leak via fallback field probing ⬆ Medium
**Origin:** Codex M-05 (Track A: A-03; Track B: B-02)
**Files:**
- `src/main.ecs.js` (~L97, ~L107)
- `src/game/bootstrap.js` (~L125)

**Problem:** Tight coupling to adapter internals and brittle future adapter swaps. Systems probe for specific fields on the adapter object instead of using a formal interface.

**Fix:** Require explicit adapter interface methods and validate at registration.

---

### ARCH-13: `DOMPool` `release()` does not remove event listeners ⬆ Medium
**Origin:** Qwen M-05 (Track D: D-09)
**Files:**
- `src/render/dom-pool.js` (~L48-54)

**Problem:** If any code adds event listeners to pooled elements, those listeners persist when elements are released and re-used. This causes listener accumulation and potential memory leaks or duplicate event firing.

**Fix:** Document that pooled elements must not have listeners, or implement a listener cleanup mechanism.

---

### ARCH-14: Systems can access resources without capability gating ⬆ Medium
**Origin:** Qwen (Architecture table) (Track A: A-02)
**Files:**
- World design overall

**Problem:** Any system can access any resource through the world API with no capability restrictions. This weakens ECS isolation.

**Fix:** Consider resource access policies or at minimum document trusted access boundaries.

---

### ARCH-15: `EventQueue` `drain()` returns reference to internal array ⬆ Low
**Origin:** Qwen L-09 (Track D: D-01)
**Files:**
- `src/ecs/resources/event-queue.js`

**Problem:** Callers could mutate returned array or hold reference after drain, breaking encapsulation.

**Fix:** Return a copy or iterator.

---


## 4) Code Quality & Security

### SEC-01: Policy-gate security scan can be bypassed by editing excluded gate files ⬆ Critical
**Origin:** Agent 4 (SEC-03)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/run-checks.mjs` (~L653, ~L697, ~L776)

**Problem:** Changed-file scanning excludes policy-gate script paths, enabling self-modification bypass.
**Impact:** Security/process enforcement can be weakened within the same PR that changes gate code.

**Fix:** Include policy-gate files in scans, require stronger review ownership, and fail on unauthorized gate mutation patterns.

---

### SEC-02: Production CSP and Trusted Types enforcement is missing ⬆ High
**Origin:** Agent 4 (SEC-01), Codex M-06 (Track A: A-01, A-07)
**Files:** Ownership: Track A (`index.html`, `vite.config.js`)
- `index.html` (~L4, ~L15)
- `vite.config.js` (~L3, ~L4)
- `AGENTS.md` (~L151, ~L156)

**Problem:** Entry/build surfaces do not enforce strict CSP/Trusted Types for production.
**Impact:** Increases exploitability of any present/future DOM injection bug. Lower defense-in-depth against future sink regressions. AGENTS.md mandates strict CSP and Trusted Types for production builds.

**Fix:** Enforce production CSP response headers (preferred) including `require-trusted-types-for 'script'`; keep development relaxation limited to HMR paths.

---

### SEC-03: Schema validation script can fail-open on missing schema/data files ⬆ High
**Origin:** Agent 4 (SEC-02), Codex M-08 (Track A: A-07)
**Files:** Ownership: Track A (`scripts/validate-schema.mjs`)
- `scripts/validate-schema.mjs` (~L62, ~L63)

**Problem:** Missing validation inputs log warnings and continue/pass instead of failing.
**Impact:** Tampered/malformed assets can bypass CI validation guarantees.

**Fix:** Treat missing required schema/data files (schemas/manifests/maps) as hard failures and exit non-zero in CI. Allowlist optional files explicitly.

---

### SEC-04: Runtime map trust boundary is not strictly enforced ⬆ High
**Origin:** Codex H-09 (Track A: A-03; Track D: D-03)
**Files:**
- `src/game/level-loader.js` (~L80, ~L95)
- `src/ecs/resources/map-resource.js` (~L334)

**Problem:** Untrusted or malformed loader outputs can enter world state without schema or semantic validation at the load boundary.

**Fix:** Enforce schema plus semantic validation at load boundary before `setResource`.

---

### SEC-05: Repo-wide forbidden-tech scanner has incomplete pattern coverage ⬆ Medium
**Origin:** Agent 4 (SEC-04)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/check-forbidden.mjs` (~L19, ~L20)
- `scripts/policy-gate/run-all.mjs` (~L246)
- `scripts/policy-gate/run-checks.mjs` (~L628)

**Problem:** Repo scanner focuses on limited forbidden patterns; broader dangerous APIs are not consistently enforced repo-wide.
**Impact:** Reduced confidence that banned constructs are uniformly blocked.

**Fix:** Centralize comprehensive forbidden-pattern set and reuse in both full-repo and changed-file checks.

---

### SEC-06: Security scanning is primarily changed-file scoped ⬆ Medium
**Origin:** Codex M-07 (Track A: A-01)
**Files:**
- `scripts/policy-gate/run-checks.mjs` (~L514, ~L579)
- `scripts/policy-gate/run-all.mjs` (~L200)

**Problem:** Existing risky patterns in untouched files may persist undetected. Policy gate only scans diff files for forbidden sinks.

**Fix:** Add full-repo security scan stage in CI (or nightly) using same sink checks.

---

### SEC-07: Approval requirement enforcement is fail-open on CI/API misconfiguration ⬆ Medium
**Origin:** Agent 4 (SEC-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`)
- `scripts/policy-gate/require-approval.mjs` (~L27, ~L33, ~L47, ~L54)

**Problem:** Missing token/review URL/API failures lead to skip/continue outcomes.
**Impact:** Independent-review guarantees can silently degrade.

**Fix:** Fail closed in CI when approval is required and review-state cannot be reliably verified.

---

### SEC-08: Repetitive runtime error loop risk without escalation budget ⬆ Low
**Origin:** Codex L-03 (Track A: A-02, A-03)
**Files:**
- `src/main.ecs.js` (~L192, ~L209)
- `src/ecs/world/world.js` (~L144)

**Problem:** Persistent per-frame exceptions can degrade performance and observability without any circuit-breaker.

**Fix:** Add per-system error budget and temporary quarantine/escalation after threshold.

---

### SEC-09: `renderCriticalError` uses `textContent` — safe but limited formatting ⬆ Low
**Origin:** Qwen L-03 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L87-92)

**Problem:** Safe from injection, but error messages with multiple issues are hard to read as plain text.

**Fix:** Consider structured error display with `<pre>` or `<code>` blocks.

---

### SEC-10: `UNHANDLED_REJECTION_HOOK_KEY` could conflict with other libraries ⬆ Low
**Origin:** Qwen L-04 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L96)

**Problem:** Unlikely but possible collision if other code uses same window property string key.

**Fix:** Use `Symbol` instead of string key.

---

### SEC-11: `createDOMRenderer` accepts `hudQueries` but never validates query results ⬆ Low
**Origin:** Qwen L-07 (Track D: D-06)
**Files:**
- `src/render/render-ecs.js`

**Problem:** If HUD elements are missing from DOM, renderer silently produces no HUD updates.

**Fix:** Add `console.warn` if expected elements are not found.

---


## 5) Tests & CI Gaps

### CI-01: CI pass with effectively no browser verification / merge gate does not execute browser E2E tests ⬆ Critical
**Origin:** Agent 5 (CI-02), Codex B-01 (Track A: A-01)
**Files:** Ownership: Track A (`.github/workflows/**`, `scripts/policy-gate/**`, `package.json`)
- `.github/workflows/policy-gate.yml` (~L51)
- `scripts/policy-gate/run-project-gate.mjs` (~L19)
- `package.json` (~L18, ~L21, ~L22)

**Problem:** CI quality path runs policy + Vitest but does not require Playwright execution. Audit-required browser and gameplay checks can be absent while pipeline is green. The gate has pass-with-no-tests behavior.
**Impact:** Browser/runtime regressions can merge without detection.

**Fix:** Add required `test:e2e` execution in merge gate or dedicated required workflow. Remove pass-with-no-tests behavior.

---

### CI-02: Audit behavior verification is structurally unsatisfiable / test is inventory-only ⬆ Blocking
**Origin:** Agent 3 (ARCH-05), Agent 5 (CI-01), Codex B-02 (Track A: A-06)
**Violated rule:** "MUST maintain end-to-end/integration verification coverage for every question... with explicit automated checks..."
**Files:** Ownership: Track A (`tests/**`, `package.json`, `playwright.config.js`)
- `tests/e2e/audit/audit.e2e.test.js` (~L6, ~L21)
- `tests/e2e/audit/audit-question-map.js` (~L3)
- `package.json` (~L23)
- `playwright.config.js` (~L6)

**Problem:** Audit suite validates inventory counts rather than behavior; Playwright excludes audit folder. The audit test only checks that audit IDs are listed — it does not execute any behavior verification.
**Impact:** Architecture/process cannot prove required audit gates are executable and passable. False confidence that audit IDs are validated.

**Fix:** Convert audit IDs to executable browser/perf/manual-evidence workflows and include them in CI-required Playwright runs. Add executable assertions per audit ID or enforce evidence validators for each mapped question.

---

### CI-03: Semi-automatable and manual evidence categories are not CI-enforced / lack threshold assertions ⬆ High
**Origin:** Agent 5 (CI-03), Codex B-03 (Track A: A-09)
**Files:** Ownership: Track A (`tests/**`, `AGENTS.md`)
- `tests/e2e/game-loop.pause.spec.js` (~L10)
- `tests/e2e/audit/audit-question-map.js` (~L100, ~L108, ~L156)
- `AGENTS.md` (~L186, ~L205, ~L207)
- `docs/audit-reports/phase-testing-verification-report.md` (~L29, ~L30)
- `scripts/policy-gate/run-checks.mjs` (~L401)

**Problem:** Performance-related audit IDs are mapped but not asserted with measurable thresholds. Performance and trace-based acceptance criteria (F-17, F-18, B-05, F-19, F-20, F-21, B-06) can regress silently.
**Impact:** p95/FPS/long-task criteria can be claimed without objective pass/fail evidence.

**Fix:** Add Playwright `page.evaluate` + `PerformanceObserver` probes with explicit thresholds for F-17/F-18/B-05. Require a manual-evidence manifest with artifact paths in CI.

---

### CI-04: Coverage gate scope can be inflated by test files ⬆ High
**Origin:** Agent 5 (CI-04), Codex H-12 (Track A: A-01)
**Files:** Ownership: Track A (`vitest.config.js`, `scripts/policy-gate/**`)
- `vitest.config.js` (~L11, ~L12)
- `scripts/policy-gate/run-project-gate.mjs` (~L20)

**Problem:** Coverage target/include scope is not strictly source-only and lacks strict thresholds. Test files are included in the coverage target.
**Impact:** Coverage signal may overstate production-code verification.

**Fix:** Restrict include to source paths (`src/`) and enforce explicit global/per-file thresholds, excluding `tests/`.

---

### CI-05: Policy gate checks inventory parity but not audit-category/evidence obligations ⬆ High
**Origin:** Agent 5 (CI-05)
**Files:** Ownership: Track A (`scripts/policy-gate/**`, `docs/implementation/pr-template.md`)
- `scripts/policy-gate/run-checks.mjs` (~L52, ~L599, ~L604)
- `scripts/policy-gate/lib/policy-utils.mjs` (~L31)

**Problem:** Current checks validate question IDs/counts but not strict category partitions or manual evidence presence.
**Impact:** AGENTS audit obligations can be bypassed while still passing gate.

**Fix:** Enforce category membership and mandatory manual-evidence links for manual IDs in gate logic.

---

### CI-06: Functional E2E coverage is too narrow for documented scope ⬆ High
**Origin:** Codex H-10, Qwen (Test & CI Gaps table) (Track A: A-06)
**Files:**
- `tests/e2e/game-loop.pause.spec.js`
- `tests/e2e/game-loop.unhandled-rejection.spec.js`
- `docs/audit.md` (~L26)

**Problem:** Many core gameplay and HUD behaviors remain unverified in real browser runs. Only pause and unhandled-rejection scenarios have E2E tests.
**Missing tests:**
- Pause continue/restart flow
- Timer/lives/score HUD changes
- Keyboard controls verification
- Level progression and last-level → VICTORY
- `startGame()` called during PLAYING state
- DOM pool listener leak integration test
- Event queue `orderCounter` growth stress test
- Fuzz testing for map resource with malformed input

**Fix:** Add scenario E2E tests for each of the above.

---

### CI-07: Adapter-boundary integration coverage is effectively empty ⬆ High
**Origin:** Codex H-11 (Track A: A-05)
**Files:**
- `tests/integration/adapters/.gitkeep`
- `vitest.config.js` (~L6)
- `docs/audit-reports/phase-testing-verification-report.md` (~L16)

**Problem:** Adapter contracts can break unnoticed. The integration/adapters directory contains only a `.gitkeep`.

**Fix:** Add jsdom integration suite for adapter boundaries and ensure CI runs it as required.

---

### CI-08: Playwright pause test uses fixed sleeps (flakiness risk) ⬆ Medium
**Origin:** Agent 5 (CI-07), Codex M-09 (Track A: A-06)
**Files:** Ownership: Track A (`tests/**`)
- `tests/e2e/game-loop.pause.spec.js` (~L21, ~L29, ~L38)

**Problem:** Fixed `waitForTimeout` calls in Playwright tests cause nondeterministic CI failures under load variance.
**Impact:** Intermittent CI failures and timing-sensitive false positives.

**Fix:** Replace fixed waits with state-driven waits using `expect.poll` or `page.waitForFunction`.

---

### CI-09: Source-header policy is warning-only in CI ⬆ Medium
**Origin:** Agent 5 (CI-06), Codex L-04 (Track A: A-01)
**Files:** Ownership: Track A (`.github/workflows/**`, `scripts/policy-gate/**`)
- `.github/workflows/policy-gate.yml` (~L26)
- `scripts/policy-gate/check-source-headers.mjs` (~L22, ~L176, ~L178)

**Problem:** Header policy violations do not fail CI.
**Impact:** Mandatory header standard can drift indefinitely.

**Fix:** Use fail mode in CI; reserve warn mode for local/non-gating workflows.

---

### CI-10: Audit/phase documentation is out of sync with executable test reality ⬆ Medium
**Origin:** Agent 5 (CI-08)
**Files:** Ownership: Shared (`docs/**`), Track A (`docs/implementation/ticket-tracker.md`)
- `docs/implementation/audit-traceability-matrix.md` (~L30)
- `docs/audit-reports/phase-testing-verification-report.md` (~L18, ~L66, ~L77, ~L88)
- `docs/implementation/ticket-tracker.md` (~L33, ~L35)

**Problem:** Phase/matrix documentation assertions are not fully aligned with currently executable checks and tracker status signals.
**Impact:** Traceability confidence and release-readiness interpretation degrade.

**Fix:** Reconcile docs to executable reality and add doc-consistency gate checks for stale markers.

---

### CI-11: `game-flow.js` exports both named and default — inconsistent with project style ⬆ Low
**Origin:** Qwen L-05 (Track A: A-03)
**Files:**
- `src/game/game-flow.js`

**Problem:** Minor consistency issue vs ES module conventions used elsewhere.

**Fix:** Standardize on named exports only per ES module conventions.

---

### CI-12: `main.ecs.js` bootstrap auto-executes on import in browser ⬆ Low
**Origin:** Qwen L-12 (Track A: A-03)
**Files:**
- `src/main.ecs.js` (~L230-232)

**Problem:** Side effect on module import makes testing harder.

**Fix:** Export bootstrap function and let consumer call it explicitly.

---

### CI-13: Duplicate `advanceLevel` logic in test mock and implementation ⬆ Low
**Origin:** Qwen L-11 (Track A: A-05, A-08)
**Files:**
- Various test files

**Problem:** Test mocks and real implementation diverge slightly.

**Fix:** Ensure test mocks stay synchronized with implementation.

---



## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **BUG-01**: Repair restart clock resync path to prevent NaN simulation steps (Ownership: Track D).
2. **ARCH-01**: Wire explicit render collect/commit phases into runtime bootstrap (Ownership: Track A, Track D).
3. **ARCH-02**: Move restart teardown to deferred world API and remove `entityStore` leakage (Ownership: Track A).
4. **SEC-01**: Remove policy-gate file scan bypass and harden governance (Ownership: Track A).
5. **CI-02**: Replace inventory-only audit checks with executable gate-compliant verification (Ownership: Track A).
6. **BUG-02**: Correct terminal level progression branch to reach VICTORY (Ownership: Track A).
7. **BUG-03**: Fail closed on null map load before entering PLAYING (Ownership: Track A).
8. **ARCH-03**: Register/inject input adapter as required world resource (Ownership: Track A, Track B).
9. **CI-01**: Make Playwright E2E checks required in merge-blocking CI (Ownership: Track A).

### Phase 2 — High Severity (immediate follow-up)
1. **BUG-04**: Make `startGame()` idempotent during PLAYING and prevent reset stutters (Ownership: Track A).
2. **BUG-05**: Harden map bounds checks in passability and wall queries (Ownership: Track D).
3. **DEAD-01**: Fix unreachable dependency-ban logic by moving it outside source-only gate (Ownership: Track A).
4. **ARCH-04**: Integrate deterministic event queue lifecycle execution during fixed-steps (Ownership: Track A, Track D).
5. **ARCH-05**: Enforce dispatch guard that rejects immediate structural mutators during `runFixedStep` (Ownership: Track A).
6. **ARCH-06**: Expose immutable views rather than mutable direct arrays in ECS world (Ownership: Track A).
7. **ARCH-07**: Add bounds/existence boundary validation to `hasComponent`/`getComponent` (Ownership: Track A).
8. **ARCH-08**: Decouple render commit from fixed-step simulation loops (Ownership: Track A).
9. **SEC-02**: Enforce production CSP and Trusted Types headers (Ownership: Track A).
10. **SEC-03**: Treat missing required schema/data files as hard CI validation failures (Ownership: Track A).
11. **SEC-04**: Enforce schema plus semantic validation at load boundary before state injection (Ownership: Track A, Track D).
12. **CI-03**: Add explicit performance/memory threshold assertions for automatable audit IDs (Ownership: Track A).
13. **CI-04**: Restrict coverage gates strictly to `src/` folder to prevent inflation (Ownership: Track A).
14. **CI-05**: Enforce audit category classification and manual evidence links in gate logic (Ownership: Track A).
15. **CI-06**: Expand E2E coverage for pause, score/timer flow, and restart actions (Ownership: Track A).
16. **CI-07**: Add JS-DOM/integration suite tests for adapter interface boundaries (Ownership: Track A).

### Phase 3 — Medium Severity
1. **BUG-06**: Prevent artificial timing progression on zero/negative frame deltas (Ownership: Track D).
2. **BUG-07**: Catch map-parsing/semantic errors sequentially rather than via hard TypeError crashes (Ownership: Track D).
3. **BUG-08**: Delay level index commit until map successfully resolves (Ownership: Track A).
4. **BUG-09**: Align `tickClock` maxDelta multiplier correctly with `maxStepsPerFrame` (Ownership: Track D).
5. **BUG-10**: Automate event-queue counter resets per fixed frame (Ownership: Track D).
6. **DEAD-02**: Strip unreachable fallback branch code in ticket-association (Ownership: Track A).
7. **DEAD-03**: Simplify or cleanly distinguish identical restart branches in sync loader (Ownership: Track A).
8. **DEAD-04**: Unify test-only ECS scaffolding directly into runtime or cleanly isolate it (Ownership: Track B, Track D).
9. **DEAD-05**: Resolve stale ownership policy declarations matching nonexistent paths (Ownership: Track A).
10. **DEAD-06**: Prune redundant `cachedMapResource` option parameters (Ownership: Track A).
11. **ARCH-09**: Normalize render-intent specification against typed implementation realities (Ownership: Shared, Track D).
12. **ARCH-10**: Integrate manifest-backed preload logic straight into standard bootstrap (Ownership: Shared, Track A, Track D).
13. **ARCH-11**: Rectify ownership tracking definitions between docs against validation tooling (Ownership: Shared, Track A).
14. **ARCH-12**: Explicitly define formal adapter interfaces instead of duck-probed fallbacks (Ownership: Track A, Track B).
15. **ARCH-13**: Implement listener detaching logic on release within the `DOMPool` (Ownership: Track D).
16. **ARCH-14**: Institute formalized resource access checks or clearly logged capability bounds (Ownership: Track A).
17. **SEC-05**: Expand forbidden-tech static checks repository-wide, rather than just locally (Ownership: Track A).
18. **SEC-06**: Broaden security scan trigger domains beyond merely isolated PR diff paths (Ownership: Track A).
19. **SEC-07**: Tighten approval gate fetching to fail-closed on API mis-reads (Ownership: Track A).
20. **CI-08**: Overhaul Playwright fixed waiting limits with direct state polling (Ownership: Track A).
21. **CI-09**: Switch source-header CI validations strictly from warnings over to hard failures (Ownership: Track A).
22. **CI-10**: Sync testing claims and phase trace documentation against operational test setups (Ownership: Shared, Track A).

### Phase 4 — Low Severity (maintenance)
1. **BUG-11**: Correct latest delta tracking arrays avoiding misrepresentation (Ownership: Track A).
2. **BUG-12**: Explicitly clamp existing temporal accumulators safely to zero inside resync paths (Ownership: Track D).
3. **BUG-13**: Trim unnecessary float clamping math from `clampLevelIndex` boundaries (Ownership: Track A).
4. **DEAD-07**: Prune rarely consumed return properties in system bindings mappings (Ownership: Track A).
5. **DEAD-08**: Simplify signature maps in level advancing callbacks (Ownership: Track A).
6. **DEAD-09**: Add exclusion patterns stripping commit/test outputs from tracking (Ownership: Track A, Shared).
7. **DEAD-10**: Fix disconnected/misrepresented signatures remaining in stale JSDoc headers (Ownership: Track D).
8. **DEAD-11**: Deduplicate parallel/overlapping package.json execution lint scripts (Ownership: Track A).
9. **DEAD-12**: Withdraw the persistent changed-files trace log out from repository tracking (Ownership: Track A).
10. **ARCH-15**: Secure local inner queue state cloning logic upon external event drain attempts (Ownership: Track D).
11. **SEC-08**: Frame escalating circuit breakers onto repetitive runaway exception looping errors (Ownership: Track A).
12. **SEC-09**: Refactor critical error outputs into structurally legible debug pre-blocks (Ownership: Track A).
13. **SEC-10**: Symbolize rejection hooks uniquely averting unintended DOM property overwrite hooks (Ownership: Track A).
14. **SEC-11**: Inject debug verifications parsing DOM retrieval hooks within renderer lookups (Ownership: Track D).
15. **CI-11**: Harmonize named structural exporting practices consistently handling control flow elements (Ownership: Track A).
16. **CI-12**: Halt direct instantiation side-effects leaking into test imports directly (Ownership: Track A).
17. **CI-13**: Synchronize structural advancement logic implementations cleanly matching mocked patterns (Ownership: Track A).

## Final Verification
**Verify Check:** Total Issues Counted at start and end match properly: 64.

*End of deduplicated summary report.*
