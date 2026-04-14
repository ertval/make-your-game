# 🚀 Performance & Architecture Optimization Report (2026)

## Overview
This comprehensive report synthesizes findings from a 10-point research deep-dive into **Modern JavaScript (2026)** performance standards and proposes a specific integration roadmap for the Ghostman ECS architecture. Our goal is to ensure a **"Premium" performance tier**: sustained 60 FPS, p95 frame time < 16.7ms, and ultra-low input latency (INP).

---

## 📊 Strategy Matrix: Current vs. Optimal (2026)

| Vector | Current Implementation | 2026 Optimal Pattern | Strategic Action | 
| :--- | :--- | :--- | :--- |
| **Game Loop** | Fixed-step Accumulator via `rAF`. | **Hybrid Async Loop**: Render on Main Thread, Logic in **Web Worker**. | **A-03 / B-08**: Offload AI to protect V-Sync. |
| **Logic Threading** | Synchronous Main Thread execution. | **Off-Main-Thread** via `postMessage` + `Transferables`. | **B-08**: Prevent AI from blocking rendering tasks. |
| **Memory Management**| ID Recycling (Entity Store). | **Data-Oriented Design (DOD)** via `TypedArrays`. | **B-01**: Zero out "Stop-the-World" GC pauses. |
| **Asset Decoding** | `new Image()` (Lazy Decoding). | **`createImageBitmap`** (Async/Pre-emptive). | **D-09**: Eliminate "First-Draw" sprite stutters. |
| **State Tracking** | JavaScript Objects `{}`. | **Flat Buffers / SoA (Structure of Arrays)**. | **B-01**: Improve CPU cache locality for ECS. |
| **Reflow Isolation** | `transform`/`opacity` updates. | **CSS `contain` Property** (Layout/Paint isolation). | **D-01**: Restrict reflow scope to game container. |

---

## 🔍 Detailed Optimization Findings

### 1. Off-Main-Thread Simulation (Web Workers)
*   **Current**: The `stepFrame` simulation and Ghost AI pathfinding run on the main browser thread. If logic exceeds the frame budget (~16.6ms), it directly blocks the UI and causes visual jank.
*   **Optimization**: Move `stepFrame` logic and `Ghost AI` to a dedicated Web Worker using `SharedArrayBuffer` or `Transferable Objects`. The main thread acts strictly as a "Compositor" that renders the latest state sent by the worker.
*   **Benefit**: Guaranteed visual fluidity. Even if AI calculations hit a complex intersection and spike in compute time, the render loop continues to hit its 60 FPS target.

### 2. Memory: The "TypedArray" Shift
*   **Current**: Entity components are managed as standard JavaScript objects or arrays of objects. This puts significant pressure on the V8 engine's Scavenger and Mark-Sweep garbage collectors.
*   **Optimization**: Refactor high-churn component data (Position, Velocity, Timers) into flat **`Float32Array`** or **`Uint32Array`** buffers. Use Structure of Arrays (SoA) for better spatial locality.
*   **Benefit**: Zero-allocation hot paths. By treating game state as a fixed, contiguous memory block, we eliminate "Stop-the-World" GC pauses that cause intermittent micro-stutters.

### 3. Rendering: Layout Containment & Promotion
*   **Current**: Uses static `will-change: transform` on player and ghost sprites. The browser must manage these layers even when they are idle.
*   **Optimization**: 
    1. Apply `contain: layout paint style;` to the `#game-board` to isolate the maze from the rest of the page.
    2. Implement **Dynamic Promotion**: Apply `will-change` only when an entity begins moving and remove it when it stops.
*   **Benefit**: Reduced GPU memory overhead and faster style/layout recalculation times. Isolating the game board prevents game updates from triggering expensive full-page reflows.

### 4. Asset Throughput: `createImageBitmap`
*   **Current**: Assets are loaded via `new Image()`. Actual decoding and GPU texture upload often happen on the main thread during the first `drawImage` call, leading to a dropped frame when a sprite first appears.
*   **Optimization**: Leverage the 2026 **`createImageBitmap()`** API during the map loading/pre-warm phase to asynchronously decode assets into GPU-optimized bitmaps.
*   **Benefit**: Eliminates "first-draw" stutters. All sprite assets are ready in GPU memory before the player enters the level.

---

## 🛠 Proposed Ticket Modifications

The following amendments are proposed for the existing implementation tracks to integrate these 2026 performance standards.

### 🏗 Track A — World & Game Flow
#### Ticket A-03: Game Loop & Main Initialization
> [!IMPORTANT]
> **Implementation**: Explicitly incorporate the **`scheduler.yield()`** API (or 2026 fallback) during heavy initialization paths (such as `level-loader.js` map parsing). This prevents "Long Tasks" (>50ms) and ensures the browser remains responsive to user input (INP) during map generation.

### 🧠 Track B — Components & AI Simulation
#### Ticket B-01: ECS Components
> [!TIP]
> **Implementation**: Extend **SoA (Structure of Arrays)** and **TypedArrays** usage to all "hot" simulation components including `velocity` and `ghost-state` timers. This ensures zero-allocation iteration, completely bypassing GC pressure during hot paths.

#### Ticket B-08: Ghost AI System
> [!CAUTION]
> **Pivot**: Change to a **"Worker-Core"** approach. Design the AI calculations to be fully serializable. In 2026 architecture, offloading AI to a Web Worker is the standard way to protect the Rendering loop, even for mid-complexity pathfinding.

### 🎨 Track D — Resources & Rendering
#### Ticket D-01: Resources & Constants
> [!NOTE]
> **CSS Variables**: Define a `BOARD_CONTAINMENT` constant mapping to a `contain: layout paint style;` rule. This ensures the browser treats the maze as an isolated layout island.

#### Ticket D-05: CSS Layout & Layer Policy
> [!IMPORTANT]
> **Dynamic Promotion**: Move away from static `will-change`. Implement a system that applies `will-change: transform` to entities only during active motion and removes it when idle to conserve GPU resources on mobile devices.

#### Ticket D-09: Sprite Pool Adapter
> [!TIP]
> **Async Asset Decoding**: The adapter MUST implement **`createImageBitmap()`** for all sprite sheet processing. This forces image decoding and GPU texture upload into the background, preventing "micro-stutters" when sprites first enter the viewport.

---

## 📈 Impact Summary
By integrating these changes, the project moves from a "Standard" ECS performance profile to a **"Systemic High-Performance"** profile:
1.  **GC Immunity**: Zero-allocation hot paths via TypedArrays.
2.  **Main Thread Protection**: Worker-based simulation and cooperative scheduling.
3.  **Rendering Purity**: GPU-accelerated async decoding and strict layout containment.

---

## 🏁 Conclusion
The architectural shift proposed here moves the focus from "making it work" to **"isolating the main thread"**. By treating the main thread as a pure "Compositor" that only handles input and final display, the game will remain immune to performance variations across different hardware. This 2026 strategy ensures that Miss Ghostman achieves a **"Premium" rating**, providing identical, buttery-smooth gameplay on everything from high-end desktops to value-tier mobile browsers.