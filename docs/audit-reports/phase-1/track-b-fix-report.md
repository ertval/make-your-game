# Track B Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report with full details.

### BUG-06: `droppedBombByCell` not cleared on bomb tile change ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L355)

**Problem:** When a bomb changes tiles, the previous cell's entry in `droppedBombByCell` is never cleared.
**Impact:** False collision responses.

**Fix:** Clear previous cell entry when a bomb moves.

**Tests to add:** Test that `droppedBombByCell` is cleared for previous cell.

---

### BUG-14: `collectStaticPickup` mutates map BEFORE emitting event ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track B (Tickets: B-04)
- `src/ecs/systems/collision-system.js` (~L651)

**Problem:** Mutates map before emitting event.
**Impact:** Inconsistent state if event emission fails.

**Fix:** Emit event first, then mutate map.

---

### DEAD-09: Duplicate `readEntityTile()` in `bomb-tick-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (~L48)

**Problem:** Identical to `collision-system.js`.
**Fix:** Consolidate.

---

### DEAD-15: `ALL_COMPONENT_MASKS` exported but never imported ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/registry.js` (~L56)

**Fix:** Remove.

---

### DEAD-22: Unused `*_RUNTIME_STATUS` exports ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/spatial.js` (~L51)

**Fix:** Remove.

---

### ARCH-04: `input-system.js` directly imports adapter module ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Systems MUST NOT import adapters directly."
**Files:** Ownership: Track B (Tickets: B-02)
- `src/ecs/systems/input-system.js` (~L21)

**Problem:** Direct import from `input-adapter.js`.
**Impact:** Couples simulation to adapter.

**Fix:** Move adapter assertions to shared utils.

---

### CI-10: Phase testing report out-of-sync with ticket tracker ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: All tracks
- `docs/audit-reports/phase-testing-verification-report.md` (~L68)

**Problem:** Report describes P2 criteria as testable despite 68% incomplete tickets.
**Fix:** Update phase report.

---

### CI-13: `audit.e2e.test.js` uses string-matching instead of execution ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-02)
- `tests/e2e/audit/audit.e2e.test.js` (~L136)

**Fix:** Replace with actual test execution.

---

