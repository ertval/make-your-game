# 🏗️ Ms. Ghostman Game Architecture Analysis (2026)

## 1. Executive Summary
This document provides a prospective analysis of our chosen architecture for **Ms. Ghostman** compared against prevailing 2026 standards in browser-based Javascript game development. Research inputs were collected through independent subagent tracks focusing on module boundaries, runtime performance, testing strategy, content pipelines, and security.

Our codebase currently uses a **FCIS (Functional Core, Imperative Shell)** structured by **Feature Modules**. The current architecture is strong and highly testable for a vanilla JS DOM-grid game. It aligns with many high-value 2026 recommendations: pure domain logic, feature-first layout, fixed-step loops, and explicit performance budgeting.

Main risks lie in missing enforcement details:
1. Determinism contracts (clock and RNG injection)
2. Module boundary enforcement (public APIs only)
3. Data schema validation and content version migrations
4. Production security posture (CSP and Trusted Types rollout)
5. CI quality gates and release controls

---

## 2. The 2026 Javascript Game Architecture Landscape

As of 2026, building vanilla HTML5 games generally splits into two dominating architectural paradigms:

1. **ECS (Entity Component System)**
   - The absolute industry standard for heavy-duty, high-performance engines. 
   - Maximizes data-oriented design (DOD) to loop over tightly packed arrays (TypedArrays) in CPU cache.
   - Separation of data (Components) from logic (Systems) from identifiers (Entities).

2. **FCIS (Functional Core, Imperative Shell) / Clean Architecture**
   - A highly testable, stable approach adopted from enterprise frontend paradigms.
   - The *Functional Core* holds pure domain logic, immutable state updates, and calculates transformations with zero side effects.
   - The *Imperative Shell* handles XSS-immune DOM manipulation, `requestAnimationFrame`, I/O, and Side Effects (audio, timers, input).
   - Prevents logic bleeding by keeping the DOM ignorant of business rules.

---

## 3. Our Current Structure (FCIS + Feature-First)

For **Ms. Ghostman**, we have selected the **FCIS + Feature-First** approach. While true ECS is theoretically superior for massive scale (10,000+ entities), FCIS heavily optimizes for developer velocity, bug prevention, and strict security constraints, which are the highest risks for a highly-scoped DOM-based 2D grid game.

```text
src/
 ├─ core/ (Functional Core)          <-- 100% pure JS, zero DOM, immutable state
 ├─ features/ (Imperative Shell)     <-- Game loop, Renderer, DOM injections, Input
 ├─ infrastructure/                  <-- API abstractions (storage, audio)
 └─ shared/                          <-- Primitive utilities (Signals, Pooling)
```

---

## 4. What Matches 2026 Best Practices (Pros)

### 1. Maximum Testability & Reliability (Functional Core)
Because the `/core` logic contains strictly pure functions, Vitest units require absolutely zero mocking of the DOM or browser APIs. Time-travel debugging and reproducing edge cases (e.g., chain-reaction explosions) becomes a trivial input-output assertion.

### 2. Feature-First Organization with Colocation
`features/feat.*` modules colocate behavior, tests, and styling. This scales significantly better than type-based folders as game mechanics evolve, improving change isolation.

### 3. Fixed-Timestep Loop with Interpolation
Using `requestAnimationFrame` plus a fixed accumulator and render interpolation explicitly targets stable game logic under variable refresh rates. This matches current browser game guidance for deterministic simulation.

### 4. Performance-First Design & State Separation
Explicit frame budgets, paint constraints, and DOM object pooling are already specified. By forcing developers to pass state sequentially, the renderer only draws what it's given, limiting DOM complexity to a dedicated adapter layer.

### 5. Security by Construction
Quarantining the DOM logic completely to `/features/feat.renderer` allows us to enforce strict internal rules (e.g., *No `innerHTML` calls anywhere*). 

---

## 5. Gaps and Risks vs 2026 Guidance (Cons)

### 1. Garbage Collection (GC) Pressure & Immutability
Functional programming favors returning new objects (`...spread`). In a 60 FPS loop, this triggers JS Garbage Collection pauses. 
*Mitigation:* We mitigate this by strategically breaking functional rules *only* inside the Imperative Shell (e.g., using `src/shared/object-pool.js` for rapid-lifecycle DOM elements and mutating `transform` in-place).

### 2. Paradigm Learning Curve & Boilerplate
Adding simple properties requires updating types, immutable copiers, pure functions, and the renderer. It stops spaghetti code but creates a heavier bureaucratic process for tiny features compared to traditional OOP `class Ghost`.

### 3. Determinism Not Fully Formalized
The plan uses a fixed timestep, but does not formalize injected RNG and clock as architecture contracts. This risks replay flakiness for AI and timing bugs.
*Recommendation:* Inject time and randomness through explicit ports. Add deterministic replay traces.

### 4. Content Pipeline Lacks Strong Schema Governance
JSON map loading is planned without schema standards or migrations.
*Recommendation:* Adopt JSON Schema 2020-12 validation in CI with `schemaVersion`.

### 5. Worker Strategy Is Not Defined
AI/path logic is planned in the main loop without a threshold policy for worker offload, risking main-thread locks on lower-end devices.

### 6. Security & CI Controls Are Baseline-Only
While safe DOM writing is present, strict CSP, Trusted Types, and CI quality gates (coverage minimums, merge gates) are missing.

---

## 6. Comparison Matrix

| Practice Area | 2026 Direction | Current Plan Status | Assessment |
|---|---|---|---|
| Core architecture | Functional core + adapters | Explicitly defined | Strong |
| Folder strategy | Feature-first slices | Explicitly defined | Strong |
| Game loop | Fixed step + interpolation | Explicitly defined | Strong |
| Render discipline | Batched minimal DOM writes | Mostly defined | Good |
| Determinism | Injected clock and RNG | Not explicit | Gap |
| Module boundaries | Enforced public APIs | Conceptual only | Gap |
| Data pipeline | Schema validation + versioning | Partial validation only | Gap |
| CI governance | Required quality gates | Implicit only | Gap |
| Security hardening | CSP + Trusted Types + supply chain | Safe sinks only | Gap |
| Worker strategy | Offload compute thresholds | Not defined | Gap |

---

## 7. Prioritized Improvements

### P0 (Add before heavy implementation)
1. Define clock and RNG interfaces in shared contracts and require them in core logic.
2. Add boundary enforcement rules: no deep imports across feature internals.
3. Add map JSON schema validation in CI with strict failure on invalid level data.
4. Resolve pause behavior contradiction across all design documents.

### P1 (Add during early implementation)
1. Add deterministic replay harness for input/timing sequences.
2. Define worker offload criteria and message contracts for heavy AI/pathfinding.
3. Add CI merge gates: lint, tests, coverage, and protected branch checks.

### P2 (Add before release hardening)
1. Add CSP report-only policy, then enforce strict policy.
2. Add Trusted Types rollout plan for script sinks.
3. Add dependency governance: lockfile policy, SBOM generation.

---

## 8. Verdict

For **Ms. Ghostman**—a tightly scoped, grid-based, DOM-rendered arcade game—our **Functional Core / Imperative Shell** architecture is overwhelmingly the correct choice, optimizing for bug prevention, testability, and 4-dev scalability. 

The architecture is already above average for 2026 browser game projects. If the team addresses GC pooling effectively and closes the CI/determinism governance gaps listed above, this plan will be exceptionally robust for scaling the game to additional levels and mechanics without major structural rework.
