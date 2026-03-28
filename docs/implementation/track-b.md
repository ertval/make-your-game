# 🎮 Track B — Physics, Input, Gameplay Logic & Rules (Dev 2)

📎 Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: All ECS components, ALL gameplay systems (input, movement, collision, bombs, explosions, ghost AI, scoring, timer, lives, pause, progression, power-ups), and gameplay event hooks. Pure ECS simulation — no DOM, no audio, no visuals.  
> **Estimate**: ~24 hours

#### B-1: ECS Components (All Data Definitions)
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Covers**: ECS data layer for all gameplay entities (`game-description.md` §2-§5)

- [ ] Implement `src/ecs/components/spatial.js`:
  - `position` (row, col, prevRow, prevCol, targetRow, targetCol) — SoA Float64Array.
  - `velocity` (direction vector, speed multiplier).
  - `collider` (type enum: player, ghost, bomb, fire, pellet, powerup, wall).
- [ ] Implement `src/ecs/components/actors.js`:
  - `player` (lives, maxBombs, fireRadius, invincibilityMs, speedBoostMs, isSpeedBoosted).
  - `ghost` (type: blinky/pinky/inky/clyde, state: normal/stunned/dead, timerMs, speed).
  - `input-state` (up, down, left, right, bomb, pause — snapshot per fixed step).
- [ ] Implement `src/ecs/components/props.js`:
  - `bomb` (fuseMs, radius, ownerId, row, col).
  - `fire` (burnTimerMs, row, col).
  - `power-up` (type: powerPellet/bombPlus/firePlus/speedBoost).
  - `pellet` (isPowerPellet flag).
- [ ] Implement `src/ecs/components/stats.js`:
  - `score` (total points, combo counter).
  - `timer` (remainingMs, levelDurationMs).
  - `health` (lives remaining, invincibility state).
- [ ] Implement `src/ecs/components/visual.js`:
  - `renderable` (kind: player/ghost/bomb/fire/pellet/wall/powerup, spriteId).
  - `visual-state` (classBits bitmask: STUNNED=1, INVINCIBLE=2, HIDDEN=4, DEAD=8, SPEED_BOOST=16).
- [ ] Ensure component fields cover all gameplay described in `game-description.md` §2-§8.
- [ ] Verification gate: unit tests assert defaults, shape integrity, and component-mask registration.

#### B-2: Input Adapter & Input System
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `requirements.md` (hold-to-move, no spam); `audit.md` F-11, F-12; `game-description.md` §3.1

- [ ] Implement `adapters/io/input-adapter.js`: Captures `keydown`/`keyup` securely mapping into an intent buffer. No OS key repeat reliance.
- [ ] Ensure held-key state clears on `blur`/`visibilitychange` to prevent stuck movement after focus loss.
- [ ] Implement `ecs/systems/input-system.js`: Reads adapter, writes into the `input-state` component attached to the Player entity within the frame logic.
- [ ] Snapshot input state once per fixed simulation step and consume immutable snapshots in gameplay systems.
- [ ] Use canonical bindings: Arrow keys movement, `Space` bomb, `Escape`/`P` pause toggle.
- [ ] Handle `Enter` key for menu navigation, Start Game, Next Level, and Play Again confirmations.
- [ ] Verification gate: tests cover hold-to-move behavior, focus-loss clearing, and no dependency on OS key-repeat.

#### B-3: Movement & Grid Collision System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Covers**: `game-description.md` §3.1 (grid movement, wall blocking, smooth translation)

- [ ] Implement `player-move-system.js`: Queries the grid from `map-resource` based on Position vs Velocity intentions. Ensures smooth sub-cell locking and prevents walking through walls.
- [ ] Works using ECS state-machine variables. Updates TargetRow/Col.
- [ ] Enforce no diagonal drift and deterministic motion under variable render FPS.
- [ ] Handle speed boost multiplier (`1.5x`) when player has active speed boost.
- [ ] Verification gate: unit tests for blocked movement, path continuity, and interpolation correctness.

#### B-4: Bomb & Explosion Systems
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Covers**: `game-description.md` §4 (bomb placement, explosion mechanics, chain reactions)

- [ ] Implement `bomb-tick-system.js`: Decrements fuse, validates explosion radius against `map-resource`.
- [ ] Implement `explosion-system.js`: Translates detonated bombs into Fire entities mapping over map resources (destructible wall clears). Chain reactions use an **iterative detonation queue** (NOT recursive) with `MAX_CHAIN_DEPTH = 10`.
- [ ] Enforce one-bomb-per-cell placement, `3000ms` fuse, `500ms` fire lifetime, cross-pattern propagation, and wall-stop rules.
- [ ] Enforce strict pellet pass-through mechanics (pellets are NEVER destroyed by fire).
- [ ] Enforce power-up destruction (power-ups ARE destroyed by fire without being collected).
- [ ] Apply combo explosion multipliers logic (`200 * 2^(n-1)` for `n` ghosts killed in one chain).
- [ ] Verification gate: unit tests for explosion geometry, chain determinism, pellet immunity, and wall blocking.

#### B-5: Entity Collision System
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `game-description.md` §3.3, §4.2, §5.2 (all collision interactions)

- [ ] Implement `collision-system.js` using a **cell-occupancy map** for O(1) spatial lookups:
  - Fire vs Player → damage/death intent.
  - Fire vs Ghost → ghost death intent.
  - Player vs Ghost (normal) → Player death intent. **Ghosts cannot be killed by touch**.
  - Player vs Ghost (stunned) → harmless contact (no damage).
  - Player vs Pellet → mark for collection (+10 points).
  - Player vs Power Pellet → mark for collection (+50 points, stun all ghosts).
  - Player vs Power-up → mark for collection (+100 points, apply effect).
- [ ] Include bomb-cell occupancy constraints and ghost push-back when bomb dropped on shared cell.
- [ ] Verification gate: integration tests cover all listed collision permutations.

#### B-6: Ghost AI System & Spawning
**Priority**: 🔴 Critical  
**Estimate**: 5 hours  
**Covers**: `game-description.md` §5 (all ghost types, states, spawning, movement rules)

- [ ] Implement `ghost-ai-system.js` with 4 distinct personalities:
  - **Blinky** (Red): Targets direction closest to player at intersections.
  - **Pinky** (Pink): Predicts player's heading and attempts to cut them off.
  - **Inky** (Cyan): Semi-random influenced by both Blinky and player positions.
  - **Clyde** (Orange): Fully random wildcard at intersections.
- [ ] Implement ghost state machine: Normal → Stunned (on Power Pellet) → Dead (on bomb kill) → respawn.
  - **Normal**: Patrols maze, lethal on contact.
  - **Stunned**: Blue, slow, flees from player for `5000ms`. Harmless. Kill by bomb = 400pts.
  - **Dead**: Eyes-only return to ghost house, respawn after delay.
- [ ] Enforce "no reversing" unless Power Pellet triggers flee mode.
- [ ] Ghosts cannot pass through indestructible walls or active bombs.
- [ ] Implement `spawn-system.js`: Staggered ghost-house release timing per level (2/3/4 ghosts). Death-return respawn.
- [ ] Use zero-allocation heuristics (pre-compute direction scores in-place, no temporary arrays).
- [ ] **Worker offload gate**: Do NOT add a Web Worker unless profiling shows ghost pathfinding exceeds 4 ms per frame.
- [ ] Verification gate: seeded determinism tests produce identical ghost movement traces.

#### B-7: Scoring, Timer & Life Systems
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Covers**: `game-description.md` §6, §7, §3.3 (all scoring values, timer, lives)

- [ ] Implement `scoring-system.js` with exact canonical values:
  - Pellet: +10, Power Pellet: +50, Ghost kill (normal): +200, Ghost kill (stunned): +400.
  - Chain multiplier: `200 * 2^(n-1)` per ghost. Power-up pickup: +100.
  - Level clear: +1000 + (remainingSeconds × 10).
- [ ] Implement `timer-system.js`: countdown per level (120s/180s/240s). Timer hits zero → GAME_OVER.
- [ ] Implement `life-system.js`: 3 starting lives, decrement on death, respawn with 2000ms invincibility. Zero lives → GAME_OVER.
- [ ] Verification gate: unit tests match every value in `game-description.md` §6.

#### B-8: Power-Up System
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Covers**: `game-description.md` §2 (all 4 collectibles), §5.3 (stun mechanics)

- [ ] Implement `power-up-system.js` processing collection intents from collision system:
  1. **Power Pellet (`⚡`)**: Stuns all ghosts for `5000ms`. Non-stacking (resets timer).
  2. **Bomb Power-Up (`💣+`)**: Increments `maxBombs` by 1.
  3. **Fire Power-Up (`🔥+`)**: Increments `fireRadius` by 1.
  4. **Speed Boost (`👟`)**: Applies `1.5x` speed multiplier for `10000ms`. Non-stacking (resets timer). Visual trail/tint indicator.
- [ ] Manage parallel countdown timers for stun and speed boost expiry.
- [ ] Verification gate: unit/integration tests cover stun, speed boost, bomb+, fire+ effects and exact durations.

#### B-9: Pause & Level Progression Systems
**Priority**: 🔴 Critical  
**Estimate**: 2 hours  
**Covers**: `audit.md` F-07..F-10; `game-description.md` §8, §10 (pause menu, level progression)

- [ ] Implement `pause-system.js`: Freezes simulation timer while `rAF` continues. Fuse timers, invincibility, and stun timers all freeze.
- [ ] Implement `level-progress-system.js` and `src/game/level-loader.js`:
  - All pellets eaten → `LEVEL_COMPLETE` state with stats screen.
  - Level Complete → load next level map or `VICTORY` after level 3.
  - `GAME_OVER` on timer expiry or zero lives.
- [ ] Enforce FSM: `MENU → PLAYING ↔ PAUSED → LEVEL_COMPLETE → VICTORY` or `GAME_OVER`.
- [ ] Pause Continue: resumes exact prior simulation state.
- [ ] Pause Restart: resets current level, preserves cumulative score from previous levels.
- [ ] Verification gate: e2e pause open/continue/restart tests pass with keyboard-only flow.

#### B-10: Gameplay Event Hooks
**Priority**: 🟡 Medium  
**Estimate**: 1 hour  
**Covers**: Cross-system communication contract for audio/visual cues

- [ ] Define deterministic event payloads: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`.
- [ ] Include `frame` and monotonic `order` fields for deterministic ordering.
- [ ] Ensure collision, explosion, and scoring systems emit stable, ordered events.
- [ ] Verification gate: repeated seeded runs produce identical event order and payload schema.

---

