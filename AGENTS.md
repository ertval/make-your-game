# Agent Instructions: Modern JavaScript 2026 DOM + ECS Game Development

> **Standards & Guidelines** — Mandatory technical constraints and workflows for development.

---

## Semantics and Priority

- **MUST**: Mandatory requirement.
- **SHOULD**: Default unless a documented exception exists.
- **MAY**: Optional.

### Conflict Resolution
If rules conflict, prioritize in the following order:
1. Safety and hard project constraints
2. Deterministic correctness and testability
3. Performance and frame stability
4. Local code style preferences

### Canonical Documentation Rule
- **AGENTS.md is normative** for implementation constraints and audit gates.
- If another document conflicts with this file, **AGENTS.md wins** unless an approved ADR explicitly supersedes it.
- Documentation SHOULD avoid duplicating normative constraints unless it links back to this canonical file.

---

## Core Project Constraints

| Requirement | Description |
|---|---|
| **Tech Stack** | Vanilla JavaScript (ES modules only), semantic HTML, CSS, and SVG. |
| **Forbidden** | MUST NOT use canvas, WebGL, WebGPU, or rendering frameworks. |
| **Gameplay** | MUST preserve single-player gameplay and genre alignment with requirements docs. |
| **Pause Menu** | MUST preserve actions: Continue and Restart. |
| **HUD** | MUST maintain metrics: timer/countdown, score, and lives. |

---

## ECS Architecture Rules

- **Structure**: MUST structure gameplay with ECS: entities as opaque IDs, components as data-only, systems as behavior.
- **Systems**: MUST keep systems single-purpose and execution order explicit.
- **Determinism**: MUST keep simulation deterministic for identical seed + input + timing.
- **Components**: MUST NOT store DOM nodes, listeners, impure closures, or browser state.
- **DOM Isolation**: Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems.
- **Storage**: SHOULD use data-oriented storage and stable iteration order on hot paths.

---

## Loop, Timing, and Pause

- **Core Loop**: MUST run with `requestAnimationFrame` only.
- **Simulation**: MUST use rAF timestamp or `performance.now()` and a fixed-step simulation with accumulator.
- **Catch-up**: MUST clamp catch-up work (`maxStepsPerFrame`) to prevent spiral-of-death after throttling.
- **Pause State**: MUST keep rAF active while paused and freeze simulation time/state progression.
- **Clock Separation**: SHOULD keep real/render clock separate from simulation clock.
- **Resume Safety**: MUST reset timing baseline on unpause (`lastFrameTime = now`) and clear/cap accumulator to prevent a burst frame.
- **Visibility Handling**: SHOULD treat `visibilitychange`/`blur` as lifecycle events and resynchronize clocks on return.

---

## Input Rules

- **Tracking**: MUST track hold input using `keydown` sets and `keyup` clears.
- **Application**: MUST apply movement/actions from key state in per-frame simulation updates.
- **Key-Repeat**: MUST NOT rely on OS key-repeat for continuous movement.
- **Focus Loss Safety**: MUST clear held-key state on `blur` and when document becomes hidden to prevent stuck input.
- **Snapshot Determinism**: MUST snapshot input state once per fixed simulation step and consume snapshot data in systems.

---

## ECS Data and Mutation Discipline

- **Hot Path Storage**: SHOULD keep hot-path component data in data-oriented structures and stable iteration order.
- **Structural Deferral**: MUST defer entity/component add/remove operations to a controlled sync point.
- **Entity Recycling**: SHOULD use ID recycling with stale-handle protection semantics.
- **Event Ordering**: MUST process cross-system events in deterministic insertion order.

---

## Rendering and DOM Rules

- **Updates**: MUST use compositor-friendly updates (`transform`, `opacity`) in animation loops.
- **Batching**: MUST batch DOM writes in a dedicated render commit phase once per frame.
- **Thrashing**: MUST avoid layout thrashing (separate read and write phases; no repeated read/write interleaving).
- **Pooling**: MUST use DOM pooling for high-churn visuals (bombs, fire, ghosts, effects).
- **Promotion**: SHOULD use minimal-but-nonzero layer promotion where beneficial.
- **Commit Phases**: MUST separate render read/compute from DOM write commit phases.
- **No Forced Reflow Loops**: MUST NOT interleave layout reads and writes in hot loops.

---

## Performance and Memory Rules

- **Allocations**: MUST avoid recurring allocations in hot loops.
- **Preallocation**: MUST preallocate or pool transient entities and corresponding DOM nodes.
- **Mutation**: MUST mutate hot-path buffers in place when profiling indicates allocation pressure.
- **Main Thread**: SHOULD avoid long tasks in gameplay-critical interactions. Heavy computations (like complex pathfinding) MUST define message contracts and offload to Web Workers.

---

## Bug-Fix Workflow (Required)

Follow this sequence for every reported issue:

1. **Reproduce**: Reproduce the bug.
2. **Test Fail**: Add a failing test.
3. **Fix**: Implement minimal fix.
4. **Test Pass**: Prove fix with passing tests.
5. **Regression**: Verify no regressions in related systems.

*Note: If no deterministic repro is possible after 2 bounded attempts:*
- Document blocker and attempted repro paths.
- Capture minimal evidence (logs/steps/observed vs expected).
- Request guidance before broad or risky changes.

---

## Security and Code Quality

- **Tooling**: MUST use Biome for linting and formatting.
- **CI Governance**: MUST enforce merge gates (linting, tests, coverage) and dependency lockfile policies (with SBOM).
- **Data Validation**: MUST validate JSON maps against JSON Schema 2020-12 in CI.
- **Sinks and Policies**: MUST use safe DOM sinks (`textContent`, explicit attribute APIs), and strictly enforce Content Security Policy (CSP) and Trusted Types.
- **Injection**: MUST avoid unsafe HTML injection for untrusted content.
- **Legacy**: MUST NOT use `var`, `require`, or `XMLHttpRequest`.
- **Event Handlers**: MUST use `addEventListener`; MUST NOT use inline handler attributes.
- **Storage Trust Boundary**: MUST treat `localStorage`/`sessionStorage` data as untrusted input and validate on read.
- **CSP and Trusted Types**: SHOULD enforce strict CSP and Trusted Types where deployment allows.

---

## Accessibility and UX Invariants

- **Keyboard First**: MUST keep full game and menu control available by keyboard only.
- **Pause Focus**: MUST move focus into pause UI on open and restore focus on close.
- **HUD Announcements**: SHOULD use meaningful, throttled status updates instead of per-frame announcement spam.
- **Reduced Motion**: SHOULD respect `prefers-reduced-motion` for non-essential animations.

---

## Testing and Verification

### Layer-Specific Testing
- **Unit Tests**: For pure systems and components.
- **Integration Tests**: For world ordering and cross-system interaction.
- **Adapter Tests**: For renderer and input boundaries.

### Invariants
- SHOULD include seed-based determinism tests for timing/input-sensitive behavior.
- MUST verify pause invariants: rAF active, simulation frozen, HUD responsive.

---

## Performance Acceptance Criteria (Auditable)

For gameplay-critical update/render/input work, provide profile evidence that:

| Metric | Target |
|---|---|
| **Frame Rate** | 60 FPS target maintained during normal play and pause/resume flow. |
| **Frame Time** | p95 frame time <= 16.7 ms over a representative 60-second sample. |
| **Stutter** | No sustained dropped-frame pattern (continuous multi-second stutter bursts). |
| **Long Tasks** | No recurring long tasks > 50 ms on the main interaction path. |
| **Allocations** | No repeated burst allocations in core loops after warm-up. |

*Evidence notes MUST include scenario, trace window, and key observations.*

### Evidence Artifact Standard

For gameplay-critical changes, evidence MUST include:
1. Scenario definition (normal play, stress play, pause/resume).
2. Environment (browser version, OS, machine class, throttle conditions).
3. Frame stats (`p50`, `p95`, `p99`) and dropped-frame notes.
4. Main-thread notes (long tasks, style/layout/paint observations).
5. Memory notes (allocation/GC behavior after warm-up).

---

## Done Criteria

A task is complete only when:

1. **Linter**: Biome passes for changed scope.
2. **Tests**: Relevant tests pass (including new repro/regression tests for bug fixes).
3. **Architecture**: ECS boundaries remain intact (no forbidden DOM calls in simulation systems).
4. **Functional**: Functional coverage remains intact (single-player, pause Continue/Restart, HUD timer/score/lives).
5. **Audit**: Performance criteria are validated for gameplay-critical changes.