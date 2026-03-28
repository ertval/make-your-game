# 🎧 Track C — Audio Production & Integration (Dev 3)

📎 Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: Everything audio — adapter implementation, SFX/music asset creation, audio manifest schema, cue mapping from gameplay events, preloading/decoding strategy, and runtime integration. Fully independent from visual work.  
> **Estimate**: ~22 hours  
> **Execution model**: Integrate minimal runtime audio hooks early, then complete production assets and performance hardening.

## Phase Order (MVP First)

- **P1 Playable MVP support**: `C-01`
- **P2 Feature Complete**: `C-02` to `C-04`
- **P3 Polish and Validation**: `C-05` to `C-07`

#### C-01: Audio Adapter Implementation
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P1 Playable MVP support  
**Depends On**: `A-01`, `A-03`  
**Impacts**: Runtime audio boundary, fallback resilience, async decode baseline

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

#### C-02: Audio Cue Mapping & Runtime Integration
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `C-01`, `B-10`  
**Impacts**: Event-driven feedback loop across gameplay states and menus

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

#### C-03: Gameplay Sound Effects Production
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `C-01`  
**Impacts**: Gameplay feel and action clarity during core loop

- [ ] Create/export gameplay SFX set:
  - Bomb place.
  - Bomb fuse ticking (loopable, ~3s duration).
  - Bomb explode.
  - Chain reaction explode (variant or layered).
  - Wall destroy.
  - Pellet collect (short, satisfying).
  - Power pellet collect (distinct, impactful).
  - Power-up collect (generic for bomb+/fire+/speed).
  - Speed boost activate (whoosh).
  - Speed boost deactivate.
  - Ghost stun (all ghosts turn blue).
  - Ghost kill (bomb hit ghost).
  - Ghost return to house.
  - Player death.
  - Player respawn.
  - Player hit (life lost).
- [ ] Normalize loudness across gameplay category.
- [ ] Export in `.mp3` (primary) and `.ogg` (optional).
- [ ] Keep SFX short (< 1s for most, except fuse tick loop).
- [ ] Verification gate: all gameplay SFX listed in manifest with correct metadata.

#### C-04: Audio Preloading & Performance
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `C-01`, `C-03`  
**Impacts**: Async performance evidence and startup responsiveness (`AUDIT-B-05`)

- [ ] Implement preloading strategy during level load:
  - Decode all gameplay-critical SFX asynchronously using `decodeAudioData()`.
  - Show loading state if decode takes > 200ms.
  - Cache decoded buffers for reuse across levels.
- [ ] Implement lazy loading for non-critical audio (music, ambience) — start decoding after critical SFX are ready.
- [ ] Audio decode MUST NOT block the main thread or game loop startup.
- [ ] Verification gate: evidence artifact shows async decode timing and no main-thread blocking.

#### C-05: Audio Manifest Schema & Validation
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `C-03`, `C-06`, `C-07`, `A-09`  
**Impacts**: CI asset governance and contract consistency

- [ ] Finalize `docs/schemas/audio-manifest.schema.json` (JSON Schema 2020-12):
  - Required fields: `id`, `path`, `category` (sfx|music|ambience|ui), `format`, `durationMs`, `critical`, `loop`.
  - Optional fields: `channels`, `sampleRateHz`, `loudnessLufs`, `maxBytes`, `notes`.
- [ ] Create `assets/manifests/audio-manifest.json` with all audio asset entries.
- [ ] Wire manifest schema validation into CI (fails on invalid entries).
- [ ] Verification gate: CI rejects invalid manifest entries; valid entries pass.

#### C-06: UI Sound Effects Production
**Priority**: 🟡 Medium  
**Estimate**: 4 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `C-01`, `C-02`  
**Impacts**: Menu/pause/screen feedback quality and UX polish

- [ ] Create/export UI SFX set:
  - Menu navigate (button hover/focus change).
  - Menu confirm (start game, continue, restart, play again).
  - Menu cancel (back/close).
  - Pause open.
  - Pause close (resume).
  - Level complete jingle.
  - Game over sting.
  - Victory fanfare.
- [ ] Normalize loudness across UI category.
- [ ] Export in `.mp3` (primary) and `.ogg` (optional higher-efficiency variant).
- [ ] Pre-trim all clips (no silence padding) for instant playback.
- [ ] Verification gate: all UI SFX listed in manifest with correct metadata.

#### C-07: Music Track Production
**Priority**: 🟡 Medium  
**Estimate**: 3 hours  
**Phase**: P3 Polish and Validation  
**Depends On**: `C-01`  
**Impacts**: Overall production quality and end-state experience (`AUDIT-B-06`)

- [ ] Create/export at least one loop-safe level music track:
  - Loop-safe edit points with crossfade handling (no seam artifacts).
  - Appropriate energy level for maze-chase gameplay.
  - Duration: 60-120s loop.
- [ ] Optional: Create an ambience loop for menus/overlays.
- [ ] Normalize loudness below gameplay SFX to avoid masking.
- [ ] Export in `.mp3` with optional `.ogg` variant.
- [ ] Record metadata fields (duration, sample rate, channels, loudness) in manifest.
- [ ] Verification gate: music plays loop-safe without audible seam; manifest metadata complete.

---