Building a pure DOM-rendered game with a strict ECS architecture is a fantastic and challenging constraint! Since you are bypassing `<canvas>` entirely, your approach to handling image assets is going to look a bit different from the standard web game playbook. 

Here is how you can best utilize your PNG assets while adhering strictly to your project's performance and architectural rules.

### 1. Should You Convert to SVG or Keep PNG?
Your README lists **SVG** under the tech stack for visual assets, but keeping them as **PNGs** is perfectly fine and often preferred depending on the art style:
* **Keep as PNG if:** Your assets are **pixel art** (which fits the retro Pac-Man/Bomberman vibe). Browsers handle pixelated PNGs beautifully. You just need to apply the CSS property `image-rendering: pixelated;` to keep them crisp when scaled up.
* **Convert to SVG if:** Your assets are vector-based, smooth illustrations, and you want infinite resolution scaling without bloated file sizes. 

*Recommendation:* If your current assets are pixel art PNGs, do not convert them to SVG. Stick with PNG and utilize spritesheets.

---

### 2. How to Best Use Them: CSS Spritesheets
In a canvas-based game, you would draw different frame regions using `ctx.drawImage()`. In a pure DOM-based game, the industry standard is to use **CSS Spritesheets**.

Instead of creating hundreds of separate `<img>` tags (which harms performance and network loading), you combine all your animation frames into a single PNG file. You then display this image as a `background-image` on an empty `<div>` and shift the `background-position` to show the correct frame.

#### The Implementation (DOM & CSS):
Assume you have a `pacman-sprite.png` that is 64px tall and has 4 frames (each 64x64) in a horizontal row.

```css
/* Base class for your entity's visual representation */
.sprite {
  width: 64px;
  height: 64px;
  background-image: url('../assets/generated/sprites/pacman-sprite.png');
  background-repeat: no-repeat;
  image-rendering: pixelated; /* Crucial for retro pixel art */
  position: absolute; /* Essential for your Render Batcher to use CSS transforms */
}

/* Animation driven by CSS Steps
  This is highly performant as it offloads the animation loop to the browser's compositor.
*/
.sprite-animate-walk {
  animation: walk-cycle 0.4s steps(4) infinite;
}

@keyframes walk-cycle {
  from { background-position: 0px 0; }
  to { background-position: -256px 0; } /* 64px * 4 frames */
}
```

---

### 3. Integrating with your ECS Architecture
Your README outlines a `render-dom-system.js` that applies a single batched style-write phase. To make your PNG animations work within this framework seamlessly:

1.  **Component Level:** Create a `VisualState` component for your entities that holds the current animation state (e.g., `state: 'moving_left'`).
2.  **System Level:** Your `Render Collect System` evaluates the entity's state (velocity, health, etc.) and determines what the `VisualState` should be. 
3.  **DOM Output:** Your `Render DOM System` simply applies the corresponding CSS class (e.g., `.moving-left`) to the pooled DOM node associated with that entity, alongside updating its CSS `transform: translate(x, y)` for movement.

---

### 4. What is the Industry Standard?
To give you the complete picture:
* **The Global Standard (Web Games):** The vast majority of 2D web games use WebGL or the Canvas API via frameworks like **PixiJS** or **Phaser**. They load spritesheets and use WebGL shaders to render thousands of sprites simultaneously.
* **The DOM-Only Standard:** For highly constrained projects like yours, the standard relies heavily on **Object Pooling** (reusing a fixed number of DOM nodes instead of creating/destroying them, which causes garbage collection pauses) and **hardware-accelerated CSS** (using only `transform`, `opacity`, and `background-position` to avoid Layout Thrashing).

Your README strictly prohibits `<canvas>`, so the DOM-only standard is exactly what you must follow to hit that 60 FPS target!

Would you like me to draft a sample `VisualState` component and the corresponding ECS Render System logic to show exactly how your engine would swap these PNG sprite frames?