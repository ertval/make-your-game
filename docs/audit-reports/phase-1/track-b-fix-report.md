# Track B Fix Report

### BUG-01-INPUT: `assertValidInputAdapter` checks wrong method name ⬆ CRITICAL
**Origin:** Bugs & Logic Errors (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
- `src/adapters/io/input-adapter.js` (~L117, L130)
**Problem:** `assertValidInputAdapter` checks for `getHeldKeys` (capital H) but actual method is `getHeldKeys` (lowercase h). Similarly `clearHeldKeys` at L125. Validation always fails for correct adapters.
**Impact:** Breaks input system wiring; throws errors even with valid adapters.
**Fix:**
```javascript
// src/adapters/io/input-adapter.js L117
typeof adapter.getHeldKeys === 'function' // not getHeldKeys
// L125
typeof adapter.clearHeldKeys === 'function' // not clearHeldKeys
```
**Tests to add:** Test `assertValidInputAdapter` accepts valid adapters with correct method names.

---


### DEAD-01-ALLMASKS: `ALL_COMPONENT_MASKS` exported but never imported ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track B (B-01)
- `src/ecs/components/registry.js` (~L56)
**Problem:** Exported but never imported anywhere.
**Action:** Remove export or document future use.

---


### DEAD-08-BP: `destroy` contract may be over-specified ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
- `src/adapters/io/input-adapter.js` (~L117-127)
**Problem:** `assertValidInputAdapter` requires `destroy` method not part of core input contract.
**Action:** Fix assertion to match actual contract.

---


### ARCH-05-BP: DOM Isolation — Simulation systems ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track B/D (B-02, B-03, D-08)
**Verdict:** ✅ PASS — `input-system.js`, `player-move-system.js` do not import DOM APIs.

---


### ARCH-06-BP: Input contract ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track B (B-02)
**Verdict:** ✅ PASS — `input-system.js` uses `getHeldKeys()` + `drainPressedKeys()`; snapshot consumed once per fixed step.

---


### UT-01-MM to UT-07-MM: Missing unit tests for critical systems ⬆ HIGH (each)
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track B/C (B-06, B-07, B-08, C-04)
**Missing Tests:**
- `pause-system.js` (UT-01)
- `level-progress-system.js` (UT-02)
- `ghost-ai-system.js` (UT-03)
- `bomb-tick-system.js` (UT-04)
- `explosion-system.js` (UT-05)
- `power-up-system.js` (UT-06)
- `collision-gameplay-events.js` (UT-07)
**Fix:** Create corresponding unit test files for each system.

---
