# Codebase Analysis & Audit Report - Track D (P0 Deduplicated)

**Date:** 2026-04-14
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Consolidated deduplicated Phase-0 issues owned by Track D from 4 full audit reports
**Total Issues Counted:** 18

---

## Methodology

The following source reports were fully read and merged with deduplication by root cause:

- `docs/audit-reports/phase-0/audit-report-codebase-analysis-merged-deduplicated-track-ticket-2026-04-11.md`
- `docs/audit-reports/phase-0/asmyrogl-audit-report-P0.md`
- `docs/audit-reports/phase-0/audit-report-medvall-P0.md`
- `docs/audit-reports/phase-0/pr-audit-chbaikas-audit-P0.md`

Primary ownership was assigned to Track D when fixes are in resources/map/render-intent/render adapters/CSS board contracts.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | 2 |
| 🔴 Critical | 0 |
| 🟠 High | 4 |
| 🟡 Medium | 7 |
| 🟢 Low / Info | 5 |

**Top risks:**
1. Restart clock baseline corruption can produce NaN timing state.
2. Out-of-bounds map access and ghost passability semantics break core movement/collision correctness.
3. Render pipeline contracts are defined but not fully wired into runtime behavior.
4. Event queue and clock edge-case handling can erode determinism over long sessions.

---

## 1) Bugs & Logic Errors

### BUG-01: Restart clock baseline can be reset with undefined timestamp ⬆ Blocking
**Origin:** MRG `BUG-01`, MED `BUG-01`, CHB `BUG-01`
**Files:** Ownership: Track D + Track A
- `src/game/bootstrap.js` (~L79-L82 / ~L81)
- `src/ecs/resources/clock.js` (~L89, ~L132-L135)

**Problem:** Restart path passes `clock.realTimeMs` (non-existent field in current clock model) into `resetClock`.
**Impact:** `lastFrameTime` can become invalid, causing NaN delta/accumulator propagation.

**Fix:** Use finite runtime timestamp source (`performance.now()` / `getNow()`) for restart resync.

---

### BUG-05: Out-of-bounds map access can be treated as passable/readable ⬆ High
**Origin:** MRG `BUG-05`, ASM `BUG-01`, MED `BUG-05`, CHB `BUG-05`
**Files:** Ownership: Track D (`src/ecs/resources/map-resource.js`)

**Problem:** Bounds checks are missing across `getCell`/`setCell` and passability/wall helpers.
**Impact:** Edge traversal corruption and nondeterministic movement/collision behavior.

**Fix:**
```js
export function getCell(map, row, col) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    return CELL_TYPE.INDESTRUCTIBLE;
  }
  return map.grid[row * map.cols + col];
}
```
And enforce in all query helpers.

---

### BUG-X01: `isPassableForGhost` permits destructible-wall traversal ⬆ High
**Origin:** ASM `BUG-02`
**Files:** Ownership: Track D (`src/ecs/resources/map-resource.js`)

**Problem:** Ghost passability rejects only indestructible walls, allowing destructible walls.
**Impact:** Contradiction with gameplay contract and future AI behavior correctness.

**Fix:**
```js
export function isPassableForGhost(map, row, col) {
  const cell = getCell(map, row, col);
  return cell !== CELL_TYPE.INDESTRUCTIBLE && cell !== CELL_TYPE.DESTRUCTIBLE;
}
```

---

### BUG-07: Semantic validator can throw TypeError on malformed payloads ⬆ Medium
**Origin:** MRG `BUG-07`, MED `BUG-07`
**Files:** Ownership: Track D (`src/ecs/resources/map-resource.js`)

**Problem:** Structural assumptions can throw before controlled validation errors accumulate.
**Impact:** Hard crash path instead of deterministic rejection.

**Fix:** Add structural preflight and in-bounds guards before semantic traversal.

---

### BUG-09: `tickClock` maxDelta uses hardcoded multiplier ⬆ Medium
**Origin:** MRG `BUG-09`, MED `BUG-06`
**Files:** Ownership: Track D (`src/ecs/resources/clock.js`)

**Problem:** `fixedDtMs * 10` can diverge from configured `maxStepsPerFrame`.
**Impact:** Catch-up/interpolation mismatch after throttle stalls.

**Fix:**
```js
const maxDelta = fixedDtMs * maxStepsPerFrame;
```

---

### BUG-10: Event queue `orderCounter` never auto-resets between frames ⬆ Medium
**Origin:** MRG `BUG-10`, ASM `BUG-06`, MED `BUG-09`
**Files:** Ownership: Track D (`src/ecs/resources/event-queue.js`)

**Problem:** Counter can grow monotonically and JSDoc contract is unmet. Source detail retained: ASM also flags missing finite validation for `frame` input in `enqueue()`.
**Impact:** Long-session ordering risk and docs/behavior drift.

**Fix:** Reset per fixed-step boundary, and validate `frame` as finite numeric input (default/reject invalid frame values).

---

### BUG-X03: Accumulator clamp relies on fragile sentinel (`0.0001`) ⬆ Medium
**Origin:** ASM `BUG-04`
**Files:** Ownership: Track D (`src/ecs/resources/clock.js`)

**Problem:** Sentinel-based cap can still drift under FP edge cases.
**Impact:** Alpha interpolation stability risk.

**Fix:** Use epsilon/modulo-safe clamp.

---

### BUG-06: Non-positive frame deltas can force synthetic simulation progress ⬆ Medium
**Origin:** MRG `BUG-06`
**Files:** Ownership: Track D (`src/ecs/resources/clock.js`)

**Problem:** `<= 0` frame deltas substitute fixed dt instead of no-op.
**Impact:** Determinism drift during timestamp anomalies.

---

### BUG-12: `resyncTime` does not clear accumulator ⬆ Low
**Origin:** MRG `BUG-12`
**Files:** Ownership: Track D (`src/ecs/resources/clock.js`)

**Problem:** Residual accumulator can cause burst step post-resync.

---

### BUG-X05: `drain()` allocates sorted copy every call ⬆ Low
**Origin:** MED `BUG-10`
**Files:** Ownership: Track D (`src/ecs/resources/event-queue.js`)

**Problem:** Recurring allocation in hot path.
**Impact:** GC pressure.

---

## 2) Dead Code & Unused References

### DEAD-10: JSDoc signatures drift from implementation (resources/render-intent) ⬆ Low
**Origin:** MRG `DEAD-10`, MED `DEAD-04`
**Files:** Ownership: Track D (`src/ecs/resources/*`, `src/ecs/render-intent.js`)

### DEAD-X02: `peek()` export in event queue is test-only surface ⬆ Low
**Origin:** ASM `DEAD-03`
**Files:** Ownership: Track D (`src/ecs/resources/event-queue.js`)

### DEAD-X03: `resetOrderCounter()` export currently test-only ⬆ Low
**Origin:** ASM `DEAD-04`
**Files:** Ownership: Track D (`src/ecs/resources/event-queue.js`)

### DEAD-X06: `getRenderIntentView` allocation-heavy debug path exposed to runtime misuse ⬆ Low
**Origin:** MED `DEAD-07`
**Files:** Ownership: Track D (`src/ecs/render-intent.js`)

---

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: Render commit architecture not fully wired into runtime phases ⬆ Blocking
**Origin:** MRG `ARCH-01`, MED `ARCH-01`
**Violated rule:** Dedicated render collect/commit phase and per-rAF commit discipline
**Files:** Ownership: Track D + Track A
- `src/ecs/render-intent.js`
- `src/game/bootstrap.js`
- `src/main.ecs.js`

**Problem:** Render-intent contract exists but full runtime render-collect/render-dom wiring is incomplete.
**Impact:** Visual pipeline and performance contract remain partially unsatisfied.

---

### ARCH-04: Deterministic cross-system event ordering contract not integrated end-to-end ⬆ High
**Origin:** MRG `ARCH-04`, MED `ARCH-05`
**Files:** Ownership: Track D + Track A

**Problem:** Event queue semantics exist but lifecycle integration in runtime phases is incomplete.
**Impact:** Event ordering guarantees can be bypassed in practical runtime paths.

**Fix detail preserved from source:** Register event queue explicitly in bootstrap runtime path.
```js
import { createEventQueue } from '../ecs/resources/event-queue.js';
world.setResource('eventQueue', createEventQueue());
```

---

### ARCH-09: Render-intent contract drift vs implementation-plan spec ⬆ Medium
**Origin:** MRG `ARCH-09`
**Files:** Ownership: Track D + Shared (`src/ecs/render-intent.js`, plan docs)

**Problem:** Contract details in docs and implementation differ in representation details.
**Impact:** Cross-track integration ambiguity.

---

### ARCH-13: DOM pool release path does not ensure listener cleanup ⬆ Medium
**Origin:** MRG `ARCH-13`
**Files:** Ownership: Track D (planned runtime adapter path from source report; concrete file not present in current workspace)

**Problem:** Reused pooled elements may retain listeners.
**Impact:** Memory leaks / duplicate event dispatch risk.

---

### ARCH-X02: CSS board dimensions mismatch map dimensions ⬆ High
**Origin:** MED `ARCH-07`
**Files:** Ownership: Track D (`styles/variables.css`, map files)

**Problem:** Static board grid dimensions diverge from map dimensions.
**Impact:** Render/layout correctness issues for board representation.

---

### ARCH-15: EventQueue `drain()` internal-array exposure risk ⬆ Low
**Origin:** MRG `ARCH-15`
**Files:** Ownership: Track D (`src/ecs/resources/event-queue.js`)

---

## 4) Code Quality & Security

### SEC-11: DOM renderer HUD query results are not validated/warned ⬆ Low
**Origin:** MRG `SEC-11`
**Files:** Ownership: Track D (planned renderer adapter path from source report; concrete file not present in current workspace)

### SEC-X01: RNG constants lack provenance/explanatory docstring ⬆ Low
**Origin:** ASM `SEC-03`
**Files:** Ownership: Track D (`src/ecs/resources/rng.js`)

---

## 5) Tests & CI Gaps

_No Track D-primary CI gate issues were uniquely assigned in P0 deduplicated ownership._

---

## Recommended Fix Order

### Phase 1 — Blocking/High
1. `BUG-01` — restart clock baseline correctness.
2. `ARCH-01` — complete render phase wiring (collect + DOM commit path).
3. `BUG-05` / `BUG-X01` — bounds/passability correctness for map queries.
4. `ARCH-X02` — align board dimension contract with runtime map dimensions.

### Phase 2 — Medium
1. `BUG-07` / `BUG-09` / `BUG-10` / `BUG-X03` / `BUG-06`.
2. `ARCH-04` / `ARCH-09` / `ARCH-13`.

### Phase 3 — Low
1. `BUG-12` / `BUG-X05` / `DEAD-*` / `ARCH-15` / `SEC-11` / `SEC-X01`.

## Dedup Verification Summary

- Verification Agent 1: PASS after remediation (no missing or duplicate Track D root issues across track reports).
- Verification Agent 2: PASS after remediation (planned-file references explicitly labeled where source paths are not yet present in workspace).

## Final Verification
**Verify Check:** All Track D-primary deduplicated root issues from the 4 source reports are represented exactly once in this track report.