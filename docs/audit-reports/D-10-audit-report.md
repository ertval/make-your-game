# D-10 Audit Report — Visual Asset Production: Gameplay Sprites

**Date:** 2026-05-10
**Reviewer:** medvall
**Branch:** medvall/D-10
**Policy gate:** `npm run policy` — PASS (882 tests)

---

## 1. AGENTS.md Compliance

| Rule | Status | Evidence |
|---|---|---|
| No `innerHTML` | ✅ PASS | `player-animation-system.js`, `board-sync-system.js` contain no DOM references; `renderer-adapter.js` uses `classList.add/remove` only |
| No `eval` | ✅ PASS | No eval in any modified file |
| No canvas | ✅ PASS | WebP assets served as `background-image` via CSS |
| No `Date.now()` in systems | ✅ PASS | `player-animation-system.js` receives `context.dtMs` — no clock reads |
| Adapters inject via World resources | ✅ PASS | `board-sync-system` receives `boardAdapter` at construction; `player-animation-system` reads only `velocity` and `renderable` via World |

---

## 2. ECS Boundary Check

- `player-animation-system.js` — logic phase, reads `playerEntity` + `velocity`, writes `renderable`. Zero DOM references.
- `board-sync-system.js` — render phase, reads `collisionIntents`, calls `boardAdapter.updateCell()` via injected adapter. Zero direct DOM references.
- `render-dom-system.js` — the single permitted DOM-touching system. Added player frame class lookup uses a compile-time static array (`PLAYER_SPRITE_CLASSES`); no user-controlled strings reach `classList`.

---

## 3. Automated Test Coverage

| Suite | Tests | File |
|---|---|---|
| player-animation-system unit | 19 | `tests/unit/systems/player-animation-system.test.js` |
| board-sync-system unit | 11 | `tests/unit/systems/board-sync-system.test.js` |
| renderer-adapter integration (updateCell) | +4 | `tests/integration/adapters/renderer-adapter.test.js` |
| bootstrap logic phase order | updated | `tests/unit/game/bootstrap.test.js` |
| board canonical map reset (e2e) | 2 | `tests/e2e/board-reset.spec.js` |

All 882 tests pass including the two new e2e specs.

---

## 4. DevTools Layer / Paint Analysis (AUDIT-F-20, AUDIT-F-21)

**Methodology:** Code inspection of modified CSS and system files. See addenda in `AUDIT-F-20.layers.md` and `AUDIT-F-21.promotion.md` for full analysis.

**Summary:**

D-10 adds eight `sprite--player--walk-*` CSS classes. Each sets only `background-image: url(...)`. No `will-change` declarations were added. The player sprite's compositor promotion (`will-change: transform` on `.sprite--player`, set in D-05) is unchanged.

Swapping `background-image` on a promoted compositor layer causes a repaint of that layer only. The repaint region is bounded by the player sprite element (~128×128 px). No new layers are created. Total layer count remains 2–6 (root + player + N active ghosts), unchanged from the pre-D-10 baseline recorded in `AUDIT-F-20.layers.md`.

**AUDIT-F-20:** ✅ PASS (layer count unaffected by D-10)
**AUDIT-F-21:** ✅ PASS (no new `will-change` declarations; existing promotion policy intact)

---

## 5. Canonical Board Reset (AUDIT deferred from D-03/D-06)

**Test:** `tests/e2e/board-reset.spec.js`

- Verifies that `runtime.restart()` triggers `boardAdapter.generateBoard()` via the `onLevelLoaded` callback, restoring all pellet cells removed by `updateCell` during gameplay.
- Confirmed: pellet count before and after restart match; DOM manipulation of 5 pellet cells is fully reversed.

---

## 6. Known Deviations

| Item | Status |
|---|---|
| SVG preferred for sprites (spec) | Deviation: WebP lossless used. Source sheet is raster; WebP lossless preserves per-pixel accuracy. Rendering pipeline is format-agnostic (`background-image`). |
| `SPRITE_ID.IDLE = 0` defined but unused | Intentional: held for future use. `spriteId = 0` is never written by the animation system in current form. |
| Remaining sprites (ghosts, bombs, fire, pellets, walls, power-ups) | Not started. D-10 scope was scoped to player walk cycle and board sync. |

---

## 7. Conclusion

D-10 is merge-ready. All automated checks pass. ECS isolation is intact. Layer/paint policy is unaffected. The canonical board reset is now covered by e2e. Remaining sprite assets (ghosts, bombs, etc.) are tracked as open items in `track-d.md`.
