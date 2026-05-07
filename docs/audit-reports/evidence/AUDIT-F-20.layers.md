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
