# C-09: Audio Preloading & Performance

## Summary

Ships the full C-09 ticket in three deliverables, all confined to the audio
adapter boundary plus app-boundary wiring (Track C):

- **#1 — Preloading infrastructure**: `preloadAudioAssets(cueIds, options)` on the
  audio adapter async pre-decodes gameplay-critical SFX
  (`fetch → arrayBuffer → decodeAudioData`) in parallel into the existing buffer
  cache. Reuses already-decoded buffers, deduplicates concurrent/duplicate
  requests via an in-flight decode map, and tolerates decode failures (warn, no
  crash). Music/ambience are excluded — only `sfx`-category cues are candidates.
- **#2 — Loading-state integration**: `preloadWithIndicator` (in
  `audio-integration.js`) times the preload and reveals a new
  `audio-loading-indicator` DOM adapter **only** when the decode crosses a 200 ms
  threshold (no flicker for fast loads), hiding it the instant the preload
  settles.
- **#3 — Performance timing evidence**: real-runtime instrumentation
  (`performance.now()`) for fetch/decode/total durations + exact
  cache-hit/miss/failed-decode counts, exposed via the adapter-boundary
  `getPreloadStats()`, plus an AUDIT-B-05 evidence artifact.

---

## Description

### #1: Preloading infrastructure (`audio-adapter.js`)

- `preloadAudioAssets(cueIds, preloadOptions)` — async, `Promise.all`-parallel
  pre-decode of the supplied cue ids into the existing `sfxBuffers` cache. Cue
  URLs resolve from the manifest registered by `loadClips` (a `urlIndex`) or from
  an explicit `{ urls }` override (for the preload-before-load path).
- Cache reuse: a cue already in `sfxBuffers` is skipped. Dedup: an `inFlightDecodes`
  map shares one pending decode across duplicate ids in a batch and across
  concurrent calls. Failure tolerance: a rejected fetch/decode warns per cue and
  is reported in `failed`, never rejecting the call.
- Scope guard: cues that resolve to a non-`sfx` category (music/ambience) or to no
  URL are skipped with a warning.

### #2: Loading-state integration (`audio-loading-indicator.js`, `audio-integration.js`, `main.ecs.js`, `index.html`, `styles/base.css`)

- `src/adapters/dom/audio-loading-indicator.js` (new) — Track C DOM-visibility
  adapter. Toggles a pre-existing `[data-audio-loading]` node's visibility classes
  and `aria-busy`; no DOM creation, no game logic; tolerates a missing node.
- `src/adapters/io/audio-integration.js` — `preloadWithIndicator(params)` and
  `AUDIO_PRELOAD_INDICATOR_THRESHOLD_MS` (200). It arms a deferred show-timer that
  fires only if the preload is still in flight at the threshold, clears it on
  completion, and always hides the indicator in a `finally`. DOM-free: the
  indicator and audio adapter are injected.
- `src/main.ecs.js` — wires the indicator at the app boundary from a **single**
  audio-manifest fetch (critical SFX = `sfx` + `critical:true`), fire-and-forget so
  startup is never blocked.
- `index.html` / `styles/base.css` — indicator node and visibility styles
  (`pointer-events: none`, so it never blocks input).

### #3: Performance timing evidence (`audio-adapter.js`, `main.ecs.js`, evidence doc)

- `decodeClipTimed` measures real `performance.now()` fetch and decode spans
  (injectable `nowImpl` for deterministic tests; never `Date.now`, never
  synthetic). A `preloadStats` accumulator records per-run and lifetime
  `totalFetchMs` / `totalDecodeMs` / `totalPreloadMs`, `assetsRequested` /
  `assetsPreloaded`, and `cacheHits` / `cacheMisses` / `failedDecodes`.
- `getPreloadStats()` returns an immutable snapshot copy (plus derived averages) at
  the adapter boundary — **no ECS system reads browser timing APIs**.
- `src/main.ecs.js` logs the snapshot after preload settles for capture.
- `docs/audit-reports/evidence/AUDIT-B-05.preload-timing.md` — async preload/decode
  timing summary, cache statistics, explanation of the async execution path,
  non-blocking proof, and reproduction steps.

### Tests

- `tests/integration/adapters/audio-adapter.test.js` — preload suite (successful
  preload, cache reuse, dedup within/across concurrent calls, decode-failure
  handling, music exclusion, unknown-cue skip, empty-list) **and** instrumentation
  suite (real-timing population, cache-hit/miss accounting, failed-decode
  accounting, async non-blocking verification, immutable snapshot).
- `tests/integration/adapters/audio-loading-indicator.test.js` — indicator adapter
  (show/hide classes + aria, missing-node tolerance) and orchestrator
  (fast→never-show, slow→show-then-hide, failure-tolerant hide, no-op paths,
  200 ms threshold).
- `tests/e2e/c-09-audio-loading-indicator.spec.js` — browser-level fast-vs-slow
  loading-state against a real DOM.

---

## Verification

- `npx vitest run` → **1197 / 1197 pass**.
- `npx playwright test tests/e2e/c-09-audio-loading-indicator.spec.js` → **2 / 2 pass**.
- `npm run policy -- --require-approval=false` → all gates green.
- Biome clean on all changed files.

---

## PR Gate Checklist

- [x] **Read Standards**: Reviewed `AGENTS.md`.
- [x] **Policy Compliance**: `npm run policy` passes locally.
- [x] **Ownership**: All changed files are Track C (`src/adapters/io/`, `src/adapters/dom/`, `src/main.ecs.js` wiring, `index.html`, `styles/`, docs) on an authorized integration branch.
- [x] **Branching**: `chbaikas/integration-C-09`; ticket `C-09` extractable from branch name.
- [x] **Tests**: Unit/integration + e2e coverage added for all three deliverables.
- [x] **ECS Isolation**: no `audio-*` adapter imports in `src/ecs/`; the indicator adapter is not referenced by any ECS system; no ECS access to browser timing/DOM APIs.
- [x] **Async / non-blocking**: preload is fire-and-forget and `Promise.all`-parallel; no synchronous decode path; verified by an automated non-blocking test.
- [x] **Docs**: `ticket-tracker.md`, `audit-traceability-matrix.md` (AUDIT-B-05), and the AUDIT-B-05 evidence artifact updated/added.

---

## Notes

- Draft: depends on `C-06`, `C-08`, and the `A-13` P3 consolidated audit gate; the
  three C-09 code deliverables are complete and the final A-13 sign-off remains.
- No gameplay, audio-behavior, or settings/volume changes; existing adapter
  boundaries preserved.
