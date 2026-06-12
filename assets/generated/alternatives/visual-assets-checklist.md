# Visual Assets — Detailed Checklist

> Based on `docs/game-description.md`. Each row counts how many **separate image files** it takes. CSS-only effects (opacity blink, pulse, translate) are noted separately.
>
> **Format note:** Counts assume individual frames (SVG or static WebP). If **animated WebP** were used, any row with multiple frames collapses into a single `.webp` file per row.

---

## Player — Ms. Ghostman

| # | Asset | Files | Detail |
|---|---|---|---|
| 1 | Idle | 1 | Standing still, default facing. CSS can add subtle breathing pulse. |
| 2 | Walk — up | 2 | Two frames swapped for walk cycle (facing up). |
| 3 | Walk — down | 2 | Two frames (facing down). |
| 4 | Walk — left | 2 | Two frames (facing left). |
| 5 | Walk — right | 2 | Two frames (facing right). |
| 6 | Death effect | 3 | Shrink/fade sequence — 3 frames or 1 frame + CSS animation. |
| 7 | Invincibility blink | 1 | Same sprite as base — CSS toggles opacity for blink effect. No extra file needed if CSS handles it. |
| 8 | Speed boost overlay | 1 | Tinted overlay or trail streaks. Combined with walk sprites via CSS class. |
| | **Subtotal** | **13** (10 if CSS handles death + invincibility) | |

---

## Ghosts — 4 types × 3 states

All ghost types share the same body shape — only color differs.

| # | Asset | Files | Detail |
|---|---|---|---|
| 9–12 | Normal (Blinky, Pinky, Inky, Clyde) | 4 × 1 = 4 | Already exist as placeholders. Each is a single static sprite. CSS adds walking pulse. |
| 13–16 | Stunned (all 4 types) | 4 × 1 = 4 | Blue ghost, fleeing pose. All 4 share the same blue color during frenzy (~5s). |
| 17 | Dead — eyes only | 1 | Floating eyes returning to ghost house. **One shared sprite** used by all 4 types. |
| | **Subtotal** | **9** (4 already exist) | |

---

## Bombs & Explosions

| # | Asset | Files | Detail |
|---|---|---|---|
| 18 | Bomb — idle | 1 | Placed on grid, fuse not yet visible. |
| 19 | Bomb — fuse | 3 | Fuse spark animation — 3 frames for flicker countdown (3-second fuse). |
| 20 | Fire tile | 1 | Single tile of the cross-pattern explosion. CSS handles 0.5s fade-out. |
| 21 | Fire tile — center | 1 | Brighter/larger variant for the blast origin tile. |
| | **Subtotal** | **6** | |

---

## Walls

| # | Asset | Files | Detail |
|---|---|---|---|
| 22 | Indestructible wall | 1 | Brick/stone pattern. Static — no animation. |
| 23 | Destructible wall | 1 | Crate/box. Static until hit. |
| 24 | Destruction — frame 1 | 1 | Cracked crate. |
| 25 | Destruction — frame 2 | 1 | Shattering crate before disappearing. |
| | **Subtotal** | **4** | |

---

## Pellets

| # | Asset | Files | Detail |
|---|---|---|---|
| 26 | Pellet | 1 | Small dot. CSS adds subtle pulse. |
| 27 | Power Pellet | 1 | Larger dot. CSS adds stronger pulse animation. Triggers ~5s Ghost Frenzy. |
| | **Subtotal** | **2** | |

---

## Power-Ups (drop from destroyed walls, 5% chance each)

| # | Asset | Files | Detail |
|---|---|---|---|
| 28 | Bomb+ | 1 | Icon showing +1 max bomb. Subtle CSS glow. |
| 29 | Fire+ | 1 | Icon showing +1 explosion radius. Subtle CSS glow. |
| 30 | Speed Boost | 1 | Boot/shoe icon (👟). Subtle CSS glow. |
| | **Subtotal** | **3** | |

---

## HUD Elements

| # | Asset | Files | Detail |
|---|---|---|---|
| 31 | Heart — full | 1 | Represents one remaining life. |
| 32 | Heart — empty | 1 | Depleted heart after losing a life. |
| 33 | Bomb icon | 1 | Next to bomb count (💣×N). |
| 34 | Fire icon | 1 | Next to fire radius (🔥×N). |
| | **Subtotal** | **4** | |

> Score number, timer text, and level number are pure CSS-styled text — no image files needed.

---

## Screens & Overlays

These are **CSS/HTML layouts** with optional decorative SVG accents — not single image files.

| # | Screen | Files | Detail |
|---|---|---|---|
| 35 | Start Screen | 0–1 | Built with HTML + CSS. May include one decorative title SVG or game logo. Shows: "MS. GHOSTMAN", Start Game, High Scores, controls. |
| 36 | Pause Menu | 0 | Built with HTML + CSS overlay. Semi-transparent backdrop + keyboard-navigable buttons (Continue, Restart). |
| 37 | Game Over | 0 | HTML + CSS overlay. Final score, Play Again button. |
| 38 | Victory | 0 | HTML + CSS overlay. Final score, ghosts killed, total time, Play Again. |
| 39 | Level Complete | 0 | HTML + CSS interstitial. Stats display and next-level button. |
| | **Subtotal** | **0–1** | All screens are DOM layouts. Only the start screen title might warrant a decorative SVG. |

---

## Summary

| Category | Image Files | Notes |
|---|---|---|
| Player | 13 | Walk frames dominate the count |
| Ghosts | 9 | 4 already exist as placeholders |
| Bombs & Fire | 6 | Fuse frames + 2 fire tiles |
| Walls | 4 | Including 2 destruction frames |
| Pellets | 2 | CSS handles pulse |
| Power-Ups | 3 | Static icons with CSS glow |
| HUD | 4 | Text metrics need no images |
| Screens | 0–1 | All CSS/HTML layouts |
| **Total image files** | **41** | **36 remaining** (5 already exist) |

---

## What Changes with Animated WebP

If **animated WebP** were used instead of individual frames:

| Row | Individual files → Animated WebP | Savings |
|---|---|---|
| Walk (up/down/left/right) | 8 files → 4 files | −4 |
| Death effect | 3 files → 1 file | −2 |
| Bomb fuse | 3 files → 1 file | −2 |
| Wall destruction | 2 files → 1 file | −1 |
| **Total reduction** | | **−9 files** |

**Animated WebP total: ~32 image files** (27 remaining after existing placeholders).

CSS-only effects (invincibility blink, pellet pulse, ghost stunned color swap, walking bob) remain CSS regardless of image format.

---

## Already Created

| File | Status |
|---|---|
| `player-idle.svg` | ✅ Exists |
| `player.svg` | ⚠️ Redundant placeholder — can be removed |
| `ghost-blinky.svg` | ✅ Exists (needs stunned + dead variants) |
| `ghost-pinky.svg` | ✅ Exists (needs stunned + dead variants) |
| `ghost-inky.svg` | ✅ Exists (needs stunned + dead variants) |
| `ghost-clyde.svg` | ✅ Exists (needs stunned + dead variants) |
