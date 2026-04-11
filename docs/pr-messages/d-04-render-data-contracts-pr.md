# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run policy` locally
- [x] I ran `npm run policy:checks` locally
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
- Added `src/ecs/render-intent.js` (new file, ~120 lines) — D-04 deliverable:
  - `createRenderIntentBuffer(maxIntents)` — preallocates parallel typed arrays (`entityId`, `kind`, `spriteId`, `x`, `y`, `classBits`, `opacity`) with zero per-frame allocations after warm-up
  - `resetRenderIntentBuffer(buffer)` — O(1) frame reset (only `_count` cleared, stale data preserved)
  - `appendRenderIntent(buffer, entry)` — writes entry data into next available slot with overflow protection
  - `getRenderIntentView(buffer)` — returns plain array of populated intent objects for tests/commit phase
  - `RENDER_INTENT_VERSION` — schema version constant for forward-compatible contract evolution
- Added `tests/unit/render-intent/render-intent.test.js` (new file, ~230 lines) — 16 unit tests:
  - Buffer preallocation and defaults (6): typed array types, capacity, spriteId/sentinel, opacity, reset behavior
  - Append behavior (5): slot writes, defaults, bitwise flag OR, insertion order, overflow protection
  - View generation (2): full entry objects, empty buffer
  - ECS/DOM isolation contract (3): no DOM nodes in buffer, typed-array-only component stores, numeric classBits (no string allocations)
- Modified `docs/implementation/track-d.md` — marked D-04 deliverables and verification gate `[x]`
- Modified `docs/implementation/ticket-tracker.md` — marked D-04 `[x]`, updated done count from 7 to 8

## Why
- D-04 defines the render data contract between ECS simulation and DOM rendering systems.
- The preallocated intent buffer eliminates per-frame object allocations, directly supporting the AGENTS.md performance invariant (no recurring allocations in hot loops).
- Contract invariants in `visual.js` document the classBits-only policy and DOM reference prohibition, preventing future violations of the ECS/DOM isolation boundary.
- This ticket unblocks D-06 (Renderer Adapter & Board Generation) and D-07 (Render Collect System), which will consume the intent buffer.

## Tests
- `npm run check` (passed — Biome clean)
- `npm run test` (passed — 221/221 tests across 22 files)
- `npm run test:coverage` (passed — 84.86% line coverage)
- `npm run test:unit` (passed — 212 unit tests, 16 new render-intent tests)
- `npm run test:integration` (passed — 8 integration tests)
- `npm run test:e2e` (passed — 2 Playwright tests)
- `npm run ci` (passed — full CI pipeline)
- `npm run validate:schema` (passed — 5 files)
- `npm run policy -- --require-approval=false` (passed — mode=TICKET, track=D, tickets=D-04)

## Audit questions affected
- D-04 does not directly impact any AUDIT-F or AUDIT-B questions yet. It defines the data contract that downstream render tickets (D-07, D-08) will consume, which in turn address F-19 (frame-time stability), F-20 (compositor-only writes), F-21 (layer promotion), and B-03 (memory reuse).

## Security notes
- `render-intent.js` is pure data — no DOM APIs, no code execution sinks, no browser-specific state.
- No new dependencies introduced.
- No unsafe HTML injection or untrusted content handling.
- Typed arrays ensure numeric-only storage — no string/class-name allocations in hot path.

## Architecture / dependency notes
- Depends on D-01 (`MAX_RENDER_INTENTS` from `constants.js`) — buffer capacity derived from gameplay constants.
- Depends on B-01 (`RENDERABLE_KIND`, `VISUAL_FLAGS`, `createRenderableStore`, `createVisualStateStore` from `visual.js`) — component data contracts.
- No circular dependencies: `render-intent.js` imports only `constants.js` and `visual.js`, both of which are leaf modules with no import back to `render-intent.js`.
- The intent buffer is a World resource candidate — will be registered via `world.setResource('renderIntent', ...)` when D-07 lands.

## Risks
- The audit traceability matrix does not yet include D-04 as an owning ticket. This will be updated when downstream render tickets (D-07, D-08) reference this contract.
- `getRenderIntentView` allocates plain objects per call — acceptable because it is only used by tests and the render commit phase, never in the collect-system hot loop.
- Buffer overflow silently drops intents in development (console.warn) and production (silent). D-07 should monitor intent drop rates during gameplay to tune capacity.
