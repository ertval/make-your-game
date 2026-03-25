# Agent Instructions: ECS-First Vanilla DOM Game Development (2026)

## Purpose
This document defines required coding and architecture behavior for an Entity Component System (ECS) implementation in this project.

All instructions are compatible with project constraints:
- Vanilla JavaScript only
- Semantic HTML, CSS, SVG rendering only
- No canvas, no WebGL, no WebGPU, no external rendering framework
- requestAnimationFrame-driven runtime loop

## Instruction Semantics
- MUST: mandatory requirement
- SHOULD: strongly recommended unless a documented exception exists
- MAY: optional

If two rules appear to conflict, prioritize:
1. Safety and project hard constraints
2. Deterministic correctness and testability
3. Performance targets and frame stability
4. Local code style preferences

## Core ECS Directives
- MUST structure gameplay logic around ECS: entities as IDs, components as pure data, systems as behavior.
- MUST keep systems focused and single-purpose; avoid monolithic "god systems."
- MUST keep game rules deterministic for identical input and timing streams.
- MUST avoid quick fixes for bugs: reproduce first, test first, then fix.
- MUST maintain clear module boundaries; no cross-layer leakage.
- SHOULD use data-oriented design for hot paths (contiguous arrays and stable iteration order).
- SHOULD keep system execution order explicit and centrally documented.

## Architecture Boundaries (Required)

### 1) World Layer
- MUST provide a World that owns:
  - entity lifecycle (create, recycle, destroy)
  - component storage
  - system registration and execution order
  - frame context (delta time, elapsed simulation time, pause state)
- MUST keep World operations explicit and testable.
- MUST support deterministic replay hooks (seeded RNG and injectable clock).

### 2) Entities, Components, Systems
- Entities:
  - MUST be opaque identifiers only (no behavior on entity objects).
- Components:
  - MUST be data-only, serializable where practical.
  - MUST NOT include DOM nodes, event listeners, or impure closures.
- Systems:
  - MUST read and write component data through World APIs or sanctioned storage accessors.
  - MUST NOT call DOM APIs directly, except dedicated adapter or render systems.
  - SHOULD avoid allocations in per-frame hot loops.
  - SHOULD process entities in stable deterministic order.

### 3) Adapter Layer (DOM, Input, Time, Storage, Audio)
- MUST isolate side effects in adapters.
- MUST keep ECS simulation independent from browser APIs.
- MUST treat renderer, input, and external IO as boundary systems or adapters.
- MUST pass only normalized, validated data into simulation systems.

## Rendering and DOM Constraints (Required)
- MUST use DOM and SVG rendering only; canvas and frameworks are forbidden.
- MUST run simulation and rendering from requestAnimationFrame.
- MUST animate moving entities with transform and opacity only in active loops.
- MUST batch DOM writes at end-of-frame in a dedicated render phase.
- MUST avoid layout thrash:
  - do not interleave repeated layout reads and style writes in one frame
  - do not repeatedly create or remove DOM nodes for transient entities
- MUST use DOM pooling for high-churn visuals (for example bullets, explosions, enemies).
- SHOULD keep layer promotion minimal but nonzero when needed for smoothness.
- SHOULD avoid expensive paint-triggering properties in animation loops.

## Performance and Memory Rules (60 FPS)
- MUST target stable 60 FPS gameplay under normal load.
- MUST avoid per-frame object or array churn in hot systems.
- MUST preallocate or pool objects for rapid-lifecycle entities.
- MUST mutate hot-path buffers in place when profiling indicates allocation pressure.
- SHOULD keep per-frame main-thread work under frame budget.
- SHOULD avoid long tasks in gameplay-critical interactions.

### Performance Acceptance Criteria
For gameplay loop, render, or input changes, include evidence that:
- p95 frame time <= 16.7 ms during a representative play window.
- No sustained frame-drop pattern during normal play and pause or resume flows.
- requestAnimationFrame remains active while paused.
- Simulation time remains frozen while paused.
- No repeated burst allocations in core hot loops after warm-up.

## Input, Pause, Timing, and Batching Expectations

### Input
- MUST track key state by physical keydown and keyup transitions.
- MUST apply movement and actions from key state inside the frame loop.
- MUST avoid relying on OS key-repeat for continuous motion.
- SHOULD normalize input actions before simulation consumption.

### Pause
- MUST support pause without stopping requestAnimationFrame.
- MUST freeze simulation progression while paused.
- MUST keep pause UI responsive and renderable while paused.
- MUST preserve state integrity across pause and resume cycles.

### Timing
- MUST use rAF timestamp or performance.now for timing.
- SHOULD use fixed-step simulation with accumulator for deterministic behavior.
- MUST bound catch-up updates to prevent spiral-of-death behavior after tab throttling.

### Render Batching
- MUST gather render intents from simulation state first.
- MUST apply DOM mutations in one render batch phase per frame.
- SHOULD separate read phase and write phase to reduce forced reflow risk.

## Testing and Bugfix Workflow (Required)
- MUST follow bug workflow:
  1. identify root cause hypothesis
  2. create a failing repro test first
  3. implement minimal fix
  4. prove fix with passing tests
  5. verify no regression in related systems
- MUST add tests at the correct level:
  - unit tests for pure systems and component transforms
  - integration tests for world and system ordering and interaction
  - adapter tests for renderer and input boundary behavior
- MUST document blockers if a deterministic repro test cannot be created after bounded attempts.
- SHOULD include seed-based deterministic tests for time and input-sensitive behavior.

## Security and Tooling Constraints
- MUST use safe DOM sinks by default:
  - prefer textContent and explicit element or attribute APIs
  - avoid unsafe HTML injection paths unless sanitized by approved mechanism
- MUST use ES modules only (import and export).
- MUST NOT use var, require, or XMLHttpRequest.
- MUST keep untrusted data away from scriptable sinks and inline event attributes.
- MUST run Biome for lint and format checks on changed code.
- MUST run Vitest for relevant tests before considering work complete.
- SHOULD keep test suites fast and deterministic.

## Done Criteria (Required)
A task that changes ECS logic, loop timing, input, or rendering is complete only when:
- Biome checks pass for modified scope.
- Vitest tests pass for modified scope, including new repro or regression tests when fixing bugs.
- ECS boundaries remain intact (no forbidden DOM calls in pure systems).
- Performance acceptance criteria are satisfied with brief evidence notes.
- Project restrictions remain satisfied:
  - no canvas or framework rendering
  - DOM and SVG only
  - requestAnimationFrame loop preserved