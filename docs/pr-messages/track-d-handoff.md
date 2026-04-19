# Track D Phase 0 Handoff — Integration & Wiring

This document contains the necessary integration changes for **Track A** to wire up the Track D rendering pipeline and fix shared Phase 0 bugs in `bootstrap.js` and `main.ecs.js`.

---

## 1. `src/game/bootstrap.js`

### A. BUG-01: Restart Clock Baseline
Update the `onRestart` callback to use a finite timestamp source.

```javascript
// Change this:
onRestart: () => {
  resetClock(clock, clock.realTimeMs);
},

// To this:
onRestart: () => {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  resetClock(clock, now);
},
```

### B. ARCH-01 & ARCH-X02: Rendering Integration
Register the renderer and sync CSS board dimensions.

```javascript
// 1. Add these imports:
import { updateBoardCss } from '../adapters/dom/renderer-board-css.js';

// 2. Add registration helper to return object:
function registerRenderer(renderer) {
  registeredRenderer = renderer;
}

// 3. Update levelLoader onLevelLoaded:
onLevelLoaded: (mapResource) => {
  updateBoardCss(mapResource); // ARCH-X02
  syncPlayerEntityFromMap(world, mapResource, options);
},

// 4. Update stepFrame to flush the renderer:
function stepFrame(...) {
  // ...
  world.runRenderCommit(...);

  if (registeredRenderer && typeof registeredRenderer.update === 'function') {
    registeredRenderer.update(renderIntent); // ARCH-01
  }
  // ...
}
```

---

## 2. `src/main.ecs.js`

### SEC-11 & ARCH-01: Application Handoff
Instantiate the renderer and validate HUD elements.

```javascript
// 1. Add imports:
import { createDomRenderer } from './adapters/dom/renderer-dom.js';

// 2. Update bootstrapApplication():
const renderer = createDomRenderer({ appRoot });

// SEC-11: Validate HUD
const hudElements = {
  score: targetDocument.getElementById('hud-score'),
  level: targetDocument.getElementById('hud-level'),
  lives: targetDocument.getElementById('hud-lives'),
};

if (process?.env?.NODE_ENV === 'development') {
  for (const [name, el] of Object.entries(hudElements)) {
    if (!el) logger.warn(`HUD element "#hud-${name}" not found.`);
  }
}

// 3. Register with bootstrap:
bootstrap.registerRenderer(renderer);
```

---

## Status of Track D Owned Files
- **`src/ecs/resources/clock.js`**: FIXED (NaN guards, large delta clamping, epsilon-safe accumulator).
- **`src/ecs/resources/map-resource.js`**: FIXED (Structural preflight, bounds checks, ghost passability).
- **`src/ecs/resources/event-queue.js`**: FIXED (Deterministic sorting, in-place optimization, shallow-copy drain).
- **`src/ecs/resources/rng.js`**: FIXED (Mulberry32 constant documentation).
- **`src/ecs/render-intent.js`**: FIXED (JSDoc alignment).
- **`src/adapters/dom/*`**: READY (Allocation-free renderer and guarded CSS adapter).
