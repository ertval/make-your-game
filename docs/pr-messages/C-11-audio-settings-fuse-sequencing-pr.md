# C-11: Audio Settings Persistence, Settings Overlay & Fuse Sequencing

## Summary

Ships the C-11 audio-settings layer in three parts:

- **C-11A** — Persisted audio settings: `storage-adapter` extended with `getAudioSettings` / `setAudioSettings` / `updateAudioSetting` backed by `localStorage`, and `applyAudioSettings` added to `audio-integration.js` to push those settings into the adapter's gain graph on load and on every change.
- **C-11B** — Settings overlay & persistent audio quick-toggle: `screens-adapter` gains a full Settings overlay (open from Start or Pause, Back navigation, keyboard-only operation, accessible toggle + slider controls); `screens-audio-toggle.js` (new) owns the always-visible top-right music/sfx mute buttons; `main.ecs.js` wires both surfaces to `applyAudioSettings` and the storage layer.
- **C-11C** — Bomb-place → fuse-loop sequencing: `audio-integration.js` gains a `fuseLoopDelay` option (default 310 ms, matching `bomb-place.mp3` duration) so the fuse loop starts only after the placement one-shot finishes, with no change to when the loop ends.

---

## Description

### C-11A: Persisted Audio Settings (`storage-adapter`, `audio-integration`)

- `src/adapters/io/storage-adapter.js` — adds `AUDIO_SETTINGS_STORAGE_KEY`, `DEFAULT_AUDIO_SETTINGS`, `getAudioSettings()`, `setAudioSettings(settings)`, `updateAudioSetting(key, value)`, and `normalizeAudioSettings(raw)`. All reads fall back to defaults for missing/corrupt storage. Volume values are clamped to `[0, 1]`; boolean toggles coerce non-boolean values to `true`.
- `src/adapters/io/audio-integration.js` — adds `applyAudioSettings(audio, settings)`: the only adapter calls used are `setMasterVolume`, `setMusicVolume`, `setSfxVolume`, `setUiVolume` (all idempotent). Music/SFX enabled state is expressed as volume 0 / restored-volume, not as a play/stop toggle, so gain changes survive across pause and level transitions without touching the playback graph.
- Settings are restored from `localStorage` on app start (before the first frame) and re-applied on every change from the Settings overlay or the quick-toggle.

### C-11B: Settings Overlay & Audio Quick-Toggle (`screens-adapter`, `screens-audio-toggle`, `main.ecs.js`, `index.html`, styles)

- `src/adapters/dom/screens-adapter.js` — `showSettings(origin)` / `backFromSettings()` manage the Settings overlay as an overlay-to-overlay transition; `syncSettingsControls(settings)` keeps toggle states and slider positions in sync with the live settings object. The adapter fires `onSettingChange(key, value)` for every user action; the host (`main.ecs.js`) persists and applies.
- `src/adapters/dom/screens-audio-toggle.js` (new) — `createAudioQuickToggle(rootElement, options)` binds `[data-audio-toggle]` buttons, manages `aria-pressed` + emoji icon state, and notifies via `options.onToggle(key, enabled)`. Tolerates missing DOM nodes for headless test environments.
- `index.html` / `styles/base.css` / `styles/grid.css` — Settings overlay markup and quick-toggle button markup added; layout positions the quick-toggle in the top-right corner, clear of the game board.
- `src/main.ecs.js` — wires `createAudioQuickToggle`, the settings change handler, and `applyAudioSettings` at the app boundary.

### C-11C: Bomb-Place → Fuse-Loop Sequencing (`audio-integration`, `bootstrap`)

- `src/adapters/io/audio-integration.js` — `createAudioCueRunner` accepts `options.fuseLoopDelay` (number, ms) and `options.now` (injectable clock, defaults to `() => performance.now()`). On the rising edge of `bombActive`, the runner records `fuseLoopAllowedAt = now() + fuseLoopDelay` and holds the fuse loop until that timestamp passes. The fuse loop stop path is unchanged — the loop ends the instant `bombActive` drops.
- `src/game/bootstrap.js` — `createAudioCueSystem` and `createBootstrap` accept `options.fuseLoopDelay` and forward it to the runner, so integration tests can pass `fuseLoopDelay: 0` to bypass the delay without mocking the clock.
- The constant `BOMB_PLACE_SFX_DURATION_MS = 310` (in `audio-integration.js`) documents the asset duration that informed the default.

### Tests

- `tests/integration/adapters/storage-adapter.test.js` — `getAudioSettings` / `setAudioSettings` / `updateAudioSetting` round-trips, defaults, normalization, and corrupt-storage fallback.
- `tests/integration/adapters/screens-settings.test.js` — Settings overlay open/close, `syncSettingsControls`, `onSettingChange` dispatch, keyboard navigation, Back navigation from Start and Pause origins.
- `tests/integration/adapters/audio-integration.test.js` — existing fuse-loop tests updated to use `fuseLoopDelay: 0`; two new tests: delay hold (fuse not emitted before window elapses) and delay reset on `bombActive` falling edge.
- `tests/integration/gameplay/bomb-explosion-runtime-wiring.test.js` — updated to pass `fuseLoopDelay: 0` to `createBootstrap` so the fuse-loop assertion fires within a single frame.
- `tests/e2e/c-11-settings-navigation.spec.js` — browser-level coverage for Settings overlay open from Start, open from Pause, Back navigation, keyboard-only operation, `aria-pressed` state, and quick-toggle buttons.

---

## Verification

- `npx vitest run` → **1032 / 1032 pass**.
- `npm run validate:schema` → all manifests pass.
- `npm run policy -- --require-approval=false` → all gates green.

---

## PR Gate Checklist

- [x] **Read Standards**: Reviewed `AGENTS.md`.
- [x] **Policy Compliance**: `npm run policy` passes locally.
- [x] **Ownership**: All changed files are Track C (`src/adapters/`, `src/adapters/io/`, `src/adapters/dom/`, `src/main.ecs.js` wiring) or Track A integration wiring on an authorized integration branch.
- [x] **Branching**: `chbaikas/integration-C-11`; ticket `C-11` extractable from branch name.
- [x] **Tests**: Unit, integration, and e2e coverage added for all three sub-features.
- [x] **ECS Isolation**: `grep -rn 'audio-adapter\|audio-integration' src/ecs/` → zero matches.

---

## Architecture & Security Notes

- `applyAudioSettings` uses only the adapter's volume setters — no play/stop calls, no DOM access, no URL construction.
- `normalizeAudioSettings` rejects non-finite / NaN volume values and coerces booleans, so corrupt localStorage cannot propagate invalid state into the gain graph.
- The fuse delay timer uses `performance.now()` (injected for tests), not `Date.now()` — it is not persisted and resets cleanly on every bomb placement.
- Quick-toggle buttons carry stable `aria-label` values; only the emoji icon changes on toggle so screen-reader announcements stay consistent.

---

## Local Command Reference

| Command | Purpose |
| :--- | :--- |
| `npm run policy` | Primary gate (all checks + tests) |
| `npm run check` | Linting & formatting |
| `npm run test` | All vitest suites |
| `npm run dev` | Launch app to verify settings persistence and fuse sequencing live |
