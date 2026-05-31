# Track C — Scoring, Game Flow UI, Audio & Runtime Feedback (Dev 3)

Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Scoring/timer/lives systems, spawn timing, pause/progression gameplay flow systems, HUD and screen overlay adapters, storage adapter, audio adapter, audio cue mapping, SFX/music production, and audio manifest governance. Track C owns scoped tests that validate Track C-owned implementation files. Track A remains the global owner for `tests/**` and QA gates.
> **Execution model**: Deliver scoring/lives/timer + gameplay flow UI for MVP, then layer audio integration and polish.

## Phase Order (Prototype-First)

- **P1 Visual Prototype**: No new Track C tickets
- **P2 Playable MVP**: `C-01` to `C-06`
- **P3 Feature Complete + Hardening**: `C-07`
- **P4 Polish and Validation**: `C-08` to `C-10`

> Note: `A-11` is referenced for audit traceability only and does not block Track C ticket execution.

---

#### C-01: Scoring System
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `B-04` (collision intents), `C-02` (timer/lives), `D-01` (event-queue resource), `A-11` (audit gate, non-blocking)
**Impacts**: HUD-critical score metric (`AUDIT-F-15`)
**Blocks**: A-08, B-09

**Deliverables**:
- `src/ecs/systems/scoring-system.js` — canonical scoring values, combo logic

- [x] Implement `scoring-system.js` with exact canonical values:
  - Pellet: +10, Power Pellet: +50, Ghost kill (normal): +200, Ghost kill (stunned): +400.
  - Chain multiplier: `200 * 2^(n-1)` per ghost. Power-up pickup: +100. Retain full authority over all pointing and combo logic here in C-01.
  - Level clear: +1000 + (remainingSeconds × 10) ships as a pure helper and is now consumed at runtime — `scoring-system` observes the `PLAYING → LEVEL_COMPLETE` transition and awards the bonus exactly once (one-shot guarded on `scoreState.levelClearBonusAwarded`).
- [x] Consume collision intents (B-04) for the current scoring pipeline.
- [x] C-01 scoring authority is implemented for the current collision-intent pipeline. Explosion-event scoring is not part of C-01 and will be integrated in a later ticket once event-queue usage is established through `B-09` or later runtime event consumers such as `C-07`.
- [x] Level-clear scoring runtime hookup is live: `scoring-system` observes the `PLAYING → LEVEL_COMPLETE` transition and awards `1000 + remainingSeconds * 10` exactly once via a `levelClearBonusAwarded` one-shot flag on the `scoreState` resource (re-armed when gameplay returns to PLAYING). Verification: `tests/integration/gameplay/c-01-level-clear-bonus.test.js`. Remaining event-driven scoring work (explosion events, cross-system event hooks) stays scoped to `B-09` / `C-07`.
- [x] Verification gate: unit tests match every value in `game-description.md` §6.

---

#### C-02: Timer & Life Systems
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (clock/constants resources), `B-04` (collision intents for death), `A-11` (audit gate, non-blocking)
**Impacts**: HUD-critical timer and lives metrics (`AUDIT-F-14`, `AUDIT-F-16`)
**Blocks**: A-05, A-08, B-09, C-04, C-05

**Deliverables**:
- `src/ecs/systems/timer-system.js` — level countdown, time-up → GAME_OVER
- `src/ecs/systems/life-system.js` — 3 starting lives, decrement, respawn, invincibility, zero → GAME_OVER

- [x] Implement `timer-system.js`: countdown per level (120s/180s/240s). Timer hits zero → GAME_OVER.
- [x] Implement `life-system.js`: 3 starting lives, decrement on death, respawn with 2000ms invincibility. Zero lives → GAME_OVER.
- [x] Verification gate: unit tests cover countdown, time-up game over, respawn invincibility, and zero-lives game over.

---

#### C-03: Spawn System
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (constants/clock), `D-03` (map resource — ghost spawn points), `A-11` (audit gate, non-blocking)
**Impacts**: Ghost stagger timing and death-return respawn
**Blocks**: A-08, B-08

**Deliverables**:
- `src/ecs/systems/spawn-system.js` — staggered ghost-house release, death-return respawn timing

- [x] Implement `spawn-system.js`: Apply absolute staggered ghost-house release timings per `game-description.md` §5.4 (0s, 5s, 10s, 15s) using absolute `elapsedMs`.
- [x] Enforce per-level active ghost caps from `mapResource.maxGhosts` with deterministic FIFO release order when a slot opens.
- [x] Death-return respawn is `5000ms`, with respawned ghosts re-entering the FIFO queue and still respecting the active cap.
- [x] The spawn system owns a dedicated `ghostSpawnState` world resource with `elapsedMs`, `releasedGhostIds`, `queuedGhostIds`, `respawnQueue`, and `activeGhostCap`.
- [x] Deterministic ghost order comes from a `ghostIds` resource when present; otherwise falls back to `[0..activeGhostCap-1]` (the resolved per-level cap), so under-cap maps no longer over-spawn during fallback.
- [x] Spawn-state updates are resource-only by design. Direct ghost-entity mutation (entity creation, AI targeting, position/velocity updates, DOM rendering) is deferred to `B-08 Ghost AI System (Track B, Phase 3)`. C-03 deliberately stays isolated from collision, audio, UI, and bootstrap integration — this is the intended scope, not an incomplete Track C implementation. If ghosts are not visibly moving at runtime, that is expected until B-08 lands.
- [x] Verification gate: unit tests validate stagger timing, FIFO/cap behavior, respawn delay, and duplicate protection.

---

#### C-04: Pause & Level Progression Systems
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (clock/game-status), `D-03` (map resource), `C-02` (timer/lives), `A-03` (game loop), `A-11` (audit gate, non-blocking)
**Impacts**: ECS pause/progression flow contracts and later pause menu/runtime integration (`AUDIT-F-07..F-10`)
**Blocks**: A-05, A-06, A-08, C-05
**READY_FOR_MAIN**: YES

C-04 is runtime-integrated. The ECS systems (`pause-input-system`, `pause-system`, `level-progress-system`) are registered in the default bootstrap, and the visible pause menu, restart UX, and level-flow advancement are wired through the C-05 adapters that ship alongside this work. Runtime integration landed via `ekaramet/integration-track-D-C-followups`.

**C-04 Status**
- Scope: ECS system layer + default runtime registration
- Pause: in-place resource mutation, dispatched once per rAF in the `meta` phase
- Restart: `levelFlow.pendingRestart` is consumed by the bootstrap restart path, which fully resets gameplay resources, the sprite pool, and intent buffers
- Level progression: `levelFlow.pendingLevelAdvance` is consumed by the runtime level loader to advance levels and trigger overlays

**Deliverables**:
- `src/ecs/systems/pause-system.js` — FSM-only pause, continue, and paused-restart transitions
- `src/ecs/systems/pause-input-system.js` — pause-key edge input to `pauseIntent`
- `src/ecs/systems/level-progress-system.js` — pellet completion detection

- [x] Implements ECS system-layer logic for pause and level progression.
- [x] Implemented: `pause-input-system`, `pause-system`, and `level-progress-system`.
- [x] System-layer FSM intents: `PLAYING ↔ PAUSED` and `PLAYING → LEVEL_COMPLETE`.
- [x] Default runtime registration: all three systems are registered in the default bootstrap (pause systems in the `meta` phase, level-progress in `logic`).
- [x] C-04 does NOT apply level-clear scoring directly. It owns only the `PLAYING → LEVEL_COMPLETE` transition. Level-clear score awards are handled by the C-01 `scoring-system` runtime integration.
- [x] Pause Continue intent: `PAUSED → PLAYING` transition is implemented and live through the runtime pause menu (Continue button + Enter key).
- [x] Pause Restart intent: `pause-system` accepts the restart intent, and the bootstrap restart path performs the full reset/reload (score, timer, lives, ghost spawn state, sprite pool, intent buffers).
- [x] Verification gate: focused unit tests cover `pause-input-system`, `pause-system`, and `level-progress-system`; e2e coverage in `tests/e2e/game-loop.pause.spec.js`, `tests/e2e/c-05-screens-navigation.spec.js`, and `tests/e2e/stress/race-condition.spec.js`.

C-04 is runtime-integrated. `AUDIT-F-07` through `AUDIT-F-10` are covered by the e2e pause/restart suite plus the signed-off manual evidence entries for F-19/F-20/F-21/B-06 in `docs/audit-reports/manual-evidence.manifest.json`.

---

#### C-05: HUD Adapter & Screen Overlays
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-05` (CSS layout), `C-02` (timer/lives data), `C-04` (pause/progression states), `A-11` (audit gate, non-blocking)
**Impacts**: Visible gameplay metrics (`AUDIT-F-14..F-16`), pause/start/restart UX (`AUDIT-F-07..F-09`)
**Blocks**: A-05, A-06, A-08, D-11
**READY_FOR_MAIN**: YES

C-05 is runtime-integrated. `hud-adapter`, `screens-adapter`, and `storage-adapter` are mounted via the bootstrap injection slots (`setHudAdapter`, `setScreensAdapter`, `setStorageProvider`), and the `hud-system` plus the new `screens-system` ECS bridge are registered in the default `render` phase. Overlays (start/pause/level-complete/game-over/victory) are active in the live runtime shell. Runtime integration landed via `ekaramet/integration-track-D-C-followups`.

**Deliverables**:
- `src/adapters/dom/hud-adapter.js` — textContent updates for lives, score, timer, bomb count, fire radius, level number
- `src/adapters/dom/screens-adapter.js` — start screen, pause menu, level complete, game over, victory overlays
- `src/adapters/io/storage-adapter.js` — high score localStorage with untrusted data validation

- [x] Implement `hud-adapter.js`:
  - Binds text nodes natively with `.textContent` to update: lives (heart icons), score (5-digit), timer (M:SS), bomb count, fire radius, level number.
  - Uses throttled `aria-live` updates for accessibility (not per-frame spam).
- [x] Implement `screens-adapter.js` with fully distinct game state screens:
  - **Start Screen** (`game-description.md` §9.5): Title, Start Game button, High Scores display, control instructions. `Enter` to start.
  - **Pause Menu** (`game-description.md` §10): Continue and Restart options. Arrow keys to select, `Enter` to confirm.
  - **Level Complete Screen** (`game-description.md` §8): Level stats. `Enter` for next level.
  - **Game Over Screen** (`game-description.md` §11): Final score, Play Again button.
  - **Victory Screen** (`game-description.md` §11): Final score, ghosts killed, total time, Play Again button.
- [x] Implement keyboard focus transfer: Arrow keys for menu navigation, Enter for confirm. Focus enters overlay on open, restores to gameplay on close.
- [x] Implement `adapters/io/storage-adapter.js`: High score saving/reading from `localStorage` with untrusted data validation on read.
- [x] Verification gate: adapter tests confirm HUD metrics update correctly via safe sinks; e2e harness tests confirm keyboard-only navigation across screen-overlay flows owned by C-05.

C-05 is runtime-integrated: the HUD/screen DOM is mounted into the live runtime shell, adapter resources are registered through bootstrap, and the full gameplay/runtime product flow (start → play → pause → restart → level complete → game over / victory, with high-score persistence) is exercised end-to-end by `tests/e2e/c-05-screens-navigation.spec.js`, `tests/e2e/track-c-integration.spec.js`, and `tests/integration/gameplay/restart-flow.test.js`.

### Storage Trust Boundary & Validation Contract

All data read from `localStorage` or `sessionStorage` MUST be treated as untrusted input.

Track C enforces the following contract for storage-backed adapters:

- All reads MUST go through a guarded access layer (`safeRead`).
- Stored values MUST be parsed using `JSON.parse` inside a try/catch block.
- Parsed values MUST be validated for basic structural correctness (non-null object, no arrays).
- Invalid, malformed, or unexpected data MUST NOT crash the application.
- On validation failure, a safe default value MUST be returned.
- All validation failures MUST log a warning via `console.warn`.
- JSON Schema (2020-12) validation will be integrated in a future step for strict contract enforcement.

This ensures that storage acts as a safe, fault-tolerant boundary and cannot corrupt runtime state.

This contract is implemented in `src/adapters/io/storage-adapter.js` and defines a strict trust boundary between external storage and the ECS runtime state.

---

#### C-06: Audio Adapter Implementation — ✅ Complete (adapter); runtime wiring via Track A handoff
**Priority**: Critical
**Phase**: P2 Playable MVP
**Depends On**: `A-01` (scaffolding), `D-01` (constants resource), `A-11` (audit gate, non-blocking)
**Impacts**: Runtime audio boundary, fallback resilience, async decode baseline (`AUDIT-B-05`)
**Blocks**: C-07, C-08, C-09

**Status**: Adapter contract delivered under Track C ownership. Runtime registration (bootstrap slot, manifest module, level-load preload, app-boundary construction) is out of Track C scope per `scripts/policy-gate/lib/policy-utils.mjs`, and is delivered by a separate Track A integration PR (`ekaramet/integration-track-C-audio-wiring`) — same pattern as the C-04 / C-05 / B-03 runtime-integration handoffs already on record.

**Deliverables (Track C, this ticket)**:
- `src/adapters/io/audio-adapter.js` — AudioContext, `decodeAudioData`, `playSfx` / `playMusic`, master/music/sfx/ui gain graph, BufferSource-per-playback, `visibilitychange` handling, missing-clip fallback. Framework-agnostic factory (`createAudioAdapter(options)`) with injectable `windowTarget` / `documentTarget` / `audioContextCtor` / `fetchImpl` for tests.
- `tests/integration/adapters/audio-adapter.test.js` — 30 deterministic tests (placed under `tests/integration/adapters/` per Track C ownership glob `tests/integration/adapters/audio-*.test.js`).

**Deliverables (Track A handoff PR, follow-up)**:
- `src/ecs/resources/audio-manifest.js` — canonical `AUDIO_CUE.*` IDs (`pellet`, `bomb`, `powerup`, `game-over`, `level-theme`), `AUDIO_CATEGORY` constants, `DEFAULT_AUDIO_MANIFEST`, `GAMEPLAY_CRITICAL_SFX`, `buildAudioManifest`, `pickSfxManifest`.
- `src/game/bootstrap.js` — pre-registered `'audio'` World resource slot, `setAudioAdapter` / `getAudioAdapter` accessors, deduped critical-SFX preload from `onLevelLoaded` / late adapter registration.
- `src/main.ecs.js` — `createAudioAdapter(...)` constructed at the app boundary inside a `try / catch`; init failure logs `console.warn` and leaves the slot `null` without crashing the game loop. `runtime.stop()` clears the slot via `bootstrap.setAudioAdapter(null)`.

- [x] Implement `adapters/io/audio-adapter.js`:
  - `AudioContext` is constructed lazily on the first `pointerdown`/`keydown` and resumed in line with the browser autoplay policy. Unlock listeners self-detach via `{ once: true }`.
  - `loadClips(manifest)` runs `fetch → arrayBuffer → decodeAudioData` per cue and stores decoded `AudioBuffer`s in internal `Map`s (sfx/music) so repeat playbacks reuse the cached buffer.
  - `playSfx(cueId)` and `playMusic(trackId)` map cue IDs to decoded buffers; each playback allocates a fresh `AudioBufferSourceNode` because Web Audio forbids restarting a source — this is also how overlapping SFX works.
  - `setVolume(category, value)` updates per-category gain (master, music, sfx, ui) and clamps to `[0, 1]`. Volumes set before the context exists are honored once gain nodes are created.
  - `suspend()` / `resume()` forward to the underlying context; `stopMusic()` halts the active music source idempotently; `destroy()` tears down listeners, stops playback, clears Maps, and closes the context.
- [x] Missing clips warn-and-no-op: `console.warn` once per cue ID, return `null`, never throw. Failed `fetch` / `decodeAudioData` are reported in the `loadClips` result without escaping.
- [x] Adapter docstring locks the World resource contract: ECS systems MUST consume the adapter via `world.getResource('audio')` and MUST NOT `import` the adapter module. The runtime registration that wires this contract live (bootstrap `setAudioAdapter`) lands in the Track A integration handoff PR.
- [x] `document.visibilitychange` suspends the running context when the tab is hidden and resumes it when visible — battery and tab-throttle friendly.
- [x] Verification gate: `tests/integration/adapters/audio-adapter.test.js` (30 tests, fully deterministic) covers async decode flow, buffer caching, independent BufferSource per playback, overlapping SFX, missing-clip warn/no-op, visibilitychange lifecycle, category gain updates, music replacement, and failed-fetch/decode resilience.

**Out of scope for C-06 (covered by later tickets)**:
- Wiring gameplay events (BombPlaced, PelletCollected, …) to `playSfx` calls and music state across `GAME_STATE` transitions — `C-07`.
- Producing the actual `.mp3`/`.ogg` asset files — `C-08`.
- Lazy/streaming load policy for non-critical audio + perf budgets — `C-09`.
- Audio manifest JSON Schema + manifest file under `assets/manifests/` — `C-10`.

---

#### C-07: Audio Cue Mapping & Runtime Integration
**Priority**: Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `C-06` (audio adapter), `B-09` (event hooks), `A-12` (P2 consolidated audit gate)
**Impacts**: Event-driven audio feedback loop across gameplay states and menus
**Blocks**: A-08

**Deliverables**:
- Audio cue mapping table (event type → manifest audio ID)
- Cue consumption system in audio adapter
- Music state management across game states

- [x] Define audio cue mapping table from gameplay event types to manifest audio IDs:
  - `BombPlaced` → `sfx-bomb-place`
  - `BombDetonated` → `sfx-bomb-explode`
  - `PelletCollected` → `sfx-pellet-collect`
  - `PowerPelletCollected` → `sfx-power-pellet-collect`
  - `PowerUpCollected` → `sfx-powerup-collect`
  - `LifeLost` → `sfx-player-hit`
  - `GhostDefeated` → `sfx-ghost-kill`
  - `GhostStunned` → `sfx-ghost-stun`
  - `LevelCleared` → `sfx-level-complete`
  - `GameOver` → `sfx-game-over`
  - `Victory` → `sfx-victory`
- [x] Implement cue consumption in audio adapter: read event queue each frame and trigger corresponding audio.
- [x] Handle overlapping SFX (multiple pellets, chain explosions) without clipping.
- [x] Ensure music stops/changes appropriately across game states (MENU, PLAYING, PAUSED, GAME_OVER, VICTORY).
- [x] Verification gate: integration tests validate every event→audio mapping fires correctly.

**Track A integration handoff** (out of Track C ownership scope, mirrors the
C-04 / C-05 / B-03 / C-06 handoff pattern):

- File: `src/adapters/io/audio-integration.js` ships the cue mapping table,
  the music-state table, and the `createAudioCueRunner({ warnUnknownEvents })`
  driver. Public surface: `AUDIO_CUE_MAPPING`, `MUSIC_STATE_MAPPING`,
  `resolveCueForEvent`, `resolveMusicForState`, `createAudioCueRunner`.
- The runner exposes a single `tick({ audio, eventQueue, gameStatus })`
  method. It never imports the world, the audio adapter module, or the
  event queue module directly — all collaborators are injected per tick.
- Track A wires the runner with a thin system wrapper whose `update()`
  resolves world resources and forwards to the runner. The wrapper adds
  no audio logic; it is pure plumbing so the Track C-owned cue table
  remains the only place audio behavior is described:

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

- Phase: `render`. Audio is a downstream feedback channel — running after
  `logic` (where collision / scoring / life / level-progress systems emit
  the events the runner consumes) guarantees the cue heard in frame N
  corresponds to the simulation of frame N. Placing it under `render`
  also matches the existing convention that observable side effects (DOM,
  HUD, audio) live outside the simulation phases.
- Ordering within `render`: the runner can run before or after
  `render-dom-system` — the only hard requirement is that it runs after
  every logic-phase system that calls `emitGameplayEvent(...)`. Track A
  should append the wrapper at the end of the `render` registration list
  so future audio-emitting render systems remain free to enqueue cues.
- Asset note: the cue ids in `AUDIO_CUE_MAPPING` are forward references
  to assets delivered by `C-08`. Until C-08 lands, the C-06 adapter
  warns once per missing cue and no-ops, so the runtime is unaffected.

---

#### C-08: Sound Effects & Music Production
**Priority**: Critical
**Phase**: P4 Polish and Validation
**Depends On**: `C-06` (audio adapter), `A-13` (P3 consolidated audit gate)
**Impacts**: Gameplay feel, action clarity, overall production quality (`AUDIT-B-06`)
**Blocks**: C-09, C-10

**Deliverables**:
- `assets/generated/sfx/*.mp3` — all gameplay and UI SFX
- `assets/generated/music/*.mp3` — at least one loop-safe level music track
- `assets/source/audio/` — source project files

- [ ] Create/export gameplay SFX set:
  - Bomb place, fuse ticking (loopable), explode, chain reaction, wall destroy.
  - Pellet collect, power pellet collect, power-up collect.
  - Speed boost activate/deactivate. Ghost stun, ghost kill, ghost return.
  - Player death, player respawn, player hit.
- [ ] Create/export UI SFX set:
  - Menu navigate, confirm, cancel. Pause open/close.
  - Level complete jingle. Game over sting. Victory fanfare.
- [ ] Create/export at least one loop-safe level music track (60-120s loop, crossfade handling).
- [ ] Normalize loudness across categories (gameplay, UI, music).
- [ ] Export in `.mp3` (primary) and `.ogg` (optional).
- [ ] Keep SFX short (<1s for most, except fuse tick loop).
- [ ] Verification gate: all SFX/music listed in manifest with correct metadata.

---

#### C-09: Audio Preloading & Performance
**Priority**: Medium
**Phase**: P4 Polish and Validation
**Depends On**: `C-06`, `C-08`, `A-13` (P3 consolidated audit gate)
**Impacts**: Async performance measurement and startup responsiveness (`AUDIT-B-05`)
**Blocks**: A-09

**Deliverables**:
- Preloading strategy implementation in audio adapter
- Loading state display for slow decode
- Performance timing evidence artifact

- [ ] Implement preloading strategy during level load:
  - Decode all gameplay-critical SFX asynchronously using `decodeAudioData()`.
  - Show loading state if decode takes > 200ms.
  - Cache decoded buffers for reuse across levels.
- [ ] Implement lazy loading for non-critical audio (music, ambience).
- [ ] Audio decode MUST NOT block the main thread or game loop startup.
- [ ] Verification gate: evidence artifact shows async decode timing and no main-thread blocking.

---

#### C-10: Audio Manifest Schema & Validation
**Priority**: Critical
**Phase**: P4 Polish and Validation
**Depends On**: `C-08`, `A-07` (CI schema gates), `A-13` (P3 consolidated audit gate)
**Impacts**: CI asset governance and contract consistency
**Blocks**: None

**Deliverables**:
- `docs/schemas/audio-manifest.schema.json` (JSON Schema 2020-12)
- `assets/manifests/audio-manifest.json` — all audio asset entries

- [ ] Finalize `docs/schemas/audio-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `category` (sfx|music|ambience|ui), `format`, `durationMs`, `critical`, `loop`.
  - Optional fields: `channels`, `sampleRateHz`, `loudnessLufs`, `maxBytes`, `notes`.
- [ ] Create `assets/manifests/audio-manifest.json` with all audio asset entries.
- [ ] Wire manifest schema validation into CI (fails on invalid entries).
- [ ] Verification gate: CI rejects invalid manifest entries; valid entries pass.

---
