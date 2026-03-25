# Agent Instructions: Modern JavaScript (2026) Vanilla DOM Game Development Guidelines

## Directive Semantics and Precedence
- MUST = mandatory requirement.
- SHOULD = strong default; deviate only with explicit justification.
- MAY = optional guidance.
- If directives conflict, prioritize in this order:
  1. Safety and security constraints
  2. Requirements and audit alignment
  3. Performance and architecture constraints
  4. Code style preferences

## Core Directives
- **Action-Oriented**: Focus on clean, idiomatic code and rigorous static analysis.
- **No Quick Fixes**: For bug reports, prefer root-cause analysis before implementation.

## Bug-Fix Workflow (Required)
- MUST follow this sequence when feasible:
  1. Reproduce the bug.
  2. Add a failing test that captures the bug.
  3. Implement the fix.
  4. Prove the fix with passing tests.
- SHOULD use subagents for alternative fix attempts when useful.
- If no deterministic repro test is possible after 2 bounded attempts:
  1. Document the blocker and attempted repro paths.
  2. Capture minimal evidence (logs, steps, observed vs expected behavior).
  3. Request user guidance before risky or broad changes.

## Functional Coverage (Required)
- MUST preserve single-player gameplay.
- MUST preserve pause menu actions: Continue and Restart.
- MUST implement and maintain HUD metrics: timer or countdown, score, and lives.
- MUST keep game concept aligned with approved genre constraints in requirements documentation.

## Performance and Memory Management (Zero-Allocation and 60 FPS)
- **Avoid GC Pauses**: In the core game loop, avoid high-frequency allocation that causes frame drops.
- **Memory and DOM Pooling**: Pre-allocate logical objects and corresponding DOM elements (for example bullets and enemies). Reuse them instead of repeated `document.createElement()` and remove cycles.
- **State Mutation Scope**:
  - In-place mutation is REQUIRED in verified hot loops where profiling shows allocation-driven risk.
  - Outside hot loops, clarity and testability SHOULD be preferred; pure transforms are acceptable.

## Pure DOM Game Engine Architecture (Canvas Forbidden)
- **Strictly Plain JS/DOM**: The game MUST avoid `<canvas>`, WebGL, WebGPU, and external visual frameworks. Use semantic HTML, CSS, SVG, and Vanilla JavaScript only.
- **Compositor-Only Rendering**: Animate only `transform` (for example `translate3d()`) and `opacity` in the main loop.
- **Layer Management**: Layer promotion (`will-change: transform` or `transform: translateZ(0)`) MUST be minimal but not zero.
- **SVG Graphics**: Prefer inline SVG for entity visuals and CSS-driven geometry or styling changes.
- **ECS and DOM Batching**:
  - Simulation updates logical state.
  - Render system batches DOM style writes at the end of each frame.

## Game Loop and Timing
- **Strict requestAnimationFrame**: Core loop MUST run on `window.requestAnimationFrame()` only. Do not use `setInterval` or `setTimeout` for the update loop.
- **Time Tracking**: Use `performance.now()` or the rAF callback timestamp.
- **Pause and State Integrity**: During pause, simulation time MUST freeze while rAF continues so pause UI stays responsive and smooth.

## Input Handling
- **Smooth Keyboard Holds**: Continuous motion MUST come from key-state tracking (`keydown` sets pressed, `keyup` clears) and per-frame physics updates. Do not rely on OS key repeat for movement.

## Performance Acceptance Criteria (Auditable)
- For gameplay-critical update, render, or input changes, MUST provide evidence from a browser profiling run:
  - 60 FPS target during normal play and pause or resume flows.
  - p95 frame time <= 16.7 ms in a representative 60-second play sample.
  - No sustained dropped-frame pattern (no continuous stutter bursts over multiple seconds).
  - rAF remains active during pause while simulation remains frozen.
  - No recurring long tasks over 50 ms in the main interaction path.
- Evidence MUST be summarized in task notes or PR notes (trace window, scenario, and key observations).

## Code Quality and Security
- **Tooling**: Use Biome for linting and formatting.
- **Safe DOM Sinks**: Prefer `textContent` for HUD and status updates. Avoid unsafe HTML injection patterns for untrusted content.
- **Legacy Anti-Patterns**: `var` is forbidden. Use ES Modules (`import` and `export`). No `require`. Avoid `XMLHttpRequest`.

## Done Criteria (Quality Gate)
- MUST pass lint and relevant tests.
- MUST validate applicable performance acceptance criteria for gameplay-critical changes.
- MUST confirm functional coverage remains intact (single-player flow, pause Continue or Restart, HUD metrics).