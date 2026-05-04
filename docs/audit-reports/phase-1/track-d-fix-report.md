# Track D Fix Report

### BUG-01-SPRITE: Sprite Pool Adapter recycles empty active pool ⬆ HIGH
**Origin:** Bugs & Logic Errors (GF)
**Source Reports:** GF
**Files:** Track D (D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (~L100)
**Problem:** When idle elements are exhausted and active pool is empty, `activePool.shift()` returns `undefined`, causing runtime crash on `.style.transform` access.
**Impact:** Occurs when acquiring sprites without warm-up or after pool reset.
**Fix:**
```javascript
const recycled = activePool.shift();
if (!recycled) {
  const el = createElement(type);
  activePool.push(el);
  return el;
}
recycled.style.transform = OFFSCREEN_TRANSFORM;
```
**Tests to add:** Test `acquire()` on un-warmed sprite pool.

---


### BUG-02-BP: Modifying Map during iteration in `render-dom-system.js` ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (BP)
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L156-161)
**Problem:** `entityElementMap` modified with `.delete()` during `for...of` iteration, unsafe in some environments.
**Impact:** Sprite pool leaks from uncleaned DOM elements.
**Fix:** Collect entries to delete first, then iterate to release and delete.
**Tests to add:** Test entity cleanup when removed from render intent.

---


### BUG-03-MM: `render-dom-system` entityElementMap memory leak ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js:92-161`
**Problem:** `entityElementMap` accumulates entries but never cleans up destroyed entities; old DOM elements not released on level restart.
**Impact:** Memory growth and pool exhaustion across restarts.
**Fix:** Add cleanup on level restart:
```javascript
if (context.isLevelRestart) {
  for (const [id, info] of entityElementMap) {
    spritePool.release(info.type, info.element);
  }
  entityElementMap.clear();
}
```
**Tests to add:** Test `entityElementMap` cleanup on entity destroy.

---


### BUG-06-MM: Event queue `drain()` optimization comment misleading ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js:70-94`
**Problem:** Comment claims in-place sort to avoid allocation, but code copies array with `[...queue.events]`.
**Impact:** Misleading documentation; minor allocation overhead.
**Fix:** Either sort in-place or remove optimization comment.

---


### BUG-10-MM: `render-intent` buffer overflow silently drops intents ⬆ MEDIUM
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-07)
- `src/ecs/render-intent.js:126-146`
**Problem:** Buffer overflow silently drops intents in production (only warns in dev mode).
**Impact:** Entities may not render in high-entity scenarios; silent failure.
**Fix:** Increase buffer size with headroom, or implement ring buffer. Log in production.
**Tests to add:** Test render-intent buffer overflow handling.

---


### BUG-14-MM: Event queue sort comparator overflow risk ⬆ LOW
**Origin:** Bugs & Logic Errors (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js:80-85`
**Problem:** Sort uses subtraction which overflows for very large frame numbers.
**Impact:** Unlikely in practice, but theoretical long-session overflow.
**Fix:**
```javascript
return a.frame < b.frame ? -1 : (a.frame > b.frame ? 1 : 0);
```

---

## 2) Dead Code & Unused References


### DEAD-RESETQ: `resetOrderCounter` unused export ⬆ MEDIUM
**Origin:** Dead Code & Unused References (GF, MM)
**Source Reports:** GF, MM
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L133)
**Problem:** Exported but never invoked in game loop or bootstrap (GF DEAD-01). Also reported as MM DEAD-02 with medium severity.
**Action:** Remove function and export.

---


### DEAD-02-SIMHZ: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L23)
**Problem:** Exported but only used locally to derive `FIXED_DT_MS`.
**Action:** Remove export, keep as local const.

---


### DEAD-03-BP: Ghost AI constants unused ⬆ MEDIUM
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L92-98)
**Problem:** `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, `INKY_REFERENCE_OFFSET` never used.
**Action:** Remove or annotate for future AI tickets.

---


### DEAD-04-BP: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L147-160)
**Problem:** Never imported; `props.js` defines its own `PROP_POWER_UP_TYPE`.
**Action:** Remove from `constants.js`.

---


### DEAD-05-BP: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L63)
**Problem:** Defined but never imported or referenced.
**Action:** Remove.

---


### DEAD-06-BP: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/constants.js` (~L101)
**Problem:** Defined but never imported or used.
**Action:** Remove.

---


### DEAD-09-BP: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** Dead Code & Unused References (BP)
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L37-45)
**Problem:** `RENDERABLE_KIND.WALL` maps to `null`; walls don't have Renderable component.
**Action:** Remove entry from `KIND_TO_SPRITE_TYPE`.

---


### DEAD-05-MM: `getActiveEntityHandles` may be inefficient ⬆ MEDIUM
**Origin:** Dead Code & Unused References (MM)
**Source Reports:** MM
**Files:** Track D (D-01)
- `src/ecs/world/world.js:276`
**Problem:** Creates full handle objects for simple destroy operations; `getActiveIds()` would suffice.
**Action:** Use `getActiveIds()` for destroy logic.

---

## 3) Architecture, ECS Violations & Guideline Drift


### ARCH-01-BP: Event queue `drain()` allocates new array per call ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Violated Rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L88)
**Problem:** `drain()` uses `[...queue.events]` which allocates a new array each call.
**Impact:** Recurring allocation in hot loop.
**Fix:** Use pre-allocated ring buffer for events.

---


### ARCH-01-GF: Event queue `resetOrderCounter` violates sync point ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (GF)
**Violated Rule:** *"Events are drained once per frame at a defined sync point"*
**Source Reports:** GF
**Files:** Track D (D-01)
- `src/ecs/resources/event-queue.js` (~L126-L135)
**Problem:** Manual `resetOrderCounter` risks resetting event order indexes before consumers drain events.
**Impact:** High risk of insertion order collisions.
**Fix:** Deprecate `resetOrderCounter` and rely exclusively on `drain()`.

---


### ARCH-02: `display:none` used for HIDDEN flag instead of offscreen transform ⬆ CRITICAL
**Origin:** Architecture, ECS Violations & Guideline Drift (BP, MM)
**Violated Rule:** AGENTS.md Rendering and DOM Rules: *"Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none`"*
**Source Reports:** BP (ARCH-02), MM (ARCH-01)
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L73-75)
**Problem:** HIDDEN flag uses `el.style.display = 'none'` which triggers layout thrashing.
**Impact:** Violates performance policy for DOM hiding.
**Fix:**
```javascript
if ((classBits & VISUAL_FLAGS.HIDDEN) !== 0) {
  el.style.transform = 'translate(-9999px, -9999px)';
}
// Restore transform when HIDDEN is cleared
```

---


### ARCH-03-BP: `currentFrameEntityIds` Set created every frame ⬆ MEDIUM
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Violated Rule:** AGENTS.md Performance Rules: *"MUST avoid recurring allocations in hot loops"*
**Source Reports:** BP
**Files:** Track D (D-08)
- `src/ecs/systems/render-dom-system.js` (~L111)
**Problem:** `const currentFrameEntityIds = new Set()` allocated every render frame.
**Impact:** Recurring allocation in hot loop.
**Fix:** Hoist Set to system closure; clear in-place with `clear()`.

---


### ARCH-04-BP: Render commit phase separation ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track D (D-07, D-08)
**Verdict:** ✅ PASS — `render-collect-system.js` computes intents, `render-dom-system.js` applies DOM writes in single batch.

---


### ARCH-07-BP: Render-Intent Contract ⬆ PASS
**Origin:** Architecture, ECS Violations & Guideline Drift (BP)
**Source Reports:** BP
**Files:** Track D (D-07)
**Verdict:** ✅ PASS — `render-intent.js` uses pre-allocated parallel typed arrays; `classBits` bitmask correct.

---


### SEC-01-BP: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/security/trusted-types.js` (~L10-17)
**Problem:** Default policy passes through strings without sanitization; no actual security benefit.
**Fix:** Implement proper sanitization or document why empty policy is acceptable.

---


### SEC-02-BP: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `vite.config.js` (~L27-28)
**Problem:** Weaker security for Vite HMR support; known trade-off.
**Fix:** Document trade-off in AGENTS.md or vite.config.js comments.

---


### SEC-04-BP: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** Code Quality & Security (BP)
**Source Reports:** BP
**Files:** Track D (D-01)
- `src/security/trusted-types.js` (~L1-18)
**Problem:** Missing required block comment header per AGENTS.md.
**Fix:** Add file header explaining purpose, API, and implementation notes.

---


### TEST-01-BP: Missing unit tests for adapter entry points ⬆ HIGH
**Origin:** Tests & CI Gaps (BP)
**Source Reports:** BP
**Files:** Track D (D-05, D-06)
- `src/adapters/dom/renderer-adapter.js`, `src/adapters/dom/renderer-board-css.js`
**Problem:** No Vitest/jsdom tests for adapter modules.
**Fix:** Create `tests/unit/adapters/renderer-adapter.test.js` and `renderer-board-css.test.js`.

---
