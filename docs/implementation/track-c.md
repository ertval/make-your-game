# ��� Track C — Scoring, Game Flow UI, Audio & Runtime Feedback (Dev 3)

��� Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Scoring/timer/lives systems, spawn timing, pause/progression gameplay flow systems, HUD and screen overlay adapters, storage adapter, audio adapter, audio cue mapping, SFX/music production, and audio manifest governance. Dev 3 owns the player-facing runtime feedback loop across gameplay state, UI feedback, and sound. Track C may modify tests that map to Track C-owned implementation files; Track A retains global testing ownership.
> **Execution model**: Deliver scoring/lives/timer + gameplay flow UI for MVP, then layer audio integration and polish.

## Phase Order (Prototype-First)

- **P1 Visual Prototype**: No new Track C tickets
- **P2 Playable MVP**: `C-01` to `C-06`
- **P3 Feature Complete + Hardening**: `C-07`
- **P4 Polish and Validation**: `C-08` to `C-10`

---

#### C-01: Scoring System
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `B-04` (collision intents), `C-02` (timer/lives), `D-01` (event-queue resource)
**Impacts**: HUD-critical score metric (`AUDIT-F-15`)
**Blocks**: A-08, B-09

**Deliverables**:
- `src/ecs/systems/scoring-system.js` — canonical scoring values, combo logic

- [ ] Implement `scoring-system.js` with exact canonical values:
  - Pellet: +10, Power Pellet: +50, Ghost kill (normal): +200, Ghost kill (stunned): +400.
  - Chain multiplier: `200 * 2^(n-1)` per ghost. Power-up pickup: +100. Retain full authority over all pointing and combo logic here in C-01.
  - Level clear: +1000 + (remainingSeconds × 10).
- [ ] Consume collision intents and explosion events to award points.
- [ ] Verification gate: unit tests match every value in `game-description.md` §6.

---

#### C-02: Timer & Life Systems
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (clock/constants resources), `B-04` (collision intents for death)
**Impacts**: HUD-critical timer and lives metrics (`AUDIT-F-14`, `AUDIT-F-16`)
**Blocks**: A-05, A-08, B-09, C-04, C-05

**Deliverables**:
- `src/ecs/systems/timer-system.js` — level countdown, time-up → GAME_OVER
- `src/ecs/systems/life-system.js` — 3 starting lives, decrement, respawn, invincibility, zero → GAME_OVER

- [ ] Implement `timer-system.js`: countdown per level (120s/180s/240s). Timer hits zero → GAME_OVER.
- [ ] Implement `life-system.js`: 3 starting lives, decrement on death, respawn with 2000ms invincibility. Zero lives → GAME_OVER.
- [ ] Verification gate: unit tests cover countdown, time-up game over, respawn invincibility, and zero-lives game over.

---

#### C-03: Spawn System
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (constants/clock), `D-03` (map resource — ghost spawn points)
**Impacts**: Ghost stagger timing and death-return respawn
**Blocks**: A-08, B-08

**Deliverables**:
- `src/ecs/systems/spawn-system.js` — staggered ghost-house release, death-return respawn timing

- [ ] Implement `spawn-system.js`: Apply absolute staggered ghost-house release timings per `game-description.md` §5.4 (0s, 5s, 10s, 15s).
- [ ] Enforce per-level active ghost caps from map data (`2/3/4`) with deterministic FIFO release order when a slot opens.
- [ ] Death-return respawn is 5 seconds.
- [ ] Verification gate: unit tests validate stagger timing and respawn delay.

---

#### C-04: Pause & Level Progression Systems
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-01` (clock/game-status), `D-03` (map resource), `C-02` (timer/lives), `A-03` (game loop)
**Impacts**: Pause menu behavior and level/game state transitions (`AUDIT-F-07..F-10`)
**Blocks**: A-05, A-06, A-08, C-05

**Deliverables**:
- `src/ecs/systems/pause-system.js` — freeze simulation while rAF continues
- `src/ecs/systems/level-progress-system.js` — pellet tracking, level transitions, victory/game-over

- [ ] Implement `pause-system.js`: Freezes simulation timer while `rAF` continues. Fuse timers, invincibility, and stun timers all freeze.
- [ ] Implement `level-progress-system.js`:
  - All pellets eaten → `LEVEL_COMPLETE` state with stats screen.
  - Level Complete → load next level map or `VICTORY` after level 3.
  - `GAME_OVER` on timer expiry or zero lives.
- [ ] Enforce FSM: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Pause Continue: resumes exact prior simulation state.
- [ ] Pause Restart: resets current level, preserves cumulative score from previous levels.
- [ ] Verification gate: e2e pause open/continue/restart tests pass with keyboard-only flow.

---

#### C-05: HUD Adapter & Screen Overlays
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `D-05` (CSS layout), `C-02` (timer/lives data), `C-04` (pause/progression states)
**Impacts**: Visible gameplay metrics (`AUDIT-F-14..F-16`), pause/start/restart UX (`AUDIT-F-07..F-09`)
**Blocks**: A-05, A-06, A-08, D-11

**Deliverables**:
- `src/adapters/dom/hud-adapter.js` — textContent updates for lives, score, timer, bomb count, fire radius, level number
- `src/adapters/dom/screens-adapter.js` — start screen, pause menu, level complete, game over, victory overlays
- `src/adapters/io/storage-adapter.js` — high score localStorage with untrusted data validation

- [ ] Implement `hud-adapter.js`:
  - Binds text nodes natively with `.textContent` to update: lives (heart icons), score (5-digit), timer (M:SS), bomb count, fire radius, level number.
  - Uses throttled `aria-live` updates for accessibility (not per-frame spam).
- [ ] Implement `screens-adapter.js` with fully distinct game state screens:
  - **Start Screen** (`game-description.md` §9.5): Title, Start Game button, High Scores display, control instructions. `Enter` to start.
  - **Pause Menu** (`game-description.md` §10): Continue and Restart options. Arrow keys to select, `Enter` to confirm.
  - **Level Complete Screen** (`game-description.md` §8): Level stats. `Enter` for next level.
  - **Game Over Screen** (`game-description.md` §11): Final score, Play Again button.
  - **Victory Screen** (`game-description.md` §11): Final score, ghosts killed, total time, Play Again button.
- [ ] Implement keyboard focus transfer: Arrow keys for menu navigation, Enter for confirm. Focus enters overlay on open, restores to gameplay on close.
- [ ] Implement `adapters/io/storage-adapter.js`: High score saving/reading from `localStorage` with untrusted data validation on read.
- [ ] Verification gate: adapter tests confirm HUD metrics update correctly via safe sinks; e2e tests confirm keyboard-only navigation across all screens.

---

#### C-06: Audio Adapter Implementation
**Priority**: ��� Critical
**Phase**: P2 Playable MVP
**Depends On**: `A-01` (scaffolding), `D-01` (constants resource)
**Impacts**: Runtime audio boundary, fallback resilience, async decode baseline (`AUDIT-B-05`)
**Blocks**: C-07, C-08, C-09

**Deliverables**:
- `src/adapters/io/audio-adapter.js` — AudioContext, decodeAudioData, playSfx/playMusic, volume control, visibility handling

- [ ] Implement `adapters/io/audio-adapter.js`:
  - `AudioContext` initialization on first user interaction (browser autoplay policy).
  - Pre-decode gameplay-critical SFX using `AudioContext.decodeAudioData()` during level load.
  - Provide `playSfx(cueId)` and `playMusic(trackId)` methods that map to decoded buffers.
  - Support volume control per category (SFX, music, UI).
  - Support simultaneous SFX playback (bomb + pellet collect can overlap).
- [ ] Provide fallback behavior for missing clips: `console.warn` and continue without breaking the game loop.
- [ ] Register adapter as a World resource (never imported directly by systems).
- [ ] Handle `visibilitychange` to suspend/resume AudioContext for battery and tab-throttle.
- [ ] Verification gate: adapter tests validate async decode path, playback, and fallback behavior.

---

#### C-07: Audio Cue Mapping & Runtime Integration
**Priority**: ��� Critical
**Phase**: P3 Feature Complete + Hardening
**Depends On**: `C-06` (audio adapter), `B-09` (event hooks)
**Impacts**: Event-driven audio feedback loop across gameplay states and menus
**Blocks**: A-08

**Deliverables**:
- Audio cue mapping table (event type → manifest audio ID)
- Cue consumption system in audio adapter
- Music state management across game states

- [ ] Define audio cue mapping table from gameplay event types to manifest audio IDs:
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
- [ ] Implement cue consumption in audio adapter: read event queue each frame and trigger corresponding audio.
- [ ] Handle overlapping SFX (multiple pellets, chain explosions) without clipping.
- [ ] Ensure music stops/changes appropriately across game states (MENU, PLAYING, PAUSED, GAME_OVER, VICTORY).
- [ ] Verification gate: integration tests validate every event→audio mapping fires correctly.

---

#### C-08: Sound Effects & Music Production
**Priority**: ��� Critical
**Phase**: P4 Polish and Validation
**Depends On**: `C-06` (audio adapter)
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
**Priority**: ��� Medium
**Phase**: P4 Polish and Validation
**Depends On**: `C-06`, `C-08`
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
**Priority**: ��� Critical
**Phase**: P4 Polish and Validation
**Depends On**: `C-08`, `A-07` (CI schema gates)
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
