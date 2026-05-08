# Track C Fix Report

This report tracks the uniquely assigned Track C issues from the Phase 1 audit and their
post-remediation status against the current source tree.

- Original verification baseline: `2026-05-05`
- Remediation status updated against codebase state: `2026-05-08`

**Total Actual Issues Reviewed: 8**

## Status Summary

- Resolved: `6`
- Out of Track C Remediation Scope / Follow-up Required: `2`

## Verified Issues

### BUG-03: `resetClock()` rewound `simTimeMs` on resume/focus
**Severity:** High
**Ownership:** Track A / Track D / Track C (`A-03`, `D-01`, `C-04`)
**Files:**
- `src/ecs/resources/clock.js`
- `src/game/bootstrap.js`

**Verification:** Confirmed true positive in the original audit. Lifecycle resync and full restart
shared the same reset path, which zeroed `simTimeMs` and broke pause/resume determinism.

**Resolution:** Not fixed in this branch.
- This branch was refactored back to strict Track C ownership only.
- `clock.js` and bootstrap-level lifecycle resync remain shared Track A / Track D ownership areas.
- The finding remains technically valid and should be addressed in a follow-up remediation owned by
  the runtime/resource tracks.

**Track C note:** Track C documentation retains this issue historically because it affects C-04
behavior at integration time, but no shared runtime/resource implementation changes are claimed in
this branch.

**Status:** Out of Track C remediation scope; requires Track A / Track D follow-up

---

### BUG-04: `life-system` accessed `world.entityStore.isAlive()` instead of `world.isEntityAlive()`
**Severity:** High
**Ownership:** Track C / Track A (`C-02`, `A-02`)
**Files:**
- `tests/unit/systems/life-system.test.js` (regression coverage added on this branch)

**Verification:** Confirmed true positive in the original audit. Direct access to internal
`entityStore` violated ECS isolation and coupled the system to World internals.

**Resolution:** Already resolved upstream on `main`; this branch adds regression coverage.
- The source fix landed on `main` in commit `e850cf3` ("refactor: encapsulate entity lifecycle
  checks within World..."); `src/ecs/systems/life-system.js` is not modified by this branch.
- `life-system` already relies on `world.isEntityAlive(playerEntity)` in `main`, preserving the
  restricted World API boundary expected by simulation systems.
- This branch pins that behavior with explicit regression tests so a future regression that
  reintroduces `entityStore` access fails fast.

**Verification coverage:**
- `tests/unit/systems/life-system.test.js`
  - asserts dead-player handling does not depend on `entityStore` (uses a throwing stub on
    `entityStore.isAlive` to prove the system never calls it)
  - asserts the system does not throw when the player entity is no longer alive

**Status:** Resolved (regression-tested on this branch; source fix pre-existed on `main`)

---

### BUG-09: Pause state not explicitly cleared before `LEVEL_COMPLETE -> PLAYING`
**Severity:** Low
**Ownership:** Track C (`C-04`)
**Files:**
- `src/game/game-flow.js`

**Verification:** The original finding was correctly downgraded to low severity. Existing logic
already synchronized pause state from `gameStatus`, but the transition path still benefited from
defensive hardening.

**Resolution:** Fixed as precautionary hardening.
- Added an explicit pause-clear helper before transitions back to `PLAYING` in `startGame()`.
- Applied this defensively on both `MENU -> PLAYING` and `LEVEL_COMPLETE -> PLAYING` paths.

**Verification coverage:** Covered by Track C-owned `game-flow` code inspection for the transition
paths changed in this branch. No cross-track runtime/bootstrap integration assertions are claimed.

**Status:** Resolved

---

### BUG-11: `spawn-system.js` forced fallback ghost count to `POOL_GHOSTS`
**Severity:** Medium
**Ownership:** Track C (`C-03`)
**Files:**
- `src/ecs/systems/spawn-system.js`
- `tests/unit/systems/spawn-system.test.js`

**Verification:** Confirmed true positive in the original audit. Fallback ghost ordering forced a
minimum of 4 ghost ids even when the active cap was lower or zero.

**Resolution:** Fixed.
- Removed the `POOL_GHOSTS` floor from fallback ghost-order generation.
- Fallback order now respects the resolved active cap exactly.

**Verification coverage:**
- `tests/unit/systems/spawn-system.test.js`
  - `resolveDeterministicGhostOrder([], 0) -> []`
  - `resolveDeterministicGhostOrder([], 2) -> [0, 1]`
  - `resolveDeterministicGhostOrder([], 4) -> [0, 1, 2, 3]`

**Status:** Resolved

---

### BUG-13: Spawn system created multiple transient `Set` allocations per tick
**Severity:** Low
**Ownership:** Track C (`C-03`)
**Files:**
- `src/ecs/systems/spawn-system.js`
- `tests/unit/systems/spawn-system.test.js`

**Verification:** Confirmed true positive in the original audit. The previous implementation
created several short-lived `Set` instances inside hot-path helper functions.

**Resolution:** Fixed.
- Hoisted reusable scratch `Set` instances into the spawn-system closure scope.
- Replaced repeated allocation with `clear()` + refill logic for within-tick transient membership
  tracking.

**Verification coverage:**
- Existing spawn-system behavioral tests continue to pass unchanged.

**Status:** Resolved

---

### DEAD-10: Legacy fallback branch in `destroyAllEntitiesDeferred()`
**Severity:** Low
**Ownership:** Track C (`C-04`)
**Files:**
- `src/game/game-flow.js`

**Verification:** Correctly downgraded to low severity. The branch remains useful for partial
runtime stubs and older test harnesses, so removal was not justified yet.

**Resolution:** Fixed conservatively.
- Kept the fallback path for compatibility.
- Added an explicit `console.warn(...)` when the legacy path is used so remaining callers are
  visible during development.

**Status:** Resolved

---

### ARCH-03: Core Track C gameplay systems were not registered in the default runtime
**Severity:** High
**Ownership:** Track C / Track A (`C-01`, `C-02`, `C-04`, `C-05`)
**Files:**
- `src/game/bootstrap.js`

**Verification:** Confirmed. This was not just “plausible”; the remediation pass verified runtime
registration needed tightening in the default bootstrap stack.

**Resolution:** Not fixed in this branch.
- This branch was refactored back to strict Track C ownership only.
- Default runtime/bootstrap registration is a shared runtime integration surface and is not claimed
  as a Track C-only implementation change here.
- The finding remains documented because it materially affects whether Track C systems are active in
  production runtime, but the actual bootstrap change requires Track A / shared-runtime follow-up.

**Status:** Out of Track C remediation scope; requires Track A follow-up

---

### SEC-05: Storage trust boundary for high scores
**Severity:** Low
**Ownership:** Track C (`C-05`)
**Files:**
- `src/adapters/io/storage-adapter.js`
- `docs/implementation/track-c.md`

**Verification:** Originally forward-looking, but this remediation pass implemented the missing
boundary explicitly instead of leaving it as a reminder.

**Resolution:** Fixed.
- Added `src/adapters/io/storage-adapter.js`.
- High-score reads now validate persisted data and fail closed on malformed/untrusted payloads.
- All storage access is guarded with `try/catch`.
- Missing or invalid persisted data falls back safely instead of throwing.

**Status:** Resolved

---

## Deferred / Partial Items

### Remaining product-level gaps outside this remediation pass

The issues above are resolved at the remediation scope that was requested. What remains partial is
not the correctness of these fixes, but broader feature integration owned by later tickets:

- visible pause menu / overlay UX remains in later `C-05` / Track A integration work
- HUD-visible high-score presentation is still later integration work
- full product-level browser audit coverage for pause/restart UI remains outside this report

These are intentionally deferred feature-integration deliverables and are not regressions
introduced by this remediation pass.
