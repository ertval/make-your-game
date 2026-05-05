# Track D Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report, verified against
the actual source code on 2026-05-05. False positives have been removed; corrected notes, adjusted
severities, and improved fix guidance are added where the original finding was imprecise.

**Total Actual Issues to Resolve: 26**

---

## 1) Bugs & Logic Errors

---

### BUG-05: Sprite Pool Adapter crashes when pool is un-warmed ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (L86–103)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE, with corrected description.** The `acquire(type)`
function (L86) correctly handles a non-empty idle pool (L90–93). However, when the idle pool is
empty AND the active pool is also empty (i.e., pool was never warmed via `warmUp()`), line 100:
```js
const recycled = activePool.shift(); // returns undefined
recycled.style.transform = OFFSCREEN_TRANSFORM; // CRASH: Cannot read property of undefined
```
This crash path is reachable if `acquire()` is called before `warmUp()` is called.

**Fix:** Add a null-guard and graceful element creation fallback:
```js
const recycled = activePool.shift();
if (!recycled) {
  // Pool is completely exhausted (neither idle nor active elements exist).
  // Create a new element on demand to avoid a crash, but log a warning
  // so developers know the pool was under-sized.
  if (dev) {
    console.warn(`[sprite-pool] Pool for "${type}" exhausted — creating element on demand.`);
  }
  const el = createElement(type);
  // Do not attach to container here; caller must manage DOM insertion.
  activePool.push(el);
  return el;
}
```
Additionally, consider asserting that `warmUp()` has been called before any `acquire()` in dev
mode.

**Tests to add:**
- Test `acquire()` on a pool that has never been warmed up — must not throw.
- Test `acquire()` when all idle and all active slots are exhausted — graceful fallback.

---

### ~~BUG-07: `render-dom-system` entityElementMap memory leak~~ ❌ FALSE POSITIVE

**Verification note (from audit report):** `render-dom-system.js:L156–161` runs a cleanup loop
every render frame:
```js
for (const [prevEntityId, info] of entityElementMap) {
  if (!currentFrameEntityIds.has(prevEntityId)) {
    spritePool.release(info.type, info.element);
    entityElementMap.delete(prevEntityId);
  }
}
```
This releases and removes stale entries every frame. No memory leak exists. **Removed from fix
list.**

---

### BUG-10: `render-intent` buffer silently drops intents in production ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-07)
- `src/ecs/render-intent.js` (L126–135)

**Verification:** ⚠️ **DOWNGRADED TO LOW.** Code review shows:
1. The buffer logs a `console.warn` in **dev mode** when full (L128–133), so dev builds do
   surface overflows.
2. `MAX_RENDER_INTENTS` (constants.js:L211–216) is sized as `POOL_GHOSTS + POOL_MAX_BOMBS +
   POOL_FIRE + POOL_PELLETS + 1 + 200 = 4 + 10 + 170 + 165 + 1 + 200 = 550`. For a 15×11 grid
   this is sufficient.
3. The true risk is ARCH-06 (capacity mismatch with EntityStore 10k capacity) — not this file.

**Fix (reduced scope):** The silent production drop is acceptable given the buffer is sized to
capacity. Add a **frame-rate-throttled** production warning (one warning per second max) to
surface overflow bugs in production without spam:

```js
// At module level in render-intent.js:
let _lastOverflowWarnMs = 0;

export function appendRenderIntent(buffer, entry) {
  if (buffer._count >= buffer._capacity) {
    const now = Date.now();
    if (now - _lastOverflowWarnMs > 1000) {
      console.warn(`[render-intent] Buffer overflow: entity ${entry.entityId} dropped.`);
      _lastOverflowWarnMs = now;
    }
    return;
  }
  // ...
}
```

Proper fix for capacity: resolve ARCH-06 to align `MAX_RENDER_INTENTS` with the actual max
renderable entity count.

---

### BUG-12: Event Queue `drain()` allocates a new array per call ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (L88)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Line 88:
```js
const result = [...queue.events]; // spread allocation every drain
```
This allocates a new array on every `drain()` call, which happens once per frame. In a 60Hz
game loop this is ~60 heap allocations/second — visible as GC pressure in allocation profiles.

**Fix options (ordered by performance impact):**

**Option A — Preferred (minimal change):** Swap ownership of the internal buffer:
```js
export function drain(queue) {
  if (queue.events.length === 0) {
    queue.orderCounter = 0;
    return _EMPTY; // frozen singleton: Object.freeze([])
  }
  queue.events.sort((a, b) => {
    if (a.frame !== b.frame) return a.frame - b.frame;
    return a.order - b.order;
  });
  const result = queue.events;
  queue.events = []; // assign fresh array to internal buffer (reuses old as result)
  queue.orderCounter = 0;
  return result;
}
```
This eliminates the spread allocation. The returned array IS the old internal buffer — callers
must NOT hold references across frames (document this clearly). Add a frozen empty singleton for
the zero-events fast path to avoid even the `[]` allocation there.

**Option B — Ring buffer:** Pre-allocate a fixed-capacity typed buffer. Higher complexity,
not warranted unless `drain()` shows up in frame profiles with Option A in place.

**Tests to add:** Regression test: assert `drain()` returns events in deterministic `(frame,
order)` order even when enqueued out of order. Verify empty drain returns `[]`-like result.

---

### BUG-15: `enqueue()` throws when `queue` parameter is `null` ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (L49)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** `enqueue(queue, ...)` calls `queue.events.push()`
without a null guard. If `queue` is `null` or `undefined`, this throws a `TypeError`. The function
is called from multiple systems and the queue might be conditionally absent in test harnesses.

**Fix:** Add a guard at the top of `enqueue`:
```js
export function enqueue(queue, type, payload, frame) {
  if (!queue) return; // silently skip if no queue registered
  const validFrame = Number.isFinite(frame) ? frame : 0;
  // ...
}
```

**Tests to add:** `enqueue(null, 'test', {}, 0)` must not throw.

---

## 2) Dead Code & Unused References

---

### DEAD-01: Two Competing Render Pipelines / Duplicate DOM Renderer ⬆ HIGH
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`
- `src/game/bootstrap.js` (~L242)

**Problem:** The runtime has two DOM commit paths: `runRenderCommit` via `render-dom-system` (the
ECS path with sprite pooling) and `stepFrame` via `renderer-dom.js` (a legacy path that bypasses
pooling entirely). If both are active in the same frame, this causes double DOM writes and
duplicate elements.

**Fix:** Remove `createDomRenderer`/`stepFrame` from the runtime frame path entirely. The ECS
`render-dom-system` is the canonical path. `renderer-dom.js` may remain for non-ECS tooling use
(e.g., map preview) but MUST NOT be called from the main game loop.

---

### DEAD-04: `resetOrderCounter` exported but only called in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (L133)

**Verification:** ⚠️ **STALE FINDING, REDUCED SEVERITY.** `resetOrderCounter` is only called in
`tests/unit/resources/event-queue.test.js`. The runtime uses `drain()` which auto-resets the
counter (L91). The export has no production callers.

**Fix:** Options:
1. **Preferred:** Annotate in JSDoc that this is a test-only escape hatch. The function is
   harmless, and removing it breaks the unit test.
2. **Aggressive:** Remove the export and inline the test assertion directly.

If keeping, also consider resolving ARCH-07 (which flags it as a sync-point violation when called
outside `drain()`).

---

### DEAD-06: Ghost AI constants unused externally ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (L95–101)

**Verification:** ✅ **CONFIRMED.** `CLYDE_DISTANCE_THRESHOLD`, `PINKY_TARGET_OFFSET`, and
`INKY_REFERENCE_OFFSET` are defined but no ghost-AI system currently consumes them (AI system
is not yet implemented in Phase 1).

**Fix:** Keep these constants but add a JSDoc comment noting they are reserved for the
ghost-AI system (Track D later phase). Do NOT remove — removing forces re-introduction when AI
is implemented. Mark as `@internal` if they should not be exposed in the module's public API.

---

### DEAD-07: `POWER_UP_TYPE` and `PROP_POWER_UP_TYPE` are distinct (not redundant) ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (L158–163)
- `src/ecs/components/props.js` (L41)

**Verification:** ⚠️ **PARTIALLY VALID, but fix description needs correction.** `POWER_UP_TYPE`
in `constants.js` has `{ NONE, BOMB, FIRE, SPEED }` and is **used internally** in the same
file inside `POWER_UP_DROP_CHANCES` (L150–155). It is NOT orphaned. `PROP_POWER_UP_TYPE` in
`props.js` has `{ NONE, BOMB_PLUS, FIRE_PLUS, SPEED_BOOST }` — different enum values.

**Revised fix:** These two enums serve different domains and should remain. What IS needed:
- Add a comment to `POWER_UP_TYPE` clarifying it is used for drop-rate configuration (not
  gameplay component state).
- Add a comment to `PROP_POWER_UP_TYPE` clarifying it is the component-level enum.
- Ensure no callers are accidentally using one where the other is expected.

**Do NOT remove `POWER_UP_TYPE`** — it is actively used.

---

### DEAD-08: `getActiveEntityHandles` may be inefficient ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/world/world.js` (~L276)

**Verification:** Needs check. The audit indicates that creating full handle objects just to iterate and destroy is inefficient.

**Fix:** Use `world.getActiveIds()` instead of `world.getActiveEntityHandles()` if only the IDs are required for bulk operations.

---

### DEAD-11: `renderer-dom.js` Uses Its Own Element Map ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L31)

**Fix:** Subsumed by DEAD-01 resolution. Remove `renderer-dom.js` from the game loop, and the
element map in that file becomes irrelevant. No separate fix required.

---

### DEAD-16: `SIMULATION_HZ` is only used to compute `FIXED_DT_MS` ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (L23)

**Verification:** `SIMULATION_HZ` is exported and used on L26 to compute `FIXED_DT_MS`. It is
exported as part of the public API. Whether it's imported externally is a separate question.

**Fix:** Verify with a global import search. If no external callers exist, add a JSDoc note that
`SIMULATION_HZ` is used to derive `FIXED_DT_MS` and may not need to be externally exported.
Removing the export is a minor cleanup but risks breaking external consumers (tests, devtools).

---

### DEAD-17: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (L66)

**Verification:** `MAX_CHAIN_DEPTH = 10` is defined but no system currently enforces a chain
depth limit. BUG-B6 explosion system is not yet implemented.

**Fix:** Same as DEAD-06 — keep but annotate as reserved for the chain-explosion system. Do not
remove.

---

### DEAD-18: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (L104)

**Fix:** Keep but annotate as reserved for ghost-AI pathfinding. Same rationale as DEAD-06.

---

### DEAD-19: `KIND_TO_SPRITE_TYPE.WALL` maps to `null` — unreachable in sprite path ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (L44)

**Verification:** ✅ **CONFIRMED.** `KIND_TO_SPRITE_TYPE[RENDERABLE_KIND.WALL] = null`.
The render loop at L123–124 skips `null` sprite types:
```js
const spriteType = KIND_TO_SPRITE_TYPE[kind];
if (!spriteType) continue; // skip if no mapping (e.g., WALL)
```
So WALL entities silently skip DOM rendering, which is correct — walls are static grid cells.

**Fix:** The `null` is intentional and documented in the comment at L44. This is not dead code —
it is a deliberate no-op sentinel. **Severity downgrade to INFO / documentation only.** Add
a note in the render-dom-system header comment that WALL intentionally skips sprite rendering.

---

### DEAD-23: `isPlayerStart()` only used in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L584)

**Fix:** Move `isPlayerStart()` to a test utility file (e.g., `tests/unit/helpers/map-helpers.js`)
and remove the export from `map-resource.js`. Update `map-resource.test.js` imports accordingly.

---

## 3) Architecture, ECS Violations & Guideline Drift

---

### ARCH-01: `display:none` used for HIDDEN flag instead of offscreen transform ⬆ CRITICAL
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)`
— not `display:none`"
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (L74)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Line 74:
```js
el.style.display = 'none';
```
This is inside `applyVisualFlagClasses()`, triggered when `VISUAL_FLAGS.HIDDEN` is set. Setting
`display: none` forces layout/reflow, violating the compositor-only update requirement.

Note: The sprite pool adapter (`sprite-pool-adapter.js:L30,L59,L101,L123,L135`) already correctly
uses `OFFSCREEN_TRANSFORM = 'translate(-9999px, -9999px)'`. The render-dom-system is the
inconsistency.

**Fix:**
```js
// Replace:
el.style.display = 'none';
// With:
el.style.transform = 'translate(-9999px, -9999px)';
```
Also remove the `el.style.display = ''` reset at L139, which undoes the display override — once
hidden via transform, no display reset is needed (position already handles visibility).

**Tests to add:** Assert that when an entity has `VISUAL_FLAGS.HIDDEN` set, the rendered element
uses `transform` not `display` for hiding.

---

### ARCH-05: Per-Frame `new Set()` allocation in Render DOM System ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (L111)

**Verification:** ✅ **CONFIRMED TRUE POSITIVE.** Line 111:
```js
const currentFrameEntityIds = new Set();
```
Allocated inside `update()`, which runs every render frame (~60Hz). Violates the no-recurring-
allocations rule.

**Fix:** Hoist to the system closure, clear in-place with `Set.prototype.clear()`:
```js
export function createRenderDomSystem(options = {}) {
  // ...
  const entityElementMap = new Map();
  const currentFrameEntityIds = new Set(); // hoisted

  return {
    // ...
    update(context) {
      // ...
      currentFrameEntityIds.clear(); // in-place reset, no allocation
      // ... rest of update
    }
  };
}
```

---

### ARCH-07: `resetOrderCounter` should be deprecated in favor of `drain()` ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (L133)

**Verification:** ✅ **CONFIRMED VALID CONCERN.** `resetOrderCounter()` resets the monotonic
insertion counter without draining events. If called before consumers have drained, it can cause
order-index collisions (two events with order=0 in the same frame). `drain()` auto-resets at L91,
making `resetOrderCounter` a dangerous escape hatch.

**Fix:** Add a deprecation notice and assert in dev that events are empty when called:
```js
/** @deprecated Use drain() which auto-resets the counter. */
export function resetOrderCounter(queue) {
  if (queue.events.length > 0 && isDevelopment()) {
    console.warn('[event-queue] resetOrderCounter called with undrained events. Use drain().');
  }
  queue.orderCounter = 0;
}
```

---

## 4) Code Quality & Security

---

### SEC-02: Trusted Types default policy passes strings without sanitization ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L10)

**Problem:** The default Trusted Types policy allows HTML injection without sanitization, which
undermines the security guarantee of Trusted Types.

**Fix:** For this game (no user-generated HTML), the safest policy is to **reject all
createHTML calls** and throw, unless the string comes from a known-safe template. Alternatively,
use a strict allowlist of permissible HTML patterns. Do not sanitize with a general-purpose
sanitizer unless DOMPurify or equivalent is already a dependency.

---

### SEC-04: No CSP `<meta>` tag in `index.html` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `index.html` (~L1)

**Problem:** CSP is only injected via Vite's HTTP headers (dev server). In production static
deployments without server-side headers, CSP enforcement is absent.

**Fix:** Add a static `<meta http-equiv="Content-Security-Policy">` tag to `index.html` as a
fallback. Note: `<meta>` CSP cannot enforce `frame-ancestors` — that remains a server-only
directive. The meta tag should mirror the production Vite header policy.

---

### SEC-06: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `vite.config.js` (~L27)

**Fix:** Document the HMR trade-off in AGENTS.md (already permitted by AGENTS.md: "During
development with Vite, CSP enforcement MAY be relaxed to allow HMR inline scripts"). Add a
comment in `vite.config.js` referencing this rule. No code change needed beyond the comment.

---

### SEC-07: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (L1)

**Fix:** Add a block comment header per AGENTS.md requirements: file purpose, public API, and
implementation notes or constraints.

---

### SEC-08: Trusted Types CSP declared but no default policy created ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L16)

**Fix:** Create a default Trusted Types policy in `trusted-types.js` and call
`trustedTypes.createPolicy('default', ...)` at app startup, or remove the `require-trusted-types-for
'script'` directive from the CSP header if no policy is intentionally created.

---

### SEC-09: Missing `Permissions-Policy` and `Cross-Origin-*` headers ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L36)

**Fix:** Add to `vite.config.js` server headers:
```
'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
'Cross-Origin-Opener-Policy': 'same-origin',
'Cross-Origin-Embedder-Policy': 'require-corp',
```

---

### SEC-10: `className` string assignment instead of `classList` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L57)

**Fix:** Replace `el.className = '...'` with `el.classList.add(...)` for each class. String
assignment is harder to maintain and can accidentally overwrite classes set by other code.

Note: `render-dom-system.js:L138` already uses `el.className = 'sprite'` (base class reset) —
this pattern is acceptable for the base-class reset, but subsequent additions should use
`classList.add()`.

---

### SEC-11: `response.json()` without content-length validation in map loading ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/main.ecs.js` (~L149)

**Fix:** Add a content-length check before parsing:
```js
const contentLength = response.headers.get('Content-Length');
if (contentLength && parseInt(contentLength, 10) > MAX_MAP_SIZE_BYTES) {
  throw new Error(`Map file too large: ${contentLength} bytes`);
}
const mapData = await response.json();
```
Define `MAX_MAP_SIZE_BYTES` as a constant (e.g., 500KB for a reasonable map cap).

---

## Removed / False Positives

The following items were included in the original Track D assignment but are **confirmed false
positives** based on source verification. They have been removed from the actionable fix list.

---

### ~~BUG-07: `render-dom-system` entityElementMap memory leak~~ ❌ FALSE POSITIVE

**Verification note (from audit report):** `render-dom-system.js:L156–161` cleans up stale
entities on every render frame. **No fix required.**

---

### ~~BUG-16: Event queue sort comparator overflow risk~~ ❌ FALSE POSITIVE

**Verification note (from audit report):** The sort uses `if (a.frame !== b.frame) return
a.frame - b.frame; return a.order - b.order`. `frame` is a ~60/sec counter (safe for years)
and `orderCounter` resets to 0 on every `drain()`. Integer overflow is not possible. **No fix
required.**
