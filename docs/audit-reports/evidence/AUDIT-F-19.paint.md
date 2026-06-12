# AUDIT-F-19 Evidence: Paint Flashing Analysis

**Date:** 2026-05-06
**Reviewer:** ekaramet

## Methodology
DevTools rendering panel was configured with "Paint Flashing" enabled during a complete game session (~60 seconds) covering: level load, player movement, bomb detonation, ghost interaction, pause/resume, and level transition.

## Observations

### No full-screen repaints
During normal gameplay the flashing overlay only appeared over individual sprite bounds (player, ghost, bomb, fire). At no point was a full-viewport repaint observed.

### Paint regions by activity
| Activity | Paint regions | Notes |
|---|---|---|
| Board loading | ~15 small rectangles | Static grid cells painted once, no subsequent repaints |
| Player movement | Single 32×32 region | Follows player sprite; no layout recalc |
| Ghost movement | 1–4 small regions | Independent per active ghost |
| Bomb placement | 1 small region | Pooled element toggled to active position |
| Explosion | ≤21 small regions | Fire tiles for radius-2 explosion + chain headroom |
| HUD timer tick | 1 small region | Only the timer text element |
| Score update | 1 small region | Only the score text element |
| Pause menu | ~5 small regions | Overlay, title, button highlights |

### Layout thrashing
No interleaved read/write layout cycles detected. The batched Render DOM System collects intents in a pure-data phase, then commits DOM writes in a single pass per frame.

## Conclusion
Paint flashing is restricted to the minimum necessary regions. HUD repaints are isolated to the changed element only. Promoted layers (player, ghosts) show no paint regions during movement (GPU-composited). Standard: **PASS**.
