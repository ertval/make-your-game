# Track B Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report, verified against
the actual source code on 2026-05-05. False positives have been removed; corrected notes are added
where the original finding was imprecise.

**Total Actual Issues to Resolve: 5**

---

## Verified Issues

---

### DEAD-09: Duplicate `readEntityTile()` in `bomb-tick-system.js` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-06)
- `src/ecs/systems/bomb-tick-system.js` (L48–56)
- `src/ecs/systems/collision-system.js` (L96–106)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Both functions have identical implementations —
`Math.round(positionStore.row[entityId])` / `Math.round(positionStore.col[entityId])` — with
identical JSDoc. The only difference is `bomb-tick-system.js` exports its copy as a named export,
while `collision-system.js` also exports its copy. Two independent copies of the same logic
increase maintenance burden and introduce risk of future divergence.

**Fix:** Extract a shared `readEntityTile(positionStore, entityId, outTile)` helper into a new
`src/ecs/shared/tile-utils.js` (or similar canonical utils file). Both callers import from there.
Do NOT re-export from `collision-system.js` — that file is Track B/collision-domain specific;
tile utilities are not.

**Tests to add:** Existing unit tests for both files implicitly cover this. No new tests required
beyond verifying the import swap does not break existing tests.

---

### DEAD-15: `ALL_COMPONENT_MASKS` exported but only imported in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/registry.js` (L56)

**Verification:** ✅ **CONFIRMED, with qualification.** `ALL_COMPONENT_MASKS` is imported in
`tests/unit/components/registry.test.js` but has no callers in `src/`. It is exported from
production code but is only a test utility.

**Fix:** Options ordered by risk:
1. **Preferred (low churn):** Keep the export but add a JSDoc note that it is intended for test
   and tooling use only — avoids import churn if tests are restructured later.
2. **Aggressive (cleaner prod bundle):** Move it into a `tests/unit/components/registry-utils.js`
   test helper and remove the production export. This is the DEAD code fix intent.

Do NOT remove without updating `registry.test.js` first.

---

### DEAD-22: `SPATIAL_STORE_RUNTIME_STATUS` exported but only imported in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track B (Tickets: B-01)
- `src/ecs/components/spatial.js` (L51–55)

**Verification:** ✅ **CONFIRMED.** The export name is `SPATIAL_STORE_RUNTIME_STATUS` (audit report
said `*_RUNTIME_STATUS` which was a generic label). It is imported only in
`tests/unit/components/spatial.test.js`; no production callers exist.

**Fix:** Same options as DEAD-15. Preferred: annotate as test/tooling API in JSDoc. If removing:
update `spatial.test.js` to use a local constant and remove the export.

---

### CI-13: `audit.e2e.test.js` uses string-matching instead of execution ⬆ LOW
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: Track B (Tickets: B-02)
- `tests/e2e/audit/audit.e2e.test.js` (~L136)

**Verification:** Needs manual confirmation. The finding flags use of string-matching pattern
checks (e.g., `/addEventListener/`) on source file contents instead of running a real browser
test. This produces false confidence — a passing string check cannot verify runtime behavior.

**Fix:** Replace source-string checks with actual Playwright browser interactions. For each audit
assertion that uses this pattern, implement a real `page.evaluate()` call or a Playwright UI
action that exercises the behavior.

---

### CI-10: Phase testing report out-of-sync with ticket tracker ⬆ MEDIUM
**Origin:** 5. Tests & CI Gaps
**Files:** Ownership: All tracks (assigned to Track B for coordination)
- `docs/audit-reports/phase-testing-verification-report.md` (~L68)

**Problem:** Report describes P2 acceptance criteria as testable/satisfiable despite 68% of
associated tickets being incomplete at time of writing.

**Fix:** Update the phase report to reflect current ticket completion status. Mark P2 criteria
as "pending" for any criteria whose dependent tickets are unfinished. This is a doc-only fix.

---

## Removed / False Positives

The following items were included in the original Track B assignment but are **confirmed false
positives** based on source verification. They have been removed from the actionable fix list.

---

### ~~BUG-06: `droppedBombByCell` not cleared on bomb tile change~~ ❌ FALSE POSITIVE

**Verification note:** `resetCollisionScratch()` (`collision-system.js:L169–177`) performs
`scratch.droppedBombByCell.fill(-1)` on **every tick** via `ensureCollisionScratch()`. Within a
single tick, `droppedBombByCell` can only hold the current tile's entry (written after a tile
change check at `buildHazardOccupancy:L358–360`). There is no persistent per-cell state that
survives between ticks. **No fix required.**

---

### ~~BUG-14: `collectStaticPickup` mutates map BEFORE emitting event~~ ❌ FALSE POSITIVE

**Verification note:** `collectStaticPickup()` (`collision-system.js:L643–691`) calls `setCell()`
to clear the tile, then calls `emitPickupEvent()`. The event emission path calls
`emitGameplayEvent()` which is guarded by `eventContext?.eventQueue` — it is entirely optional and
infallible (no throw path). The map mutation before event emission is **intentional and correct**:
it prevents a second pickup of the same tile during the same tick (idempotency guard). Reordering
these calls would create a TOCTOU window where the same pellet could be collected twice. **No fix
required.**

---

### ~~ARCH-04: `input-system.js` directly imports adapter module~~ ❌ FALSE POSITIVE

**Verification note (from audit report):** `input-system.js` imports ONLY from
`../components/registry.js`. It contains a local `assertInputAdapterContract()` function that
performs duck-type validation via function checks — this is the correct ECS pattern for adapter
boundary enforcement without creating a direct module coupling. **No fix required.**
