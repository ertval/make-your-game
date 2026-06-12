# Ms. Ghostman — Visual Asset Inventory & Creation Report

> **Generated**: 2026-04-12
> **Source**: `docs/game-description.md`, `docs/requirements.md`, `docs/implementation/track-d.md`, `docs/implementation/assets-pipeline.md`
> **Purpose**: Complete inventory of every visual asset that must be created, organized by category, with current status tracking.

---

## Summary Statistics

| Category | Total | Created | Remaining |
|---|---|---|---|
| Player Character | 8 | 2 | 6 |
| Ghosts (all types × all states) | 16 | 4 | 12 |
| Bombs & Explosions | 6 | 0 | 6 |
| Walls & Terrain | 5 | 0 | 5 |
| Pellets & Collectibles | 4 | 0 | 4 |
| Power-Ups | 3 | 0 | 3 |
| HUD Elements | 5 | 0 | 5 |
| UI Screens & Overlays | 5 | 0 | 5 |
| **TOTAL** | **52** | **6** | **46** |

---

## 1. Player Character — Ms. Ghostman

All sprites: **64×64px**, SVG preferred, <50 path elements each.

| # | Asset ID | Filename | State / Animation | Description | Status |
|---|---|---|---|---|---|
| 1.1 | `player-idle` | `player-idle.svg` | Idle (facing default) | Standing still, neutral pose. **EXISTING** — needs review. | ✅ Created |
| 1.2 | `player` | `player.svg` | Generic / starter placeholder | Existing placeholder. May be replaced or consolidated. | ✅ Created |
| 1.3 | `player-walk-up-01` | `player-walk-up-01.svg` | Walking up, frame 1 | Animation frame 1 of walk cycle, facing up. | ❌ Needed |
| 1.4 | `player-walk-down-01` | `player-walk-down-01.svg` | Walking down, frame 1 | Animation frame 1 of walk cycle, facing down. | ❌ Needed |
| 1.5 | `player-walk-left-01` | `player-walk-left-01.svg` | Walking left, frame 1 | Animation frame 1 of walk cycle, facing left. | ❌ Needed |
| 1.6 | `player-walk-right-01` | `player-walk-right-01.svg` | Walking right, frame 1 | Animation frame 1 of walk cycle, facing right. | ❌ Needed |
| 1.7 | `player-death` | `player-death.svg` | Death animation | Shrink/fade or explosion effect on life loss. | ❌ Needed |
| 1.8 | `player-invincible` | `player-invincible.svg` | Invincibility blink | Blinking or shimmering overlay during 2s invincibility window. Used with `classBits` flag `INVINCIBLE`. | ❌ Needed |
| 1.9 | `player-speed-boost` | `player-speed-boost.svg` | Speed boost tint/trail | Visual trail or color tint indicating active 10s speed boost. Used with `classBits` flag `SPEED_BOOST`. Can be overlay layer combined with walk sprites. | ❌ Needed |

**Notes**:
- Walking animation frames should share identical viewBox and coordinate system for smooth CSS animation swaps.
- Invincibility and speed boost may be implemented as CSS class overlays on base walk/idle sprites rather than separate SVGs. Confirm during D-10 implementation.
- Reference: `game-description.md` §3.1–3.3, §3.3 Invincibility Window, Speed Boost visual trail requirement.

---

## 2. Ghosts — All Types × All States

Each ghost needs **3 state variants** (normal, stunned, dead/eyes). Base size: **64×64px**.

### 2.1 Blinky (🔴 Red) — Aggressive Chaser

| # | Asset ID | Filename | State | Description | Status |
|---|---|---|---|---|---|
| 2.1.1 | `ghost-blinky-normal` | `ghost-blinky-normal.svg` | Normal | Red ghost, aggressive chase pose. **EXISTING** — needs state variant review. | ✅ Created |
| 2.1.2 | `ghost-blinky-stunned` | `ghost-blinky-stunned.svg` | Stunned (Frenzy) | Blue ghost, fleeing pose. Triggered by Power Pellet for ~5s. Used with `classBits` flag `STUNNED`. | ❌ Needed |
| 2.1.3 | `ghost-blinky-dead` | `ghost-blinky-dead.svg` | Dead (Eyes Only) | Floating eyes returning to ghost house. Used with `classBits` flag `DEAD`. | ❌ Needed |

### 2.2 Pinky (🩷 Pink) — Ambusher

| # | Asset ID | Filename | State | Description | Status |
|---|---|---|---|---|---|
| 2.2.1 | `ghost-pinky-normal` | `ghost-pinky-normal.svg` | Normal | Pink ghost, ambush pose. **EXISTING** — needs state variant review. | ✅ Created |
| 2.2.2 | `ghost-pinky-stunned` | `ghost-pinky-stunned.svg` | Stunned (Frenzy) | Blue ghost, fleeing pose. Used with `classBits` flag `STUNNED`. | ❌ Needed |
| 2.2.3 | `ghost-pinky-dead` | `ghost-pinky-dead.svg` | Dead (Eyes Only) | Floating eyes returning to ghost house. Used with `classBits` flag `DEAD`. | ❌ Needed |

### 2.3 Inky (🔵 Cyan) — Flanker

| # | Asset ID | Filename | State | Description | Status |
|---|---|---|---|---|---|
| 2.3.1 | `ghost-inky-normal` | `ghost-inky-normal.svg` | Normal | Cyan ghost, flanker pose. **EXISTING** — needs state variant review. | ✅ Created |
| 2.3.2 | `ghost-inky-stunned` | `ghost-inky-stunned.svg` | Stunned (Frenzy) | Blue ghost, fleeing pose. Used with `classBits` flag `STUNNED`. | ❌ Needed |
| 2.3.3 | `ghost-inky-dead` | `ghost-inky-dead.svg` | Dead (Eyes Only) | Floating eyes returning to ghost house. Used with `classBits` flag `DEAD`. | ❌ Needed |

### 2.4 Clyde (🟠 Orange) — Wildcard

| # | Asset ID | Filename | State | Description | Status |
|---|---|---|---|---|---|
| 2.4.1 | `ghost-clyde-normal` | `ghost-clyde-normal.svg` | Normal | Orange ghost, erratic pose. **EXISTING** — needs state variant review. | ✅ Created |
| 2.4.2 | `ghost-clyde-stunned` | `ghost-clyde-stunned.svg` | Stunned (Frenzy) | Blue ghost, fleeing pose. Used with `classBits` flag `STUNNED`. | ❌ Needed |
| 2.4.3 | `ghost-clyde-dead` | `ghost-clyde-dead.svg` | Dead (Eyes Only) | Floating eyes returning to ghost house. Used with `classBits` flag `DEAD`. | ❌ Needed |

**Notes**:
- Stunned ghosts ALL share the same blue color regardless of original type (per Pac-Man convention).
- Dead "eyes only" sprites can share a single generic eyes asset across all ghost types if design allows, reducing asset count. Confirm during D-10.
- Ghost sprites carry `will-change: transform` during active gameplay (per AGENTS.md layer promotion policy).
- Reference: `game-description.md` §5.1–5.3, `AGENTS.md` §Rendering and DOM Rules (will-change policy).

---

## 3. Bombs & Explosions

SVG preferred for bombs; fire tiles may use CSS animation + SVG combo.

| # | Asset ID | Filename | State / Animation | Description | Status |
|---|---|---|---|---|---|
| 3.1 | `bomb-idle` | `bomb-idle.svg` | Placed, fuse not started | Standard bomb on grid cell. | ❌ Needed |
| 3.2 | `bomb-fuse-01` | `bomb-fuse-01.svg` | Fuse ticking, frame 1 | Bomb with flickering/sparking fuse — animation frame 1. | ❌ Needed |
| 3.3 | `bomb-fuse-02` | `bomb-fuse-02.svg` | Fuse ticking, frame 2 | Bomb with flickering/sparking fuse — animation frame 2. | ❌ Needed |
| 3.4 | `bomb-fuse-03` | `bomb-fuse-03.svg` | Fuse ticking, frame 3 | Bomb with flickering/sparking fuse — animation frame 3 (rapid flicker). | ❌ Needed |
| 3.5 | `fire-tile` | `fire-tile.svg` | Explosion cross tile | Single tile of the cross-pattern explosion. Animated fade (0.5s duration). Used in DOM pooling. | ❌ Needed |
| 3.6 | `fire-tile-center` | `fire-tile-center.svg` | Explosion center tile | Center tile of explosion (brighter/larger variant). | ❌ Needed |

**Notes**:
- Bomb sprites must display fuse timing visually (3-second countdown per `game-description.md` §4.1).
- Fire tiles are pooled via `sprite-pool-adapter.js` and hidden with `transform: translate(-9999px, -9999px)` when not active.
- Explosion cross pattern extends N tiles in each cardinal direction (default N=2, upgradeable via Fire Power-Up).
- Reference: `game-description.md` §4, `AGENTS.md` §Rendering and DOM Rules (DOM pooling).

---

## 4. Walls & Terrain

| # | Asset ID | Filename | State / Animation | Description | Status |
|---|---|---|---|---|---|
| 4.1 | `wall-indestructible` | `wall-indestructible.svg` | Static | Brick/stone pattern. Permanent maze structure. Cannot be destroyed. | ❌ Needed |
| 4.2 | `wall-destructible` | `wall-destructible.svg` | Static | Crate/wooden box. Breakable block that hides pellets/power-ups. | ❌ Needed |
| 4.3 | `wall-destruct-01` | `wall-destruct-01.svg` | Destruction frame 1 | Cracked/broken crate — first frame of destruction animation. | ❌ Needed |
| 4.4 | `wall-destruct-02` | `wall-destruct-02.svg` | Destruction frame 2 | Shattering crate — second frame before disappearing. | ❌ Needed |
| 4.5 | `tile-empty` | `tile-empty.svg` | Static | Passable empty space (may be CSS-only, no SVG needed). | ⚠️ TBD |

**Notes**:
- Indestructible walls are typically arranged in a repeating grid pattern (per `game-description.md` §2).
- Destructible walls may reveal power-ups on destruction (5% chance each for Bomb+, Fire+, Speed Boost).
- Empty tiles may not need SVG — could be styled purely with CSS grid cells. Confirm during D-06/D-10.
- Reference: `game-description.md` §2, §4.2 (Explosion interactions).

---

## 5. Pellets & Collectibles

| # | Asset ID | Filename | State / Animation | Description | Status |
|---|---|---|---|---|---|
| 5.1 | `pellet` | `pellet.svg` | Static / subtle pulse | Small collectible dot. Eating one = 10 points. | ❌ Needed |
| 5.2 | `power-pellet` | `power-pellet.svg` | Pulsing animation | Larger pellet. Triggers ~5s Ghost Frenzy when eaten = 50 points. | ❌ Needed |
| 5.3 | `pellet-collected` | `pellet-collected.svg` | Collection flash | Brief sparkle/flash animation when pellet is eaten. | ❌ Needed |
| 5.4 | `power-pellet-collected` | `power-pellet-collected.svg` | Collection flash | Larger flash/burst when power pellet is eaten. | ❌ Needed |

**Notes**:
- All open-path corridors contain pellets (`game-description.md` §2.1).
- Power pellets are pre-placed in level maps (marked as `*` in ASCII blueprints), NOT dropped from destructible walls.
- Collection animations should be brief (<0.3s) to avoid distracting from gameplay.
- Reference: `game-description.md` §2, §6 (Scoring System).

---

## 6. Power-Ups (Drop from Destructible Walls)

| # | Asset ID | Filename | State / Animation | Description | Status |
|---|---|---|---|---|---|
| 6.1 | `powerup-bomb` | `powerup-bomb.svg` | Static / subtle glow | Bomb+ icon. Increases max simultaneous bomb count by 1. Drop rate: 5%. Collecting = 100 points. | ❌ Needed |
| 6.2 | `powerup-fire` | `powerup-fire.svg` | Static / subtle glow | Fire+ icon. Increases bomb explosion radius by 1 tile. Drop rate: 5%. Collecting = 100 points. | ❌ Needed |
| 6.3 | `powerup-speed` | `powerup-speed.svg` | Static / subtle glow | Speed boot icon (👟). 1.5× speed for 10s. Drop rate: 5%. Collecting = 100 points. | ❌ Needed |

**Notes**:
- Power-ups spawn when destructible walls are destroyed (5% chance each, 85% empty).
- Collecting a power-up = 100 points (`game-description.md` §6).
- Speed boost is non-stacking — collecting another resets the 10s timer.
- Power-ups destroyed by fire are lost (not collected) — `game-description.md` §4.2.
- Reference: `game-description.md` §2, §4.3, §6.

---

## 7. HUD Elements

HUD displayed at all times during gameplay (`game-description.md` §9).

| # | Asset ID | Filename | Description | Status |
|---|---|---|---|---|
| 7.1 | `hud-heart-full` | `hud-heart-full.svg` | Full life icon (❤️) | ❌ Needed |
| 7.2 | `hud-heart-empty` | `hud-heart-empty.svg` | Lost life icon (depleted heart) | ❌ Needed |
| 7.3 | `hud-bomb-icon` | `hud-bomb-icon.svg` | Bomb count indicator (💣×N) | ❌ Needed |
| 7.4 | `hud-fire-radius` | `hud-fire-radius.svg` | Fire radius indicator (🔥×N) | ❌ Needed |
| 7.5 | `hud-timer-icon` | `hud-timer-icon.svg` | Timer/clock icon (⏱️) — optional, may be CSS text only | ⚠️ TBD |

**Notes**:
- HUD layout: `❤️ ❤️ ❤️   SCORE: 00000   ⏱️ 2:45` / `💣×1  🔥×2   LEVEL 1`
- Heart icons decrement on death (full → empty transition).
- Bomb and fire radius indicators update when power-ups are collected.
- Some HUD elements (score, timer, level number) may be pure text with CSS styling rather than SVG assets.
- Reference: `game-description.md` §9.

---

## 8. UI Screens & Overlays

Full-screen overlays with keyboard-navigable focus indicators (per `AGENTS.md` §Accessibility).

| # | Asset ID | Filename | Description | Status |
|---|---|---|---|---|
| 8.1 | `ui-start-screen` | `ui-start-screen.svg` | Start screen background/title treatment. Shows: "👻 MS. GHOSTMAN", "▶ Start Game", "📊 High Scores", controls legend. | ❌ Needed |
| 8.2 | `ui-pause-overlay` | `ui-pause-overlay.svg` | Pause menu semi-transparent overlay. Shows: "⏸️ PAUSED", "▶ Continue", "🔄 Restart". | ❌ Needed |
| 8.3 | `ui-gameover-screen` | `ui-gameover-screen.svg` | Game Over screen. Shows: "💀 GAME OVER", "Final Score: XXX", "🔄 Play Again". | ❌ Needed |
| 8.4 | `ui-victory-screen` | `ui-victory-screen.svg` | Victory screen. Shows: "🎉 YOU WIN!", "Final Score: XXXXX", "Ghosts Killed: XX", "Total Time: X:XX", "🔄 Play Again". | ❌ Needed |
| 8.5 | `ui-levelcomplete-screen` | `ui-levelcomplete-screen.svg` | Level complete interstitial. Shows stats (score, time, ghosts killed) and "Next Level" button. | ❌ Needed |

**Notes**:
- All screens must be fully keyboard-navigable with visible focus indicators (`AGENTS.md` §Accessibility).
- Pause menu focus management: focus moves into pause UI on open, restores focus on close.
- Screens use CSS layouts with SVG decorative elements — not necessarily single monolithic SVG files.
- Start screen appears on game load, after Game Over, and after Victory (`game-description.md` §9.5).
- Reference: `game-description.md` §9.5, §10, §11, `AGENTS.md` §Accessibility and UX Invariants.

---

## 9. Technical Specifications

### 9.1 Format & Quality Standards

| Property | Requirement |
|---|---|
| **Primary Format** | SVG (scalable, DOM-friendly) |
| **Max Path Elements** | <50 per SVG sprite (`AGENTS.md` §Asset Performance) |
| **Player/Ghost Dimensions** | 64×64px (recommended for grid alignment) |
| **Bomb Dimensions** | 48×48px or 64×64px |
| **Fire Tile Dimensions** | 64×64px (matches grid cell) |
| **Pellet Dimensions** | 16×16px to 32×32px |
| **Power-Up Dimensions** | 32×32px to 48×48px |
| **HUD Icon Dimensions** | 24×24px to 32×32px |
| **ViewBox Consistency** | MUST maintain stable viewBox across animation variants (`assets-pipeline.md` §3) |
| **Editor Metadata** | MUST be stripped before export |
| **Naming Convention** | Lower-kebab-case, role-oriented (`assets-pipeline.md` §4) |

### 9.2 Optimization Rules (from `assets-pipeline.md` §5)

1. Favor static SVG for scalable UI and grid sprites.
2. Avoid large transparent margins in texture exports.
3. Reserve dimensions/aspect ratio at render targets to prevent CLS.
4. Keep gameplay animation updates on `transform` and `opacity` only.
5. SVG sprites under 50 path elements to avoid paint and layout recalc overhead.

### 9.3 CSS Animation Mapping

The following CSS animations (defined in `styles/animations.css`) consume visual assets:

| Animation | Consumes Assets | Notes |
|---|---|---|
| `walking-pulse` | Player walk frames, Ghost sprites | Frame swap or subtle scale on transform |
| `bomb-fuse` | Bomb fuse frames (3.1–3.4) | Flickering spark effect |
| `explosion-fade` | Fire tiles (3.5–3.6) | 0.5s opacity fade |
| `ghost-stun-flash` | Ghost stunned sprites (2.x.2) | Blue color transition flash |
| `invincibility-blink` | Player invincible sprite (1.8) | Rapid opacity toggle |
| `speed-boost-trail` | Player speed boost overlay (1.9) | Trail/tint effect |

---

## 10. Priority & Creation Order

Following Track D ticket ordering (`D-10` → `D-11`):

### Phase 1: Core Gameplay Sprites (D-10) — CRITICAL

| Priority | Category | Reason |
|---|---|---|
| P1 | Player (1.3–1.6) | Movement must be visible for MVP |
| P1 | Ghosts normal (2.x.1) | Enemies must render for playability |
| P1 | Bombs (3.1–3.4) | Core mechanic visualization |
| P1 | Walls (4.1–4.2) | Map structure readability |
| P1 | Pellets (5.1–5.2) | Objective visibility |
| P2 | Ghosts stunned (2.x.2) | Power pellet feedback |
| P2 | Fire tiles (3.5–3.6) | Explosion visualization |
| P2 | Power-ups (6.1–6.3) | Upgrade feedback |
| P2 | Ghosts dead (2.x.3) | Death state visualization |
| P3 | Player death/invincible/speed (1.7–1.9) | Edge-case feedback |
| P3 | Wall destruction (4.3–4.4) | Satisfying destruction feel |
| P3 | Collection flashes (5.3–5.4) | Juice/polish |

### Phase 2: UI Screens & HUD (D-11) — POLISH

| Priority | Category | Reason |
|---|---|---|
| P3 | HUD elements (7.1–7.5) | Persistent gameplay info |
| P3 | Pause overlay (8.2) | Required by AGENTS.md |
| P4 | Start screen (8.1) | Player onboarding |
| P4 | Game Over screen (8.3) | Failure state clarity |
| P4 | Victory screen (8.4) | Success state clarity |
| P4 | Level Complete (8.5) | Progression feedback |

---

## 11. Existing Asset Audit

| File | Status | Notes |
|---|---|---|
| `assets/generated/sprites/player-idle.svg` | ✅ Present | Needs quality review; verify viewBox, path count, dimensions |
| `assets/generated/sprites/player.svg` | ⚠️ Redundant | Generic placeholder; consolidate with `player-idle.svg` or remove |
| `assets/generated/sprites/ghost-blinky.svg` | ✅ Present | Needs state variants (stunned, dead); review quality |
| `assets/generated/sprites/ghost-pinky.svg` | ✅ Present | Needs state variants (stunned, dead); review quality |
| `assets/generated/sprites/ghost-inky.svg` | ✅ Present | Needs state variants (stunned, dead); review quality |
| `assets/generated/sprites/ghost-clyde.svg` | ✅ Present | Needs state variants (stunned, dead); review quality |
| `assets/manifests/visual-manifest.json` | ⚠️ Incomplete | Only contains `player-idle` entry; needs all 52 assets |
| `assets/source/visual/` | ❌ Empty | No source design files yet |

---

## 12. Manifest Requirements

Each asset MUST have an entry in `assets/manifests/visual-manifest.json` with the following required fields (per `assets-pipeline.md` §9):

```json
{
  "id": "unique-identifier",
  "path": "assets/generated/sprites/filename.svg",
  "kind": "sprite|ui|tile|effect",
  "format": "svg",
  "width": 64,
  "height": 64,
  "tags": ["tag1", "tag2"],
  "critical": true|false
}
```

Optional fields:
- `maxBytes`: Size budget (e.g., 32768 for 32KB)
- `notes`: Implementation notes

---

## 13. Dependencies & Constraints

| Constraint | Source | Impact |
|---|---|---|
| No `<canvas>`, no WebGL | `AGENTS.md`, `game-description.md` | All rendering via DOM/SVG/CSS |
| SVG <50 path elements | `AGENTS.md` §Asset Performance | Limits sprite complexity |
| `will-change: transform` on player + ghosts only | `AGENTS.md` §Rendering | ~5 compositor layers max |
| DOM pooling for fire/bombs/effects | `AGENTS.md` §Rendering | Hidden via `transform: translate(-9999px, -9999px)` |
| `prefers-reduced-motion` support | `AGENTS.md` §Accessibility | Menu/overlay animations disabled when query active |
| Keyboard-only navigation | `AGENTS.md` §Accessibility | Focus indicators on all UI elements |
| Lower-kebab-case naming | `assets-pipeline.md` §4 | Consistent asset identification |
| ViewBox stability | `assets-pipeline.md` §3 | Prevents CLS during animation swaps |

---

## 14. Recommendations

1. **Consolidate generic eyes**: All 4 ghosts can share a single `ghost-eyes-dead.svg` sprite, reducing asset count by 3.
2. **CSS overlays for states**: Invincibility blink and speed boost trail can be CSS class overlays (opacity blink, pseudo-element trail) rather than separate SVG files.
3. **Empty tile as CSS**: `tile-empty` likely needs no SVG — pure CSS grid cell with background color.
4. **HUD text elements**: Score, timer, and level number can be styled text without SVG assets.
5. **Shared fire tiles**: Fire explosion tiles can reuse a single SVG with CSS animation for variety.
6. **Source file organization**: Create `assets/source/visual/` subdirectories: `characters/`, `environment/`, `effects/`, `ui/`, `hud/` for maintainability.
7. **Iterative delivery**: Prioritize D-10 gameplay sprites before D-11 UI polish to maintain prototype-first workflow.

---

*Report end. Total assets to create: **46** (after accounting for existing 6 and potential consolidations).*
