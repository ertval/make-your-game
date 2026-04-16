**Best way to use your PNG assets in this specific game (Ms. Ghostman — pure DOM, no canvas, ECS + CSS Grid + Render Batcher)**

Your PNGs are **already the perfect format** for this project.  
**Do NOT convert them to SVG** unless they are very simple icons/UI elements (pellets, power-ups, menu icons).  
Pixel-art style sprites (player, ghosts, bombs, explosions, walls, tiles) work far better as raster PNGs — they keep the crisp retro look, smaller file size, and exact pixel fidelity that SVG vectorization would ruin.

### Industry standard for pure-DOM browser games (2025-2026)

The current industry practice when you **cannot use Canvas** (exactly this project’s constraint) is:

- **PNG sprite sheets** (one big PNG containing all frames/tiles)
- **CSS background-position animation** (or CSS `background-position` stepped animation via `@keyframes`)
- Applied to pooled `<div>` elements (exactly what your `render-dom-system.js` + node pooling already does)

This is how almost every high-performance DOM-only retro game (and many “no-framework” Pac-Man/Bomberman clones) is built today. It is GPU-compositor-friendly, zero layout thrashing when you only touch `transform` + `background-position`, and stays well under the ≤500 DOM elements budget.

### Recommended workflow for this repo

1. **Prepare your PNGs (source → generated)**
   - Put raw PNGs in `assets/source/visual/` (exactly where the assets pipeline expects hand-authored art).
   - Create **sprite sheets** (recommended tool: free & offline):
     - TexturePacker (best for games)
     - Aseprite → Export → Sprite Sheet
     - or online: https://www.codeandweb.com/texturepacker (free tier)
   - Layout style: **horizontal strip** (easiest for CSS) or grid.  
     Example for Ms. Ghostman walking animation:
     ```
     player-walk.png   ← 8 frames side-by-side, 32×32 px each → total 256×32 px
     ghost-red.png     ← 4 directions × 2 frames = 128×64 px strip
     explosion.png     ← 5 frames
     ```
   - Optimize aggressively:
     - 8-bit PNG (PNGOUT / pngquant / ImageOptim)
     - No transparency on tiles/walls if possible
     - Target < 50 KB per sheet for 60 FPS comfort

2. **Build-time processing (follow the project’s pipeline)**
   The repo already has a planned assets pipeline (`docs/implementation/assets-pipeline.md`).  
   Put your sprite sheets in `assets/source/visual/` → run the build → they will land in `assets/generated/sprites/` and be listed in `visual-manifest.json`.  
   The manifest is what the Render Collect / Render DOM systems read at runtime.

3. **How the Render Batcher will use them (code pattern you should follow)**

In the DOM nodes created by your node pool (in `render-dom-system.js`):

```css
/* styles/animations.css (or wherever you define sprite animations) */
.sprite-player {
  background-image: url("/assets/generated/sprites/player-walk.png");
  background-size: 800% 100%;           /* 8 frames horizontal */
  background-repeat: no-repeat;
  image-rendering: pixelated;           /* crucial for retro look */
  width: 32px;
  height: 32px;
}

@keyframes walk {
  0%   { background-position: 0% 0; }
  12.5% { background-position: 12.5% 0; }
  /* ... up to 100% */
}
```

Then in the render system you only do:

```js
// render-dom-system.js
entityDOM.style.transform = `translate(${x}px, ${y}px)`;
entityDOM.style.backgroundPosition = `${frameOffset}% 0`; // or add/remove CSS class
```

This is **exactly** the performant pattern the project is designed for (single batched style write phase, transform-only, compositor-friendly).

### Alternative options (and why they are worse here)

| Option                  | Pros                              | Cons for this project                              | Recommendation |
|-------------------------|-----------------------------------|----------------------------------------------------|----------------|
| Individual PNG per frame | Simple                            | 100s of DOM nodes or HTTP requests → breaks pooling & 60 FPS target | Avoid |
| Convert to SVG          | Scalable, crisp at any size      | Huge file size for pixel art, loses retro look, slower DOM rendering | Only for UI |
| Inline SVG + <image>    | One file                          | Still raster under the hood + extra DOM overhead   | Not worth it |
| CSS background single PNG + JS frame control | Perfect performance & control | None — this is the winner                          | **Use this** |

### Quick checklist for your PR (Track D)

- PNGs → `assets/source/visual/`
- Sprite sheets created + optimized
- `visual-manifest.json` updated (or let the build script do it)
- Animation CSS in `styles/animations.css`
- Render system only mutates `transform` + `background-position` (never `left/top` or `innerHTML`)
- Test at 60 FPS with the existing performance targets

This approach is the **actual industry standard** for DOM-only games in 2026 (see high-score DOM Pac-Man clones, Bomberman HTML5 remakes, etc.). It fits the ECS render pipeline perfectly and will keep you under every performance budget listed in the readme.

Drop your PNGs in the right folder, make sprite sheets, and you’re good to go. If you want, share the name of the asset (player, ghost, bomb, etc.) and I can give you the exact CSS `@keyframes` snippet.