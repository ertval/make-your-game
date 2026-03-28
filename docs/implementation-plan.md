 # 📋 Ms. Ghostman — ECS Implementation Plan

> **Architecture**: Entity-Component-System (ECS)  
> **Stack**: Vanilla JS (ES2026) · HTML · CSS Grid · DOM API only  
> **Tooling**: Biome (lint + format) · Vite (dev server + bundler) · Vitest (unit tests)  
> **Target**: 60 FPS via `requestAnimationFrame` · No canvas · No frameworks

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Workflow Tracks (Balanced Workload)](#3-workflow-tracks-balanced-workload)
    - [Track A — Core Engine, CI, Schema, and Evidence Wiring (Dev 1)](#track-a--core-engine-ci-schema-and-evidence-wiring-dev-1)
    - [Track B — Physics, Input, and Gameplay Event Hooks (Dev 2)](#track-b--physics-input-and-gameplay-event-hooks-dev-2)
    - [Track C — AI, Rules, and Audio Production and Integration (Dev 3)](#track-c--ai-rules-and-audio-production-and-integration-dev-3)
    - [Track D — Rendering, DOM Batching, and Visual Production and Integration (Dev 4)](#track-d--rendering-dom-batching-and-visual-production-and-integration-dev-4)
4. [Integration Milestones](#4-integration-milestones)
5. [Shared Contracts & Interfaces](#5-shared-contracts--interfaces)
6. [Testing Strategy](#6-testing-strategy)
7. [Performance Budget & Acceptance Criteria](#7-performance-budget--acceptance-criteria)
8. [Done Criteria](#8-done-criteria)
9. [Asset Creation & Pipeline](#9-asset-creation--pipeline)
10. [Maintenance Notes](#10-maintenance-notes)

---

## 1. Architecture Overview

### 1.1 What Is ECS?

**Entity-Component-System (ECS)** is a data-oriented architecture:

- **Entity**: an opaque ID representing a game object.
- **Component**: pure data attached to entities (no behavior, no DOM state).
- **System**: deterministic logic that processes entities with matching components.

For this game, ECS helps keep simulation deterministic, isolate DOM side effects, and scale gameplay features without creating tightly coupled classes.

### 1.2 Source Of Truth References

1. `docs/requirements.md` + `docs/game-description.md` define project requirements and intended gameplay behavior.
2. `docs/audit.md` defines pass/fail acceptance criteria.
3. `docs/audit-traceability-matrix.md` maps every audit question to requirement, plan, and test anchors.
4. `docs/assets-pipeline.md` defines visual/audio authoring and optimization standards.
5. When implementation details are ambiguous, resolve against those references first.

```mermaid
graph TB
    subgraph "Imperative Shell / Adapters"
        MAIN["main.ecs.js (entry)"]
        RENDERER["Renderer Adapter (DOM)"]
        INPUT["Input Adapter"]
        AUDIO["Audio Adapter"]
    end

    subgraph "Core ECS Simulation (Pure Data & Behavior)"
        WORLD["World (Entities, Scheduling)"]
        
        subgraph "Systems"
            SYS_INPUT["Input System"]
            SYS_MOVE["Movement & Collision Systems"]
            SYS_BOMB["Bomb & Explosion Systems"]
            SYS_AI["Ghost AI System"]
            SYS_RENDER["Render Collect & DOM Systems"]
        end
        
        subgraph "Components"
          COMP_POS["Position, Velocity"]
          COMP_ACT["Player, Ghost, Bomb"]
          COMP_REN["Renderable, VisualState"]
        end
    end

    MAIN --> WORLD
    WORLD --> SYS_INPUT
    WORLD --> SYS_AI
    WORLD --> SYS_MOVE
    WORLD --> SYS_BOMB
    WORLD --> SYS_RENDER
    
    SYS_INPUT -. reads .-> INPUT
    SYS_RENDER -. writes .-> RENDERER
    
    SYS_INPUT --> COMP_POS
    SYS_MOVE --> COMP_POS
    SYS_AI --> COMP_ACT
```

### Core Architectural Boundaries

1. **World Layer**
   - Owns entity lifecycle, component stores, resources, and system scheduler.
   - Provides deterministic frame context (dt, pause flag, elapsed simulation time).
2. **ECS Simulation Layer (Pure or Mostly Pure)**
   - Systems run in fixed order and mutate component data in place in hot paths.
   - No DOM calls in simulation systems.
3. **Adapter Layer**
   - Input adapter, render adapter, storage adapter, audio adapter.
   - Converts browser events/DOM into normalized data for ECS resources.
   - **Adapters are registered as World resources** and accessed via the resource API. Systems MUST NOT import adapters directly — direct imports violate DOM isolation boundaries.
4. **Render Boundary**
   - Two-stage rendering:
     - `render-collect-system`: computes render intents from ECS state
     - `render-dom-system`: applies batched DOM writes only at end-of-frame

### Frame Pipeline

1. `requestAnimationFrame` tick.
2. **Input snapshot** (adapter).
3. **Fixed-step simulation pass** (0..N updates from accumulator, bounded to prevent spiral-of-death).
4. **Render intent collection**.
5. **One batched DOM commit pass**.
6. **HUD and overlay updates** via `textContent` and class toggles.

### Deterministic Runtime Contract

1. Simulation uses a **configurable fixed timestep** driven by `SIMULATION_HZ` (default `60`), yielding `FIXED_DT_MS = 1000 / SIMULATION_HZ` (`≈16.6667ms`). The `SIMULATION_HZ` constant lives in `constants.js`; changing it adjusts simulation rate without touching loop logic.
2. Catch-up is clamped (`maxStepsPerFrame`, default `5`) after tab throttling or CPU stalls.
3. `frameTime` is clamped before accumulator integration to avoid runaway bursts.
4. System order and query iteration are stable and centrally declared in `world.js`.
5. Structural entity/component mutations are deferred and applied at one sync point per tick.
6. Cross-system events (bomb chains, collisions, scoring) pass through deterministic event queues.

### Pause Semantics

- `rAF` continues running.
- Simulation updates are skipped while paused.
- Pause UI remains responsive; no timer progression while paused.
- On unpause, timing baseline is reset and accumulator is cleared/capped to prevent burst catch-up.
- `visibilitychange` / `blur` are treated as lifecycle events that force input and clock resynchronization.

### Input Determinism Contract

1. Input adapter tracks hold state from `keydown`/`keyup` sets; gameplay does not depend on OS key-repeat.
2. Held key state is cleared on `blur` and document hidden transitions.
3. World snapshots input once per fixed simulation step and systems consume only that snapshot.

### ECS Mutation Contract

1. Structural mutations (add/remove entity/component) are deferred to a sync point after system execution.
2. Entity IDs are recycled with stale-handle protection semantics.
3. Cross-system event queues are processed in deterministic insertion order.

### Key Principles

1. **ECS-First**: The game strictly follows Entity (numeric IDs), Components (pure data records), and Systems (deterministic behavior).
2. **DOM Isolation**: Simulation systems (movement, AI, collisions) must NEVER touch the DOM object. All DOM side effects are handled exclusively by the `Render DOM System` and adapters explicitly built to wrap DOM nodes.
3. **Data-Oriented & Zero Allocation**: Inside the core fixed-timestep update, arrays and pools are pre-allocated. Mutations on hot-path buffers occur in-place to avoid GC pause and frame drops.
4. **Stable Scheduling**: System execution order is rigidly defined in the `World` object. Components are updated predictably.
5. **Rendering Pipeline**: Simulation feeds intents. The `Render Collect System` processes what needs drawing and emits a frame-local render-intent buffer from ECS data. The `Render DOM System` then applies a single batch-write phase of transforms and opacity to avoid layout thrashing.

### Component Storage Architecture

Component storage uses a **Struct-of-Arrays (SoA)** layout for numeric hot-path data and plain object arrays for complex/non-numeric components:

- **Numeric components** (position, velocity, timers): `TypedArray` per field (e.g., `Float64Array`, `Int32Array`) indexed by entity ID. Maximises cache locality and eliminates per-entity GC pressure.
- **Complex components** (ghost state, renderable, visual-state): Plain object arrays — one object per entity slot, mutated in place.
- **Query matching**: Bitmask-based in `query.js` — each component type owns a unique power-of-two bit; an entity's component mask is the bitwise OR of all attached component bits. Fastest approach for ≤ 32 component types.

```js
// Example SoA for Position — hot-path friendly
const positions = {
  row:       new Float64Array(MAX_ENTITIES),
  col:       new Float64Array(MAX_ENTITIES),
  prevRow:   new Float64Array(MAX_ENTITIES),
  prevCol:   new Float64Array(MAX_ENTITIES),
  targetRow: new Float64Array(MAX_ENTITIES),
  targetCol: new Float64Array(MAX_ENTITIES),
};
```

Entity IDs are recycled via a free-list pool in `entity-store.js`. Stale-handle protection is provided by a generation counter per slot.

---

## 2. Directory Structure

```text
make-your-game/
├── index.html
├── package.json
├── biome.json
├── vite.config.js
│
├── docs/
│   ├── requirements.md
│   ├── audit.md
│   ├── audit-traceability-matrix.md
│   ├── assets-pipeline.md
│   ├── schemas/
│   │   ├── visual-manifest.schema.json
│   │   └── audio-manifest.schema.json
│   ├── game-description.md
│   └── implementation-plan.md          # This file
│
├── tests/
│   ├── README.md
│   ├── e2e/
│   │   └── audit/
│   │       ├── audit-question-map.js
│   │       └── audit.e2e.test.js       # Playwright-based (F-01..F-21, B-01..B-06)
│   ├── integration/
│   │   ├── gameplay/               # Multi-system interaction tests
│   │   └── adapters/               # Adapter boundary tests (jsdom)
│   └── unit/
│       ├── systems/                # One test file per system
│       ├── resources/              # clock, rng, event-queue tests
│       └── world/                  # entity-store, query, world tests
│
├── src/
│   ├── main.ecs.js                    # App entry — bootstraps the ECS World
│   │
│   ├── game/                          # Game-flow orchestration (not ECS simulation)
│   │   ├── bootstrap.js               # World assembly + system registration order
│   │   ├── level-loader.js            # Level transition orchestration
│   │   └── game-flow.js               # FSM driver: MENU → PLAYING ↔ PAUSED → GAMEOVER/VICTORY
│   │
│   ├── debug/                         # Dev/test utilities — excluded from production builds
│   │   └── replay.js                  # Input recording, state hashing, replay playback
│   │
│   ├── ecs/
│   │   ├── world/
│   │   │   ├── world.js               # Lifecycle, system scheduling, frame context
│   │   │   ├── entity-store.js        # ID generation & recycling
│   │   │   └── query.js               # Component mask matching
│   │   ├── components/
│   │   │   ├── spatial.js             # position + velocity + collider (always co-occur)
│   │   │   ├── actors.js              # player + ghost + input-state (actor data)
│   │   │   ├── props.js               # bomb + fire + power-up (prop data)
│   │   │   ├── stats.js               # Health, lives, score, timer tags
│   │   │   └── visual.js              # renderable + visual-state (render queries)
│   │   ├── systems/
│   │   │   ├── input-system.js        # Applies adapter input to components
│   │   │   ├── player-move-system.js  # Grid-constrained player motion
│   │   │   ├── ghost-ai-system.js     # Chasing, fleeing, pathing
│   │   │   ├── bomb-tick-system.js    # Fuse countdown, chain reaction marking
│   │   │   ├── explosion-system.js    # Bomb destruction and fire spawn
│   │   │   ├── collision-system.js    # Entity overlap checks
│   │   │   ├── power-up-system.js     # Applies pickups and timed boosts
│   │   │   ├── scoring-system.js      # Applies events to total score
│   │   │   ├── timer-system.js        # Level countdown
│   │   │   ├── life-system.js         # Respawn and invincibility logic
│   │   │   ├── pause-system.js        # Freeze simulation while rAF continues
│   │   │   ├── spawn-system.js        # Ghost stagger spawn and respawn
│   │   │   ├── level-progress-system.js # Manages levels and game states
│   │   │   ├── render-collect-system.js # Maps simulation to visuals
│   │   │   └── render-dom-system.js   # Batches writes to the DOM
│   │   └── resources/
│   │       ├── constants.js           # Enums, speeds, config
│   │       ├── rng.js                 # Seeded RNG for determinism
│   │       ├── clock.js               # Deterministic / injected time tracking
│   │       ├── event-queue.js         # Deterministic event ordering between systems
│   │       ├── map-resource.js        # Loaded static grid & spawn points
│   │       └── game-status.js         # FSM: MENU → PLAYING ↔ PAUSED, WIN_LEVEL → LEVEL_COMPLETE → PLAYING/VICTORY, GAME_OVER
│   │
│   ├── adapters/
│   │   ├── dom/
│   │   │   ├── renderer-adapter.js    # DOM helper wrappers (no `innerHTML`)
│   │   │   ├── sprite-pool-adapter.js # Object pool for DOM elements
│   │   │   ├── hud-adapter.js         # Updates textContent for UI
│   │   │   └── screens-adapter.js     # Menus and overlays
│   │   ├── io/
│   │   │   ├── input-adapter.js       # Captures native key events
│   │   │   ├── storage-adapter.js     # Highscore saving
│   │   │   └── audio-adapter.js       # Sound playback
│   │
│   └── shared/
│       ├── result.js
│       └── utils.js                   # Pure math wrappers, arrays
│
├── assets/
│   ├── source/
│   │   ├── visual/
│   │   └── audio/
│   ├── generated/
│   │   ├── sprites/
│   │   ├── ui/
│   │   ├── sfx/
│   │   └── music/
│   └── manifests/
│       ├── visual-manifest.json
│       └── audio-manifest.json
│
└── styles/
    ├── variables.css
    ├── grid.css
    └── animations.css
```

---

## 3. Workflow Tracks (Balanced Workload)

The work is divided into 4 tracks with a near-even workload split. Asset production and validation are embedded into Track C (AI, rules, and audio production and integration), Track D (rendering, DOM batching, and visual production and integration), Track A (core engine, CI, schema, and evidence wiring), and Track B (physics, input, and gameplay event hooks). Since systems and components are heavily decoupled, tracks can be developed independently with mocked resources.

### Workload Summary (Balanced)

| Track | Developer | Estimated Hours | Notes |
|---|---|---:|---|
| Track A | Dev 1 | ~22h | Core engine, CI, schema, and evidence wiring |
| Track B | Dev 2 | ~23h | Physics, input, and gameplay event hooks |
| Track C | Dev 3 | ~23h | AI, rules, and audio production and integration |
| Track D | Dev 4 | ~23h | Rendering, DOM batching, and visual production and integration |
| **Total** | **4 Devs** | **~91h** | **~22.75h average per dev** |

### Critical Path By Dev

| Dev | Critical Path Focus | Must Land Before | Depends On |
|---|---|---|---|
| Dev 1 | Core engine bootstrap, resource plumbing, CI/schema wiring, and asset validation gates | Any gameplay integration that relies on stable startup, manifests, or CI gates | None for initial scaffolding; later depends on Track B, Track C, and Track D outputs for evidence aggregation |
| Dev 2 | Input snapshot, movement, collision, and gameplay event emission | Audio cue mapping, visual cue triggers, and deterministic replay checks | Dev 1 world/resource setup; coordinates with Dev 3 and Dev 4 via event payload contracts |
| Dev 3 | Ghost AI, scoring, timer/life rules, and audio asset runtime cues | Final gameplay loop completeness and audio feedback readiness | Dev 1 ECS/resources; Dev 2 collision/event hooks for cues; Dev 4 for visual state alignment |
| Dev 4 | Render batching, DOM commit, visual asset mapping, and visual fallback behavior | Visual completeness, pause/menu presentation, and paint/layer constraints | Dev 1 render boundary/setup; Dev 2 entity state events; Dev 3 visual state rules for stun, death, and pause cues |

#### Scheduling Rule

1. Dev 1 starts first to land the boot, world, and validation rails.
2. Dev 2 and Dev 4 can then work in parallel once the ECS resource/event contracts are stable.
3. Dev 3 should integrate against the event contracts early so audio/game rule behavior and visual states do not drift.
4. Shared asset/CI evidence work stays on Dev 1, but requires inputs from Dev 3 and Dev 4 before it can close.

> **Team model alignment (D-3)**: The track ownership here (Engine / Physics+Input / AI+Rules / Rendering) is the **canonical assignment**. `docs/agentic-workflow-guide.md` describes a simplified cross-cutting model; when there is a conflict, this plan’s track assignments take precedence for day-to-day task ownership.

---

### Track A — Core Engine, CI, Schema, and Evidence Wiring (Dev 1)

> **Scope**: Scaffolding, ECS internals (World, Entity Store, Queries), and Core Resources.
> **Estimate**: ~22 hours

#### A-1: Project Scaffolding & Tooling
**Priority**: 🔴 Critical  
**Estimate**: 2 hours

- [ ] Initialize `package.json` with ES modules, configure Vite and Biome.
- [ ] Setup Vitest for pure system/component testing.
- [ ] Configure CI merge gates (lint, tests, coverage minimums, protected branch checks).
- [ ] Implement dependency governance (strict lockfile policy and SBOM generation).
- [ ] Create `index.html` structure with core `<div>` mount points.
- [ ] Commit basic CSS reset and variable stubs.

#### A-2: ECS Architecture Core (World, Entity, Query)
**Priority**: 🔴 Critical  
**Estimate**: 5 hours

- [ ] Implement `src/ecs/world/entity-store.js` using ID arrays via a recycling pool to avoid GC chunks.
- [ ] Implement `src/ecs/world/query.js`: Provides fast entity lookups matching component masks.
- [ ] Implement `src/ecs/world/world.js`:
  - Registers systems and dictates phase ordering (Input -> Physics -> Logic -> Render).
  - Handles fixed-step logic loop (`accumulator`) and calls simulation systems.
  - Passes resource references smoothly without global singleton abuse.
- [ ] Unit Test: Entity generation, recycling, and system pass ordering.

#### A-3: Resources (Time, Constants, RNG)
**Priority**: 🔴 Critical  
**Estimate**: 2 hours

- [ ] Add `src/ecs/resources/constants.js`: Sizes, rules, entity IDs.
- [ ] Implement `src/ecs/resources/clock.js`: Tracks elapsed simulation time, delta, and logic pause-state vs unpaused system state.
- [ ] Implement `src/ecs/resources/rng.js`: Predictable `Math.random` replacement for deterministic runs.

#### A-4: Game Loop & Main Initialization
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Implement `main.ecs.js`: Boots World, binds `window.requestAnimationFrame`.
- [ ] Connect `rAF` pipeline into World's internal accumulator update.
- [ ] Implement basic state-transition flow (playing, paused) handled by checking `clock.isPaused` to freeze simulation while keeping rAF active.
- [ ] Add resume safety and lifecycle handling: baseline reset (`lastFrameTime = now`) and accumulator clamp/clear on unpause and tab restore.
- [ ] Test the empty loop verifies consistent 60 FPS overhead with Performance API.

#### A-5: Map Loading Resource
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Create 3 JSON map blueprints.
- [ ] Implement JSON Schema 2020-12 validation in CI, failing build on invalid level data.
- [ ] Implement `map-resource.js`: Parses map on load, stores a fixed representation of the static grid cells (walls, emptiness, intersections).
- [ ] Injects map info into the World context upon level start.

#### A-6: Shared Asset Validation Wiring
**Priority**: 🔴 Critical  
**Estimate**: 3 hours

- [ ] Wire schema checks for `assets/manifests/*.json` against `docs/schemas/*.schema.json` into CI.
- [ ] Add file existence checks for manifest paths and fail CI on missing assets.
- [ ] Enforce naming and size-budget checks for generated assets.

#### A-7: Asset Evidence Aggregation
**Priority**: 🟡 Medium  
**Estimate**: 2 hours

- [ ] Capture before/after size report for generated visual and audio assets.
- [ ] Collect runtime evidence notes for paint/layer behavior and audio startup timing from Dev 3 and Dev 4 outputs.
- [ ] Link evidence artifacts to `docs/audit-traceability-matrix.md` rows impacted by asset work.

---

### Track B — Physics, Input, and Gameplay Event Hooks (Dev 2)

> **Scope**: Input acquisition, movement validation, colliding bodies, and explosion logic. All pure ECS.
> **Estimate**: ~23 hours

#### B-1: Action Components
**Priority**: 🔴 Critical  
**Estimate**: 2 hours

- [ ] Implement pure data files in `src/ecs/components/`:
  - `position.js` (row, col, targetRow, targetCol).
  - `velocity.js` (direction vector).
  - `input-state.js` (requested moving direction, bomb requested).
  - `collider.js` (types: player, entity, obstacle).
  - `player.js` (lives, stats).

#### B-2: Input Adapter & System
**Priority**: 🔴 Critical  
**Estimate**: 3 hours

- [ ] Implement `adapters/io/input-adapter.js`: Captures `keydown`/`keyup` securely mapping into an intent buffer. No OS key repeat reliance.
- [ ] Ensure held-key state clears on `blur`/`visibilitychange` to prevent stuck movement after focus loss.
- [ ] Implement `ecs/systems/input-system.js`: Reads adapter, writes into the `input-state` component attached to the Player entity within the frame logic.
- [ ] Snapshot input state once per fixed simulation step and consume immutable snapshots in gameplay systems.

#### B-3: Movement & Grid Collision System
**Priority**: 🔴 Critical  
**Estimate**: 5 hours

- [ ] Implement `player-move-system.js`: Queries the grid from `map-resource` based on Position vs Velocity intentions. Ensures smooth sub-cell locking and prevents walking through walls.
- [ ] Works cleanly using ECS state-machine variables rather than loose classes. Updates TargetRow/Col.
- [ ] Unit test grid boundaries and interpolation steps.

#### B-4: Bomb Components & Bomb Tick System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Implement `bomb.js` (fuse timing) and `fire.js` (burn timer).
- [ ] Implement `bomb-tick-system.js`: Decrements fuse, validates explosion radius against `map-resource`.
- [ ] Implement `explosion-system.js`: Translates detonated bombs into Fire entities mapping over map resources (destructible wall clears). Chain reactions use an **iterative detonation queue** (NOT recursive — avoids call-stack risk) with a hard depth limit (`MAX_CHAIN_DEPTH = 10`; pre-allocated queue buffer in `constants.js`). Process the queue within a single fixed step for determinism.

#### B-5: Entity Collision System
**Priority**: 🟡 Medium  
**Estimate**: 4 hours

- [ ] Implement `collision-system.js` using a **cell-occupancy map** for O(1) spatial lookups (not O(n²) pair checks). Each fixed step: build `cellOccupants: Map<"row,col", Set<EntityId>>` in O(n), then query O(1) per moving entity:
  - Fire vs Player → damage/death intent.
  - Fire vs Ghost → death intent.
  - Player vs Ghost → Player death intent. **Ghosts cannot be killed by touch** — only a bomb explosion destroys a ghost.
  - Player vs Power-up/Pellet → mark for destruction/collection and tag points.
- [ ] Tests collision permutations locally using mocked World queries.

#### B-6: Gameplay Event Hooks for Asset Cues
**Priority**: 🟡 Medium  
**Estimate**: 5 hours

- [ ] Define deterministic event payloads for audio/visual cue triggers (`BombPlaced`, `BombDetonated`, `PelletCollected`, `LifeLost`, `GhostDefeated`).
- [ ] Ensure collision and explosion systems emit stable, ordered events usable by adapters.
- [ ] Add integration tests asserting event order and payload consistency for adapter consumption.

---

### Track C — AI, Rules, and Audio Production and Integration (Dev 3)

> **Scope**: Ghost behaviors, score keeping, lives management, pause, and high-level progression.
> **Estimate**: ~23 hours

#### C-1: AI Components & Spawning Logic
**Priority**: 🔴 Critical  
**Estimate**: 3 hours

- [ ] Implement `ghost.js` (AI behaviors: blinky, pinky, inky, clyde).
- [ ] Setup a ghost-spawning sub-routine via map resource that creates entities utilizing `World.EntityStore`.

#### C-2: Ghost AI System
**Priority**: 🔴 Critical  
**Estimate**: 6 hours

- [ ] Implement `ghost-ai-system.js`. For every ghost:
  - Pathfinding based on its personality (chase target offsets, intersection evaluation).
  - Must not mutate target positions when not at cell centers.
  - Enforce "no reversing" logic unless a Power Pellet is eaten (flee mode).
  - Fleeing: Random intersection logic aiming to maximize player distance.
  - Dead state: Eyes-only return to ghost house.
- [ ] Use zero-allocation heuristics for distance computing (pre-compute direction scores in-place; no temporary arrays).
- [ ] **Worker offload gate**: BFS on a ≤ 20×20 grid for 4 entities takes microseconds. Do NOT add a Web Worker unless profiling shows ghost pathfinding exceeds **2 ms per frame** on a representative device. If that threshold is crossed, define message contracts at that point.

#### C-3: Power Up & Stun Routines
**Priority**: 🟡 Medium  
**Estimate**: 3 hours

- [ ] Process power-pellet collection events from the Collision System.
- [ ] Toggles ghost states across components to "stunned".
- [ ] Countdown timers within the Ghost System that flicker out and return to normal chasing routines.

#### C-4: Timer System & Scoring System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Implement `scoring-system.js`: Reacts to collision events (dead ghosts, cleared pellets, powerups) and updates a singular `stats.js` Score component. Handles combo multipliers.
- [ ] Implement `timer-system.js`: Manages level timing, applying time bonuses when levels complete.
- [ ] Implement `life-system.js`: Handles loss of lives from player death intents.

#### C-5: Pause & Progression Systems
**Priority**: 🔴 Critical  
**Estimate**: 3 hours

- [ ] Implement `pause-system.js` and `level-progress-system.js`: Triggering pause freezes the global simulation timer while `clock.elapsedMs` and actual `rAF` continue. This ensures the pause UI transitions cleanly. Handles level resets and map reloading.

#### C-6: Audio Assets and Runtime Cues (Dev 3)
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Finalize `docs/schemas/audio-manifest.schema.json` and maintain `assets/manifests/audio-manifest.json`.
- [ ] Create/export UI and gameplay SFX set (confirm/cancel/pause, bomb place/explode, hit/death, pickup).
- [ ] Create/export at least one loop-safe level music track and optional ambience loop.
- [ ] Normalize loudness across categories and record metadata fields (duration, sample rate, channels, loudness).
- [ ] Define audio cue mapping from gameplay events to manifest IDs in adapter integration notes (using Dev 2 event contracts).

---

### Track D — Rendering, DOM Batching, and Visual Production and Integration (Dev 4)

> **Scope**: Safe, minimal DOM mutation. Adapting ECS simulation outputs into visual representations using CSS grids and pooled DOM elements without leaking memory or `frames`.
> **Estimate**: ~23 hours

#### D-1: Renderer Structure & CSS Layout
**Priority**: 🔴 Critical  
**Estimate**: 3 hours

- [ ] Build `styles/grid.css` using strict grid-template layouts and absolute positioning over grid cells. Apply a strict **`will-change` policy**:
  - Player sprite: `will-change: transform` (always moving).
  - Ghost sprites: `will-change: transform` (always moving).
  - Bomb sprites: `will-change: transform` only while fuse animation is active (add/remove dynamically).
  - Fire tiles, static grid cells, HUD elements: **NO** `will-change`.
  - Target layer count: ~6 (player + 4 ghosts + active bomb group). Satisfies “minimal but non-zero.”
- [ ] Implement CSS animations (walking pulse, explosion fade, flashings).

#### D-2: Adapters (DOM & HUD)
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Implement `renderer-adapter.js`: Strict `document.createElementNS` logic for generating the static board. Zero `innerHTML`.
- [ ] Define Content Security Policy (CSP) and Trusted Types rollout plan. **During development with Vite, CSP enforcement MAY be relaxed to allow HMR inline scripts. Production builds MUST enforce strict CSP.**
- [ ] Implement `sprite-pool-adapter.js`: Pre-allocates pools sized from `constants.js` (e.g., `POOL_FIRE = maxBombs * fireRadius * 4`, `POOL_BOMBS = MAX_BOMBS`). Hidden elements MUST use `transform: translate(-9999px, -9999px)` — never `display:none` (which triggers layout). When pool is exhausted: log `console.warn` in development; silently recycle the oldest active element in production.
- [ ] Implement `hud-adapter.js` and `screens-adapter.js`: Binds text nodes natively with `.textContent` to update metrics securely.

#### D-3: Render Data Contracts
**Priority**: 🔴 Critical  
**Estimate**: 2 hours

- [ ] Define `renderable.js` (sprite class references mapped to visual kinds) and `visual-state.js` (pure render flags only; no DOM handles in ECS components).
- [ ] Define `render-intent.js` as a frame-local batch structure consumed by `render-dom-system.js`.

#### D-4: Render Collect System
**Priority**: 🔴 Critical  
**Estimate**: 4 hours

- [ ] Implement `render-collect-system.js`: Called after Simulation but before Batch DOM write. Matches all entities with Position + Renderable logic. Checks bounds. Computes intended absolute pixels or transform positions using the interpolation factor (`alpha`) passed by the `accumulator` logic. Outputs a purely structured batch-write array.

#### D-5: Render DOM System (The Batcher)
**Priority**: 🔴 Critical  
**Estimate**: 5 hours

- [ ] Implement `render-dom-system.js`: The ONLY system in the loop where the DOM mutates.
- [ ] Applies calculated batched writes:
  - Exclusively updates `.style.transform = "translate3d(x, y, 0)"` and `.style.opacity`.
  - Swaps `classList` values based on states (like stunned/invincible).
  - Informs `sprite-pool-adapter` to reclaim or hide nodes not present in the current frame's render-intent set (entity death/despawn).
- [ ] Enforce strict render commit phases: no layout reads interleaved with write loops.
- [ ] DevTools trace verification to prove zero multi-pass layout recalcs (layout thrashing) during a full bomb explosion.

#### D-6: Visual Assets and Render Mapping (Dev 4)
**Priority**: 🔴 Critical  
**Estimate**: 5 hours

- [ ] Finalize `docs/schemas/visual-manifest.schema.json` and maintain `assets/manifests/visual-manifest.json`.
- [ ] Create/export player, ghost states, bombs, fire, pellets, power-ups, HUD icons, and pause UI visuals.
- [ ] Optimize SVG/raster outputs and ensure all deferred visuals have reserved dimensions in manifest metadata.
- [ ] Build manifest-to-renderable mapping table and define missing-asset fallback class behavior.
- [ ] Validate visual assets against layer/paint constraints using DevTools traces.

---

## 4. Integration Milestones

```mermaid
gantt
    title Ms. Ghostman - ECS Integration Timeline
    dateFormat  X
    axisFormat %s

    section Engine (A)
    Scaffolding & Core World: a1, 0, 7
    Resources & Map Load: a2, 7, 6
    Game Loop Wrap: a3, 13, 4

    section Physics (B)
    Adapter & Input Sys: b1, 2, 5
    Movement Grid Resolve: b2, 7, 5
    Bomb & Collision: b3, 12, 8

    section AI & Rule (C)
    Ghost AI Sys: c1, 4, 9
    Mechanics & Scoring: c2, 13, 6

    section Shell (D)
    CSS Structure & Gen: d1, 0, 7
    Sprite Pools & Adapts: d2, 7, 6
    Render Batcher: d3, 13, 10
    
    section Integration
    M1 Complete ECS Engine + Static Grid: milestone, m1, 7, 0
    M2 Player Intention -> Bounds: milestone, m2, 14, 0
    M3 Render Maps Chasing AI: milestone, m3, 18, 0
    M4 Full Mechanics, 60fps Lock: milestone, m4, 21, 0
    M5 Audit and Performance Hardening: milestone, m5, 23, 0
```

### Milestone 1: Engine + Static View (Day 3)
**Requires**: A-2, A-5, D-1, D-2  
**Result**: The core world schedules a tick, generating a layout based on pure simulation mapping of static `Grid` resource entities via safe DOM manipulation.

### Milestone 2: Movement & Actions (Day 4)
**Requires**: M1 + A-4, B-2, B-3, B-4, D-4, D-5  
**Result**: Player moves flawlessly aligned to grid offsets. Bombs are tracked physically. Rendering interpolates movement using pooled DOM components.

### Milestone 3: AI Ecosystem (Day 5)
**Requires**: M2 + C-1, C-2, B-5  
**Result**: Ghosts navigate intersecting pathways appropriately utilizing distance vectors. Collision sets are triggered.

### Milestone 4: Game Polish & Audit Lock (Day 6-7)
**Requires**: M3 + A-4, C-3, C-4, C-5, D-2, D-5  
**Result**: Playable from Start Menu to Win/Loss. Fully measurable 60fps loop via profiler with zero component pooling GC delays. Strict ECS conformance met. Pause logic bypasses simulation accurately.

### Milestone 5: Audit and Performance Hardening
**Requires**: All tracks complete
**Result**: Audit checklist pass evidence and performance trace summary.

### Gate Evidence Required (All Milestones)

1. Test evidence: relevant Vitest suites green, including new deterministic replay or regression tests for changed systems.
2. Performance evidence (for gameplay-critical changes): p50/p95/p99 frame-time stats + dropped-frame notes over representative 60s traces.
3. Pause evidence: rAF remains active while simulation/timer/fuse progression is frozen.
4. Rendering evidence: no recurring forced layout/reflow loops in render commit.
5. Environment evidence: browser version, OS, machine class, and throttle conditions.

---

## 5. Shared Contracts & Interfaces

Shared structure inside component storage array definitions. These are documented using JSDoc `typedef` for IDE support and clarity.

### Primitive Types
```js
/** @typedef {number} EntityId - Simply a unique numeric ID */
```

### Frame Context & Clock (Resource)
```js
/** 
 * @typedef {Object} FrameContext
 * @property {number} dtMs       - Fixed simulation delta time in ms (= FIXED_DT_MS = 1000/SIMULATION_HZ)
 * @property {number} simTimeMs  - Elapsed simulation time (does not advance while paused)
 * @property {number} alpha      - Render interpolation factor: `accumulator / FIXED_DT_MS` (0…1).
 *                                 Used in render-collect-system to lerp visual positions:
 *                                 `displayRow = prevRow + (row - prevRow) * alpha`
 *                                 `displayCol = prevCol + (col - prevCol) * alpha`
 * @property {boolean} isPaused  - Global simulation freeze flag
 * @property {number} frameIndex - Monotonic fixed-step counter (for deterministic event ordering)
 */
```

### Input State (Resource/Component)
```js
/**
 * @typedef {Object} InputState
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} bomb - Action 1
 * @property {boolean} pause - Menu toggle
 */
```

### Event Queue (Resource)
```js
/**
 * @typedef {Object} GameEvent
 * @property {string} type - Event discriminator (e.g. BombDetonated, GhostKilled)
 * @property {number} frame - Fixed-step frame index
 * @property {number} order - Monotonic insertion index used for deterministic ordering
 * @property {Object} payload - Event-specific data
 */
```

### Core Components
```js
/**
 * @typedef {Object} Position
 * @property {number} row - Current grid row
 * @property {number} col - Current grid column
 * @property {number} prevRow - Row in previous fixed frame
 * @property {number} prevCol - Col in previous fixed frame
 * @property {number} targetRow - Destination for lerping
 * @property {number} targetCol - Destination for lerping
 */

/**
 * @typedef {Object} Player
 * @property {number} lives
 * @property {number} maxBombs
 * @property {number} fireRadius
 * @property {number} invincibilityMs - Protection timer
 */

/**
 * @typedef {Object} Ghost
 * @property {number} type - Personality ID
 * @property {number} state - Chasing, Fleeing, Dead, Stunned
 * @property {number} speed
 * @property {number} timerMs - State duration timer
 */

/**
 * @typedef {Object} Bomb
 * @property {number} fuseMs - Time until detonation
 * @property {number} radius
 * @property {number} ownerId - Entity that placed it
 */
```

### Render Intent

The render-intent buffer is **pre-allocated once** (`new Array(MAX_RENDER_INTENTS)`) at startup and reused every frame. CSS class state is encoded as a **bitmask integer** (`classBits`) instead of `string[]` to eliminate per-frame array allocations.

```js
/**
 * @typedef {Object} RenderIntent
 * @property {number} entityId
 * @property {string} kind      - Sprite/element type key
 * @property {number} row       - Interpolated display row
 * @property {number} col       - Interpolated display col
 * @property {number} classBits - Bitmask of visual state flags (see VISUAL_FLAGS in constants.js)
 */
// Visual state bit flags (combine with bitwise OR):
// const VISUAL_FLAGS = { STUNNED: 1, INVINCIBLE: 2, HIDDEN: 4, DEAD: 8 };
```

### Map Resource
```js
/**
 * @typedef {Object} MapResource
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} cells - Flattened grid cell layout
 * @property {number} pelletCount - Progress tracker
 * @property {Object} playerSpawn - {row, col}
 * @property {Array<{row, col}>} ghostSpawns
 */
```

---

## 6. Testing Strategy

| Boundary Layer | Tool | What to Test |
|---|---|---|
| **World Engine** | Vitest | Component registration, query accuracy, entity ID pooling constraints, deterministic execution order. |
| **Pure Systems** | Vitest | Deterministic output: Mock a system tick against a mocked component pool. Verify exact property writes. No DOM needed. |
| **Map Loader** | Vitest | Parses blueprint strictly. Rejects invalid maps. |
| **DOM Adapters** | Vitest + jsdom | Verifies `createElementNS` behaves securely without string/`innerHTML` injections. Assert pooled lengths; verify pool hiding via offscreen transform. |
| **Replay Determinism** | Vitest | Same seed + same input trace (`src/debug/replay.js`) must produce same `hashWorldState` output at frame N. |
| **Pause & Timer Invariants** | Vitest + integration fixtures | While paused, rAF remains active and simulation time remains frozen. Timer/fuse/invincibility counters do not drift. |
| **Accessibility Invariants** | Vitest + jsdom | Pause focus enters overlay on open and restores to prior target on close. Keyboard-only control path remains valid. |
| **Security Boundaries** | Vitest + static checks | HUD/menu updates use safe sinks (`textContent`, explicit attributes); untrusted storage data is validated on read. |
| **Regression Fixes** | Vitest | Repro test first, then fix, then pass. Verify no cross-system side effects outside component/resource contracts. |
| **Smoke Test** | **Playwright** | Boot game, run headlessly for 60 s with randomised input injections. Assert no unhandled exceptions. Write this first — it is the single highest-value test. |
| **Audit — Fully Automatable (F-01..F-16, B-01, B-03)** | **Playwright** (real browser) | Crash-free run, rAF usage, pause/continue/restart, hold-to-move, HUD metrics, genre compliance. One test per audit ID. |
| **Audit — Semi-Automatable (F-17, F-18)** | **Playwright** + `page.evaluate()` | Frame timing via Performance API. Assert p95 frame time ≤ 20 ms over a 30-second measurement window. |
| **Audit — Manual-With-Evidence (F-19, F-20, F-21, B-04, B-05, B-06)** | DevTools traces (PR artifacts) | Paint usage, layer count, layer promotion, SVG usage, async patterns. Require a signed evidence note — NOT a Vitest assertion. |

---

## 7. Performance Budget & Acceptance Criteria

Failure to meet these budgets violates the `audit.md` strict pass parameters.

### Budget Targets

| Metric | Budget | ECS Implementation Enforcement |
|---|---|---|
| FPS | **Target: 60 FPS sustained. Acceptable: ≥ 55 FPS at p95 (only 5% of frames may run below 55 FPS). Unacceptable: any sustained period > 500 ms below 50 FPS.** | Engine decouples fixed-step loop (systems) from rAF render pass. Audit criterion accepts “50–60 or more” — internal target is 60. |
| Frame Time | p95 ≤ 16.7 ms, p99 ≤ 20 ms | Logic routines perform zero internal allocations (no `.map` or `.filter` in hot loops, strict `for` loops over entity Query buffers). No recurring long tasks > 50 ms in interaction-critical path. |
| DOM Elements | ≤ 500 total (assert at startup) | A dev-mode assertion after level load counts `document.querySelectorAll('*').length` and logs a warning if > 400 (80% of budget). Transient rendering uses fixed Object Pools. Static map blocks rendered once. |
| Layout Thrashing | **Zero** | System boundaries ensure properties are ONLY written via single batch function at the tail of the tick (Render DOM System). Minimal paint and minimal-but-nonzero layer promotion. |
| Layer Promotion (`will-change`) | Player + 4 ghost sprites only | `will-change: transform` applied to always-moving sprites. Bomb sprites get it dynamically during fuse animation only. Fire tiles, grid cells, HUD carry none. Target ≈6 compositor layers. |
| GC Pauses / Jank | **Zero** | SoA TypedArray component storage for hot-path data. Entity recycling via free-list pool. Render-intent buffer pre-allocated and reused each frame. |
| Catch-up Stability | Max `5` fixed steps per frame enforced | Accumulator bounded to `5 × FIXED_DT_MS` to avoid spiral-of-death after tab throttling. |
| Modularity Leak | **Zero** | All simulation systems agnostic of DOM APIs. Adapters injected as World resources, never imported directly by systems. |

### Required Evidence

For gameplay-critical changes (update/render/input):
1. DevTools Performance trace summary.
2. Pause/resume verification note (rAF active, simulation frozen).
3. Brief note on paint/layer observations.
4. Frame-time stats (`p50`, `p95`, `p99`) from a representative 60-second run.
5. Environment note (browser version, machine class, and scenario).

---

## 8. Done Criteria

A change is complete only when:
1. Biome passes for modified scope.
2. Relevant Vitest suites pass.
3. ECS boundaries are respected (pure systems have no DOM side effects).
4. Functional coverage remains intact:
   - Single player
   - Pause Continue/Restart
   - Timer/score/lives HUD
   - Genre-aligned gameplay
5. Performance criteria are validated for gameplay-critical changes.
6. Every question in `docs/audit.md` has explicit automated test coverage and all those tests pass.

---

## 9. Asset Creation & Pipeline

This section is mandatory for delivery readiness and complements Track D — Rendering, DOM Batching, and Visual Production and Integration.

### 9.1 Scope and Ownership

1. Rendering systems own only runtime placement/state; they do not define asset authoring rules.
2. Asset authoring, optimization, and validation are defined in `docs/assets-pipeline.md`.
3. Asset changes should be reviewed with gameplay and performance in the same PR when behavior is affected.

### 9.2 Visual Asset Rules (DOM/SVG-first)

1. Preferred format is SVG for icons, characters, and UI glyphs where feasible.
2. Raster textures should be exported at exact display targets to avoid runtime scaling churn.
3. Every image asset must have declared dimensions in metadata/manifests so layout space is reserved and CLS risk is minimized.
4. Animation in gameplay paths must favor `transform` and `opacity` to preserve compositor-only motion.
5. Do not use unbounded filter stacks or expensive paint-heavy effects in hot scenes.

### 9.3 Audio Asset Rules

1. Provide at least one broadly compatible compressed format for each clip category (`.mp3` or `.m4a`), and optional higher-efficiency/open variants when supported (`.ogg`/Opus).
2. Use short, pre-trimmed SFX for gameplay events; avoid long tails that overlap and inflate active voice count.
3. Looping tracks must include loop-safe edit points and fade handling to prevent seam artifacts.
4. Normalize loudness across categories (UI, gameplay, ambience, music) and keep headroom for mix peaks.
5. Keep decode/startup latency constraints explicit for latency-sensitive cues.

### 9.4 Build and Validation Gates

1. Add CI checks for maximum asset sizes and required naming conventions.
2. Enforce that assets referenced by manifests/routes exist and are reachable.
3. Reject oversized additions without documented justification in the PR.
4. Keep an auditable source-to-export path (source files, export settings, generated outputs).

### 9.5 Runtime Loading Strategy

1. Load first-interaction critical assets eagerly (player sprite set, HUD, immediate SFX).
2. Defer non-critical/offscreen assets and prefetch upcoming-level bundles during safe frames.
3. Reserve dimensions for lazily loaded visual media to avoid layout shifts.
4. Keep object pools warm for high-churn entities and map visual instances from render intents only.

### 9.6 External Best-Practice Basis

The asset standards in this plan align with:

1. MDN audio codec guidance (format compatibility and compression tradeoffs): https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs
2. MDN SVG guidance (web-native vector workflow and scripting compatibility): https://developer.mozilla.org/en-US/docs/Web/SVG
3. web.dev lazy-loading guidance (defer offscreen media, keep in-viewport eager): https://web.dev/articles/browser-level-image-lazy-loading
4. web.dev CLS guidance (always reserve dimensions/aspect ratio): https://web.dev/articles/optimize-cls

---

## 10. Maintenance Notes

1. This repository is ECS-only; no legacy alternative-architecture workflow docs are maintained.
2. `AGENTS.md` is the normative constraints source. This plan is the execution source for ECS work.
3. Keep documentation links synchronized when adding/removing docs under `docs/`.
4. If architecture constraints change, update `AGENTS.md` first and then align this plan.