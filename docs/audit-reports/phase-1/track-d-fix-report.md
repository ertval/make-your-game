# Track D Fix Report

This report contains the uniquely assigned issues from the Phase 1 audit report with full details.

### BUG-05: Sprite Pool Adapter recycles empty active pool ⬆ HIGH
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-09)
- `src/adapters/dom/sprite-pool-adapter.js` (~L100)

**Problem:** When active pool is empty, `activePool.shift()` returns `undefined`, causing crash on `.style.transform` access.
**Impact:** Runtime crash when acquiring sprites without warm-up.

**Fix:** If `recycled` is undefined, create a new element, push to active pool, and return it.

**Tests to add:** Test `acquire()` on un-warmed sprite pool.

---

### BUG-07: `render-dom-system` entityElementMap memory leak ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L92)

**Problem:** `entityElementMap` never cleans up destroyed entities.
**Impact:** Memory growth across restarts.

**Fix:** Add cleanup on level restart.

---

### BUG-10: `render-intent` buffer overflow silently drops intents ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-07)
- `src/ecs/render-intent.js` (~L126)

**Problem:** Buffer overflow silently drops intents in production.
**Impact:** Visuals disappear silently.

**Fix:** Increase buffer size or implement ring buffer.

---

### BUG-12: Event Queue `drain()` allocates new array / returns empty array on hot path ⬆ MEDIUM
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L88)

**Problem:** `drain()` allocates a garbage array per frame (`[...queue.events]`).
**Impact:** Recurring allocation in hot loop.

**Fix:** Use pre-allocated ring buffer or return a frozen singleton array when empty.

---

### BUG-15: Event queue `enqueue` doesn't validate `queue` parameter ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L49)

**Problem:** Function throws if queue is null.
**Fix:** Add guard validation.

---

### BUG-16: Event queue sort comparator overflow risk ⬆ LOW
**Origin:** 1. Bugs & Logic Errors
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L80)

**Problem:** Sort uses subtraction which overflows.
**Fix:** Use ternary comparison.

---

### DEAD-01: Two Competing Render Pipelines / Duplicate DOM Renderer ⬆ HIGH
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js`
- `src/game/bootstrap.js` (~L242)

**Problem:** Runtime has two DOM commit paths (`runRenderCommit` via `render-dom-system` and `stepFrame` via `renderer-dom.js`). One bypasses sprite pooling entirely.
**Impact:** Double DOM writes per frame, duplicate elements.

**Fix:** Remove `createDomRenderer` from runtime frame path or make it delegate to the ECS system. Rely solely on ECS render-dom-system.

---

### DEAD-04: `resetOrderCounter` unused export ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L133)

**Problem:** Exported but never invoked.
**Fix:** Remove.

---

### DEAD-06: Ghost AI constants unused ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L92)

**Problem:** AI target offsets never used.
**Fix:** Remove or annotate.

---

### DEAD-07: `POWER_UP_TYPE` enum orphaned ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L147)

**Problem:** Redundant with `PROP_POWER_UP_TYPE`.
**Fix:** Remove.

---

### DEAD-08: `getActiveEntityHandles` may be inefficient ⬆ MEDIUM
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/world/world.js` (~L276)

**Problem:** Creates full handles for simple destroys.
**Fix:** Use `getActiveIds()`.

---

### DEAD-11: `renderer-dom.js` Uses Its Own Element Map ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L31)

**Fix:** Subsumed by DEAD-01 resolution.

---

### DEAD-16: `SIMULATION_HZ` export unused externally ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L23)

**Fix:** Remove export.

---

### DEAD-17: `MAX_CHAIN_DEPTH` never referenced ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L63)

**Fix:** Remove.

---

### DEAD-18: `GHOST_INTERSECTION_MIN_EXITS` unused ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/constants.js` (~L101)

**Fix:** Remove.

---

### DEAD-19: `KIND_TO_SPRITE_TYPE.WALL` unreachable ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L37)

**Fix:** Remove.

---

### DEAD-23: `isPlayerStart()` only used in tests ⬆ LOW
**Origin:** 2. Dead Code & Unused References
**Files:** Ownership: Track D (Tickets: D-03)
- `src/ecs/resources/map-resource.js` (~L584)

**Fix:** Move to test utils.

---

## 3) Architecture, ECS Violations & Guideline Drift

---

### ARCH-01: `display:none` used for HIDDEN flag instead of offscreen transform ⬆ CRITICAL
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Violated rule:** "Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none`"
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L74, L139)

**Problem:** Uses `el.style.display = 'none'` triggering layout thrashing.
**Impact:** Frame-time spikes and layout jank, violating compositor-only update rule.

**Fix:** Use `el.style.transform = 'translate(-9999px, -9999px)'` instead.

---

### ARCH-05: Per-Frame Set Allocation in Render DOM System ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-08)
- `src/ecs/systems/render-dom-system.js` (~L111)

**Problem:** `new Set()` allocated every render frame.
**Impact:** Violates no recurring allocations rule.

**Fix:** Hoist Set to system closure and clear in-place.

---

### ARCH-07: Event queue `resetOrderCounter` violates sync point ⬆ MEDIUM
**Origin:** 3. Architecture, ECS Violations & Guideline Drift
**Files:** Ownership: Track D (Tickets: D-01)
- `src/ecs/resources/event-queue.js` (~L126)

**Problem:** Manual reset risks index collisions before consumers drain.
**Fix:** Deprecate `resetOrderCounter` and rely on `drain()`.

---

### SEC-02: Trusted Types policy too permissive ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L10)

**Problem:** Default policy passes strings without sanitization.
**Fix:** Implement proper sanitization.

---

### SEC-04: No CSP `<meta>` tag in `index.html` ⬆ MEDIUM
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `index.html` (~L1)

**Problem:** CSP only injected via Vite HTTP headers.
**Fix:** Add static `<meta http-equiv="Content-Security-Policy">` fallback.

---

### SEC-06: Development CSP uses `unsafe-eval` and `unsafe-inline` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `vite.config.js` (~L27)

**Fix:** Document trade-off in AGENTS.md.

---

### SEC-07: Missing source header on `trusted-types.js` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-01)
- `src/security/trusted-types.js` (~L1)

**Fix:** Add block comment header per AGENTS.md.

---

### SEC-08: Trusted Types CSP declared but no default policy created ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L16)

**Fix:** Create policy or remove declaration.

---

### SEC-09: Missing `Permissions-Policy` and `Cross-Origin-*` headers ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-05)
- `vite.config.js` (~L36)

**Fix:** Add remaining security headers.

---

### SEC-10: `className` string assignment instead of `classList` ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-08)
- `src/adapters/dom/renderer-dom.js` (~L57)

**Fix:** Use `classList`.

---

### SEC-11: `response.json()` without size limit in map loading ⬆ LOW
**Origin:** 4. Code Quality & Security
**Files:** Ownership: Track D (Tickets: D-03)
- `src/main.ecs.js` (~L149)

**Fix:** Add content-length check.

---

## 5) Tests & CI Gaps

---

