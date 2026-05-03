# 🚀 Test Coverage Roadmap to 90% in Every Category

This report outlines exactly which files per track have less than 90% branch or function coverage and details the necessary testing enhancements needed to achieve the required **90% coverage threshold** across all categories (functions, branches, lines, and statements).

---

## 🛡️ Track A: ECS Core & Game Bootstrap

Track A contains the critical game loop, entity store, world management, and bootstrap code. Since much of this relies on dynamic browser or environment variables, coverage currently lags on certain branches.

### 1. `src/ecs/world/world.js`
- **Current Coverage**: ~73.68% branches, ~79.24% functions.
- **Why it lags**: Large switch statements for events/messages, deferred entity deletions, and environment fallback conditions.
- **Tests Needed to Add/Update**:
  - Add tests specifically covering the execution paths where entities are deleted mid-tick to test the internal deferred structural modification sync point.
  - Test all edge cases of world component mutations and direct entity recycling (e.g., trying to modify a deleted or stale entity handle).
  - Add specific world serialization/deserialization tests covering missing branch cases.

### 2. `src/ecs/world/entity-store.js`
- **Current Coverage**: ~75.86% branches, ~77.77% functions.
- **Why it lags**: Entity handle validation and ID recycling edge cases.
- **Tests Needed to Add/Update**:
  - Test explicit entity ID wrapping behavior and entity handle reuse where IDs exceed original preallocated bounds.
  - Add tests validating that passing invalid entity handles returns `undefined` or throws early errors.

### 3. `src/game/bootstrap.js`
- **Current Coverage**: ~78.75% branches, ~86.66% functions.
- **Why it lags**: Browser initialization, dynamic context creation, and fallback configuration logic.
- **Tests Needed to Add/Update**:
  - Mock various browser states (e.g., missing `localStorage`, missing DOM nodes, or varied initialization dimensions).
  - Test with incomplete maps to exercise initial load fallback branches.

### 4. `src/game/game-flow.js`
- **Current Coverage**: ~67.69% branches, ~75.55% functions.
- **Why it lags**: State machine transitions for the game lifecycle (`mainMenu`, `active`, `paused`, `gameOver`).
- **Tests Needed to Add/Update**:
  - Exercise transition logic for rapid, consecutive pause/unpause, unhandled promise rejections during transition, and mid-simulation clock changes.
  - Test state machine error recoveries.

### 5. `src/shared/env.js` and `src/security/trusted-types.js`
- **Current Coverage**: ~66% functions for `env.js`, and `trusted-types.js` has no coverage.
- **Tests Needed to Add/Update**:
  - Supply mock global states in Vitest (`globalThis.window.trustedTypes`) to exercise full initialization paths.
  - Inject multiple mock `process.env` configurations into `env.js` unit tests.

---

## 🏃 Track B: Component Registry & Movement Systems

Track B contains movement processing, collision logic, and the central gameplay event loop.

### 1. `src/adapters/io/input-adapter.js`
- **Current Coverage**: ~85.71% branches.
- **Why it lags**: Handling of multiple concurrent key combinations and window focus/blur scenarios.
- **Tests Needed to Add/Update**:
  - Add integration tests for simulated simultaneous keyboard input sequences.
  - Explicitly test focus/blur state transitions where the event queues are flushed or cleared mid-tick.

### 2. `src/ecs/systems/collision-system.js` and `collision-gameplay-events.js`
- **Current Coverage**: ~82.6% to 85.38% branches.
- **Why it lags**: Intricate boundary conditions and collision event queuing.
- **Tests Needed to Add/Update**:
  - Add targeted unit tests for multi-entity collision intersection cases.
  - Test early collision exits when entities possess missing components.
  - Add tests for entities crossing map borders.

### 3. `src/ecs/systems/player-move-system.js`
- **Current Coverage**: ~82.35% branches.
- **Why it lags**: Vector parsing and grid alignment clamping.
- **Tests Needed to Add/Update**:
  - Add tests verifying movement clamping for extreme float coordinate inputs.
  - Test cornering/sliding behavior when the player bumps against non-orthogonal walls.

---

## ⏱️ Track C: UI, HUD, & Resource Management

Track C contains timing, player stats, and spawn manager resources.

### 1. `src/ecs/systems/spawn-system.js` and `timer-system.js`
- **Current Coverage**: ~78.21% branches in `spawn-system`, ~86% in `timer-system`.
- **Why it lags**: Stagger timing loops, maximum-cap ghost limits, and ticking conditions.
- **Tests Needed to Add/Update**:
  - Test ghost spawning with an already completely filled map to verify absolute cap enforcement branches.
  - Add mock ticking tests where simulation delta steps are extremely small or negative to stress the accumulator.

### 2. `src/ecs/resources/game-status.js`
- **Current Coverage**: ~85.71% branches.
- **Why it lags**: High-level score validation and life decrement operations.
- **Tests Needed to Add/Update**:
  - Add tests specifically asserting game over states when life decrement operations drop below zero.

---

## 🎨 Track D: Renderer & DOM Utilities

Track D contains performance-critical DOM reads/writes, sprite pooling, and SVG parsing.

### 1. `src/adapters/dom/renderer-adapter.js` and `renderer-dom.js`
- **Current Coverage**: ~66.66% to 85.24% branches.
- **Why it lags**: Real browser DOM interaction branches that are mocked out in Node.
- **Tests Needed to Add/Update**:
  - Add complete tests using JSDOM to mimic accurate layer generation, CSS classes injection, and DOM node structural parsing.
  - Mock diverse board dimensions to test fallback layout generation code paths.

### 2. `src/adapters/dom/renderer-board-css.js` and `sprite-pool-adapter.js`
- **Current Coverage**: ~81.25% to 88.23% branches.
- **Why it lags**: Complex coordinate translation and translation transform pooling optimizations.
- **Tests Needed to Add/Update**:
  - Add unit tests validating out-of-bounds entity translations to assert hidden pool translation (`translate(-9999px, -9999px)`).
  - Test that returning sprites to an exhausted pool creates fallback nodes safely without throwing runtime exceptions.
