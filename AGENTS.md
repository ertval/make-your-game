# Agent Instructions: Modern JavaScript 2026 DOM + ECS Game Development

## Semantics and Priority
- MUST = mandatory requirement.
- SHOULD = default unless a documented exception exists.
- MAY = optional.
- If rules conflict, prioritize:
  1. Safety and hard project constraints
  2. Deterministic correctness and testability
  3. Performance and frame stability
  4. Local code style preferences

## Core Project Constraints
- MUST use Vanilla JavaScript (ES modules only), semantic HTML, CSS, and SVG.
- MUST NOT use canvas, WebGL, WebGPU, or rendering frameworks.
- MUST preserve single-player gameplay and genre alignment with requirements docs.
- MUST preserve pause menu actions: Continue and Restart.
- MUST maintain HUD metrics: timer/countdown, score, and lives.

## ECS Architecture Rules
- MUST structure gameplay with ECS: entities as opaque IDs, components as data-only, systems as behavior.
- MUST keep systems single-purpose and execution order explicit.
- MUST keep simulation deterministic for identical seed + input + timing.
- Components MUST NOT store DOM nodes, listeners, impure closures, or browser state.
- Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems.
- SHOULD use data-oriented storage and stable iteration order on hot paths.

## Loop, Timing, and Pause
- MUST run core loop with `requestAnimationFrame` only.
- MUST use rAF timestamp or `performance.now()` and a fixed-step simulation with accumulator.
- MUST clamp catch-up work (`maxStepsPerFrame`) to prevent spiral-of-death after throttling.
- MUST keep rAF active while paused and freeze simulation time/state progression.
- SHOULD keep real/render clock separate from simulation clock.

## Input Rules
- MUST track hold input using `keydown` sets and `keyup` clears.
- MUST apply movement/actions from key state in per-frame simulation updates.
- MUST NOT rely on OS key-repeat for continuous movement.

## Rendering and DOM Rules
- MUST use compositor-friendly updates (`transform`, `opacity`) in animation loops.
- MUST batch DOM writes in a dedicated render commit phase once per frame.
- MUST avoid layout thrashing (separate read and write phases; no repeated read/write interleaving).
- MUST use DOM pooling for high-churn visuals (bombs, fire, ghosts, effects).
- SHOULD use minimal-but-nonzero layer promotion where beneficial.

## Performance and Memory Rules
- MUST avoid recurring allocations in hot loops.
- MUST preallocate or pool transient entities and corresponding DOM nodes.
- MUST mutate hot-path buffers in place when profiling indicates allocation pressure.
- SHOULD avoid long tasks in gameplay-critical interactions.

## Bug-Fix Workflow (Required)
- MUST follow this sequence when feasible:
  1. Reproduce the bug.
  2. Add a failing test.
  3. Implement minimal fix.
  4. Prove fix with passing tests.
  5. Verify no regressions in related systems.
- If no deterministic repro is possible after 2 bounded attempts:
  1. Document blocker and attempted repro paths.
  2. Capture minimal evidence (logs/steps/observed vs expected).
  3. Request guidance before broad or risky changes.

## Security and Code Quality
- MUST use Biome for linting and formatting.
- MUST use safe DOM sinks (`textContent`, explicit attribute APIs).
- MUST avoid unsafe HTML injection for untrusted content.
- MUST NOT use `var`, `require`, or `XMLHttpRequest`.

## Testing and Verification
- MUST add tests at the right layer:
  - unit tests for pure systems/components
  - integration tests for world ordering and cross-system interaction
  - adapter tests for renderer/input boundaries
- SHOULD include seed-based determinism tests for timing/input-sensitive behavior.
- MUST verify pause invariants: rAF active, simulation frozen, HUD responsive.

## Performance Acceptance Criteria (Auditable)
For gameplay-critical update/render/input work, provide profile evidence that:
- 60 FPS target is maintained during normal play and pause/resume flow.
- p95 frame time <= 16.7 ms over a representative 60-second sample.
- No sustained dropped-frame pattern (continuous multi-second stutter bursts).
- No recurring long tasks > 50 ms on the main interaction path.
- No repeated burst allocations in core loops after warm-up.

Evidence notes MUST include scenario, trace window, and key observations.

## Done Criteria
A task is complete only when:
1. Biome passes for changed scope.
2. Relevant tests pass (including new repro/regression tests for bug fixes).
3. ECS boundaries remain intact (no forbidden DOM calls in simulation systems).
4. Functional coverage remains intact (single-player, pause Continue/Restart, HUD timer/score/lives).
5. Performance criteria are validated for gameplay-critical changes.