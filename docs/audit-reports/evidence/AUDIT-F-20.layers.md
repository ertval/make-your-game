# AUDIT-F-20 Evidence: Layer Borders Capture

**Date:** 2026-05-06
**Reviewer:** ekaramet

## Methodology
DevTools "Layer borders" overlay was enabled during gameplay. Layer counts and compositions were recorded across 3 level loads, pause/resume cycles, and bomb-dense scenarios.

## Observations

### Layer inventory at steady state
| Layer | Composition reason | Elements | `will-change` |
|---|---|---|---|
| Root | Document layer | Game board, static walls, HUD | No |
| Player (active) | Compositor-thread animation | Player sprite | `transform` |
| Ghost × N (active) | Compositor-thread animation | Each active ghost sprite | `transform` |

### Layer count stability
- Level 1 idle: 3 layers (root + player + 1 ghost)
- Level 1 max ghosts: 5 layers (root + player + 3 ghosts)
- During explosion: No new layers created; fire tiles stay on root layer
- Pause: No layer changes
- Level transition: Old layers destroyed, new layers created (expected)

### No layer leaks
`will-change` is only applied to player and ghost sprites during active gameplay.
- On level complete: ghost `will-change` is removed
- On pause: layers remain but no composite activity
- On restart: all `will-change` elements are recycled through the sprite pool

## Conclusion
Total layer count stays within 2–6 (well under the 30-layer GPU budget on all target devices). No unnecessary promotion. Standard: **PASS**.

---

## D-10 Addendum — 2026-05-10 (medvall)

D-10 adds eight `sprite--player--walk-*` CSS classes (one per directional walk frame). Each class sets only `background-image: url(...)`. No `will-change` declarations were introduced.

The player sprite is already a promoted compositor layer via `.sprite--player { will-change: transform }` (D-05). Swapping `background-image` on a promoted layer triggers a repaint of that layer only — it does **not** create a new compositor layer and does not affect the root layer or any other element.

**Layer count impact:** None. Baseline of 2–6 layers (root + player + N ghosts) is unchanged.
**D-10 AUDIT-F-20 status:** ✅ PASS
