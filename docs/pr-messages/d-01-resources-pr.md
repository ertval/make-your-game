# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run policy:quality` locally
- [x] I ran `npm run policy -- --pr-body-file docs/pr-messages/<ticket>-pr.md`
- [x] I ran `npm run policy:repo` locally
- [x] I ran the applicable local checks
- [x] I listed the audit IDs affected by this change
- [x] I checked security sinks and trust boundaries
- [x] I checked architecture boundaries
- [x] I checked dependency and lockfile impact
- [x] I requested human review
- [x] I stored this PR body under `docs/pr-messages/`

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Added `src/ecs/resources/constants.js` — 40+ canonical gameplay constants (timestep, player, bomb, ghost, scoring, level, pool sizes, visual flags, cell types).
- Added `src/ecs/resources/clock.js` — deterministic simulation clock with pause awareness, spiral-of-death clamping, and render interpolation alpha.
- Added `src/ecs/resources/rng.js` — Mulberry32 seeded PRNG for deterministic game runs and replay support.
- Added `src/ecs/resources/event-queue.js` — deterministic insertion-order event queue for cross-system communication.
- Added `src/ecs/resources/game-status.js` — FSM with 6 states (MENU, PLAYING, PAUSED, LEVEL_COMPLETE, VICTORY, GAME_OVER) and validated transitions.
- Added `tests/unit/resources/resources.test.js` — 45 unit tests covering all 5 resources.

## Why
- Delivers the D-01 deterministic world-state infrastructure required by all downstream tracks.
- Blocks A-03 (game loop), B-02 (input), C-01/C-02/C-03 (scoring/timer/spawn), and D-02/D-03 (map pipeline).
- Establishes the determinism contract (clock + RNG + event ordering) that every gameplay system depends on.

## Tests
- `npm run policy -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:repo` (passed)
- `npm run policy:quality` (passed)
- `npm run policy:checks -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:forbidden -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:header -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:approve -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed; approval API check skipped in local mode)
- `npm run policy:forbiddenrepo -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:headerrepo -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run policy:trace -- --pr-body-file docs/pr-messages/d-01-resources-pr.md` (passed)
- `npm run test:unit` (passed — 56 tests: 45 new + 11 existing)
- `npm run policy:forbidden` (passed)

## Audit questions affected
- AUDIT-B-03 (memory reuse — pool size constants and deterministic RNG foundation).
- AUDIT-F-17/F-18 (frame timing — clock resource provides the fixed-step simulation contract).
- No direct gameplay-facing functional audit behaviors changed; this is infrastructure only.

## Security notes
- All 5 resources are pure data objects with no DOM access, no browser APIs, and no HTML injection.
- No new dependencies introduced; uses only built-in JavaScript features.
- RNG uses Mulberry32 (no crypto requirements — game determinism, not security randomness).

## Architecture / dependency notes
- Resources are designed as World resource records: plain data objects mutated in place via the resource API.
- `constants.js` is the single source of truth for all gameplay tuning values — no system should hardcode these.
- `clock.js` separates wall-clock time from simulation time, enabling pause semantics without rAF interruption.
- `event-queue.js` sorts by (frame, order) on drain to guarantee deterministic cross-system event processing.
- `game-status.js` throws synchronously on invalid transitions to catch game flow bugs early.

## Risks
- These resources are foundational — any API change will ripple across all gameplay systems. The public API is intentionally minimal and stable.
- The event queue's sort-on-drain allocates a new array each frame; this is acceptable for now but may need optimization in D-09 if profiling shows pressure.
- `MAX_RENDER_INTENTS` uses a loose wall-cell budget (200); this will be tightened once D-02 defines canonical map dimensions.
