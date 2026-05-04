# Track C Fix Report

### BUG-04-MM: Pause state not explicitly cleared after level complete ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track C (C-04)
- `src/game/game-flow.js:120-140`, `src/ecs/resources/clock.js:157-159`
**Problem:** If game is paused when entering `LEVEL_COMPLETE`, pause state may persist incorrectly on transition to `PLAYING`.
**Impact:** Edge case pause leak across level boundaries.
**Fix:** Explicitly call `setPauseState(clock, false)` at start of `startGame()`.

---


### AT-01-MM to AT-04-MM: Missing adapter tests ⬆ HIGH (each)
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-05, C-06)
**Missing Tests:**
- `audio-adapter.js` (AT-01)
- `hud-adapter.js` (AT-02)
- `screens-adapter.js` (AT-03)
- `storage-adapter.js` (AT-04)
**Fix:** Create corresponding adapter test files.

---


### EA-03-MM: Missing E2E test for HUD runtime score increments ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-05, A-06)
**Problem:** AUDIT-F-15 requires runtime-visible score increments.
**Fix:** Add Playwright test verifying score increases on pellet collect.

---


### EA-04-MM: Missing E2E test for player death and lives decrement ⬆ HIGH
**Origin:** Tests & CI Gaps (MM)
**Source Reports:** MM
**Files:** Track C (C-02, A-06)
**Problem:** AUDIT-F-16 requires lives decrease on death.
**Fix:** Add Playwright test verifying lives decrement on death.

---
