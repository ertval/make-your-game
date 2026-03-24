# 🏗️ Game Architecture Analysis (2026)

This document provides a prospective analysis of our chosen architecture for **Ms. Ghostman** (Functional Core / Imperative Shell with Feature-First packaging) compared against prevailing 2026 standards in browser-based Javascript game development, leveraging insights from modern static analysis and structural trends.

---

## 1. The 2026 Javascript Game Architecture Landscape

As of 2026, building vanilla HTML5 games generally splits into two dominating architectural paradigms:

1. **ECS (Entity Component System)**
   - The industry standard for heavy-duty, high-performance engines (leveraged heavily by WASM/Rust and replicated in JS via libraries like `bitecs`). 
   - Maximizes data-oriented design (DOD) to loop over tightly packed arrays in CPU cache.
   - Separation of data (Components) from logic (Systems) from identifiers (Entities).

2. **FCIS (Functional Core, Imperative Shell) / Clean Architecture**
   - A highly testable, extremely stable approach adopted from enterprise frontend paradigms and mapped onto game development.
   - The *Functional Core* holds pure domain logic, immutable state updates, and calculates transformations with zero side effects.
   - The *Imperative Shell* handles XSS-immune DOM manipulation, `requestAnimationFrame`, I/O, and Side Effects (audio, timers, input).
   - Prevents "spaghetti code" by keeping the DOM completely ignorant of business logic, and vice versa.

---

## 2. Our Current Structure (FCIS + Feature-First)

Our codebase uses **FCIS structured by Feature Modules**, directly adhering to the `AGENTS.md` mandate for 2026 JS Guidelines:

```text
src/
 ├─ core/ (Functional Core)          <-- 100% pure JS, zero DOM, immutable state
 ├─ features/ (Imperative Shell)     <-- Game loop, Renderer, DOM injections, Input
 ├─ infrastructure/                  <-- API abstractions (storage, audio)
 └─ shared/                          <-- Primitive utilities (Signals, Pooling)
```

---

## 3. Pros and Cons Analysis

### ✅ Pros of Our Structure

1. **Maximum Testability & Reliability**
   Because the `/core` logic (`grid.js`, `ghost.js`, `bomb.js`, `collision.js`) contains strictly pure functions, writing Vitest units requires zero mocking of the DOM or browser APIs. Time-travel debugging and reproducing edge cases (e.g., chain-reaction explosions overlapping) becomes a trivial input-output assertion.

2. **Absolute Separation of Concerns**
   By forcing developers to pass state sequentially (instead of mutating global state variables), the DOM (`renderer.js`) only has to worry about drawing what it's given. It prevents logic bleeding into UI layers, protecting us against the #1 cause of game-breaking bugs.

3. **Decoupled Workflow Scalability (The 4-Dev Setup)**
   Because the domains are violently decoupled via contracts (`shared/types.js`), Dev 2 can build bombs and Dev 3 can build Ghost AI algorithms entirely independently. They just exchange immutable state objects.

4. **Security by Construction**
   By quarantining the DOM logic completely to `/features/feat.renderer`, we can easily enforce our strict internal rule: *No `innerHTML` calls anywhere.* It isolates security risks to a single folder.

5. **Fine-Grained Reactivity (Signals)**
   Using standard Signals (`src/shared/signal.js`) inside the Imperative Shell for our HUD isolates repaints. A tick updating the remaining timer doesn't force a reconciliation of the whole game loop. 

### ❌ Cons of Our Structure

1. **Garbage Collection (GC) Pressure**
   Functional programming heavily favors returning *new* objects/arrays over mutating existing ones (`.with()`, `...spread`). In a 60 FPS loop, creating new deeply-nested `GameState` trees 60 times a second can trigger JS Garbage Collection pauses. 
   - *Mitigation:* We've introduced `src/shared/object-pool.js` specifically for rapid-lifecycle objects (Bombs, Explosion Tiles), but managing global state immutability at 60 FPS safely is a tightrope walk without structural sharing.

2. **Not as Performant as True ECS**
   For a grid-based game with ~100 entities (ghosts, bombs, pellets), FCIS is perfectly 60 FPS capable. However, if we wanted to scale Ms. Ghostman to support a 10,000-entity bullet-hell survival mode, the lack of contiguous memory allocation (which a pure Data-Oriented ECS structure provides) would cause cache misses and extreme CPU overhead in JavaScript. 

3. **Steeper Paradigm Learning Curve**
   Game developers naturally think in Object-Oriented paradigms (e.g., `class Ghost { update() { this.x += speed } }`). Forcing developers to decouple data from pure functions (`moveGhost(ghostData)`) requires a paradigm shift that might slow down initial onboarding.

4. **Boilerplate for Simple Changes**
   Want to add a new property to a Ghost? You must update the `GhostState` type, ensure it passes through the immutable copier, handle the new state in `ghost.js` pure functions, and explicitly wire the visual effect in `renderer.js`. It stops spaghetti but creates a heavier bureaucratic process for tiny features.

---

## 4. Conclusion

For **Ms. Ghostman**—a tightly scoped, grid-based, DOM-rendered arcade game—our **Functional Core / Imperative Shell** architecture is overwhelmingly the correct choice. 

It heavily optimizes for **developer velocity, bug prevention, strict security constraints, and robust testability**, which are the highest risks for this project. While an ECS architecture would theoretically raise the performance ceiling infinitely, it would be extreme overkill for a DOM-based Pac-Man/Bomberman hybrid, bringing unnecessary complexity where predictability is preferred. 

By strategically breaking the strict functional rules *only* inside the Imperative Shell (e.g., using `object-pools` and in-place `transform` mutations for DOM elements), we achieve the safety of FP without surrendering the vital 60 FPS performance floor.
