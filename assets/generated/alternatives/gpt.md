Short answer: **don’t convert your PNGs to SVG** unless they are truly vector-style assets. The industry standard for 2D games (including DOM-based ones like yours) is:

> **Raster sprites (PNG/WebP) + sprite sheets + metadata + batched rendering**

Given your constraints (**DOM, no canvas, ECS, 60 FPS**), you want a **sprite atlas pipeline + CSS transform rendering**.

---

# 🧭 Decision Framework (what to use when)

## 1. PNG vs SVG

**Use PNG (or WebP) for almost everything in your game.**

| Asset type                  | Format         | Why                                          |
| --------------------------- | -------------- | -------------------------------------------- |
| Characters (player, ghosts) | PNG/WebP       | Pixel-perfect control, predictable rendering |
| Explosions / VFX            | PNG/WebP       | Frame-based animation                        |
| Tiles / walls               | PNG/WebP       | Grid-aligned raster works best               |
| UI icons (simple shapes)    | SVG (optional) | Scales cleanly                               |

### 🚫 Why NOT SVG for your game

* Complex animations = **DOM overhead explodes**
* Harder to batch efficiently in ECS render system
* Worse performance under frequent transforms
* No advantage for pixel-art style

👉 SVG is only worth it if assets are:

* geometric
* resolution-independent
* rarely animated

---

# 🏭 Industry Standard Pipeline

## ✅ 1. Sprite Sheets (Texture Atlases)

Instead of:

```
player_walk_1.png
player_walk_2.png
...
```

You use:

```
player.png  (contains all frames)
```

![Image](https://images.openai.com/static-rsc-4/1veJl2MS9nS4AWr1w1f1JU-Pe8mUe67lkJDumTejeBtksX6F3IUwA7QYFrgS-xTDZ_J2yPpbqsDGkR7uw1V_RQBCIwjfQGgBPkNTjIxoA2XiUNgvz2xDMhYlc8pKProgqNYtpDnihcc23ONuG7vEGZ1X_ZQ65JOdvBBtrcs0KdwFs7kp-mBGcH7Oja4c_A-i?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/WDIydvrw5_-kY1whdL04Zl0uQRtZzhSIt4Rq-PMsuWEk2NcQXNXyvR5hYz6gxVcKl8WWsIiiOgNMlxoAJMUMevyJycMrDYgYCSBseD9oiEjlRk7W0W6nZOMzH338_4idNy3OBRZdtN57WxrQgo9MpSOBmhSUxFlWCsO92ypzCt7dP7x95-jtXIWAtVGChBii?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/tV215ZyPTF5uQkcHomu2RzOw_BpdACUjKImp0sRpOXJmlGHKuOLAUoUveTnHxaJO0AXHMZpqgjF0AlikQxAbYFSu1OJZF1d_DhDZ9idhjdflcA-cBAoT5CV6x7xEOtGLllCCD8MLDLK3zbNntxZ2EGRgUve_bC2XTDnj2PGoYrHudjalWjKRCXbjrTT_yY7s?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/pzPPos9vDe2N9T7KjWosVMpO72SX0Q8jSX_KU4JV3uhEQMLarieq3L2n_kiku5m_Xw2rXXy5SOF3WX4uiapyADPeP1DfmuTahScUWVRBasowEABPtceEC5iRlkl4KwRHYqC6J2Wx5mfUZ0a0he_fvz4eFwJk7r9wWRVttNFWkVQPlGPY_mcEA5MBZlBUK7Fs?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/diAD5Rul1MQQKcIKjFdDAeLaZxHIG8nT0_YIV4a5_-3XOHsRyN7sVM9BuFqDNMkUm7H5v3LmsnWquU1X5PvltHw9ksYfJ2rFUHjNRZWpsPIswy6OqoOoR4bGTS4e4gatHrQO43PF8s55K48gmHxnvp5tVsLbzNxmRnE0KEcJ1qLl4ldW5k2yH9Efcdm1PzEw?purpose=fullsize)

### Benefits

* **1 DOM image per entity type**
* Fewer network requests
* Better cache locality
* Enables GPU-friendly rendering

---

## ✅ 2. Metadata (CRITICAL)

You need a manifest like:

```json
{
  "player": {
    "image": "player.png",
    "frameWidth": 32,
    "frameHeight": 32,
    "animations": {
      "walk": [0,1,2,3],
      "idle": [4]
    }
  }
}
```

This fits perfectly into your:

```
assets/manifests/visual-manifest.json
```

---

## ✅ 3. Rendering Strategy (DOM-friendly)

Since you **don’t use canvas**, the industry trick is:

### Use ONE `<div>` per entity with:

```css
.entity {
  width: 32px;
  height: 32px;
  background-image: url(player.png);
  background-position: -64px 0;
  transform: translate3d(x, y, 0);
}
```

### Animate via:

* `background-position` (frame switching)
* `transform` (movement)

👉 This aligns PERFECTLY with your:

* **Render Collect System**
* **Render DOM System (batched writes)**
* **transform-only updates (compositor friendly)**

---

## ✅ 4. Animation Model (ECS-aligned)

Define a component:

```js
Animation = {
  frame: 0,
  timer: 0,
  speed: 0.1,
  current: "walk"
}
```

System:

```js
animationSystem(dt) {
  anim.timer += dt;
  if (anim.timer > anim.speed) {
    anim.frame = (anim.frame + 1) % frames.length;
    anim.timer = 0;
  }
}
```

Render system maps:

```
frame → background-position
```

---

# ⚡ Optimization Tier (what pros do)

## ✅ Use WebP (or AVIF)

* Smaller than PNG
* Same quality
* Supported in modern browsers

👉 Keep PNG only if:

* you need lossless pixel-perfect sprites

---

## ✅ Texture Packing Tools

Industry tools:

* **TexturePacker**
* **Free alternatives**: `spritesmith`, `sharp`, `aseprite export`

They:

* pack sprites tightly
* generate JSON automatically

---

## ✅ Power-of-Two Atlases (optional)

Helps GPU alignment:

```
256x256
512x512
1024x1024
```

---

## ✅ Group by usage

Separate atlases:

```
player.png
ghosts.png
effects.png
tiles.png
```

👉 Avoid one giant atlas → cache inefficiency

---

# ❌ What NOT to do

### ❌ Individual PNG per frame

* kills performance (DOM + network)

### ❌ GIF animations

* no control
* no ECS integration

### ❌ CSS keyframe animations for gameplay

* breaks determinism (important for your ECS)

### ❌ Inline SVG animation for everything

* heavy + slow at scale

---

# 🧱 Best Setup for *your exact architecture*

Given your repo + ECS + DOM batching:

## ✔ Asset pipeline

```
assets/source → (build step) → sprite atlas → manifest.json
```

## ✔ ECS integration

* `Renderable` → sprite id
* `Animation` → frame index
* `Render System` → computes background-position

## ✔ DOM constraints

* one node per entity
* no layout properties (only transform/opacity)
* background-position updates only

---

# 🧠 Practical Recommendation

For your game specifically:

👉 **Do this:**

1. Keep PNG assets
2. Convert them into **sprite sheets**
3. Generate a **visual-manifest.json**
4. Use **background-position animation**
5. Optionally convert to **WebP for production**

👉 **Do NOT:**

* convert everything to SVG
* animate via CSS keyframes
* load individual frame images

---

# If you want next step

I can:

* design your **visual-manifest schema**
* give you a **sprite packing script (Node + sharp)**
* or define your **ECS Renderable + Animation components contract**

Just tell me.
