# 🎮 Track B — Components, Input & Core Movement (Dev 2)

📎 Source plan: `docs/implementation/implementation-plan-v3.md` (Section 3)

> **Scope**: All ECS component data definitions, input adapter/system, movement & grid collision, entity collision system. Pure ECS simulation — no DOM, no audio, no visuals. **Does NOT own** bombs, explosions, ghost AI, scoring, timer, lives, pause, progression, power-ups, or gameplay events — those distributed to Tracks C and D.  
> **Estimate**: ~16 hours (5 tickets)  
> **Execution model**: Deliver the core physics pipeline that everything else depends on.

## Phase Order (MVP First)

- **P0 Foundation**: `B3-01`
- **P1 Playable MVP**: `B3-02` to `B3-04`
- **P2 Feature Complete**: `B3-05`

---

#### B3-01: ECS Components (All Data Definitions)
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P0 Foundation  
**Depends On**: `A3-02` (world engine)  
**Impacts**: Canonical gameplay data model, unblocks all gameplay systems and render contracts

**Deliverables**:
- `src/ecs/components/spatial.js` — position (SoA Float64Array), velocity, collider
- `src/ecs/components/actors.js` — player, ghost, input-state
- `src/ecs/components/props.js` — bomb, fire, power-up, pellet
- `src/ecs/components/stats.js` — score, timer, health
- `src/ecs/components/visual.js` — renderable, visual-state (classBits bitmask)

**Blocks**:
- B3-02, B3-03, B3-04, B3-05 (same track)
- D3-04 (Track D — render data contracts need component definitions)
- C3-01 (Track C — scoring needs component shapes)

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

#### B3-02: Input Adapter & Input System
**Priority**: 🔴 Critical  
**Estimate**: 3 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `B3-01`, `A3-03` (game loop), `D3-01` (resources/constants)  
**Impacts**: Keyboard control path and hold-to-move (`AUDIT-F-11`, `AUDIT-F-12`)

**Deliverables**:
- `src/adapters/io/input-adapter.js` — keydown/keyup capture, blur clearing, no OS key-repeat dependency
- `src/ecs/systems/input-system.js` — reads adapter, writes input-state component per fixed step

**Blocks**:
- B3-03 (same track — movement reads input)

- [ ] Implement `adapters/io/input-adapter.js`: Captures `keydown`/`keyup` securely mapping into an intent buffer. No OS key repeat reliance.
- [ ] Ensure held-key state clears on `blur`/`visibilitychange` to prevent stuck movement after focus loss.
- [ ] Implement `ecs/systems/input-system.js`: Reads adapter, writes into the `input-state` component attached to the Player entity within the frame logic.
- [ ] Snapshot input state once per fixed simulation step and consume immutable snapshots in gameplay systems.
- [ ] Use canonical bindings: Arrow keys movement, `Space` bomb, `Escape`/`P` pause toggle.
- [ ] Handle `Enter` key for menu navigation, Start Game, Next Level, and Play Again confirmations.
- [ ] Verification gate: tests cover hold-to-move behavior, focus-loss clearing, and no dependency on OS key-repeat.

---

#### B3-03: Movement & Grid Collision System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `B3-01`, `B3-02`, `D3-03` (map resource from Track D)  
**Impacts**: Core controllable gameplay movement (`AUDIT-F-11`, `AUDIT-F-12`, `AUDIT-F-13`)

**Deliverables**:
- `src/ecs/systems/player-move-system.js` — grid-constrained player motion

**Blocks**:
- B3-04 (same track — collision needs movement)
- C3-04 (Track C — ghost AI needs movement for pathfinding context)
- D3-07 (Track D — render collect needs position data)
- D3-10 (Track D — bombs need player position)

- [ ] Implement `player-move-system.js`: Queries the grid from `map-resource` based on Position vs Velocity intentions. Ensures smooth sub-cell locking and prevents walking through walls.
- [ ] Works using ECS state-machine variables. Updates TargetRow/Col.
- [ ] Enforce no diagonal drift and deterministic motion under variable render FPS.
- [ ] Apply exact base speed from `game-description.md` §8 (Player = 5.0 tiles/sec).
- [ ] Handle speed boost multiplier (`1.5x`) when player has active speed boost.
- [ ] Verification gate: unit tests for blocked movement, path continuity, and interpolation correctness.

---

#### B3-04: Entity Collision System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours  
**Phase**: P1 Playable MVP  
**Depends On**: `B3-01`, `B3-03`, `D3-03` (map resource)  
**Impacts**: Player/ghost/pellet interaction correctness and life/score intents

**Deliverables**:
- `src/ecs/systems/collision-system.js` — cell-occupancy map, collision hierarchy, ghost house barrier

**Blocks**:
- B3-05 (same track — event integration)
- C3-02 (Track C — scoring consumes collision intents)
- D3-11 (Track D — power-up collection consumes collision intents)

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

#### B3-05: Gameplay Event Integration Surface
**Priority**: 🟡 Medium  
**Estimate**: 2 hours  
**Phase**: P2 Feature Complete  
**Depends On**: `B3-04`, `D3-01` (event-queue resource)  
**Impacts**: Deterministic event emission from collision/movement systems for consumption by scoring, audio, and visual cues

**Deliverables**:
- Updated `collision-system.js` and `player-move-system.js` to emit events via `event-queue` resource
- Event emission for: `PelletCollected`, `PowerPelletCollected`, `PowerUpCollected`, `PlayerGhostContact`

**Blocks**:
- None (Track C and D consume events independently)

- [ ] Wire collision system to emit deterministic events via `event-queue` resource for each collision resolution.
- [ ] Wire movement system to emit position-change events when needed by consumers.
- [ ] Include `frame` and monotonic `order` fields for deterministic ordering.
- [ ] Ensure stable, ordered event emission from collision and movement systems.
- [ ] Verification gate: repeated seeded runs produce identical event order and payload schema from B systems.

---
