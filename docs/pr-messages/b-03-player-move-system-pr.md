# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-wide rerun when needed: `npm run policy:repo`

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>` (for example `ekaramet/A-03`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed the audit IDs affected by this change.
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
- Implemented the `B-03` grid-constrained player movement system in `src/ecs/systems/player-move-system.js`.
- Added the canonical movement contract for the ticket: component query mask, fixed held-input priority, cardinal direction vectors, epsilon-based target checks, and helper functions for movement start, advance, and stop behavior.
- Wired the system update loop to read ECS resources from the World, capture previous position each step, resolve exactly one movement direction, and enforce finish-the-current-cell-first movement.
- Enforced map-driven blocking through the canonical map resource so the player cannot move through walls, destructible tiles, or ghost-house tiles.
- Applied the exact player base speed and speed-boost multiplier through the movement stepping path.
- Added focused unit coverage in `tests/unit/systems/player-move-system.test.js` for direction priority, target snapping, blocked movement, continued held movement, release behavior, turning behavior, boosted speed, and deterministic replay.
- Marked `B-03` as done in `docs/implementation/ticket-tracker.md`.

## Why
- `B-03` owns the core controllable movement loop that the rest of gameplay depends on.
- The movement contract needs to stay deterministic under fixed-step simulation, including held-input resolution and per-cell movement completion.
- Grid collision should rely on the existing map resource as the single source of truth instead of duplicating tile rules inside the movement system.
- Downstream collision, rendering, and gameplay tickets need a stable movement/data contract before they can build on it safely.

## Tests
- `npm run policy` (passed locally)

## Audit questions affected
- `AUDIT-F-11`
- `AUDIT-F-12`
- `AUDIT-F-13`

## Security notes
- No unsafe HTML sinks, inline handlers, framework imports, or canvas APIs were introduced.
- The change stays inside ECS simulation and unit tests; it does not expand the DOM/browser trust boundary.
- No new dependencies or external inputs were introduced by this ticket.

## Architecture / dependency notes
- `src/ecs/systems/player-move-system.js` remains a simulation system with no DOM access.
- The system reads `mapResource`, `player`, `position`, `velocity`, and `inputState` through World resources only.
- Passability remains delegated to `src/ecs/resources/map-resource.js`, which avoids duplicating collision rules in movement code.
- No runtime dependencies, lockfiles, or package metadata changed.

## Risks
- This ticket establishes fixed direction priority as `up -> left -> down -> right`; if the intended design later changes to press-order priority, the input contract will need to change too.
- Runtime/render integration is intentionally outside this ticket, so visible on-screen movement still depends on downstream integration work.
