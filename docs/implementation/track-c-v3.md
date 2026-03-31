# 🎧 Track C — Ghost AI, Scoring, Audio & Game Events (Dev 3)

📎 Source plan: `docs/implementation/implementation-plan-v3.md` (Section 3)

> **Scope**: Ghost AI & spawning, scoring/timer/lives systems, gameplay event hooks, audio adapter, audio cue mapping, SFX/music production, audio manifest. Dev 3 owns the "game feel" — the systems that make gameplay responsive and rewarding.  
> **Estimate**: ~28 hours (10 tickets)  
> **Execution model**: Deliver scoring/timer/lives for MVP, then layer ghost AI and audio integration.

## Phase Order (MVP First)

- **P1 Playable MVP**: `C3-01` to `C3-03`
- **P2 Feature Complete**: `C3-04` to `C3-07`
- **P3 Polish and Validation**: `C3-08` to `C3-10`

---

#### C3-01: Scoring System
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `B3-04` (collision intents), `D3-01` (event-queue resource)  
**Impacts**: HUD-critical score metric (`AUDIT-F-15`)

**Deliverables**:
- `src/ecs/systems/scoring-system.js` — canonical scoring values, combo logic

**Blocks**:
- C3-03 (same track — lives/timer depend on scoring being established)

- [ ] Implement `scoring-system.js` with exact canonical values:
  - Pellet: +10, Power Pellet: +50, Ghost kill (normal): +200, Ghost kill (stunned): +400.
  - Chain multiplier: `200 * 2^(n-1)` per ghost. Power-up pickup: +100.
  - Level clear: +1000 + (remainingSeconds × 10).
- [ ] Consume collision intents and explosion events to award points.
- [ ] Verification gate: unit tests match every value in `game-description.md` §6.

---

#### C3-02: Timer & Life Systems
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-01` (clock/constants resources), `B3-04` (collision intents for death)  
**Impacts**: HUD-critical timer and lives metrics (`AUDIT-F-14`, `AUDIT-F-16`)

**Deliverables**:
- `src/ecs/systems/timer-system.js` — level countdown, time-up → GAME_OVER
- `src/ecs/systems/life-system.js` — 3 starting lives, decrement, respawn, invincibility, zero → GAME_OVER

**Blocks**:
- C3-03 (same track)
- D3-09 (Track D — pause freezes timer/lives)

- [ ] Implement `timer-system.js`: countdown per level (120s/180s/240s). Timer hits zero → GAME_OVER.
- [ ] Implement `life-system.js`: 3 starting lives, decrement on death, respawn with 2000ms invincibility. Zero lives → GAME_OVER.
- [ ] Verification gate: unit tests cover countdown, time-up game over, respawn invincibility, and zero-lives game over.

---

#### C3-03: Spawn System
**Priority**: 🔴 Critical  
**Estimate**: 1 hour  
**Phase**: P1 Playable MVP  
**Depends On**: `D3-01` (constants/clock), `D3-03` (map resource — ghost spawn points)  
**Impacts**: Ghost stagger timing and death-return respawn

**Deliverables**:
- `src/ecs/systems/spawn-system.js` — staggered ghost-house release, death-return respawn timing

**Blocks**:
- C3-04 (same track — ghost AI needs spawned ghosts)

- [ ] Implement `spawn-system.js`: Apply absolute staggered ghost-house release timings per `game-description.md` §5.4 (0s, 5s, 10s, 15s).
- [ ] Death-return respawn is 5 seconds.
- [ ] Verification gate: unit tests validate stagger timing and respawn delay.

---

#### C3-04: Ghost AI System
**Priority**: 🔴 Critical  
**Estimate**: 5 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `B3-03` (movement/grid), `B3-04` (collision), `D3-01` (constants/rng), `D3-03` (map resource)  
**Impacts**: Difficulty curve and personality-driven enemy behavior (`AUDIT-F-13`)

**Deliverables**:
- `src/ecs/systems/ghost-ai-system.js` — Blinky/Pinky/Inky/Clyde targeting, state machine, pathfinding

**Blocks**:
- C3-06 (same track — events need ghost state changes)

- [ ] Implement `ghost-ai-system.js` with exact pathfinding math per `game-description.md` §5.1:
  - **Blinky**: Targets player current tile.
  - **Pinky**: Targets 4 spaces ahead of player.
  - **Inky**: Double-vector targeting based on Blinky+Player.
  - **Clyde**: Distance-based toggle (chase vs retreat to corner).
- [ ] Implement ghost state machine: Normal → Stunned (on Power Pellet) → Dead (on bomb kill) → respawn.
  - **Normal**: Patrols maze at level-specific speeds (4.0/4.5/5.0 tiles/sec).
  - **Stunned**: Slows to flat 2.0 tiles/sec, flees from player for `5000ms`. Harmless. Kill by bomb = 400pts.
  - **Dead**: Eyes-only return to ghost house, respawn after `5000ms` delay.
- [ ] Enforce "no reversing" unless Power Pellet triggers flee mode.
- [ ] Ghosts cannot pass through indestructible walls or active bombs.
- [ ] Use zero-allocation heuristics (pre-compute direction scores in-place, no temporary arrays).
- [ ] **Worker offload gate**: Do NOT add a Web Worker unless profiling shows ghost pathfinding exceeds 4 ms per frame.
- [ ] Verification gate: seeded determinism tests produce identical ghost movement traces.

---

#### C3-05: Audio Adapter Implementation
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `A3-01` (scaffolding), `D3-01` (constants resource)  
**Impacts**: Runtime audio boundary, fallback resilience, async decode baseline (`AUDIT-B-05`)

**Deliverables**:
- `src/adapters/io/audio-adapter.js` — AudioContext, decodeAudioData, playSfx/playMusic, volume control, visibility handling

**Blocks**:
- C3-07 (same track — cue mapping needs adapter)

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

#### C3-06: Gameplay Event Hooks
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `C3-01` (scoring), `C3-02` (timer/lives), `C3-04` (ghost AI), `D3-10` (bombs/explosions), `D3-01` (event-queue)  
**Impacts**: Deterministic integration surface for audio/visual cues

**Deliverables**:
- Finalized event payload definitions and emission points across all gameplay systems
- Event types: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`

**Blocks**:
- C3-07 (same track — cue mapping consumes events)

- [ ] Define deterministic event payloads: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`.
- [ ] Include `frame` and monotonic `order` fields for deterministic ordering.
- [ ] Ensure collision, explosion, and scoring systems emit stable, ordered events.
- [ ] Verification gate: repeated seeded runs produce identical event order and payload schema.

---

#### C3-07: Audio Cue Mapping & Runtime Integration
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `C3-05` (audio adapter), `C3-06` (event hooks)  
**Impacts**: Event-driven audio feedback loop across gameplay states and menus

**Deliverables**:
- Audio cue mapping table (event type → manifest audio ID)
- Cue consumption system in audio adapter
- Music state management across game states

**Blocks**:
- C3-08 (same track — audio production fills the mapped cue IDs)

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

#### C3-08: Sound Effects & Music Production
**Priority**: 🔴 Critical  
**Estimate**: 5 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `C3-05` (audio adapter)  
**Impacts**: Gameplay feel, action clarity, overall production quality (`AUDIT-B-06`)

**Deliverables**:
- `assets/generated/sfx/*.mp3` — all gameplay and UI SFX
- `assets/generated/music/*.mp3` — at least one loop-safe level music track
- `assets/source/audio/` — source project files

**Blocks**:
- C3-09 (same track — preloading needs assets)
- C3-10 (same track — manifest needs asset metadata)

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

#### C3-09: Audio Preloading & Performance
**Priority**: 🟡 Medium  
**Estimate**: 1 hour  
**Phase**: P3 Polish and Validation  
**Depends On**: `C3-05`, `C3-08`  
**Impacts**: Async performance measurement and startup responsiveness (`AUDIT-B-05`)

**Deliverables**:
- Preloading strategy implementation in audio adapter
- Loading state display for slow decode
- Performance timing evidence artifact

**Blocks**:
- None

- [ ] Implement preloading strategy during level load:
  - Decode all gameplay-critical SFX asynchronously using `decodeAudioData()`.
  - Show loading state if decode takes > 200ms.
  - Cache decoded buffers for reuse across levels.
- [ ] Implement lazy loading for non-critical audio (music, ambience).
- [ ] Audio decode MUST NOT block the main thread or game loop startup.
- [ ] Verification gate: evidence artifact shows async decode timing and no main-thread blocking.

---

#### C3-10: Audio Manifest Schema & Validation
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `C3-08`, `A3-07` (CI schema gates)  
**Impacts**: CI asset governance and contract consistency

**Deliverables**:
- `docs/schemas/audio-manifest.schema.json` (JSON Schema 2020-12)
- `assets/manifests/audio-manifest.json` — all audio asset entries

**Blocks**:
- None

- [ ] Finalize `docs/schemas/audio-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `category` (sfx|music|ambience|ui), `format`, `durationMs`, `critical`, `loop`.
  - Optional fields: `channels`, `sampleRateHz`, `loudnessLufs`, `maxBytes`, `notes`.
- [ ] Create `assets/manifests/audio-manifest.json` with all audio asset entries.
- [ ] Wire manifest schema validation into CI (fails on invalid entries).
- [ ] Verification gate: CI rejects invalid manifest entries; valid entries pass.

---
