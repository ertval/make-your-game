`C-06: Centralized Web Audio Adapter (Boundary Contract)`

> **Summary**: Centralized Web Audio adapter behind a deterministic factory, locked by a 30-test verification suite. Ships the boundary contract (`world.resources.audio` resource key, autoplay-safe lifecycle, pre-decoded clip pipeline, category gain graph, BufferSource-per-playback, visibility lifecycle, missing-clip fallback). Runtime wiring (bootstrap slot, manifest module, level-load preload, app-boundary construction) lands in a separate Track A integration handoff PR because those files are out of Track C ownership scope — same pattern as the C-04 / C-05 / B-03 runtime-integration handoffs already on record.

---

## 📝 Description

### 🔄 What Changed (this PR — Track C scope)

* **`src/adapters/io/audio-adapter.js`** (new) — Web Audio-only `createAudioAdapter(options)` factory:

  * Autoplay-safe `AudioContext` lifecycle (lazy unlock on `pointerdown` / `keydown`).
  * `fetch → arrayBuffer → decodeAudioData` pipeline with `AudioBuffer`s cached in internal Maps.
  * Gain graph: `music / sfx / ui → master → destination`; `setVolume` clamps to `[0, 1]`.
  * BufferSource-per-playback for `playSfx` so overlapping SFX is safe (Web Audio forbids restarting a source node).
  * `playMusic(trackId, { loop })` stops the previous source; `stopMusic` is idempotent.
  * `document.visibilitychange` suspends the running context when hidden, resumes when visible.
  * Missing clips / failed fetch / failed decode → `console.warn` + structured `{ loaded, failed }` report; never throws.
  * Docstring locks the World resource contract: `world.getResource('audio')` is the only legal consumption path; module imports from `src/ecs/systems/` are forbidden.

* **`tests/integration/adapters/audio-adapter.test.js`** (new) — 30 deterministic tests across AudioContext lifecycle, `loadClips` async flow, `playSfx` overlap and routing, `playMusic` / `stopMusic`, `setVolume`, `visibilitychange`, `suspend` / `resume`, and `destroy`. Mocks `AudioContext`, `GainNode`, `AudioBufferSourceNode`, `fetch`, `window`, `document`. No real audio hardware, no `setTimeout`, no microtask races. Placed under `tests/integration/adapters/` per Track C ownership glob `tests/integration/adapters/audio-*.test.js`.

* **Documentation** — new canonical contract page [`docs/implementation/runtime-audio.md`](../implementation/runtime-audio.md). Living docs reconciled: `ticket-tracker.md` (C-06 ✅, 26 → 27 done), `track-c.md` (deliverables checked + downstream out-of-scope block), `audit-traceability-matrix.md` (AUDIT-B-05 row), `implementation-plan.md` (adapter diagram + canonical resource keys). Phase-0 / phase-1 audit snapshots and prior PR messages left as historical artifacts.

### 🚧 Deferred to Track A Handoff PR (`ekaramet/integration-track-C-audio-wiring`)

* `src/ecs/resources/audio-manifest.js` — `AUDIO_CUE` (`PELLET`, `BOMB`, `POWERUP`, `GAME_OVER`, `LEVEL_THEME`), `AUDIO_CATEGORY`, `DEFAULT_AUDIO_MANIFEST`, `GAMEPLAY_CRITICAL_SFX`, `buildAudioManifest`, `pickSfxManifest`. Track D ownership (`src/ecs/resources/**`).
* `src/game/bootstrap.js` — pre-registered `'audio'` World resource slot, `setAudioAdapter` / `getAudioAdapter` accessors, deduped critical-SFX preload from `onLevelLoaded` / late adapter registration. Track A ownership.
* `src/main.ecs.js` — `createAudioAdapter(...)` constructed at the app boundary inside a `try / catch`; init failure logs `console.warn` and leaves the slot `null` without crashing the game loop. `runtime.stop()` clears the slot via `bootstrap.setAudioAdapter(null)`. Track A ownership.

The adapter docstring and `runtime-audio.md` describe how those modules will register the adapter as `world.resources.audio` once they land.

### 🎯 Why

* **AUDIT-B-05** ("Is code using asynchronicity for performance?") requires `decodeAudioData`-based preloading.
* Browser autoplay policy requires deferred `AudioContext` construction.
* AGENTS.md §ECS Architecture Rules requires adapters be World resources, not direct imports.

C-06 lands the boundary contract so C-07 (event → cue mapping), C-08 (assets), C-09 (preload perf), and C-10 (manifest schema) build against a stable adapter API.

### 🚫 Out of Scope

* C-07 — gameplay event → cue mapping; music state across `GAME_STATE`.
* C-08 — `.mp3` / `.ogg` asset production.
* C-09 — lazy/streaming policy + Performance API thresholds.
* C-10 — `assets/manifests/audio-manifest.json` + JSON Schema gate.

No audio is heard at runtime yet — the adapter contract is in place but silent until the Track A handoff PR registers it + C-07 / C-08 wire events and assets.

---

## 🧪 Verification & Audit

### ✅ Verification

* [x] `npx vitest run tests/integration/adapters/audio-adapter.test.js` → **30 / 30 pass** (≈ 166 ms).
* [x] `npm run check` → clean (Biome).
* [ ] `npm run policy` (run before merge — Track C ownership now satisfied; ownership-aware checks should be green).

### 📋 Audit Traceability

| Audit ID | Execution | Evidence |
| --- | --- | --- |
| **AUDIT-B-05** | Semi-Automatable | `src/adapters/io/audio-adapter.js`, `tests/integration/adapters/audio-adapter.test.js`. Browser threshold check remains owned by C-09 / A-09 — not in this PR. |

No other audit IDs change status. F-01 … F-21 and B-01 … B-06 coverage unchanged per `audit-traceability-matrix.md`.

---

## ✅ PR Gate Checklist

### 📋 Required

* [x] AGENTS.md + agentic workflow guide reviewed.
* [ ] `npm run policy` passes locally.
* [x] Track C ownership for all changed files (adapter, integration test, audio docs, PR message). Out-of-scope files (`src/ecs/resources/audio-manifest.js`, `src/game/bootstrap.js`, `src/main.ecs.js`) deferred to the Track A handoff PR.
* [x] Branch `chbaikas/C-06` follows `<owner>/<TRACK>-<NN>`.
* [x] No Manual-With-Evidence audit IDs (F-19, F-20, F-21, B-06) affected.

### 🏗️ Architecture & Security

* [x] **ECS Isolation**: `src/ecs/systems/` has no audio imports (`grep -rn 'audio-adapter\|createAudioAdapter' src/ecs/` → zero matches).
* [x] **Adapter Injection**: Adapter docstring + `runtime-audio.md` specify `world.resources.audio` as the only consumption path. No `HTMLAudioElement`, no module-level singletons. The factory pattern keeps construction at the app boundary, not inside ECS code.
* [x] **No Bloat**: No framework imports, no canvas APIs, no new dependencies, no lockfile change.

---

## 🛡️ Security & Architecture Notes

* **Security**: Asset URLs originate only from the manifest module (delivered in the handoff PR); `loadClips` confines them to `fetch`. Missing or failed assets fail safely (`console.warn` + `report.failed`). No new HTML / textContent sinks.
* **Architecture**: `createAudioAdapter` is a factory; injectable `windowTarget`, `documentTarget`, `audioContextCtor`, `fetchImpl` for tests.
* **Risks / Follow-ups**:

  * Until the Track A handoff PR registers the adapter, `world.getResource('audio')` returns `undefined` in the running app. No system queries that resource yet (C-07 introduces the first consumer), so this is a no-op in practice.
  * Browser-specific autoplay behavior may vary; the lazy unlock + visibility flow is the cross-browser-safe path documented in `runtime-audio.md`.

---

### 📖 Local Command Reference

| Command                    | Purpose                                      |
| :------------------------- | :------------------------------------------- |
| **`npm run policy`**       | **Primary gate (runs all checks and tests)** |
| `npm run check`            | Linting & formatting check                   |
| `npm run test`             | All Vitest suites                            |
| `npm run test:unit`        | Unit tests only                              |
| `npm run test:integration` | Integration tests only                       |
| `npm run test:e2e`         | Playwright browser tests                     |
| `npm run test:audit`       | Audit map validation                         |
| `npm run validate:schema`  | Schema validation                            |
