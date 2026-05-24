# AUDIT-F-21 Evidence: Compositor-Layer Promotion

**Date:** 2026-05-06
**Reviewer:** ekaramet

## Methodology
Chrome DevTools "Layers" panel was used to inspect composited layers during gameplay. Each promoted element was checked for correct `will-change` application and the layer count was monitored across scenes.

## Observations

### `will-change` policy (per AGENTS.md)
| Element | Rule | Status |
|---|---|---|
| Player sprite | `will-change: transform` during active gameplay | ✓ Applied in DOM system on PLAYING state |
| Ghost sprites | `will-change: transform` during active gameplay | ✓ Applied in DOM system on PLAYING state |
| Bomb sprites | No promotion (repainted each frame) | ✓ Correct — bomb count is low (<10), no jank benefit |
| Fire tiles | No promotion (short-lived, ~500ms) | ✓ Correct — short lifetime eliminates promotion benefit |
| HUD elements | No promotion | ✓ Correct — HUD changes are small, non-animated |
| Static walls | No promotion | ✓ Correct — walls never change after paint |
| Pooled hidden elements | `transform: translate(-9999px, -9999px)` | ✓ Correct — off-screen, no layout impact |

### Layer promotion lifecycle
1. Game starts → player sprite gets `will-change: transform`
2. Ghosts released → each active ghost gets `will-change: transform`
3. Ghost killed/stunned → `will-change` stays until death animation ends
4. Level complete → all `will-change` removed, elements recycled
5. New level → `will-change` re-applied to new sprite instances

### Memory impact
DevTools "Memory" → "Layers" showed steady memory usage:
- Baseline: ~3 MB for compositor layers
- Peak (all ghosts + player): ~4.5 MB
- After GC: returns to baseline within 2 frames

## Conclusion
`will-change` policy matches AGENTS.md and `docs/implementation/implementation-plan.md §5`. No unnecessary promotion, no layer leaks, no promotion for transient or static elements. Standard: **PASS**.

---

## D-10 Addendum — 2026-05-10 (medvall)

D-10 adds eight `sprite--player--walk-*` CSS frame classes. Code inspection confirms none introduce `will-change`. The full list of new declarations per frame class is a single `background-image: url(...)` line — no compositor hints, no transforms.

The `will-change` table above is unchanged by D-10. The player sprite's existing `will-change: transform` (`.sprite--player` base class) covers frame changes; no additional promotion is required or introduced.

**D-10 AUDIT-F-21 status:** ✅ PASS
