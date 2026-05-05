# Track C Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report with full details.

### BUG-03: Resume and focus resync reset simulation time to zero ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track A / Track D / Track C (Tickets: A-03, D-01, C-04)
- `src/ecs/resources/clock.js` (~L143)

**Problem:** `resetClock()` always sets `clock.simTimeMs = 0`. Runtime calls `bootstrap.resyncTime()` on resume/focus, rewinding simulation time.
**Impact:** Violates pause/resume determinism.

**Fix:** Split clock APIs. Keep restart reset that clears `simTimeMs`, and add baseline resync that updates `lastFrameTime` without changing `simTimeMs`.

**Tests to add:** Pause/resume integration coverage asserting `simTimeMs` is unchanged after `resyncTime()`.

---

### BUG-04: `life-system` crashes under normal World dispatch ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C / Track A (Tickets: C-02, A-02)
- `src/ecs/systems/life-system.js` (~L102)

**Problem:** `life-system` calls `world.entityStore.isAlive()`, but the dispatch view only exposes `isEntityAlive()`.
**Impact:** System throws on life-loss path.

**Fix:** Use `world.isEntityAlive(playerEntity)`.

**Tests to add:** Assert lives decrement and no system fault is recorded.

---

### BUG-09: Pause state not explicitly cleared after level complete ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (~L120)

**Problem:** Pause state may persist incorrectly on transition to PLAYING.
**Impact:** Edge case pause leak.

**Fix:** Explicitly call `setPauseState(false)` at start of `startGame()`.

---

### BUG-11: `spawn-system.js` fallback ghost count forced to `POOL_GHOSTS` minimum ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L184)

**Problem:** Forces fallback ghost count to at least 4.
**Impact:** Wrong ghost count on early levels.

**Fix:** Remove `Math.max` wrapping.

---

### BUG-13: Spawn System Creates Multiple Sets Per Tick ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track C (Tickets: C-03)
- `src/ecs/systems/spawn-system.js` (~L228)

**Problem:** `new Set(...)` created multiple times per tick.
**Impact:** Minor GC pressure.

**Fix:** Hoist a reusable scratch Set into system closure scope.

---

### DEAD-10: Legacy fallback in `destroyAllEntitiesDeferred()` ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track C (Tickets: C-04)
- `src/game/game-flow.js` (~L63)

**Problem:** Fallback branch is never reached.
**Fix:** Remove.

---

### ARCH-03: Product-level pause and HUD audit behavior is not wired into default runtime ⬆ HIGH
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track C/A (Tickets: C-01, C-02, C-04, C-05)
- `src/game/bootstrap.js` (~L244)

**Problem:** Default runtime does not register `pause-system`, `level-progress-system`, `timer-system`, etc.
**Impact:** Audit questions cannot be satisfied through real gameplay.

**Fix:** Register Track C systems in deterministic order.

---

### SEC-05: Storage trust boundary remains pending for high scores ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track C (Tickets: C-05)
- `docs/game-description.md` (~L311)

**Problem:** High scores require validation-on-read storage adapter.
**Fix:** Implement `storage-adapter.js` before C-05 lands.

---

