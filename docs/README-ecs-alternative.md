# Ms. Ghostman ECS Alternative README (2026)

## Purpose
This document defines an ECS-first alternative architecture for Ms. Ghostman while preserving project constraints:
- vanilla JavaScript only
- DOM and SVG rendering only
- no canvas and no frameworks
- requestAnimationFrame-based runtime
- 60 FPS target with minimal paint and layer usage

## Why This ECS Alternative Exists
The current FCIS plan is already strong for a grid game. This ECS alternative exists as a scalability and data-oriented option:
1. Improve hot-loop performance via tighter data layouts and stable system passes.
2. Reduce cross-feature coupling by enforcing component and system boundaries.
3. Keep deterministic simulation behavior while preserving DOM safety constraints.

For this project size, ECS is optional but useful if entity count and interaction complexity grow.

## Proposed ECS Folder Structure

```text
src/
  ecs/
    world/
      world.js                # World lifecycle, system scheduler, frame context
      entity-store.js         # Entity IDs and recycling
      query.js                # Query helpers for component masks
    components/
      position.js             # row/col + interpolation data
      velocity.js
      player.js
      ghost.js
      bomb.js
      fire.js
      collider.js
      health.js
      score.js
      timer.js
      input-state.js
      renderable.js           # sprite key, classes, z-index hints
      pooled-dom.js           # DOM node handles for pooled renderables
    systems/
      input-system.js
      player-move-system.js
      ghost-ai-system.js
      bomb-tick-system.js
      explosion-system.js
      collision-system.js
      scoring-system.js
      timer-system.js
      life-system.js
      pause-system.js
      level-progress-system.js
      render-collect-system.js
      render-dom-system.js    # final batched DOM writes only
    resources/
      constants.js
      rng.js                  # seeded RNG for determinism
      clock.js                # injected clock/timestamp helpers
      map-resource.js         # loaded map state, spawn tables
  adapters/
    dom/
      renderer-adapter.js
      sprite-pool-adapter.js
      hud-adapter.js
      screens-adapter.js
    io/
      input-adapter.js
      storage-adapter.js
      audio-adapter.js
  main.ecs.js                 # ECS bootstrap
```

## ECS Core Concepts in This Project
1. Entity
- An opaque numeric ID. No behavior methods.

2. Component
- Data-only records attached to entities (for example Position, Ghost, Bomb).
- No DOM references in pure simulation components.

3. System
- A deterministic function that queries component sets and mutates state in a fixed order.
- One clear concern per system.

4. World
- Owns entities, components, resources, and system scheduling.
- Executes systems in well-defined phases each frame.

5. Query
- Retrieves entity sets that match component requirements.
- Reused and allocation-light in hot loops.

## Main Loop Organization (ECS)

1. requestAnimationFrame tick starts.
2. Input adapter snapshots key states into input resources.
3. Accumulator runs fixed-step simulation updates:
- Input systems
- Movement and AI systems
- Bomb and explosion systems
- Collision and scoring systems
- Timer and state-transition systems
4. Render collect system computes render intents from ECS state.
5. Render DOM system applies one batched DOM write phase.
6. HUD adapter updates only changed textContent fields.

Pause behavior:
- rAF continues.
- simulation steps are skipped while paused.
- pause overlay and HUD remain responsive.

## Rendering Strategy for DOM and SVG
1. Use static DOM grid creation at startup.
2. Use pooled DOM nodes for transient entities (bombs, fire tiles, ghost effects).
3. Move entities using transform and opacity only.
4. Avoid top/left animation and avoid frequent node creation/removal.
5. Keep layer promotion minimal and intentional.

## Performance and Memory Strategy
1. Hot-loop mutability:
- Mutate component buffers in place during fixed-step updates.

2. Allocation control:
- Reuse query buffers and temporary arrays.
- Pool entity IDs and pooled DOM nodes.

3. Batching:
- Separate simulation from DOM writes.
- One render commit pass per frame.

4. Verification:
- Profile gameplay, pause, and resume flows.
- Track frame stability and dropped-frame patterns.

## Migration Plan from FCIS to ECS
1. Start by wrapping existing feature modules as systems without changing behavior.
2. Move shared game state slices into component stores incrementally.
3. Replace direct feature-to-feature calls with world resources and system ordering.
4. Introduce render-collect then render-dom split to enforce write batching.
5. Keep existing tests, then add system-level deterministic tests before removing old paths.

## Testing Strategy for ECS
1. Unit tests:
- Pure systems with seeded RNG and injected clocks.

2. Integration tests:
- World scheduling order and cross-system interactions (bomb chain, pause, respawn).

3. Adapter tests:
- Input normalization and DOM batching outputs.

4. Determinism tests:
- Same seed + same input trace => same final state.

5. Performance guard tests:
- No excessive per-frame allocations in hot systems.

## Practical Recommendation
Use FCIS as default for current delivery speed, and use this ECS alternative when performance complexity increases or when feature interactions make central world scheduling more maintainable.