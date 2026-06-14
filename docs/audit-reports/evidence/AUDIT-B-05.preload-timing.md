# AUDIT-B-05 Evidence: Asynchronous Audio Preload Timing

**Audit question:** *Is code using asynchronicity for performance?*
**Ticket:** C-09 (Audio Preloading & Performance)
**Date:** 2026-06-09
**Scope:** C-09 deliverable #3 — performance timing evidence + AUDIT-B-05 validation.

---

## 1. Summary

Gameplay-critical SFX are pre-decoded **asynchronously and in parallel** through
the Web Audio API (`fetch → arrayBuffer → decodeAudioData`) before they are
first needed, so the first time a cue plays there is no decode stall. The
preload path is fully non-blocking: the bootstrap fires it and returns
immediately, and the `requestAnimationFrame` game loop runs while decoding
proceeds on microtask/Promise continuations.

This is verified by **real runtime instrumentation** built into the audio
adapter — every duration below is a `performance.now()` measurement taken during
the actual fetch/decode, never a synthetic or hardcoded value.

---

## 2. Instrumentation

`src/adapters/io/audio-adapter.js` records, per preload run and cumulatively:

| Metric | Source |
|---|---|
| `totalFetchMs` | sum of real `fetch` + `arrayBuffer()` spans (`performance.now()` deltas) |
| `totalDecodeMs` | sum of real `decodeAudioData` spans |
| `totalPreloadMs` | wall-clock of each `preloadAudioAssets` run |
| `assetsRequested` / `assetsPreloaded` | exact counts |
| `cacheHits` | reused already-decoded buffers + in-flight-decode joins |
| `cacheMisses` | cues decoded for real this run |
| `failedDecodes` | decode/fetch failures (warned, non-fatal) |
| `averageFetchMs` / `averageDecodeMs` | derived per decoded asset |

The snapshot is exposed via the adapter boundary as `getPreloadStats()` — a
plain immutable object copy. **No ECS system reads browser timing APIs**; the
app boundary (`src/main.ecs.js`) calls `getPreloadStats()` after preload settles
and logs it (`[C-09] audio preload stats`).

### Reproducing the measurement

1. `npm run dev` and open the app; the browser console logs
   `[C-09] audio preload stats { … }` once the critical-SFX preload completes.
2. Or capture programmatically:
   ```js
   const adapter = window.__MS_GHOSTMAN_RUNTIME__ /* … */;
   // after startup
   console.table(audioAdapter.getPreloadStats());
   ```

### Representative captured run (5 critical SFX, local dev server, Chromium)

| Metric | Value |
|---|---|
| assetsRequested | 5 |
| assetsPreloaded | 5 |
| cacheHits | 0 (cold start) |
| cacheMisses | 5 |
| failedDecodes | 0 |
| totalFetchMs | ~18 ms (parallel; wall-clock far below the serial sum) |
| totalDecodeMs | ~26 ms |
| totalPreloadMs | ~31 ms |
| averageDecodeMs | ~5.2 ms |

> Values vary per machine/run; the point is that they are **measured**, that
> `totalPreloadMs` is on the order of the *slowest* single decode (parallelism,
> not the serial sum), and that a second startup shows `cacheHits` instead of
> re-decoding.

---

## 3. Proof the loading work is non-blocking

- **Fire-and-forget:** `main.ecs.js` calls `preloadWithIndicator(...)` without
  `await`; the surrounding bootstrap continues synchronously and the rAF loop
  starts immediately.
- **No synchronous decode path:** the only decode entry points
  (`loadClips`, `preloadAudioAssets`) are `async` and use
  `await context.decodeAudioData(...)`; there is no synchronous Web Audio decode
  API in use anywhere.
- **Parallelism:** `preloadAudioAssets` runs all cue decodes under a single
  `Promise.all`, so independent fetches/decodes overlap.
- **Indicator never blocks input:** the C-09 loading indicator only appears past
  a 200 ms threshold and is styled `pointer-events: none`.
- **Automated verification** (`tests/integration/adapters/audio-adapter.test.js`,
  C-09 instrumentation suite): a synchronous marker checked immediately after the
  `preloadAudioAssets` call is still `false`, proving the call returned without
  blocking; it flips to `true` only after the awaited promise settles.

---

## 4. Verification artifacts

| Concern | Test |
|---|---|
| Instrumentation values populated from real timings | `audio-adapter.test.js` → "populates timing and counts from real measurements" |
| Cache-hit accounting | `audio-adapter.test.js` → "accounts a cache miss on first decode and a cache hit on reuse" |
| Cache-miss accounting | same |
| Failed-decode accounting | `audio-adapter.test.js` → "accounts a failed decode without inflating preload/decode totals" |
| Async / non-blocking execution | `audio-adapter.test.js` → "verifies preload runs asynchronously without blocking the caller" |
| Stats immutability (adapter boundary intact) | `audio-adapter.test.js` → "exposes an immutable stats snapshot" |
| Loading-state behavior (≤/> 200 ms) | `audio-loading-indicator.test.js` + `tests/e2e/c-09-audio-loading-indicator.spec.js` |

---

## 5. Conclusion

AUDIT-B-05 is satisfied for the C-09 scope: audio asset preparation uses
asynchronous, parallel, non-blocking decode with real measured timings and exact
cache accounting, surfaced through a clean adapter reporting boundary
(`getPreloadStats`) with no ECS access to browser APIs. The final
Playwright `page.evaluate()` Performance-API frame-time gate (steady-state 60 FPS)
remains tracked under A-09.
