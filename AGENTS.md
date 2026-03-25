# Agent Instructions: Modern JavaScript (2026) Vanilla DOM Game Development Guidelines

## Core Directives
- **Action-Oriented**: Focus purely on writing clean, idiomatic code and performing rigorous robust static analysis.
- **No Quick Fixes**: When I report a bug, dont try to fix it immediately. Instead, try to understand the root cause of the bug. Then write a test that reproduces the bug. Then have subagents try to fix the bug and prove it with passing test. 

## Performance & Memory Management (Zero-Allocation & 60 FPS)
- **Avoid Garbage Collection (GC) Pauses**: In the core game loop, massive object creation causes fatal GC spikes and frame drops. 
  - **Memory & DOM Pooling**: Pre-allocate logical objects AND their corresponding DOM elements (e.g., bullets, enemies). Reuse them instead of creating new instances or continuously calling `document.createElement()` and `.remove()`. Memory reuse is strictly required to avoid jank.
  - **Mutable State in Hot Loops**: Mutating state in-place during the update loop is mandatory. Avoid creating new arrays or objects on every frame (e.g., heavily restrict use of spread operators `...` or immutable methods like `toSorted()`).

## Pure DOM Game Engine Architecture (Canvas Forbidden)
- **Strictly Plain JS/DOM**: The game MUST avoid `<canvas>`, WebGL, WebGPU, and any external visual frameworks. It must be built exclusively with semantic HTML, CSS, SVG, and Vanilla JavaScript.
- **Compositor-Only Rendering**: To achieve and maintain a pristine 60+ FPS, avoid triggering Layout and Paint operations in the main loop. ONLY animate CSS `transform` (e.g., `translate3d()`) and `opacity`.
- **Layer Management**: Keep the use of CSS layers (via `will-change: transform` or `transform: translateZ(0)`) minimal but not zero. Promote element layer creation properly to hardware-accelerate moving parts, but avoid over-layering to save memory.
- **SVG Graphics**: Capitalize on inline `<svg>` elements for rendering game entities visually, manipulating their geometry via CSS.
- **Entity-Component-System (ECS) & DOM Batching**: Separate pure mathematical game logic from DOM manipulation. 
  - The Simulation updates logical coordinates.
  - A dedicated Render System batches DOM `style` updates at the very end of the frame to prevent DOM Layout Thrashing.

## Game Loop & Timing
- **Strict requestAnimationFrame**: The core loop MUST run on `window.requestAnimationFrame()` without interruption. Do not use `setInterval` or `setTimeout` for the update loop.
- **Time Tracking**: Use `performance.now()` or the timestamp provided by the `requestAnimationFrame` callback for ultra-precise delta time tracking.
- **Pause & State Integrity**: The engine must support pausing natively. When paused, logic/simulation time should freeze freely, but `requestAnimationFrame` continues updating so that the pause menu and UI render smoothly without dropping frames.

## Input Handling
- **Smooth Keyboard Controls**: Motions triggered by continuous key presses must NOT stutter. Do not rely exclusively on the OS's native key-repeat rate inside `keydown`. Instead, track physical key states (e.g., `keys[e.code] = true` on `keydown`, `false` on `keyup`) and continuously apply velocity physics inside the game loop based on those states.

## Code Quality & Security
- **State-of-the-Art Tooling**: Use **Biome** as the standard for ultra-fast unified linting and formatting. Actively perform static analysis to detect code smells.
- **Code Health**: Prevent "AI slop" and boilerplate. Write tightly scoped functions, favor asynchronous performance boosts where possible, and avoid unnecessary recursive/network data requests.
- **Safe DOM sinks**: Prefer `textContent` over `innerHTML` when updating scoreboards, clocks/timers, and the HUD.
- **Legacy Anti-Patterns**: `var` is entirely forbidden. Exclusively use ES Modules (`import`/`export`). No `require`. Avoid `XMLHttpRequest`.