# 🔍 Critical Audit Report — Ms. Ghostman Implementation Plan

> **Scope**: Architecture, code organization, implementation techniques, game design, AGENTS.md quality  
> **Reviewed Documents**: `audit.md`, `requirements.md`, `implementation-plan.md`, `game-description.md`, `audit-traceability-matrix.md`, `assets-pipeline.md`, `agentic-workflow-guide.md`, `AGENTS.md`, JSON schemas  
> **Date**: 2026-03-26

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Analysis](#2-architecture-analysis)
3. [Code Organization & Directory Structure](#3-code-organization--directory-structure)
4. [Implementation Technique Critique](#4-implementation-technique-critique)
5. [Game Design & Rules Proposals](#5-game-design--rules-proposals)
6. [Performance Strategy Review](#6-performance-strategy-review)
7. [Testing Strategy Review](#7-testing-strategy-review)
8. [Security Posture Review](#8-security-posture-review)
9. [Audit Compliance Gap Analysis](#9-audit-compliance-gap-analysis)
10. [Documentation Ecosystem Review](#10-documentation-ecosystem-review)
11. [AGENTS.md Review](#11-agentsmd-review)
12. [Summary of All Proposals](#12-summary-of-all-proposals)

---

## 1. Executive Summary

The Ms. Ghostman project is **ambitiously well-documented** for a DOM-based ECS game. The plan demonstrates strong awareness of performance constraints, ECS discipline, and audit compliance. However, several areas present risks or missed optimizations:

| Dimension | Verdict | Key Concern |
|---|---|---|
| **Architecture** | ✅ Strong | Two-pass rendering is well-designed, but component storage model is underspecified |
| **Code Organization** | ✅ Good | Clean separation, but over-fragmented component files may cause import overhead |
| **Implementation Techniques** | ⚠️ Mixed | Good on DOM batching; weak on worker offload details and interpolation specifics |
| **Game Design** | ⚠️ Needs Polish | Genre hybrid creates complexity; some rules are ambiguous or conflict |
| **Performance** | ✅ Strong | Budget is rigorous; some enforcement mechanisms are theoretical |
| **Testing** | ⚠️ Incomplete | 27 audit tests are placeholder-only; e2e strategy is vague for a DOM game |
| **Security** | ✅ Adequate | CSP/Trusted Types are SHOULD-level; may be overkill for a local game |
| **AGENTS.md** | ✅ Strong | Well-structured, but some gaps and redundancy worth addressing |

**Bottom line**: The plan is very strong on paper. The primary risk is **execution fidelity** — the plan is so detailed that it could become shelfware. The secondary risk is **over-engineering** — several systems are more complex than the audit actually requires.

---

## 2. Architecture Analysis

### 2.1 What's Excellent

1. **Clean ECS boundary enforcement**: The explicit rule that simulation systems MUST NOT touch the DOM is the single most important architectural decision and is well-enforced at the constraints level.
2. **Two-phase rendering** (`render-collect-system` → `render-dom-system`): This is a textbook-correct approach for DOM games. Collecting render intents before batch-committing prevents layout thrashing.
3. **Adapter pattern for I/O**: Clean separation of browser APIs (input, audio, storage, DOM) from pure simulation.
4. **Deterministic event queue**: Cross-system communication via insertion-ordered event queues is the right choice for a game requiring deterministic replay.

### 2.2 Architectural Concerns

#### CONCERN A-1: Component Storage Model is Underspecified

> [!WARNING]
> The plan references "data-oriented storage" and "stable iteration order on hot paths" repeatedly but **never defines the actual storage layout**.

The plan mentions component files like `position.js`, `velocity.js` etc. as individual modules, but never specifies:
- Are these **Struct-of-Arrays (SoA)** or **Array-of-Structs (AoS)**?
- What is the backing store? `TypedArray`? Plain `Object` arrays? Flat arrays with index math?
- How does `query.js` match components? Bitmask? Set intersection?

**Proposal A-1**: Add a "Component Storage Architecture" subsection in §1 that specifies:
- SoA layout with `Float64Array` or `Int32Array` for numeric components (position, velocity, timers)  
- Plain object arrays for complex components (ghost state, renderable)
- Bitmask-based component matching in `query.js` (fastest for < 32 component types)

**Example**:
```js
// SoA for Position — hot-path friendly
const positions = {
  row: new Float64Array(MAX_ENTITIES),
  col: new Float64Array(MAX_ENTITIES),
  prevRow: new Float64Array(MAX_ENTITIES),
  prevCol: new Float64Array(MAX_ENTITIES),
  targetRow: new Float64Array(MAX_ENTITIES),
  targetCol: new Float64Array(MAX_ENTITIES),
};
```

This would meaningfully reduce GC pressure on hot paths. With ~500 DOM elements and ~50 active entities, the current approach of individual JS objects per component per entity could create significant allocation pressure during entity recycling.

#### CONCERN A-2: Render Intent Buffer Lifecycle

The `RenderIntent` typedef shows a plain object with `entityId`, `kind`, `row`, `col`, `classes`. The plan says "frame-local batch structure" but:

- Is this buffer **allocated once and reused** or **recreated each frame**?
- The `classes: string[]` field creates a new array every frame per entity — directly violating the zero-allocation hot-path rule.

**Proposal A-2**: Use a pre-allocated flat render intent pool:
```js
// Pre-allocate once
const renderIntents = new Array(MAX_RENDER_INTENTS);
for (let i = 0; i < MAX_RENDER_INTENTS; i++) {
  renderIntents[i] = { entityId: 0, kind: '', row: 0, col: 0, classBits: 0 };
}
let renderIntentCount = 0;
```
Use a **bitmask** for `classBits` instead of `string[]` — encode states like stunned, invincible, hidden as individual bits. This eliminates per-frame string array allocations entirely.

#### CONCERN A-3: Missing State Machine Formalism

The plan mentions "ECS state-machine variables" for movement and ghost states, but there is **no formal state machine** defined anywhere. Ghost states (Normal, Stunned, Dead) and game states (Menu, Playing, Paused, GameOver, Victory) are referenced informally.

**Proposal A-3**: Define an explicit finite state machine (FSM) resource:
```js
// game-status.js — as an FSM transition table
const TRANSITIONS = {
  MENU:     { START: 'PLAYING' },
  PLAYING:  { PAUSE: 'PAUSED', DIE: 'GAME_OVER', WIN_LEVEL: 'LEVEL_COMPLETE' },
  PAUSED:   { CONTINUE: 'PLAYING', RESTART: 'PLAYING' },
  LEVEL_COMPLETE: { NEXT: 'PLAYING', FINAL: 'VICTORY' },
  GAME_OVER: { RESTART: 'MENU' },
  VICTORY:  { RESTART: 'MENU' },
};
```
This prevents illegal state transitions and makes the pause/resume/restart flow provably correct.

#### CONCERN A-4: World ↔ Adapter Coupling Direction

The mermaid diagram shows `SYS_INPUT -.reads.-> INPUT` and `SYS_RENDER -.writes.-> RENDERER`. But the input system is an ECS pure system — how does it access the adapter?

If adapters are injected as **World resources**, this is fine. But the plan doesn't state this clearly. If systems import adapters directly, the DOM isolation boundary is violated.

**Proposal A-4**: Explicitly state in §1 that adapters are registered as World resources (not imported by systems). Systems access them through the resource API:
```js
// In world.update():
const inputSnapshot = this.getResource('inputSnapshot'); // adapter wrote to this
inputSystem.update(entities, inputSnapshot, dt);
```

---

## 3. Code Organization & Directory Structure

### 3.1 Strengths

1. **Flat component directory**: All components under `ecs/components/` — easy to find and review.
2. **Explicit separation of adapters**: `adapters/dom/` and `adapters/io/` — clean.
3. **Resources directory**: `ecs/resources/` for shared state — prevents global singletons.

### 3.2 Concerns

#### CONCERN O-1: Over-Fragmented Component Files

The plan lists **12 component files**. For a game with ~5 entity types (player, ghost, bomb, fire, power-up), many of these will be extremely small files (2-5 lines of typedef + factory).

**Proposal O-1**: Consolidate related components:
```text
ecs/components/
  ├── spatial.js          # position + velocity + collider (always co-occur)
  ├── actors.js           # player + ghost + input-state (actor-specific data)  
  ├── props.js            # bomb + fire + power-up (prop-specific data)
  ├── stats.js            # lives, score, timer tags (unchanged)
  └── visual.js           # renderable + visual-state (always co-occur in render queries)
```
This reduces import boilerplate from 12 imports to 5 and keeps related data together without violating ECS purity.

#### CONCERN O-2: Missing `src/game/` or Similar Top-Level Game Module

The entry point is `main.ecs.js`, which "bootstraps the ECS World." But there's no explicit module for:
- Level loading orchestration
- Game state transitions
- Pre-game / post-game flows

**Proposal O-2**: Add a `src/game/` directory:
```text
src/game/
  ├── bootstrap.js        # World assembly + system registration
  ├── level-loader.js     # Level transition orchestration
  └── game-flow.js        # Menu → Play → Pause → GameOver → Victory FSM driver
```
This prevents `main.ecs.js` from becoming a god module as features are integrated.

#### CONCERN O-3: Tests Directory is Flat

```text
tests/
  ├── e2e/
  ├── integration/
  └── unit/
```
But no inner structure is defined. With 15+ systems, the `unit/` directory will become unwieldy fast.

**Proposal O-3**: Mirror the `src/` structure inside `tests/`:
```text
tests/
  ├── unit/
  │   ├── systems/         # one test file per system
  │   ├── components/      # component factory tests (if any)
  │   ├── resources/       # clock, rng, event-queue tests
  │   └── world/           # entity-store, query, world tests
  ├── integration/
  │   ├── gameplay/        # multi-system interaction tests
  │   └── adapters/        # adapter boundary tests (jsdom)
  └── e2e/
      └── audit/           # audit question mapped tests
```

---

## 4. Implementation Technique Critique

### 4.1 Fixed-Step Simulation (Excellent)

The accumulator-based fixed timestep with clamped catch-up is the correct approach. The plan specifies `16.6667ms` fixed step — this is standard for 60Hz simulation.

**Minor Proposal T-1**: Consider supporting a configurable simulation rate. A `SIMULATION_HZ` constant (default 60) allows future tuning without touching loop code:
```js
const SIMULATION_HZ = 60;
const FIXED_DT_MS = 1000 / SIMULATION_HZ;
const MAX_STEPS_PER_FRAME = 5;
```

### 4.2 Interpolation (Underspecified)

The plan mentions `alpha` interpolation factor and `prevRow/prevCol` for lerping, but **never specifies the interpolation formula** or where it's applied.

> [!IMPORTANT]
> Without proper render interpolation, fixed-step simulation at 60Hz will appear to stutter on monitors running at different refresh rates (e.g., 120Hz, 144Hz displays) — and even at 60Hz, the simulation step and render frame won't always align perfectly.

**Proposal T-2**: Explicitly document the interpolation contract in the Render Collect System:
```js
// In render-collect-system.js
const displayRow = prevRow + (row - prevRow) * alpha;
const displayCol = prevCol + (col - prevCol) * alpha;
```
And specify that `alpha = accumulator / FIXED_DT_MS` is computed in the World's tick function and passed as part of `FrameContext`.

### 4.3 Web Worker Offload (Vague)

The plan says "Define worker offload criteria and message contracts for moving heavy pathfinding out of main thread" (C-2). But:
- There is no worker file in the directory structure.
- No message contract typedef is provided.
- No threshold for "heavy" is defined.

**Proposal T-3**: Given the game's scope (4 ghosts, grid-based pathfinding), Web Workers are likely **unnecessary overhead** for this project. BFS/A* on a 15×13 grid for 4 entities takes microseconds. The message serialization cost likely exceeds the computation itself.

**Recommendation**: Remove the worker offload from the plan. Instead, add a performance gate: "If ghost pathfinding exceeds 2ms per frame in profiling, move to Web Worker." This keeps YAGNI discipline while satisfying the AGENTS.md SHOULD clause.

### 4.4 Grid-Based Collision (Good, but Spatial Concern)

The collision system scans "positions overlapping via Query." For grid-based games, spatial queries should use cell-indexed lookups, not O(n²) entity pair checks.

**Proposal T-4**: Use a cell-occupancy map as a resource:
```js
// Updated once per fixed step — O(n) to build, O(1) to query
const cellOccupants = new Map(); // key: `${row},${col}` → Set<EntityId>
```
This makes collision detection O(1) per moving entity instead of O(n²), which matters when bombs and fire tiles are numerous.

### 4.5 Chain Reaction Handling (Risk)

Bomb chains can create recursive detonation. The plan says "Chains active explosions" but doesn't specify:
- Is it recursive (risky stack overflow for pathological cases)?
- Is it iterative (queue-based)?
- Is there a max chain depth?

**Proposal T-5**: Use an iterative detonation queue with a hard depth limit:
```js
const MAX_CHAIN_DEPTH = 10;
const detonationQueue = []; // pre-allocated
```
Process detonations iteratively within a single fixed step. This is deterministic and stack-safe.

### 4.6 DOM Pooling Strategy (Good, Missing Details)

The plan says "50x Fire elements, 10x Bomb elements" — good initial sizing. But:
- What happens when the pool is exhausted? Silent drop? Console warning? Pool growth?
- How are pool elements hidden? `display:none` (triggers layout) vs `visibility:hidden` vs offscreen `transform`?

**Proposal T-6**: 
1. Use `transform: translate(-9999px, -9999px)` for hiding (avoids layout/paint triggers, cheaper than `display:none`).
2. When pool exhausts, log a warning in development and silently recycle the oldest active element in production.
3. Document pool sizes as constants in `resources/constants.js` and tie them to map analysis (max possible concurrent fires = `maxBombs * fireRadius * 4`).

---

## 5. Game Design & Rules Proposals

### 5.1 Genre Hybrid Complexity

The Pac-Man + Bomberman hybrid is creative but creates design tension:

| Pac-Man Mechanic | Bomberman Mechanic | Tension |
|---|---|---|
| Eat all pellets to win | Bomb destructible walls | Bombs can destroy pellets (§4.2) — player can accidentally make level impossible |
| Ghosts patrol predictably | Bombs are area-denial tools | Ghost AI must avoid bombs but also chase player — complex pathfinding |
| Power Pellet stuns all ghosts | Bombs kill ghosts outright | Two redundant ghost-killing mechanisms dilute strategic depth |

**Proposal G-1 — Pellet-Safety Rule**: Bomb explosions should NOT destroy pellets. Instead, explosions pass through pellets harmlessly. This prevents accidental soft-locks where the player destroys required pellets and can never complete the level. This is a **critical gameplay safety issue** — without this, the game can enter an unwinnable state with no feedback to the player.

Alternatively, if pellet destruction is desired: add a fail-safe mechanic — e.g., after destroying pellets by bomb, spawn new pellets in random empty cells up to the count needed for level completion.

### 5.2 Power Pellet Balance

The game has both:
- **Power Pellets** (stun all ghosts for 5s, 400pt kills)
- **Bombs** (kill any ghost for 200pt kills)

Power Pellets are strictly superior to bombs for ghost-killing (higher points, no risk, affects all ghosts). This makes the bomb mechanic feel redundant for combat.

**Proposal G-2**: Differentiate the mechanics more clearly:
- Power Pellets: Stun (slow + flee) but DON'T allow killing. Only make ghosts harmless temporarily. Points: 50 for eating the pellet only.
- Bombs: The ONLY way to kill ghosts. Points: 200 per ghost (combo-scaled).

This makes bombs the offensive tool and power pellets the defensive tool, creating clearer strategic decisions.

### 5.3 Timer Duration

180 seconds (3 minutes) per level seems generous for Level 1 but may be extremely tight for Level 3 with "dense maze, many destructible walls, 4 ghosts." Bombing through walls costs 3 seconds per bomb, and the player must path through potentially dozens of walls.

**Proposal G-3**: Scale timer per level:
- Level 1: 120s (simpler, fewer walls → less time needed)
- Level 2: 180s (moderate complexity)
- Level 3: 240s (dense maze needs more bombing time)

This keeps time pressure proportional to maze complexity.

### 5.4 Speed Boost Interaction with Bombs

The Speed Boost power-up (`👟`) increases movement speed, but the game doesn't specify:
- Does it stack?
- How long does it last?
- Does it affect bomb escape safety (player may move too fast to judge blast radius)?

**Proposal G-4**: Specify speed boost as:
- Duration: 10 seconds
- Non-stacking (collecting another resets timer)
- Speed: 1.5× normal speed
- Visual indicator: Trail effect or color tint on player

### 5.5 Missing "Start Menu" State

The game description shows HUD, Pause, Game Over, and Victory screens but **no Main Menu / Start Screen**. The `game-status.js` resource references "menu" state but it's never described in the game description.

**Proposal G-5**: Add a start screen specification:
```
╔═══════════════════════════╗
║   👻 MS. GHOSTMAN         ║
║                           ║
║   ▶ Start Game            ║
║   📊 High Scores          ║
║                           ║
║   Arrow Keys: Move        ║
║   Space: Drop Bomb        ║
║   ESC/P: Pause            ║
╚═══════════════════════════╝
```

### 5.6 Ghost-Bomb Interaction Ambiguity

The game description says ghosts "cannot pass through active bombs" (§5.2), but the collision table (§4.2) only covers "Fire vs Ghost → death." What happens when:
- A ghost walks into a bomb (not fire)?  Answer: blocked? walks through?
- A bomb is placed on a ghost's position?

**Proposal G-6**: Explicitly specify:
- Ghosts treat active bombs as walls (cannot enter bomb cells).
- If a bomb is placed on a ghost's cell (player and ghost overlapping), the ghost is pushed to its previous cell direction.

---

## 6. Performance Strategy Review

### 6.1 Budget Alignment with Audit

The performance budget in §7 is **stricter than what the audit actually tests**. The audit (§audit.md) asks:
- "Does the game run at/or around 60fps? (from 50 to 60 or more)" — accepts 50 FPS!
- "Can you confirm there are no frame drops?" — qualitative, not p95

The plan specifies "Strictly ≥ 60 FPS" and "p95 ≤ 16.7ms" — which is significantly stricter.

**Observation**: While exceeding audit requirements is admirable, the "Strictly ≥ 60" target may create unnecessary anxiety. Even Chrome's own UI drops below 60 FPS occasionally.

**Proposal P-1**: Align the budget language:
- **Target**: 60 FPS sustained
- **Acceptable**: ≥ 55 FPS p5 (i.e., only 5% of frames may run below 55 FPS)
- **Unacceptable**: Any sustained period (>500ms) below 50 FPS

### 6.2 DOM Element Budget

The plan says "≤ 500 total DOM elements." For a 15×13 grid game:
- Grid cells: 15 × 13 = 195 static elements
- HUD: ~20 elements
- Player + 4 ghosts + bombs + fire + pellets + power-ups: ~200+ dynamic elements

500 is reasonable but should be verified against the actual map sizes.

**Proposal P-2**: Add a startup assertion that counts DOM elements after level load and warns if approaching 80% of budget:
```js
if (__DEV__) {
  const count = document.querySelectorAll('*').length;
  if (count > 400) console.warn(`DOM element count: ${count}/500`);
}
```

### 6.3 Missing `will-change` Strategy

The plan mentions `will-change: transform` in D-1 but doesn't specify a strategy for managing it. Overuse of `will-change` creates excessive layer promotion (which the audit explicitly checks for).

**Proposal P-3**: Define a `will-change` policy:
- **Player sprite**: `will-change: transform` (always moving)
- **Ghost sprites**: `will-change: transform` (always moving)
- **Bomb sprites**: `will-change: transform` only during fuse animation
- **Fire tiles**: NO `will-change` (short-lived, batch-created)
- **Static grid cells**: NO `will-change` (never change)
- **HUD elements**: NO `will-change` (text-only updates)

This keeps layer count to ~6 (player + 4 ghosts + bomb group) which satisfies "minimal but non-zero."

---

## 7. Testing Strategy Review

### 7.1 Current State: All Tests are Placeholder

The traceability matrix shows all 27 audit questions at `Mapped, Pending` status. The `audit.e2e.test.js` uses a `runAuditAssertion()` placeholder that throws. This means **zero executable test coverage exists**.

> [!CAUTION]
> The Done Criteria (§8) states: "Every question in `docs/audit.md` has explicit automated test coverage and all those tests pass." This gate cannot be met until all 27 assertions are implemented.

### 7.2 E2E Strategy is Unrealistic for Some Audit Questions

Several audit questions are **not automatable** in a meaningful way:
- AUDIT-F-17: "Can you confirm there are no frame drops?" — Requires DevTools Performance recording
- AUDIT-F-19: "Is paint used as little as possible?" — Requires visual inspection of Paint Flashing
- AUDIT-F-20/21: Layer usage assertions — Not accessible from JavaScript

**Proposal TS-1**: Split audit tests into three categories:
1. **Fully Automatable** (Vitest/Playwright): F-01 to F-16, B-01, B-03
2. **Semi-Automatable** (Performance API checks): F-17, F-18 (frame timing)
3. **Manual-With-Evidence** (DevTools traces): F-19, F-20, F-21, B-04, B-05, B-06

For category 3, require a signed evidence artifact rather than a Vitest assertion. Update the traceability matrix to reflect this reality.

### 7.3 Missing Deterministic Replay System

The testing strategy mentions "Replay Determinism: Same seed and same input trace must produce same state hash at frame N." This is an excellent aspiration but the plan provides **no infrastructure for it**:
- No input recording mechanism
- No state hashing function
- No replay playback driver

**Proposal TS-2**: Add a `src/debug/replay.js` module:
```js
export function recordInputFrame(frameIndex, inputSnapshot) { /* push to trace log */ }
export function hashWorldState(world) { /* CRC32 of all component arrays */ }
export function replayFromTrace(world, trace) { /* drive inputs from recorded trace */ }
```
This is not a gameplay feature — it's a test/debug tool that powers the determinism guarantee.

### 7.4 No Test for "Game Doesn't Crash"

AUDIT-F-01 ("Does the game run without crashing?") requires a test that:
1. Boots the game
2. Runs simulation for N seconds
3. Triggers multiple game states (play, pause, resume, death, restart)
4. Asserts no unhandled exceptions

**Proposal TS-3**: Implement this as a "smoke test" that runs the game headlessly for 60 seconds with random input injections. This is the single most valuable test to write first.

---

## 8. Security Posture Review

### 8.1 Appropriate Level for Project Scope

The security rules (CSP, Trusted Types, safe DOM sinks, untrusted storage validation) are appropriate for a web application. However, for a **single-player offline game**, some constraints add complexity without meaningful threat mitigation:

- **CSP/Trusted Types**: Valuable for production, but blocking for development if Vite's hot reload uses inline scripts.
- **Storage validation**: `localStorage` for high scores is the only storage surface. Full JSON Schema validation on read is overkill; a simple type check suffices.

**Proposal S-1**: Keep CSP/Trusted Types as a SHOULD (current status is correct). Add a development-mode bypass note in the plan:
> During development with Vite, CSP enforcement may need relaxation for HMR. Production builds MUST enforce strict CSP.

### 8.2 No XSS Surface

The game has no user-generated content input (no text fields, no chat, no custom usernames). The only DOM sink is `textContent` for HUD. The security posture is inherently strong by design.

**Observation**: The security section of AGENTS.md is more appropriate for a web app with user input. For this game, a simpler "DOM Safety" section would suffice. However, keeping the full security section doesn't hurt and establishes good habits.

---

## 9. Audit Compliance Gap Analysis

### 9.1 Complete Mapping

Every audit question in `audit.md` has a clear path to implementation in the plan. The traceability matrix proves this systematically. **No audit question is unmapped.**

### 9.2 Risk Areas

| Audit Question | Risk Level | Concern |
|---|---|---|
| AUDIT-F-10 (Pause no dropped frames) | 🟡 Medium | Subtle timing bugs in pause/resume are common. The accumulator reset is documented but easy to get wrong in practice |
| AUDIT-F-12 (No key spamming) | 🟢 Low | Input adapter design handles this, well-specified |
| AUDIT-F-19/20/21 (Paint/Layer) | 🔴 High | These are inherently subjective. "As little as possible" has no numeric threshold. Evidence must be compelling |
| AUDIT-B-03 (Memory reuse for jank) | 🟡 Medium | Depends entirely on proper execution of pool/SoA strategy, which is underspecified (see §2.2) |
| AUDIT-B-04 (SVG usage) | 🟢 Low | Plan clearly specifies SVG-first for visual assets |
| AUDIT-B-05 (Asynchronicity) | 🟡 Medium | Plan mentions workers but has no concrete async path. Audio loading could be a better candidate |

### 9.3 Missing Audit Test Infrastructure

The plan requires "one explicit automated test case per question in `docs/audit.md`" but no e2e test runner is specified. The `audit.e2e.test.js` uses Vitest, which is a unit test runner — it cannot:
- Boot a real browser
- Record Performance traces
- Check real FPS

**Proposal AC-1**: Use **Playwright** for true e2e audit tests:
```json
// package.json addition
"devDependencies": {
  "@playwright/test": "^1.x"
}
```
Playwright can:
- Launch a real browser
- Navigate to the game
- Send keyboard input
- Measure `requestAnimationFrame` timing via `page.evaluate()`
- Take screenshots for visual evidence

---

## 10. Documentation Ecosystem Review

### 10.1 Document Hierarchy

The project has **8 documents** for a game that hasn't been built yet. This is thorough but risks:
- **Document drift**: As implementation proceeds, plans and reality will diverge.
- **Onboarding overhead**: A new contributor must read 8 docs before writing code.

**Proposal D-1**: Add a `docs/README.md` that provides a reading-order guide:
```md
# Documentation Guide
1. Start here: `requirements.md` (what we're building)
2. Then: `game-description.md` (how it plays)
3. Then: `implementation-plan.md` (how we build it)
4. Reference: `AGENTS.md` (coding rules), `audit.md` (pass criteria)
5. Process: `agentic-workflow-guide.md` (team workflow)
6. Supporting: `assets-pipeline.md`, `audit-traceability-matrix.md`
```

### 10.2 Redundancy Concerns

Significant content is duplicated across documents:
- **Done Criteria**: Appears in `AGENTS.md`, `implementation-plan.md` §8, and implicitly in `agentic-workflow-guide.md` §6.
- **Performance budgets**: In `AGENTS.md`, `implementation-plan.md` §7, and informally in `audit.md`.
- **Pause semantics**: In `AGENTS.md`, `implementation-plan.md` §1, `game-description.md` §10.
- **Security rules**: In `AGENTS.md` and `agentic-workflow-guide.md` §8.

**Proposal D-2**: Apply the DRY principle to docs:
- Define each rule **once** in its canonical location (`AGENTS.md` for constraints, `game-description.md` for gameplay, `audit.md` for acceptance).
- Other documents should **reference** rather than **repeat**. Use markdown links:
  > See [Pause Semantics](game-description.md#10-pause-menu) for gameplay behavior and [AGENTS.md Loop Rules](../AGENTS.md#loop-timing-and-pause) for implementation constraints.

### 10.3 Four-Developer Model Mismatch

The implementation plan is structured for 4 developers (~91 hours total), but the agentic workflow guide describes a different split:
- **Plan**: Dev 1 (Engine), Dev 2 (Physics/Input), Dev 3 (AI/Rules/Audio), Dev 4 (Rendering/Visual)
- **Workflow guide**: Dev 1 (Loop/Timing/Input), Dev 2 (ECS data/Systems), Dev 3 (Rendering/HUD), Dev 4 (Tests/CI)

These are fundamentally different owner assignments.

**Proposal D-3**: Align the two documents. Either:
- The implementation plan's 4-track model is canonical (recommended — it's more detailed), and the workflow guide should reference it.
- Or unify into a simpler 2-3 person model if the team is actually smaller.

---

## 11. AGENTS.md Review

### 11.1 Overall Assessment: Strong ✅

The AGENTS.md is well-structured, uses RFC-2119 keywords (MUST/SHOULD/MAY) correctly, and covers the right domains. It reads like a professional engineering constraints document.

### 11.2 Strengths

1. **Conflict resolution priority order**: Safety → Correctness → Performance → Style. This is the correct ordering.
2. **Canonical documentation hierarchy**: Clear chain of authority (AGENTS.md → requirements/game-description → audit).
3. **Bug-fix workflow**: Reproduce → Test Fail → Fix → Test Pass → Regression. This is industry best practice.
4. **Evidence Artifact Standard**: Requiring scenario, environment, frame stats, and memory notes for performance changes is excellent.

### 11.3 Issues & Improvement Proposals

#### ISSUE AM-1: Missing Version/Revision Tracking

The file has no version, date, or revision history. When constraints change, there's no way to know if a developer is looking at the current version.

**Proposal AM-1**: Add a YAML frontmatter or header block:
```md
---
version: 1.0.0
last-updated: 2026-03-26
status: active
---
```

#### ISSUE AM-2: "Reduced Motion" is SHOULD, Could Be MUST

The accessibility section says `SHOULD respect prefers-reduced-motion`. Given modern web standards, this should arguably be MUST for animations that aren't core gameplay. The game itself needs animations; the menus and transitions do not.

**Proposal AM-2**: Split the rule:
- **MUST** respect `prefers-reduced-motion` for non-gameplay animations (menus, transitions, decorative effects).
- **SHOULD** provide reduced-motion alternatives for gameplay animations when feasible (e.g., reduced particle count).

#### ISSUE AM-3: Missing Error Handling Policy

AGENTS.md covers security, performance, testing, and architecture — but not **error handling**. What should happen when:
- A map fails to load?
- An audio file isn't found?
- A system throws during a tick?

**Proposal AM-3**: Add an Error Handling section:
```md
## Error Handling
- **Critical errors** (map load failure, world init failure): MUST show a user-visible error state. MUST NOT silently fail.
- **Non-critical errors** (missing audio, asset load failure): SHOULD log a warning and continue with fallback behavior.
- **System errors**: MUST NOT crash the game loop. SHOULD catch at the system boundary and log. SHOULD skip the faulting system for the current frame and retry next frame.
- **Unhandled promises**: MUST install a global `unhandledrejection` handler.
```

#### ISSUE AM-4: Missing Asset Performance Guidelines

The AGENTS.md mentions "DOM pooling" and "compositor-friendly updates" but doesn't mention asset-specific performance rules:
- Maximum SVG complexity per sprite
- Image decode timing constraints
- Audio buffer pre-decoding requirements

**Proposal AM-4**: Add an Asset Performance subsection to Performance Rules:
```md
- **SVG Complexity**: SHOULD keep SVG sprites under 50 path elements to avoid layout recalc overhead.
- **Image Decode**: SHOULD use `createImageBitmap()` for raster assets to decode off-main-thread.
- **Audio**: MUST pre-decode gameplay-critical SFX using `AudioContext.decodeAudioData()` during level load.
```

#### ISSUE AM-5: Web Worker Rule May Be Premature

The rule states: "Heavy computations (like complex pathfinding) MUST define message contracts and offload to Web Workers."

For 4 ghosts on a 15×13 grid, pathfinding is not "heavy." The MUST keyword forces unnecessary worker architecture.

**Proposal AM-5**: Change to:
```md
- **Main Thread**: SHOULD avoid long tasks in gameplay-critical interactions. Heavy computations SHOULD define message contracts and offload to Web Workers **when profiling evidence shows main-thread impact exceeding 4ms per frame.**
```
Add the profiling threshold to make the MUST/SHOULD actionable rather than theoretical.

#### ISSUE AM-6: No Mention of Browser Compatibility Targets

The file specifies "ES modules only" and "Vanilla JavaScript (ES2026)" but doesn't state which browsers must be supported.

**Proposal AM-6**: Add to Core Project Constraints:
```md
| **Browser Targets** | Latest stable Chrome, Firefox, Safari. No IE11 or legacy Edge support required. |
```

#### ISSUE AM-7: Done Criteria Duplicates Audit Coverage

Done Criteria item 6 says "Every question in `docs/audit.md` has explicit automated test coverage and passing results." This is also stated in Testing and Verification, and in the implementation plan. Three places defining the same gate creates maintenance burden.

**Proposal AM-7**: In Done Criteria, replace item 6 with a reference:
```md
6. **Audit**: All audit gates defined in the [Testing and Verification](#testing-and-verification) section are satisfied.
```

---

## 12. Summary of All Proposals

### Architecture (A)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| A-1 | Storage Model | 🔴 High | 🟡 Medium | Define SoA vs AoS component storage explicitly; use TypedArrays for numeric components |
| A-2 | Render Buffer | 🟡 Medium | 🟢 Low | Pre-allocate render intent pool; use bitmask for CSS classes instead of string arrays |
| A-3 | State Machine | 🟡 Medium | 🟢 Low | Add explicit FSM transition table for game states |
| A-4 | Adapter Access | 🟡 Medium | 🟢 Low | Clarify that adapters are World resources, not direct imports in systems |

### Code Organization (O)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| O-1 | Components | 🟢 Low | 🟢 Low | Consolidate 12 component files into 5 grouped files |
| O-2 | Game Module | 🟡 Medium | 🟢 Low | Add `src/game/` directory for orchestration logic |
| O-3 | Test Structure | 🟢 Low | 🟢 Low | Mirror `src/` structure inside `tests/` |

### Implementation Techniques (T)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| T-1 | Sim Rate | 🟢 Low | 🟢 Low | Make simulation Hz configurable via constant |
| T-1 | Sim Rate | 🟢 Low | 🟢 Low | Make simulation Hz configurable via constant |
| T-2 | Interpolation | 🔴 High | 🟡 Medium | Explicitly document lerp formula and alpha computation |
| T-3 | Workers | 🟡 Medium | 🟢 Negative | Remove premature worker offload; add profiling-based gate |
| T-4 | Collision | 🟡 Medium | 🟢 Low | Use cell-occupancy map for O(1) spatial lookups |
| T-5 | Chain Reactions | 🟡 Medium | 🟢 Low | Use iterative detonation queue with depth limit |
| T-6 | DOM Pooling | 🟡 Medium | 🟢 Low | Specify hiding strategy, exhaustion policy, size calculation |

### Game Design (G)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| G-1 | Pellet Safety | 🔴 Critical | 🟢 Low | Prevent bombs from destroying pellets to avoid soft-locks |
| G-2 | Power vs Bomb | 🟡 Medium | 🟢 Low | Differentiate power pellets (defensive) from bombs (offensive) |
| G-3 | Timer Scaling | 🟢 Low | 🟢 Low | Scale countdown per level: 120s / 180s / 240s |
| G-4 | Speed Boost | 🟢 Low | 🟢 Low | Specify duration, stacking, and visual indicator |
| G-5 | Start Menu | 🟢 Low | 🟡 Medium | Add start screen specification |
| G-6 | Ghost-Bomb | 🟢 Low | 🟢 Low | Clarify ghost-bomb cell interaction rules |

### Performance (P)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| P-1 | FPS Target | 🟢 Low | 🟢 Low | Align budget language with audit's actual 50-60 FPS acceptance |
| P-2 | DOM Budget | 🟢 Low | 🟢 Low | Add startup DOM element count assertion |
| P-3 | will-change | 🟡 Medium | 🟢 Low | Define per-element-type `will-change` policy |

### Testing (TS)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| TS-1 | Test Categories | 🔴 High | 🟡 Medium | Split audit tests into fully-, semi-, and manually-automatable |
| TS-2 | Replay System | 🟡 Medium | 🟡 Medium | Add input recording and state hashing for determinism tests |
| TS-3 | Smoke Test | 🔴 High | 🟡 Medium | Implement 60-second random-input smoke test |

### Security (S)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| S-1 | Dev Mode CSP | 🟢 Low | 🟢 Low | Document Vite HMR CSP bypass for development |

### Audit Compliance (AC)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| AC-1 | E2E Runner | 🔴 High | 🟡 Medium | Use Playwright for browser-level audit tests |

### Documentation (D)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| D-1 | Reading Guide | 🟢 Low | 🟢 Low | Add `docs/README.md` with document reading order |
| D-2 | DRY Docs | 🟡 Medium | 🟡 Medium | Deduplicate repeated rules across documents |
| D-3 | Team Model | 🟡 Medium | 🟢 Low | Align plan tracks with workflow guide owner model |

### AGENTS.md (AM)

| ID | Category | Impact | Effort | Proposal |
|---|---|---|---|---|
| AM-1 | Versioning | 🟢 Low | 🟢 Low | Add version/date frontmatter |
| AM-2 | Reduced Motion | 🟢 Low | 🟢 Low | MUST for non-gameplay animations |
| AM-3 | Error Handling | 🟡 Medium | 🟢 Low | Add Error Handling section |
| AM-4 | Asset Perf | 🟡 Medium | 🟢 Low | Add asset-specific performance guidelines |
| AM-5 | Worker Threshold | 🟡 Medium | 🟢 Low | Add profiling threshold before mandating workers |
| AM-6 | Browser Targets | 🟡 Medium | 🟢 Low | Specify supported browsers |
| AM-7 | Done Dedup | 🟢 Low | 🟢 Low | Reduce duplication in Done Criteria |

---

> [!TIP]
> **Priority recommendation**: Start with proposals G-1 (pellet safety — prevents soft-lock), A-1 (storage model — impacts all systems), T-2 (interpolation formula — impacts visual quality), and AC-1 (Playwright — unblocks all audit tests). These four changes would have the highest impact on both game quality and audit pass probability.
