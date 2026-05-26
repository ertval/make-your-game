# 🚀 C-07: Audio Cue Mapping & Runtime Integration (Driver Contract)
> **Summary**: Adds the Track C-owned audio cue runtime driver: `AUDIO_CUE_MAPPING` (11 event→cue rows), `MUSIC_STATE_MAPPING` (every `GAME_STATE`), and `createAudioCueRunner({ warnUnknownEvents })`. The runner drains the D-01 event queue each tick in deterministic `(frame, order)` sequence, dispatches `audio.playSfx(cueId)` for every mapped event (overlapping playback supported via BufferSource-per-call from C-06), and debounces music transitions. Runtime system registration lands in the same Track A integration handoff PR that wires C-06 `setAudioAdapter` — out of Track C ownership scope per `scripts/policy-gate/lib/policy-utils.mjs`, same pattern as the C-04 / C-05 / B-03 / C-06 runtime-integration handoffs already on record.

---

## 📝 Description

### 🔄 What Changed (this PR — Track C scope)

- **`src/adapters/io/audio-integration.js`** (new) — driver module:
  - `AUDIO_CUE_MAPPING` (frozen): `BombPlaced → sfx-bomb-place`, `BombDetonated → sfx-bomb-explode`, `PelletCollected → sfx-pellet-collect`, `PowerPelletCollected → sfx-power-pellet-collect`, `PowerUpCollected → sfx-powerup-collect`, `LifeLost → sfx-player-hit`, `GhostDefeated → sfx-ghost-kill`, `GhostStunned → sfx-ghost-stun`, `LevelCleared → sfx-level-complete`, `GameOver → sfx-game-over`, `Victory → sfx-victory`.
  - `MUSIC_STATE_MAPPING` (frozen): `MENU → music-menu`, `PLAYING → music-gameplay`, `PAUSED / LEVEL_COMPLETE / GAME_OVER / VICTORY → null` (silence).
  - `resolveCueForEvent(eventType)` / `resolveMusicForState(gameState)` — pure lookups, return `null` on unknown / malformed input.
  - `createAudioCueRunner({ warnUnknownEvents })` — factory returning `{ tick(context), reset() }`. `tick` drains the D-01 event queue, dispatches mapped cues, and debounces music transitions against the last-seen `gameStatus.currentState`. Adapter errors are caught locally so the game loop survives. Pre-wiring (`audio === null`) is a no-op that leaves the queue intact.
  - No DOM, no `AudioContext`, no module-level state. The runner closes over `warnedUnknown` (a Set) and `lastState` (the last `gameStatus.currentState` acted on) per instance.
- **`tests/integration/adapters/audio-integration.test.js`** (new) — 20 deterministic tests:
  - Cue mapping table (6): full C-07 mapping declared; tables frozen; `resolveCueForEvent` happy + malformed paths; `MUSIC_STATE_MAPPING` covers every `GAME_STATE`; per-state music resolution.
  - Event consumption (8): every mapped event fires; `(frame, order)` preserved across frames; 6+3 overlap without coalescing; queue drained so no replay; unknown events warned once per type; malformed event rows (non-string type, missing type) survive; adapter throw isolated; pre-wiring tick is a no-op and leaves the queue intact.
  - Music state transitions (6): first `PLAYING` tick starts gameplay music; same-state ticks do not restart; `PAUSED` stops music and `PLAYING` resumes; `GAME_OVER` / `VICTORY` both stop music; `MENU` plays menu music; `reset()` + adapter active-id guard interact correctly.
- **`docs/implementation/track-c.md`** — C-07 block updated with the Track A integration handoff contract (driver file, public surface, example system wrapper, phase = `render`, ordering rationale, asset provenance forward-reference to C-08).
- **`docs/implementation/runtime-audio.md`** — §8 example refreshed to point to the actual shipped runner (`createAudioCueRunner` from `src/adapters/io/audio-integration.js`); §9 verification table adds the new 20-test suite; §10 status column promotes C-07 row from "future ticket" to driver-shipped.
- **`docs/implementation/ticket-tracker.md`** — C-07 promoted to `[x]` with detailed status line mirroring C-06's pattern; Done count `27 → 28`; Phase 3 remediation status updated.
- **`docs/implementation/implementation-plan.md`** — added "Audio cue runtime integration" boundary note next to the existing C-06 callout.
- **`docs/implementation/audit-traceability-matrix.md`** — AUDIT-B-05 row adds the C-07 cue runner alongside C-06 in the owning-tickets column and points at `audio-integration.js` + the new test file as evidence.

### 🚧 Deferred to Track A integration handoff PR

The same Track A PR that registers the C-06 adapter (`setAudioAdapter`) registers the C-07 runner. The wrapper is pure plumbing — no audio logic, all behavior stays in `audio-integration.js`:

```js
// Track A-owned: registered in createDefaultSystemsByPhase().
function createAudioCueSystem() {
  const runner = createAudioCueRunner();
  return {
    name: 'audio-cue-system',
    phase: 'render',
    resourceCapabilities: {
      read: ['audio', 'eventQueue', 'gameStatus'],
      write: ['eventQueue'], // drain() clears the queue
    },
    update(context) {
      runner.tick({
        audio: context.world.getResource('audio'),
        eventQueue: context.world.getResource('eventQueue'),
        gameStatus: context.world.getResource('gameStatus'),
      });
    },
  };
}
```

- **Phase `render`**: audio is a downstream feedback channel — running after `logic` (where collision / scoring / life / level-progress / explosion systems emit the events the runner consumes) guarantees the cue heard in frame N corresponds to the simulation of frame N. Placement matches the existing convention that observable side effects (DOM, HUD, audio) live outside the simulation phases.

### 🎯 Why

- **Rationale**: C-06 shipped the Web Audio boundary but no system was dispatching cues. C-07 fills the gap with a deterministic, framework-free, test-isolated driver that ECS gameplay systems can rely on without ever importing the adapter module.
- **Impact**: AGENTS.md §ECS Architecture Rules requires adapters be World resources, not direct imports. The runner enforces that contract: every collaborator (`audio`, `eventQueue`, `gameStatus`) is injected per tick. No system imports `audio-adapter.js` or `audio-integration.js` from `src/ecs/systems/`.
- **Forward compatibility**: 5 of the 11 events (`LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`) need emitters from `B-09` before they reach the runner at runtime. The cue table is forward-compatible; cues will fire automatically once B-09 lands without any further C-07 changes.

### 🚫 Out of Scope

- C-08 — `.mp3` / `.ogg` asset production and manifest entries for the new cue IDs. Until C-08 lands, the C-06 adapter warns once per missing cue and no-ops.
- C-09 — lazy/streaming policy + Performance API thresholds.
- C-10 — schema validation gate (already in place via `npm run validate:schema`).
- B-09 — emitting `LifeLost` / `GhostDefeated` / `GhostStunned` / `LevelCleared` / `GameOver` / `Victory` events from gameplay systems.
- Track A — bootstrap `setAudioAdapter`, manifest module, `audio-cue-system` registration in `createDefaultSystemsByPhase()`.

---

## 🧪 Verification & Audit

### ✅ Verification

- [x] **Master Check**: `npm run policy` — all gates green.
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

Targeted runs:

- `npx vitest run tests/integration/adapters/audio-integration.test.js` → **20 / 20 pass**.
- `npx vitest run tests/integration/adapters/audio-adapter.test.js` → **30 / 30 pass** (C-06 unaffected).

### 📋 Audit Traceability

- **AUDIT-B-05** | `Semi-Automatable` | Verification: `tests/integration/adapters/audio-integration.test.js` (20 deterministic tests) | Evidence: `src/adapters/io/audio-integration.js` + `tests/integration/adapters/audio-integration.test.js`. Adapter-side async decode evidence remains C-06's `src/adapters/io/audio-adapter.js` + `tests/integration/adapters/audio-adapter.test.js`. Browser Performance API threshold check remains owned by C-09 / A-09 — not in this PR.

No other audit IDs change status. F-01 … F-21 and B-01 … B-06 coverage unchanged per `audit-traceability-matrix.md`.

---

## ✅ PR Gate Checklist

### 📋 Required Checks

- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope. New driver placed under `src/adapters/io/audio-*.js` (Track C); new test placed under `tests/integration/adapters/audio-*.test.js` (Track C). Out-of-scope files (`src/game/bootstrap.js`, `src/main.ecs.js`, `src/ecs/resources/audio-manifest.js`, `src/ecs/systems/audio-cue-system.js`) deferred to the Track A integration handoff PR.
- [x] **Branching**: Branch `chbaikas/C-07` follows `<owner>/<TRACK>-<NN>`.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: No Manual-With-Evidence audit IDs (F-19, F-20, F-21, B-06) affected by this PR.

### 🏗️ Architecture & Security

- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references and no audio imports (`grep -rn 'audio-adapter\|audio-integration\|createAudioAdapter\|createAudioCueRunner' src/ecs/` → zero matches).
- [x] **Adapter Injection**: The driver is framework-free and DOM-free. Every collaborator (`audio`, `eventQueue`, `gameStatus`) is injected through `runner.tick(context)`; the runner never imports the world or the audio adapter module. The Track A wrapper resolves world resources and forwards — no audio logic lives in the wrapper.
- [x] **Safe Sinks**: No DOM writes; no untrusted content.
- [x] **No Bloat**: No framework imports, no canvas APIs, no new dependencies, no lockfile change.
- [x] **Dependencies**: Checked dependency and lockfile impact — none.

---

## 🛡️ Security & Architecture Notes

- **Security**: Cue IDs are stable string constants frozen in `AUDIO_CUE_MAPPING`; the runner never builds URLs and never executes user input. Adapter errors are caught and logged as `console.warn` so a downstream failure cannot escalate into the game loop. No new HTML / textContent sinks.
- **Architecture**: `createAudioCueRunner` is a factory; per-instance closures hold `warnedUnknown` and `lastState`. No module-level singletons. The runner consumes the D-01 event queue via the canonical `drain(queue)` API and respects the queue's deterministic `(frame, order)` ordering.
- **Risks**:
  - Until the Track A handoff PR registers both the C-06 adapter and the C-07 runner, no audio is heard at runtime. The runner's pre-wiring branch (`audio === null`) keeps `world.getResource('audio')` returning `undefined` a no-op.
  - Until C-08 ships the actual `.mp3` files, the adapter warns once per missing cue and no-ops; the runner remains forward-compatible.
  - The 6 events that need `B-09` emitters (`LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`) silently never reach the runner today; the cue table will activate them automatically once `B-09` lands.

---

### 📖 Local Command Reference

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run test:unit` | Debug: Unit tests only |
| `npm run test:integration` | Debug: Integration tests only |
| `npm run test:e2e` | Debug: Playwright browser tests |
| `npm run test:audit` | Debug: Audit map validation |
| `npm run validate:schema` | Schema validation |
