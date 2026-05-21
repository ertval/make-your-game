---
version: 1.0.0
last-updated: 2026-05-21
status: active
ticket: C-06
---

# Runtime Audio Contract (C-06)

> **Normative**: this document describes the as-built runtime audio boundary that ships with ticket **C-06**. It complements [`AGENTS.md`](../../AGENTS.md) §Audio Rules — when this page disagrees with the running code, the code wins and the contract should be updated.

> **Delivery note**: the **adapter module + tests + this contract page** ship under Track C ownership in ticket C-06. The **runtime wiring** (bootstrap `setAudioAdapter` slot, manifest module, level-load preload, app-boundary construction in `main.ecs.js`) lands in a separate Track A integration handoff PR (`ekaramet/integration-track-C-audio-wiring`) because those files are out of Track C ownership scope per `scripts/policy-gate/lib/policy-utils.mjs`. Same pattern as the C-04 / C-05 / B-03 runtime-integration handoffs already on record. Until that handoff PR lands, `world.getResource('audio')` returns `undefined` and the rules below describe the contract any caller will satisfy once it does.

This page exists so future ticket holders (C-07, C-08, C-09, C-10) can extend the audio surface without re-discovering the boundary rules. Diagrams in [`implementation-plan.md`](implementation-plan.md) and [`README.md`](../../README.md) link here.

---

## 1. Boundary Rule

| Rule | Detail |
|---|---|
| **Single audio module** | All runtime audio flows through `src/adapters/io/audio-adapter.js`. No other module may construct `AudioContext` or call Web Audio APIs. |
| **No `HTMLAudioElement`** | `HTMLAudioElement` is forbidden for runtime playback. The adapter uses Web Audio exclusively. |
| **No direct system imports** | ECS systems MUST NOT `import` `audio-adapter.js`. They consume audio through the World resource API only. |
| **Resource key** | The adapter is registered at `world.resources.audio` (read via `world.getResource('audio')`). Resource key is overridable via `options.audioAdapterResourceKey` but defaults to the literal string `'audio'`. |
| **No singletons** | `createAudioAdapter` is a factory. Module-level singletons and globals are forbidden. The adapter is constructed at the app boundary (`src/main.ecs.js`) and injected through `bootstrap.setAudioAdapter`. |
| **Pre-registered slot** | `bootstrap.js` pre-registers the `'audio'` resource as `null` so any system that calls `world.getResource('audio')` from frame 0 sees a defined value, even when audio init failed. |

---

## 2. Lifecycle

### 2.1 Construction

- `createAudioAdapter(options)` is called from `src/main.ecs.js` inside a `try/catch`.
- A construction failure (no Web Audio support, autoplay policy reject, anything else) logs `console.warn` and leaves the `'audio'` resource as `null`. The game loop continues.
- The factory accepts injectable `windowTarget`, `documentTarget`, `audioContextCtor`, and `fetchImpl` so the adapter is unit-testable in Node without real audio hardware.

### 2.2 Autoplay-policy-safe initialization

- `AudioContext` is **not** constructed in the factory. It is constructed lazily on the first user interaction.
- Unlock listeners are bound at construction time: `pointerdown` and `keydown` on `windowTarget`, both with `{ once: true }`.
- Either event handler builds the context, wires the category gain graph, and calls `context.resume()` if the context is suspended. The listeners then self-detach.
- `loadClips`, `resume`, and any other method that needs a context can also lazily construct one on demand. This keeps headless tests and pre-interaction calls safe.

### 2.3 Visibility lifecycle

- The adapter listens for `document.visibilitychange` at construction.
- When `documentTarget.hidden` becomes `true` and the context is `running`, the adapter calls `context.suspend()`.
- When `documentTarget.hidden` becomes `false` and the context is `suspended`, the adapter calls `context.resume()`.
- If no context has been built yet (player never interacted), visibility events safely no-op.

### 2.4 Teardown

- `destroy()` is async. It removes both the unlock and visibility listeners, stops any active music source, clears the SFX/music/clipIndex Maps, clears gain nodes, and calls `context.close()`.
- `bootstrap.setAudioAdapter(null)` is the canonical way to trigger teardown — it clears the resource slot and calls `destroy()` on the previously registered adapter. `main.ecs.js` invokes this from `runtime.stop()`.

---

## 3. Pre-Decoded Audio Pipeline

The adapter never plays an undecoded buffer. Every clip goes through:

```
fetch(url) → response.arrayBuffer() → context.decodeAudioData(arrayBuffer) → cached AudioBuffer
```

- Decoded buffers are stored in two internal `Map`s on the adapter instance:
  - `sfxBuffers: Map<cueId, AudioBuffer>` — also serves UI cues (UI cues route through the `ui` gain bus but live in the same store).
  - `musicBuffers: Map<trackId, AudioBuffer>` — separate store so music cannot accidentally play through the SFX path.
- `clipIndex: Map<cueId, { category, buffers }>` lets the playback methods resolve a cue's category in one lookup.
- The `loadClips(manifest)` method returns `{ loaded: string[], failed: string[] }`. A failed clip is recorded but does not throw and does not abort the rest of the load.
- Synchronous decode is **forbidden**. There is no `decodeAudioDataSync`-style helper anywhere in the project.

### 3.1 Manifest source of truth

Cue IDs and asset URLs are centralized in `src/ecs/resources/audio-manifest.js` (delivered in the Track A integration handoff PR):

| Export | Purpose |
|---|---|
| `AUDIO_CUE` | Frozen map of canonical cue ID constants. Systems use `AUDIO_CUE.PELLET` etc. — never raw strings. |
| `AUDIO_CATEGORY` | Frozen map of category constants (`SFX`, `MUSIC`, `UI`). |
| `DEFAULT_AUDIO_MANIFEST` | Frozen manifest shaped exactly for `loadClips`: `{ sfx: { [cueId]: url }, music: { [trackId]: url }, ui: { [cueId]: url } }`. |
| `GAMEPLAY_CRITICAL_SFX` | Frozen array of cue IDs the bootstrap preloads at level load. |
| `buildAudioManifest(overrides)` | Merge overrides without mutating defaults. |
| `pickSfxManifest(manifest, cueIds)` | Filter to a preload subset (sfx only). |

Hardcoded asset paths in ECS systems are **forbidden**. Asset URLs may only appear inside the manifest module.

### 3.2 Bootstrap preload hook

- `src/game/bootstrap.js` builds the manifest with `buildAudioManifest(options.audioManifest)` and stores it at `world.resources.audioManifest`.
- The `onLevelLoaded` callback calls a deduped `preloadCriticalAudio` helper that:
  1. Reads the live `'audio'` resource. If null (headless test, init failure), the helper no-ops.
  2. Filters `GAMEPLAY_CRITICAL_SFX` against an in-bootstrap `Set` of already-loaded cue IDs.
  3. Calls `adapter.loadClips(pickSfxManifest(manifest, pending))` fire-and-forget; rejection logs `console.warn` and never escapes into the level-load path.
- `setAudioAdapter` also calls the preload hook when an adapter is registered after a level was already loaded (late init), so the warming behaviour is symmetric.

---

## 4. Public Adapter API

| Method | Signature | Behavior |
|---|---|---|
| `loadClips(manifest)` | `(manifest) → Promise<{ loaded: string[], failed: string[] }>` | Fetches and decodes every entry in `{ sfx, music, ui }`. Failures `console.warn` and land in `report.failed`. Never throws. |
| `playSfx(cueId)` | `(cueId) → AudioBufferSourceNode \| null` | Allocates a fresh BufferSource, sets the cached buffer, connects to the cue's category gain (`sfx` or `ui`), starts at 0. Missing cue ⇒ warn-once + `null`. |
| `playMusic(trackId, opts?)` | `(trackId, { loop? }) → AudioBufferSourceNode \| null` | Stops the previous music source, allocates a fresh BufferSource, optionally enables `loop`, connects to `music` gain, starts at 0. Missing track ⇒ warn + `null`. |
| `stopMusic()` | `() → void` | Stops the active music source and clears the active id. Idempotent. |
| `setVolume(category, value)` | `('master' \| 'music' \| 'sfx' \| 'ui', number) → void` | Clamps `value` to `[0, 1]` and writes `node.gain.value`. Unknown category ⇒ warn-no-op. Honors values set before the context exists. |
| `suspend()` | `() → Promise<void>` | Forwards to `context.suspend()`. Safe when no context exists. |
| `resume()` | `() → Promise<void>` | Lazily constructs the context if needed, then forwards to `context.resume()`. |
| `destroy()` | `() → Promise<void>` | Removes listeners, stops playback, clears Maps, closes the context. |

The factory also exposes `getActiveMusicId()` and `getAudioContext()` for diagnostics and tests. These two are read-only.

---

## 5. Category Gain Graph

```
music ─┐
sfx  ──┼──► master ──► destination
ui   ─┘
```

- Four `GainNode`s are created at first context construction: `master`, `music`, `sfx`, `ui`.
- The wiring is `music/sfx/ui → master → destination`. Per-category volume changes are independent of the master volume.
- Default gain for every category is `1` and is overridable via `setVolume` at any time (including before the context exists).

---

## 6. Simultaneous SFX Playback

- Each `playSfx(cueId)` call calls `context.createBufferSource()` and never reuses an existing node.
- BufferSource nodes are **not** reusable in Web Audio — calling `start()` on an already-started node throws. The adapter never does this.
- The buffer itself is reused: the same `AudioBuffer` is set on the new source, so the second playback skips decode.
- A previous source's `onended` only clears the music slot when the ended source is still the active one; concurrent SFX never interfere with the music bookkeeping.

This is exactly what enables overlapping SFX (e.g. pellet collect while a bomb fuse SFX is already playing).

---

## 7. Fallback and Resilience Rules

| Failure mode | Adapter behavior |
|---|---|
| `loadClips` called with no `AudioContext` available (no `AudioContext`/`webkitAudioContext`, no injected ctor) | `console.warn` and return `{ loaded: [], failed: [] }`. |
| `fetch` returns non-ok response | Per-clip `console.warn`, push to `report.failed`, continue with the rest. |
| `fetch` rejects (network error) | Same as above — caught inside the per-clip Promise. |
| `decodeAudioData` rejects (corrupt payload) | Same as above. |
| `playSfx` / `playMusic` called with unknown cue id | `console.warn` (once per cue id) and return `null`. |
| `playSfx` called with a music cue id | Refuses — `console.warn` and returns `null`. Music must go through `playMusic` so loop/stop bookkeeping stays consistent. |
| `playSfx` / `playMusic` called before context exists | Lazily builds the context. If construction fails, returns `null`. |
| `setVolume` with unknown category | `console.warn`; existing gains untouched. |
| `setVolume` with NaN / out-of-range value | Clamped to `[0, 1]`; `NaN` becomes `0`. |
| `suspend` / `resume` / `destroy` reject internally | Caught and logged as `console.warn`. Never escape to the caller. |

The runtime invariant: **no audio failure crashes the game loop**.

---

## 8. ECS Consumption Pattern

A future system (C-07 cue mapping) will consume audio like this:

```js
// CORRECT — read the adapter from the World resource.
function createAudioCueSystem() {
  return {
    name: 'audio-cue-system',
    phase: 'logic',
    update(_, { resources }) {
      const audio = resources.get('audio');
      const events = resources.get('eventQueue');
      if (!audio || !events) return;
      for (const event of events.drain()) {
        if (event.type === 'BombPlaced') {
          audio.playSfx(AUDIO_CUE.BOMB);
        }
      }
    },
  };
}
```

The following are **forbidden** and will be caught by review / lint policy:

```js
// WRONG — direct import bypasses the World resource boundary.
import { createAudioAdapter } from '../../adapters/io/audio-adapter.js';

// WRONG — module-level singleton.
const audio = createAudioAdapter();

// WRONG — HTMLAudioElement playback.
new Audio('/assets/audio/sfx/bomb.wav').play();

// WRONG — raw cue ID strings instead of AUDIO_CUE constants.
audio.playSfx('bomb');
```

---

## 9. Verification

| Verification | Anchor |
|---|---|
| Adapter unit/integration tests | `tests/integration/adapters/audio-adapter.test.js` — 30 deterministic tests across decode flow, buffer caching, overlapping playback, missing-clip fallback, visibility lifecycle, category gains, music replacement, failed fetch/decode. (Placed under `tests/integration/adapters/` per Track C ownership glob — see `scripts/policy-gate/lib/policy-utils.mjs`.) |
| No direct system imports | `grep -rn 'audio-adapter\|createAudioAdapter' src/ecs/` returns zero matches. |
| No hardcoded asset paths in systems | `grep -rn '/assets/audio\|\.wav\|\.ogg\|\.mp3' src/ecs/` returns zero matches. |
| Bootstrap registers `'audio'` resource | Lands in the Track A integration handoff PR: `src/game/bootstrap.js` (`ensureWorldResource(world, audioAdapterResourceKey, () => null)` + `setAudioAdapter`). |
| Audit traceability | [`audit-traceability-matrix.md`](audit-traceability-matrix.md) — AUDIT-B-05 row. |

---

## 10. Out of Scope (Owned by Later Tickets)

| Concern | Owner |
|---|---|
| Gameplay event → cue mapping (bomb placed → `sfx-bomb-place`, etc.); music state machine across `GAME_STATE` | **C-07** |
| Producing the actual `.mp3` / `.ogg` audio files; loudness normalization across categories | **C-08** |
| Lazy/streaming load policy for non-critical audio; Performance API thresholds for audio decode timing | **C-09** |
| `assets/manifests/audio-manifest.json` + JSON Schema validation gate | **C-10** |
