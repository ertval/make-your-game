# Ms. Ghostman Architecture vs 2026 JS Game Best Practices

## Scope
This document compares the current architecture in implementation-plan.md and game-description.md against 2026 best practices for JavaScript game architecture and code organization.

Research inputs were collected through 5 independent subagent tracks:
1. Architecture and module boundaries
2. Game loop and runtime performance
3. Testing and quality strategy
4. Content and data pipeline organization
5. Security and operational robustness

## Executive Summary
The current architecture is strong and modern for a vanilla JS DOM-grid game. It already aligns with most high-value 2026 recommendations: functional core, imperative shell, feature-first layout, strict immutability intent, fixed-step loop, signal-driven UI updates, and explicit performance budgeting.

Main risks are not in the high-level architecture, but in missing enforcement details:
1. Determinism contracts (clock and RNG injection)
2. Module boundary enforcement (public APIs only)
3. Data schema validation and content version migrations
4. Production security posture (CSP and Trusted Types rollout)
5. CI quality gates and release controls

## What Matches 2026 Best Practices (Pros)

### 1. Functional Core + Imperative Shell
Alignment:
- Clear split between pure domain logic in src/core and side effects in renderer/input/infrastructure.
- Fits modern testability guidance and reduces accidental coupling.

Why this is strong:
- Enables deterministic unit testing of game rules.
- Limits DOM complexity to dedicated adapter layers.

### 2. Feature-First Organization with Colocation
Alignment:
- features/feat.* modules colocate behavior, tests, and styling.
- Improves discoverability and change isolation.

Why this is strong:
- Scales better than type-based folders in game projects where mechanics evolve.

### 3. Fixed-Timestep Loop with Interpolation
Alignment:
- requestAnimationFrame plus accumulator and render interpolation is planned.
- Explicitly targets stable game logic under variable refresh rates.

Why this is strong:
- Matches current browser game guidance for deterministic simulation and smooth rendering.

### 4. Performance-First Design
Alignment:
- Explicit frame budget, paint constraints, and object pooling strategy.
- Transform-based movement and minimal repaint goals are already specified.

Why this is strong:
- Moves performance from reactive optimization to up-front architecture.

### 5. Test-Driven Core Modules
Alignment:
- Tests are planned for each core module and key feature modules.
- Includes integration milestones and scenario-driven validation.

Why this is strong:
- Supports safe iteration while introducing complex interactions (bomb chains, AI states, pause/resume).

### 6. Security-Aware DOM Approach
Alignment:
- innerHTML is forbidden and createElement-based rendering is required.

Why this is strong:
- Strong baseline against DOM XSS classes in a UI-heavy browser game.

## Gaps and Risks vs 2026 Guidance (Cons)

### 1. Determinism Not Fully Formalized
Current gap:
- Plan uses fixed timestep, but does not formalize injected RNG and clock as architecture contracts.

Risk:
- Replay/debug flakiness and harder reproducibility for AI and timing bugs.

2026 recommendation:
- Inject time and randomness through explicit ports.
- Add deterministic replay traces for hard-to-reproduce defects.

### 2. Module Boundary Rules Are Conceptual, Not Enforced
Current gap:
- Feature boundaries are documented, but no explicit enforcement is described (forbidden deep imports, boundary lint rules, API exposure contracts).

Risk:
- Cross-feature leakage over time, tighter coupling, and harder refactors.

2026 recommendation:
- Enforce public entry points per feature and import constraints via lint/tooling.

### 3. Content Pipeline Lacks Strong Schema Governance
Current gap:
- JSON map loading and validation are planned, but no schema standard, versioning, or migration workflow is defined.

Risk:
- Silent map regressions and expensive late-cycle debugging when level format evolves.

2026 recommendation:
- Adopt JSON Schema 2020-12 validation in CI.
- Add schemaVersion and migration scripts.

### 4. Worker Strategy Is Not Defined for Heavy Compute
Current gap:
- AI/path logic is planned in main loop without a threshold policy for worker offload.

Risk:
- Main-thread long tasks on lower-end devices as complexity grows.

2026 recommendation:
- Define offload criteria for CPU-heavy pure compute (for example pathfinding batches).

### 5. Security Controls Are Baseline-Only
Current gap:
- Safe DOM writing is present, but CSP, Trusted Types rollout, third-party script policy, and release pipeline controls are not documented.

Risk:
- Security regressions during integration/deployment even if game logic is secure.

2026 recommendation:
- Add strict CSP plan (report-only then enforce), Trusted Types migration, dependency/SBOM/release gates.

### 6. CI Quality Gates Are Under-Specified
Current gap:
- Lint/test tooling is planned, but not explicit PR gates, branch protection checks, minimum coverage policy, or mutation testing strategy.

Risk:
- Quality drift under team parallelism (4 tracks).

2026 recommendation:
- Define mandatory CI checks and merge gates from the start.

### 7. Minor Internal Contradiction: Pause Behavior
Current mismatch:
- implementation-plan says pause keeps RAF running and skips update.
- game-description says pause halts loop with no frames consumed.

Risk:
- Behavior ambiguity during implementation and testing.

Resolution direction:
- Decide one authoritative behavior and update both docs.

## Comparison Matrix

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

## Prioritized Improvements

### P0 (Add before heavy implementation)
1. Define clock and RNG interfaces in shared contracts and require them in core logic.
2. Add boundary enforcement rules: no deep imports across feature internals.
3. Add map JSON schema validation in CI with strict failure on invalid level data.
4. Resolve pause behavior contradiction and update both docs.

### P1 (Add during early implementation)
1. Add deterministic replay harness for input/timing sequences.
2. Define worker offload criteria and message contracts for heavy AI/pathfinding.
3. Add CI merge gates: lint, tests, coverage threshold, and protected branch checks.

### P2 (Add before release hardening)
1. Add CSP report-only policy, then enforce strict policy.
2. Add Trusted Types rollout plan for script sinks.
3. Add dependency governance: lockfile policy, vulnerability threshold, SBOM generation, provenance checks.

## Verdict
The architecture is already above average for 2026 browser game projects and is directionally correct.

If the team closes the governance and determinism gaps, this plan becomes robust not only for building the current game, but also for scaling to additional levels/features without major structural rework.

## Sources Used (Research)
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN Game Loop Anatomy: https://developer.mozilla.org/en-US/docs/Games/Anatomy
- Gaffer on Games, fixed timestep: https://gafferongames.com/post/fix_your_timestep/
- web.dev optimize long tasks: https://web.dev/articles/optimize-long-tasks
- web.dev rendering performance: https://web.dev/articles/rendering-performance
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- Vitest docs (timers, coverage): https://vitest.dev/guide/mocking/timers and https://vitest.dev/guide/coverage
- fast-check docs: https://fast-check.dev/docs/core-blocks/runners/
- Pact JS docs: https://docs.pact.io/implementation_guides/javascript/readme
- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- Ajv docs: https://ajv.js.org/
- Tiled JSON format docs: https://doc.mapeditor.org/en/stable/reference/json-map-format/
- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP CSP Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- web.dev Trusted Types: https://web.dev/articles/trusted-types
- OWASP CI/CD Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html
