# ��� Track B — Components, Input, Movement, Combat & AI Simulation (Dev 2)

��� Source plan: `docs/implementation/implementation-plan.md` (Section 3)

> **Scope**: All ECS component data definitions, input adapter/system, movement & grid collision, entity collision, bomb/explosion simulation, power-up effects, ghost AI behavior, and deterministic gameplay event emission from simulation systems. Pure ECS simulation — no DOM, no audio playback, no visual asset work. **Does NOT own** scoring/timer/lives, pause/progression UX, HUD/screens adapters, or visual rendering infrastructure.
> **Execution model**: Deliver the core physics pipeline first, then add combat depth, AI behavior, and final event-contract consolidation.

## Phase Order (MVP First)

- **P0 Foundation**: `B-01`
- **P1 Playable MVP**: `B-02` to `B-04`
- **P2 Feature Complete**: `B-05` to `B-09`

---

#### B-01: ECS Components (All Data Definitions)
**Priority**: ��� Critical
**Phase**: P0 Foundation
**Depends On**: `A-02` (world engine)
**Impacts**: Canonical gameplay data model, unblocks all simulation systems and render contracts
**Blocks**: A-08, B-02, B-03, B-04 || D-04

**Deliverables**:
- `src/ecs/components/spatial.js` — position (SoA Float64Array), velocity, collider
- `src/ecs/components/actors.js` — player, ghost, input-state
- `src/ecs/components/props.js` — bomb, fire, power-up, pellet
- `src/ecs/components/stats.js` — score, timer, health
- `src/ecs/components/visual.js` — renderable, visual-state (classBits bitmask)

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
  - `power-up` (type: bombPlus/firePlus/speedBoost).
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

---

#### B-02: Input Adapter & Input System
**Priority**: ��� Critical
**Phase**: P1 Playable MVP
**Depends On**: `B-01`, `A-03` (game loop), `D-01` (resources/constants)
**Impacts**: Keyboard control path and hold-to-move (`AUDIT-F-11`, `AUDIT-F-12`)
**Blocks**: A-08, B-03

**Deliverables**:
- `src/adapters/io/input-adapter.js` — keydown/keyup capture, blur clearing, no OS key-repeat dependency
- `src/ecs/systems/input-system.js` — reads adapter, writes input-state component per fixed step

- [ ] Implement `adapters/io/input-adapter.js`: Captures `keydown`/`keyup` securely mapping into an intent buffer. No OS key repeat reliance.
- [ ] Ensure held-key state clears on `blur`/`visibilitychange` to prevent stuck movement after focus loss.
- [ ] Implement `ecs/systems/input-system.js`: Reads adapter, writes into the `input-state` component attached to the Player entity within the frame logic.
- [ ] Snapshot input state once per fixed simulation step and consume immutable snapshots in gameplay systems.
- [ ] Use canonical bindings: Arrow keys movement, `Space` bomb, `Escape`/`P` pause toggle.
- [ ] Handle `Enter` key for menu navigation, Start Game, Next Level, and Play Again confirmations.
- [ ] Verification gate: tests cover hold-to-move behavior, focus-loss clearing, and no dependency on OS key-repeat.

---

#### B-03: Movement & Grid Collision System
**Priority**: ��� Critical
**Phase**: P1 Playable MVP
**Depends On**: `B-01`, `B-02`, `D-03` (map resource from Track D)
**Impacts**: Core controllable gameplay movement (`AUDIT-F-11`, `AUDIT-F-12`, `AUDIT-F-13`)
**Blocks**: A-05, A-08, B-04, B-06, B-08 || D-07

**Deliverables**:
- `src/ecs/systems/player-move-system.js` — grid-constrained player motion

- [ ] Implement `player-move-system.js`: Queries the grid from `map-resource` based on Position vs Velocity intentions. Ensures smooth sub-cell locking and prevents walking through walls.
- [ ] Works using ECS state-machine variables. Updates TargetRow/Col.
- [ ] Enforce no diagonal drift and deterministic motion under variable render FPS.
- [ ] Apply exact base speed from `game-description.md` §8 (Player = 5.0 tiles/sec).
- [ ] Handle speed boost multiplier (`1.5x`) when player has active speed boost.
- [ ] Verification gate: unit tests for blocked movement, path continuity, and interpolation correctness.

---

#### B-04: Entity Collision System
**Priority**: ��� Critical
**Phase**: P1 Playable MVP
**Depends On**: `B-01`, `B-03`, `D-03` (map resource)
**Impacts**: Player/ghost/pellet interaction correctness and life/score intents
**Blocks**: A-06, A-08, B-05, B-06, B-07, B-08 || C-01, C-02

**Deliverables**:
- `src/ecs/systems/collision-system.js` — cell-occupancy map, collision hierarchy, ghost house barrier

- [ ] Implement `collision-system.js` using a **cell-occupancy map** for O(1) spatial lookups:
  - **Mandatory Hierarchy**: `Invincibility > Fire > Ghost Contact`.
  - Fire vs Player → damage/death intent (unless Player `isInvincible`).
  - Fire vs Ghost → ghost death intent (Normal/Stunned ghosts).
  - Player vs Ghost (normal) → Player death intent (unless `isInvincible`).
  - Player vs Ghost (stunned) → harmless contact (no damage).
  - Player vs Pellet → mark for collection (+10 points).
  - Player vs Power Pellet → mark for collection (+50 points, stun all ghosts).
  - Player vs Power-up → mark for collection (+100 points, apply effect).
- [ ] Enforce **Ghost House Barrier** logic:
  - Ghosts can exit `G` tiles; only `Dead` (eyes-only) ghosts can enter.
  - Player is hard-blocked from entering any `G` tile.
- [ ] Include bomb-cell occupancy constraints and ghost push-back when bomb dropped on shared cell.
- [ ] Verification gate: integration tests cover all listed collision permutations.

---

#### B-05: Core Gameplay Event Surface
**Priority**: ��� Medium
**Phase**: P2 Feature Complete
**Depends On**: `B-04`, `D-01` (event-queue resource)
**Impacts**: Deterministic base event emission from collision/movement systems for scoring, audio, and visual consumers
**Blocks**: A-08, B-09

**Deliverables**:
- Updated `collision-system.js` and `player-move-system.js` to emit events via `event-queue` resource
- Event emission for: `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `PlayerGhostContact`

- [ ] Wire collision system to emit deterministic events via `event-queue` resource for each collision resolution.
- [ ] Wire movement system to emit position-change events when needed by consumers.
- [ ] Define and document payload schema for each emitted event (`type`, `frame`, `order`, `entityId`, `tile`, `sourceSystem`) and reject malformed payloads in development.
- [ ] Include `frame` and monotonic `order` fields for deterministic ordering.
- [ ] Ensure stable, ordered event emission from collision and movement systems.
- [ ] Verification gate: repeated seeded runs produce identical event order and payload schema from B systems.

---

#### B-06: Bomb & Explosion Systems
**Priority**: ��� Critical
**Phase**: P2 Feature Complete
**Depends On**: `B-03` (movement/grid), `B-04` (collision), `D-01` (constants/rng), `D-03` (map resource)
**Impacts**: Bomberman mechanics, chain reactions, combo rules (`AUDIT-F-13`, `AUDIT-B-03`)
**Blocks**: A-08, B-07, B-09

**Deliverables**:
- `src/ecs/systems/bomb-tick-system.js` — fuse countdown, detonation trigger
- `src/ecs/systems/explosion-system.js` — cross-pattern geometry, chain reactions, wall destruction, power-up drops

- [ ] Implement `bomb-tick-system.js`: Decrements fuse, validates explosion radius against `map-resource`.
- [ ] Implement `explosion-system.js`: Translates detonated bombs into Fire entities mapping over map resources (destructible wall clears). Chain reactions use an **iterative detonation queue** (NOT recursive) with `MAX_CHAIN_DEPTH = 10`.
- [ ] Enforce exact Power-Up drop rates when destructible walls are destroyed based on `game-description.md` §4.4 (85% empty, 5% bomb+, 5% fire+, 5% speed boost). Use seeded RNG generator for drop logic to retain determinism.
- [ ] Enforce one-bomb-per-cell placement, `3000ms` fuse, `500ms` fire lifetime, cross-pattern propagation, and wall-stop rules.
- [ ] Enforce strict pellet pass-through mechanics (pellets are NEVER destroyed by fire).
- [ ] Enforce power-up destruction (power-ups ARE destroyed by fire without being collected).
- [ ] Apply combo explosion multipliers logic (`200 * 2^(n-1)` for `n` ghosts killed in one chain).
- [ ] Verification gate: unit tests for explosion geometry, chain determinism, pellet immunity, and wall blocking.

---

#### B-07: Power-Up System
**Priority**: ��� Critical
**Phase**: P2 Feature Complete
**Depends On**: `B-04` (collision intents), `B-06` (explosions spawn power-ups), `D-01` (canonical duration constants)
**Impacts**: Power progression, stun windows, speed-state timing (`AUDIT-F-13`)
**Blocks**: A-08, B-08

**Deliverables**:
- `src/ecs/systems/power-up-system.js` — power pellet, bomb+, fire+, speed boost effects

- [ ] Implement `power-up-system.js` processing collection intents from collision system:
  1. **Power Pellet (`⚡`)**: Stuns all ghosts for `5000ms`. Non-stacking (resets timer).
  2. **Bomb Power-Up (`���+`)**: Increments `maxBombs` by 1.
  3. **Fire Power-Up (`���+`)**: Increments `fireRadius` by 1.
  4. **Speed Boost (`���`)**: Applies `1.5x` speed multiplier for `10000ms`. Non-stacking (resets timer). Visual trail/tint indicator.
- [ ] Manage parallel countdown timers for stun and speed boost expiry.
- [ ] Verification gate: unit/integration tests cover stun, speed boost, bomb+, fire+ effects and exact durations.

---

#### B-08: Ghost AI System
**Priority**: ��� Critical
**Phase**: P2 Feature Complete
**Depends On**: `B-03` (movement/grid), `B-04` (collision), `B-07` (stun/speed effect states), `D-01` (constants/rng), `D-03` (map resource), `C-03` (spawn timing)
**Impacts**: Difficulty curve and personality-driven enemy behavior (`AUDIT-F-13`)
**Blocks**: A-08, B-09

**Deliverables**:
- `src/ecs/systems/ghost-ai-system.js` — Blinky/Pinky/Inky/Clyde targeting, state machine, pathfinding

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

#### B-09: Cross-System Gameplay Event Hooks
**Priority**: ��� Medium
**Phase**: P2 Feature Complete
**Depends On**: `C-01` (scoring), `C-02` (timer/lives), `B-05` (event baseline), `B-06` (bombs/explosions), `B-08` (ghost AI), `D-01` (event-queue)
**Impacts**: Final deterministic integration surface for audio/visual cues
**Blocks**: A-08, C-07

**Deliverables**:
- Finalized event payload definitions and emission points across all gameplay systems
- Event types: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`

- [ ] Define deterministic event payloads: `BombPlaced`, `BombDetonated`, `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `LifeLost`, `GhostDefeated`, `GhostStunned`, `LevelCleared`, `GameOver`, `Victory`.
- [ ] Include `frame` and monotonic `order` fields for deterministic ordering.
- [ ] Ensure collision, explosion, ghost AI, and scoring systems emit stable, ordered events.
- [ ] Verification gate: repeated seeded runs produce identical event order and payload schema.

---
