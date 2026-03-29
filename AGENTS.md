---
version: 1.1.0
last-updated: 2026-03-28
status: active
---

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
- **`docs/requirements.md` + `docs/game-description.md` are the gameplay/feature source of truth.**
- **`docs/audit.md` is the pass/fail acceptance source of truth.**
- When in doubt on requirements or acceptance, teams MUST resolve against those three files.

---

## Core Project Constraints

| Requirement | Description |
|---|---|
| **Tech Stack** | Vanilla JavaScript (ES modules only), semantic HTML, CSS, and SVG. |
| **Forbidden** | MUST NOT use canvas, WebGL, WebGPU, or rendering frameworks. |
| **Gameplay** | MUST preserve single-player gameplay and genre alignment with requirements docs. |
| **Pause Menu** | MUST preserve actions: Continue and Restart. |
| **HUD** | MUST maintain metrics: timer/countdown, score, and lives. |
| **Browser Targets** | Latest stable Chrome, Firefox, Safari. No IE11 or legacy Edge support required. |

---

## ECS Architecture Rules

- **Structure**: MUST structure gameplay with ECS: entities as opaque IDs, components as data-only, systems as behavior.
- **Systems**: MUST keep systems single-purpose and execution order explicit.
- **Determinism**: MUST keep simulation deterministic for identical seed + input + timing.
- **Components**: MUST NOT store DOM nodes, listeners, impure closures, or browser state.
- **DOM Isolation**: Simulation systems MUST NOT call DOM APIs; side effects live in adapters or dedicated render systems.
- **Storage**: SHOULD use data-oriented storage and stable iteration order on hot paths.
- **Adapter Injection**: Adapters MUST be registered as World resources and accessed through the resource API. Systems MUST NOT import adapters directly — doing so would violate DOM isolation boundaries.

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
- **Pooling**: MUST use DOM pooling for high-churn visuals (bombs, fire, ghosts, effects). Pool elements MUST be hidden with `transform: translate(-9999px, -9999px)` — not `display:none` — to avoid triggering layout.
- **Promotion**: SHOULD use minimal-but-nonzero layer promotion where beneficial. See `will-change` policy: only player and ghost sprites carry `will-change: transform` during active gameplay.
- **Commit Phases**: MUST separate render read/compute from DOM write commit phases.
- **No Forced Reflow Loops**: MUST NOT interleave layout reads and writes in hot loops.

---

## Performance and Memory Rules

- **Allocations**: MUST avoid recurring allocations in hot loops.
- **Preallocation**: MUST preallocate or pool transient entities and corresponding DOM nodes.
- **Mutation**: MUST mutate hot-path buffers in place when profiling indicates allocation pressure.
- **Main Thread**: SHOULD avoid long tasks in gameplay-critical interactions. Heavy computations SHOULD define message contracts and offload to Web Workers **only when profiling evidence shows main-thread impact exceeding 4 ms per frame**. A Web Worker for ghost pathfinding is NOT required unless this threshold is exceeded on a representative device.

### Asset Performance

- **SVG Complexity**: SHOULD keep SVG sprites under 50 path elements to avoid paint and layout recalc overhead.
- **Image Decode**: SHOULD use `createImageBitmap()` for raster assets to decode off the main thread.
- **Audio Preload**: MUST pre-decode gameplay-critical SFX using `AudioContext.decodeAudioData()` during level load so playback is instantaneous.

---

## Error Handling

- **Critical errors** (map load failure, world init failure): MUST show a user-visible error state. MUST NOT silently fail.
- **Non-critical errors** (missing audio clip, individual asset load failure): SHOULD log a `console.warn` and continue with fallback behavior (e.g., silent SFX, placeholder sprite class).
- **System errors** (exception thrown inside a system tick): MUST NOT crash the game loop. SHOULD catch at the system-dispatch boundary, log the error, and skip the faulting system for the current frame.
- **Unhandled promise rejections**: MUST install a global `unhandledrejection` handler that logs the rejection reason and shows an error overlay for critical failures.

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
- **CI Governance**: MUST enforce merge gates (linting and tests). When `package.json` and corresponding scripts are present, CI MUST also enforce coverage and dependency lockfile policies (with SBOM).
- **Data Validation**: MUST validate JSON maps against JSON Schema 2020-12 in CI.
- **Sinks and Policies**: MUST use safe DOM sinks (`textContent`, explicit attribute APIs), and strictly enforce Content Security Policy (CSP) and Trusted Types.
- **Injection**: MUST avoid unsafe HTML injection for untrusted content.
- **Legacy**: MUST NOT use `var`, `require`, or `XMLHttpRequest`.
- **Event Handlers**: MUST use `addEventListener`; MUST NOT use inline handler attributes.
- **Storage Trust Boundary**: MUST treat `localStorage`/`sessionStorage` data as untrusted input and validate on read.
- **CSP and Trusted Types**: SHOULD enforce strict CSP and Trusted Types where deployment allows. During development with Vite, CSP enforcement MAY be relaxed to allow HMR inline scripts. Production builds MUST enforce strict CSP.

---

## Accessibility and UX Invariants

- **Keyboard First**: MUST keep full game and menu control available by keyboard only.
- **Pause Focus**: MUST move focus into pause UI on open and restore focus on close.
- **HUD Announcements**: SHOULD use meaningful, throttled status updates instead of per-frame announcement spam.
- **Reduced Motion (Non-Gameplay)**: MUST respect `prefers-reduced-motion` for non-gameplay animations — menus, transitions, overlays, and decorative effects MUST be disabled or simplified when the media query is active.
- **Reduced Motion (Gameplay)**: SHOULD provide reduced-motion alternatives for gameplay animations when feasible (e.g., reduced particle count, simplified explosion effects).

---

## Testing and Verification

### Layer-Specific Testing
- **Unit Tests**: For pure systems and components.
- **Integration Tests**: For world ordering and cross-system interaction.
- **Adapter Tests**: For renderer and input boundaries.
- **E2E / Browser Tests**: Use **Playwright** for audit questions requiring a real browser (FPS measurement, keyboard input, pause behavior, game loop validation). Vitest alone cannot satisfy browser-level audit assertions.

### Test Categorization for Audit Questions
Audit test coverage MUST be split into three categories:
1. **Fully Automatable** (Vitest + Playwright): All functional questions F-01 to F-16, and bonus questions B-01, B-02, B-03, and B-04.
2. **Semi-Automatable** (Performance API via Playwright `page.evaluate()`): F-17, F-18, B-05 — frame timing or async-performance measured against a threshold.
3. **Manual-With-Evidence** (DevTools traces attached as artifacts): F-19, F-20, F-21, B-06 — these require a signed evidence note, not a Vitest assertion.

### Invariants
- SHOULD include seed-based determinism tests for timing/input-sensitive behavior.
- MUST verify pause invariants: rAF active, simulation frozen, HUD responsive.
- MUST maintain end-to-end/integration verification coverage for every question in `docs/audit.md` (functional and bonus), with explicit automated checks for Fully Automatable and Semi-Automatable items and explicit evidence artifacts for Manual-With-Evidence items.

---

## Performance Acceptance Criteria (Auditable)

For gameplay-critical update/render/input work, provide profile evidence that:

| Metric | Target |
|---|---|
| **Frame Rate** | 60 FPS sustained target during normal play and pause/resume flow. |
| **Acceptable Range** | ≥ 60 FPS at p95 (only 5% of frames may run below 60 FPS). Any sustained period > 500 ms below 60 FPS is a failure. |
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
6. **Audit Test Coverage**: All audit gates defined in the [Testing and Verification](#testing-and-verification) section are satisfied — see the test category split for which questions require Playwright, Performance API, or manual evidence artifacts.