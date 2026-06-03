# 🚀 C-08: Sound Effects & Music Production (Draft — Audio Pipeline Validation)

> **Summary**: Ships the first C-08 production candidate audio set — 11 SFX + 1 loop-safe music track under `assets/generated/` — and registers every clip in the `audio-manifest.json` (C-10 surface) so the C-06 adapter can decode them and the C-07 cue runner can dispatch them. Because the goal of this draft is to **hear the cues end-to-end in the real game loop**, the branch also carries the temporary cross-track runtime wiring that injects the audio adapter and registers the `audio-cue-system`. This is an **integration branch** (`chbaikas/integration-C-08`); the cross-track wiring is validation-only and is mapped to its owning tickets below for later relocation per the Cleanup Plan.

---

## ⚠️ Draft Notice

This PR is intentionally a **DRAFT**. Its primary goal is to validate the complete runtime audio pipeline (C-06 adapter → C-07 cue runner → C-08 assets → C-10 manifest) against real assets and real gameplay before the final ticket split.

All audio assets are **initial production candidates**. If any SFX/music feels out of place, too loud/quiet, mistimed, or should be restyled, leave feedback on the PR and the assets will be re-exported before finalization.

---

## 📝 Description

### 🔄 What Changed (C-08 deliverables — Track C scope)

- **`assets/generated/sfx/*.mp3`** (new) — 11 gameplay & UI SFX production candidates:
  | File | Manifest cue id | Loop | Drives |
  | :--- | :--- | :--- | :--- |
  | `bomb-place.mp3` | `sfx-bomb-place` | — | `BombPlaced` |
  | `bomb-fuse-loop.mp3` | `sfx-bomb-fuse` | ✅ | live fuse state (`bombAudioActive`) |
  | `bomb-explode.mp3` | `sfx-bomb-explode` | — | `BombDetonated` |
  | `wall-destroy.mp3` | `sfx-wall-destroy` | — | `WallDestroyed` |
  | `pellet-collect.mp3` | `sfx-pellet-collect` | — | `PelletCollected` |
  | `power-pellet.mp3` | `sfx-power-pellet-collect` | — | `PowerPelletCollected` |
  | `speed-boost-on.mp3` | `sfx-speed-boost-on` | ✅ | live frenzy state (`powerPelletActive`) |
  | `ghost-kill.mp3` | `sfx-ghost-kill` | — | `GhostDefeated` |
  | `player-death.mp3` | `sfx-player-hit` | — | `LifeLost` |
  | `level-complete.mp3` | `sfx-level-complete` | — | `LevelCleared` |
  | `ui-confirm.mp3` | `ui-confirm` | — | UI confirm / boot unlock |
- **`assets/generated/music/gameplay-loop.mp3`** (new) — loop-safe gameplay music track (`music-gameplay`, `loop: true`), driven by `MUSIC_STATE_MAPPING[PLAYING]`.
- **`assets/manifests/audio-manifest.json`** — registers all 12 clips (id, src, category `sfx|ui|music`, loop flag, channel) so C-06 pre-decode and C-10 schema validation see every cue.

### 🔌 Integration Validation Wiring (temporary — cross-track, mapped for relocation)

These changes exist only to make the cues audible in the real loop; they are **not** permanent C-08 scope and are itemized for hand-off (see Cleanup Plan).

- **`src/game/bootstrap.js`** (Track A) — registers the `audio-cue-system` (render phase, appended last so it drains every logic-phase event of the frame), pre-registers the `audio` and `bombAudioActive` world-resource slots, and exposes `setAudioAdapter` / `getAudioAdapter`.
- **`src/main.ecs.js`** (Track A) — constructs the audio adapter at the app boundary, loads clips from the manifest, initializes volumes, plays the UI-confirm unlock, and tears the adapter down on shutdown.
- **`src/game/runtime-bomb-explosion-wiring.js`** (Track A) — propagates the event queue for bomb-related runtime audio.
- **`src/ecs/systems/bomb-tick-system.js`** (Track B) — publishes the `bombAudioActive` flag (true while any bomb is live this frame) so the cue runner loops/stops the fuse SFX from real state.
- **`src/ecs/systems/explosion-system.js`** (Track B) — emits `WallDestroyed` (the one cue not on the canonical `GAMEPLAY_EVENT_TYPE` surface) for `sfx-wall-destroy`.

### 🧪 Tests

- `tests/integration/adapters/audio-integration.test.js` — extended for runtime cue dispatch.
- `tests/integration/gameplay/a03-game-loop.test.js` — audio lifecycle through the loop.
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js`, `tests/unit/systems/bomb-tick-system.test.js`, `tests/unit/systems/explosion-system.test.js` — bomb/fuse/wall audio event emission.

### 🎯 Why

- **Rationale**: C-06 shipped the Web Audio boundary and C-07 the deterministic cue runner, but neither could be heard without real assets and runtime registration. C-08 produces the asset set and validates the full chain end-to-end on an integration branch.
- **Determinism preserved**: cues are driven by the existing canonical events (B-09 emits `LifeLost`/`GameOver`/`LevelCleared`/`GhostDefeated`/`BombPlaced` with identical `(frame, order)` ordering); no duplicate emitters were retained from the pre-B-09 draft. The only non-canonical events are `WallDestroyed` and the resource-driven fuse flag.
- **AGENTS.md compliance**: ECS systems still consume the adapter only via `world.getResource('audio')`; no `src/ecs/systems/` file imports `audio-adapter.js` / `audio-integration.js`.

### 🚫 Out of Scope / Still Pending

- Remaining SFX from the C-08 deliverable list not yet exported: chain-reaction, power-up-collect, speed-boost-off, ghost-stun, ghost-return, player-respawn, menu-navigate, cancel, pause open/close, game-over sting, victory fanfare. (Cue rows exist in C-07's table; assets to follow after feedback.)
- `.ogg` alternate exports (optional).
- Loudness normalization sign-off across all categories (in progress — candidates only).
- C-09 — preloading/decode performance evidence.
- C-10 — schema validation gate (manifest already validates via `npm run validate:schema`).
- Final relocation of cross-track wiring to Track A/B owners (Cleanup Plan).

---

## 🧪 Verification & Audit

### ✅ Verification

- [x] **Master Check**: `npm run policy -- --require-approval=false` — all gates green (integration-mode ownership bypass active for `chbaikas/integration-C-08`).
> *Includes linting, all test suites (unit, integration, e2e), schema validation, and policy gates.*

Targeted runs:

- `npx vitest run` → **1009 / 1009 pass**.
- `npm run validate:schema` → `audio-manifest.json` passes.

### 📋 Audit Traceability

- **AUDIT-B-06** | `Manual-With-Evidence` | Impact: gameplay feel / action clarity / production quality. Evidence: shipped `assets/generated/sfx/*.mp3` + `assets/generated/music/gameplay-loop.mp3`, registered in `assets/manifests/audio-manifest.json`, audible end-to-end via the C-06 adapter + C-07 runner in the bootstrap loop. Final sign-off pending complete SFX set + loudness normalization.

No other audit IDs change status.

---

## ✅ PR Gate Checklist

### 📋 Required Checks

- [x] **Read Standards**: Reviewed [AGENTS.md](file:///AGENTS.md).
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Audio assets, music, and manifest are Track C (`assets/generated/{sfx,music}/**`, `assets/manifests/audio-manifest.json`). Cross-track runtime wiring (Track A `bootstrap.js`/`main.ecs.js`/`runtime-bomb-explosion-wiring.js`, Track B `bomb-tick-system.js`/`explosion-system.js`) is **validation-only** on this integration branch and authorized via the integration-branch policy bypass.
- [x] **Branching**: `chbaikas/integration-C-08` matches the integration pattern (`<owner>/integration…`); ticket `C-08` is extractable from the branch name.
- [x] **Audit Coverage**: F-01…F-21 / B-01…B-05 unchanged; B-06 evidence added (draft).
- [x] **Evidence**: AUDIT-B-06 is Manual-With-Evidence — production candidates attached, final sign-off pending.

### 🏗️ Architecture & Security

- [x] **ECS Isolation**: `grep -rn 'audio-adapter\|audio-integration' src/ecs/` → zero matches.
- [x] **Adapter Injection**: audio reached only via `world.getResource('audio')`; the `audio-cue-system` wrapper resolves resources and forwards to `runner.tick` — no audio logic in systems.
- [x] **Safe Sinks**: assets are static `.mp3`; no DOM writes, no URL construction from user input.
- [x] **No Bloat**: no frameworks, no canvas/WebGL; `package-lock.json` change limited to the asset/tooling delta.

---

## 🧹 Cleanup Plan (before final ticket closure)

1. Complete the remaining SFX set and re-export after feedback.
2. Finalize loudness normalization across gameplay / UI / music.
3. Relocate the temporary cross-track wiring to its owning tracks (Track A bootstrap/runtime, Track B bomb/explosion event hooks) or hand off for permanent integration.
4. Split the pure C-08 deliverables (assets + manifest) onto the clean `chbaikas/C-08` ticket branch.
5. Complete C-09 (preloading evidence) and C-10 (schema gate) verification.

---

## 🛡️ Security & Architecture Notes

- **Security**: Cue ids and track ids are static, frozen string constants (`AUDIO_CUE_MAPPING` / `MUSIC_STATE_MAPPING` from C-07); the runner never builds URLs and never executes user input. Audio assets are static same-origin `.mp3` files resolved from `audio-manifest.json` — no dynamic source construction. Adapter decode/playback errors are caught locally and logged as `console.warn`, so a failed clip cannot escalate into the game loop. No new HTML / `textContent` sinks.
- **Architecture**: Systems reach audio only through `world.getResource('audio')`; the `audio-cue-system` is a render-phase wrapper that resolves world resources and forwards to `runner.tick` — no audio logic lives in `src/ecs/systems/`. The fuse loop is driven by a resource flag (`bombAudioActive`, recomputed each frame from live bomb state) rather than by counting events, which is leak-proof across pause/restart. `WallDestroyed` is the only cue emitted outside the canonical `GAMEPLAY_EVENT_TYPE` surface; every other cue rides B-09's deterministic `(frame, order)` emitters.
- **Risks**: Draft asset set is incomplete — missing cues no-op with a single warn per cue id (runtime unaffected). Loudness normalization is not finalized, so relative mix/balance may change after feedback. The cross-track runtime wiring is temporary validation-only and must be relocated to its owning tracks (A/B) before C-08 closure. No performance/preload evidence yet (owned by C-09).

---

### 📖 Local Command Reference

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run validate:schema` | Audio manifest schema validation |
| `npm run dev` | Launch the app to hear cues in the real loop |
