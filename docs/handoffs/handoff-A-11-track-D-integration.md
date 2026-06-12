# Handoff: A-11 Track D Integration (BUG-03 + DEAD-01)

**From:** Track A (ekaramet/A-11)  
**To:** Track D (medvall)  
**Date:** 2026-05-11  
**Branch:** `ekaramet/A-11` (or new integration branch off `ekaramet/A-11`)

---

## Issue 1: BUG-03 (HIGH) — `resyncTime()` zeros `simTimeMs` on resume/focus

**Files:** `src/ecs/resources/clock.js` (Track D), `src/game/bootstrap.js` (Track A)

### Problem

`src/game/bootstrap.js:669` calls `resetClock()`, which zeros `clock.simTimeMs`. This means every time the game resumes from pause or regains focus, the simulation clock rewinds to 0 — breaking pause/resume determinism.

### Fix (verified working in Track A branch, reverted due to ownership)

Two changes needed:

**1.** Add a `resyncBaseline()` function to `src/ecs/resources/clock.js` (Track D — after `resetClock`):

```js
export function resyncBaseline(clock, now) {
  clock.lastFrameTime = now;
  clock.realTimeMs = now;
  clock.accumulator = 0;
  clock.alpha = 0;
  // NOTE: intentionally does NOT zero simTimeMs
}
```

**2.** Update `src/game/bootstrap.js` (Track A — but depends on #1):

- Import `resyncBaseline` alongside the existing clock imports
- Change `resyncTime()` to call `resyncBaseline(clock, timestamp)` instead of `resetClock(clock, timestamp)`

### Validation

```bash
# Unit tests pass
npm run test:unit

# Integration tests pass
npm run test:integration
```

---

## Issue 2: DEAD-01 (LOW) — `renderer-dom.js` still in tree without LEGACY guard

**File:** `src/adapters/dom/renderer-dom.js` (Track D)

### Problem

`src/adapters/dom/renderer-dom.js` is superseded by the ECS-driven `render-dom-system`. It is NOT called from the game loop but is still present in the source tree. It could be accidentally re-imported into the frame path.

### Fix

Add LEGACY header and runtime guard to `renderer-dom.js`:

1. Update the file header comment to mark it as LEGACY / non-game-loop tooling
2. Add a runtime guard in `createDomRenderer()`:

```js
export function createDomRenderer({ appRoot }) {
  if (typeof globalThis !== 'undefined' && globalThis.__MS_GHOSTMAN_RUNTIME__) {
    throw new Error(
      'renderer-dom.js (legacy) is not for the game loop. Use render-dom-system instead.',
    );
  }
  // ... existing code
}
```

### Validation

```bash
# The existing renderer-dom test still passes (guard only throws in game-loop context)
npm run test:integration -- tests/integration/adapters/renderer-dom.test.js

# Policy check passes
npm run policy
```

---

## Integration Branch

Create a new branch off `ekaramet/A-11`:

```bash
git checkout -b medvall/A-11-track-D-integration ekaramet/A-11
```

Both fixes are within Track D ownership (clock.js is clock resource, renderer-dom.js is a DOM adapter). After fixing, merge back to `ekaramet/A-11` and verify:

```bash
npm run policy
npm run test:unit
npm run test:integration
```

---

## Current Status (after A-11 Track A pass)

| Item | Status in A-11 branch |
|------|----------------------|
| CI-04 (manual evidence) | ✅ Fixed in report |
| CI-05 (canonical thresholds) | ✅ Fixed in tests |
| CI-13 (static-config docs) | ✅ Fixed in tests |
| BUG-03 (simTimeMs on resume) | ❌ Blocked — Track D |
| DEAD-01 (renderer-dom.js guard) | ⚠️ Partial — Track D |
| CI-10 (phase test sync) | 🟡 Independent docs item |
