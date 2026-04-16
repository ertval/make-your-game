# Process: Phase-0 Remediation, Engine Hardening & Audit Matrix (A-10, D-05)

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed

- **Phase-0 Audit Remediation**: Consolidated and published four deduplicated track fix reports in `docs/audit-reports/phase-0/`. Resolved identified architectural drifts in `entity-store.js`, `world.js`, and `map-resource.js`.
- **Engine Hardening**: 
    - Decoupled `src/main.ecs.js` (logic) from `src/main.js` (side effects) to enable safe testing.
    - Implemented a robust `requestAnimationFrame` loop with rAF-timestamp-based accumulator logic.
    - Added automatic timing resynchronization on `visibilitychange`, `blur`, and `focus` events to satisfy `AUDIT-F-02`/`AUDIT-F-10`.
    - Integrated frame-time instrumentation probes for performance auditing.
- **Error Boundaries**: 
    - Installed a global `unhandledrejection` handler.
    - Implemented a dedicated `renderCriticalError` overlay using secure `textContent` sinks.
- **Audit Infrastructure**: 
    - Created the **Audit Traceability Matrix** (`docs/implementation/audit-traceability-matrix.md`) mapping all 27 requirements to audit IDs and implementation tickets.
    - Implemented `tests/e2e/audit/audit-question-map.js` as the canonical source for automation categories and thresholds.
- **Policy Gate Maturation**: 
    - Enhanced `policy-gate` with explicit `process` mode support for general docs/process branches.
    - Added security scanning for unsafe DOM sinks (innerHTML, eval, etc.) and owner-scoped ownership enforcement.
- **Visual/CSS Foundation (D-05)**: 
    - Established `styles/variables.css` and `styles/grid.css` baselines. 
    - Implemented the `will-change` layer promotion policy for player and ghost sprites to satisfy `AUDIT-F-20`/`AUDIT-F-21`.

## Why

This PR closes the Phase-0 (Foundation) loop by remediating all deduplicated audit findings and hardening the engine for the upcoming Q1 Visual Prototype. It establishes the "Audit Traceability" necessary for automated acceptance testing and reinforces layer boundaries through the matured policy gate. 

## Tests

- `npm run check` — Biome linting and formatting pass.
- `npm run test` — All unit and integration tests pass (including new `game-status` and `map-resource` regression tests).
- `npm run test:audit` — Audit map verification and threshold checks pass.
- `npm run policy` — All repository and PR-local policy checks pass.

## Audit questions affected

| ID | Execution Type | Verification |
|---|---|---|
| **AUDIT-F-02** | Fully Automatable | `rAF` pipeline integrated in `main.ecs.js` |
| **AUDIT-F-04** | Fully Automatable | Static scan confirms no `<canvas>` usage |
| **AUDIT-F-05** | Fully Automatable | CI dependency gate confirmed in `policy-gate` |
| **AUDIT-F-07** | Fully Automatable | Pause/Restart contracts defined in `audit-question-map.js` |
| **AUDIT-F-10** | Fully Automatable | Clock resync on visibility verified in `main.ecs.js` |
| **AUDIT-F-17** | Semi-Automatable | Frame probes implemented for `p95` threshold checks |
| **AUDIT-F-18** | Semi-Automatable | Instrumentation hooks exposed for FPS calculation |
| **AUDIT-F-20** | Manual-With-Evidence | `will-change` policy implemented in `grid.css` |
| **AUDIT-B-02** | Fully Automatable | Security scan and owner tracking added to policy scripts |

## Security notes

- Implemented strict regex-based scanning in `scripts/policy-gate/check-forbidden.mjs` to block `innerHTML`, `eval`, and other unsafe sinks.
- All error reporting and HUD preparations use `textContent` rather than `innerHTML` injection.
- Defined CSP and Trusted Types rollout plan within the engine's bootstrap comments.

## Architecture / dependency notes

- `src/main.ecs.js` is now safe to import into unit tests (Node.js) as it contains no top-level browser side effects.
- Tick order is now explicitly managed: `Input -> FixedUpdate (Logic) -> Resolve -> Render`.

## Risks

- **Low**. This PR focus is remediation, hardening, and infrastructure. Reverting generated assets to the `main` baseline ensures this remains a docs/process-focused PR following the `A-10` objective.
