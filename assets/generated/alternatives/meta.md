For a DOM-only ECS game like yours: **do not convert your PNGs to SVG**. Use the PNGs directly. Converting raster → SVG won't magically make them vectors and will usually make performance worse.

Here's the breakdown and what "industry standard" looks like for browser DOM games:

### **1. Keep PNG for art, use SVG only for UI/shapes**

| Format | Use for | Why |
| --- | --- | --- |
| **PNG** | Characters, tiles, effects, anything with texture/detail | GPU textures love bitmap. Instant rendering, no CPU parsing. 60fps-safe |
| **SVG** | Simple logos, HUD icons, geometric UI | Scales perfectly, tiny file size. But: each `<svg>` in DOM is expensive if animated or numerous |
| **WebP/AVIF** | Same as PNG but smaller | Better compression. Support is universal now. Good upgrade path |

**Rule of thumb**: If it was drawn as pixels, ship it as pixels. SVG is not a "better PNG". Re-tracing your PNGs to SVG will bloat DOM, kill performance, and look blurry.

Ms. Ghostman uses CSS Grid + `transform`. That means you're moving DOM elements around. Having 200+ complex inline SVGs animating via `transform` will tank your frame budget. PNGs as `background-image` or `<img>` are basically free once decoded.

### **2. Sprite sheets / texture atlases are the industry standard**

This is what every 2D game does, DOM or canvas. You said "no canvas", but the asset strategy is identical.

**Why spritesheets:**
1. **1 HTTP request vs 50** - Critical for your GitHub Pages deploy
2. **GPU upload once** - The browser decodes the PNG once, then just shifts `background-position` 
3. **Batching** - Your `render-dom-system.js` can change `transform` + `background-position` in one style write. No layout
4. **Prevents flicker** - Individual images can pop in. Spritesheet is all-or-nothing

**How to set it up for your ECS:**

Since you already have `assets/generated/sprites/` planned:

```
assets/generated/sprites/
├── characters.png    # ms-ghostman, 4 ghosts, all frames
├── tiles.png         # walls, pellets, power pellets
├── effects.png       # bomb, explosions, particles
```

**CSS approach that fits your "compositor friendly" rule:**
```css
.sprite {
  background-image: url('/assets/generated/sprites/characters.png');
  will-change: transform; /* you already do this */
  image-rendering: pixelated; /* for retro look, prevents blur */
}

.ghostman-right-frame1 { background-position: 0 0; }
.ghostman-right-frame2 { background-position: -32px 0; }
.ghostman-left-frame1  { background-position: 0 -32px; }
```

Your `Renderable` component stores `sprite: 'ghostman-right-frame1'`. The `render-dom-system.js` swaps the class name. Zero layout, just compositor work.

### **3. Animation: CSS steps() is perfect for your stack**

Don't do JS `setInterval` frame swaps. Let the browser handle it:

```css
.ghostman-walk {
  animation: walk-cycle 0.4s steps(4) infinite;
}

@keyframes walk-cycle {
  from { background-position: 0 0; }
  to   { background-position: -128px 0; } /* 4 frames * 32px */
}
```

Your ECS just adds/removes `.ghostman-walk` via `VisualState` component. The `render-dom-system.js` already batches class changes. This keeps your "pure data" components clean and hits 60fps because it's all on the compositor.

### **4. Specific to your README constraints**

| Your requirement | What it means for PNGs |
| --- | --- |
| **No `<canvas>`** | Spritesheets + CSS is literally the best option left. Canvas would use same PNGs anyway |
| **≤ 500 DOM elements** | Node pooling + spritesheets prevents you from hitting this. 1 grid tile = 1 div with changing bg-pos |
| **Zero layout thrashing** | `background-position` + `transform` never triggers layout. You're safe |
| **`assets/generated/sprites/` exists** | You're already set up for the standard pipeline. Use a tool like TexturePacker, Aseprite, or free ShoeBox to pack your PNGs |
| **`visual-manifest.json`** | Store sprite frame rects here: `{"ghostman.walk[0]": {"x":0,"y":0,"w":32,"h":32}}`. Your systems read this, not hardcoded CSS |

### **5. What pros actually do: summary**

1. **Author**: Draw individual PNGs in Aseprite/Piskel
2. **Pack**: Run them through a sprite packer → 1-3 big PNGs + JSON manifest
3. **Render**: DOM: `<div>` with `background-image` + `background-position`. Canvas/WebGL: draw from atlas with source rect
4. **Animate**: CSS `steps()` for DOM, or flip `sourceRect` per frame in JS for canvas

You only differ on step 3 because of the DOM constraint. The asset part is identical to Phaser/Pixi games.

### **Action plan for Ms. Ghostman**

1. **Keep your PNGs** as source in `assets/source/visual/`
2. **Pack them** into sheets in `assets/generated/sprites/`. 32x32 or 16x16 tiles are standard. Aim for <2048x2048 sheets for mobile GPU compatibility
3. **Generate `visual-manifest.json`** during pack step. Maps `entityType + anim + frame` → `{x,y,w,h}`
4. **In ECS**: `Renderable` component = `{sheet: 'characters', sprite: 'ghostman_idle_0'}`
5. **`render-collect-system.js`**: Looks up rect from manifest, computes `background-position`
6. **`render-dom-system.js`**: Sets `style.backgroundPosition = '-64px -32px'` in the batched write phase
7. **For animations**: Either swap `sprite` every N ticks in a system, or use CSS `steps()` and just toggle a `VisualState` flag

**Don't**: Convert to SVG, use 100 individual `<img>` tags, or use `background-size: contain` which triggers filtering cost.

Want me to sketch what your `Renderable` component + `visual-manifest.json` schema would look like given your ECS setup?