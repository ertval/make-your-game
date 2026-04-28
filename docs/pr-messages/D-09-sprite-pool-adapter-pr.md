# D-09: Sprite Pool Adapter

## What changed
- Added `src/adapters/dom/sprite-pool-adapter.js` — pre-allocates DOM element pools for all dynamic sprite types (player, ghost, bomb, fire, pellet) sized from `constants.js`
- Added `tests/integration/adapters/sprite-pool-adapter.test.js` — 15 tests covering pool sizing, offscreen-hiding strategy, acquire/release API, exhaustion behavior, and reset
- Updated `docs/implementation/track-d.md` — D-09 checklist items marked complete
- Updated `docs/implementation/ticket-tracker.md` — D-09 marked `[x]`
- Updated `docs/implementation/audit-traceability-matrix.md` — AUDIT-B-03 updated to reference `sprite-pool-adapter.test.js` as partial coverage; status updated to `Covered, Pending` (full coverage pending D-08)

## Why
- D-09 is a P1 blocker required before D-08 (Render DOM Batcher) can be completed
- Pre-allocating element pools eliminates runtime DOM allocation during gameplay, preventing jank and supporting AUDIT-B-03 (memory reuse)
- Pooled elements are hidden with `transform: translate(-9999px, -9999px)` rather than `display:none` to keep elements off the layout path

## Tests
- `npm run check` — passed (Biome lint + format)
- `npm run test:coverage` — 435 tests passed, 100% statement/function coverage on sprite-pool-adapter.js
- `npm run test:e2e` — 12 tests passed (all browser/audit specs)
- `npm run policy` — ALL CLEAR

## Audit questions affected
- **AUDIT-B-03** (Does program reuse memory to avoid jank?) — Fully Automatable — D-09 is a named owner; pool pre-allocation and acquire/release pattern directly satisfy this. Covered by `tests/integration/adapters/sprite-pool-adapter.test.js` (15 tests passing).
- **AUDIT-B-04** (Does game use SVG?) — Fully Automatable — D-09 listed as co-owner; SVG implementation deferred to D-10/D-11. No regression introduced.
- Full F-01..F-21 and B-01..B-06 coverage remains mapped and intact — no audit rows added, removed, or modified.

## Security notes
- All DOM creation uses `createElement` + `classList.add` + `style.transform` only
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `Function` usage
- No untrusted data flows into DOM sinks
- File correctly placed in `src/adapters/dom/` — ECS boundary maintained

## Architecture / dependency notes
- `src/adapters/dom/sprite-pool-adapter.js` is in `src/adapters/` — owns DOM side effects as required
- No simulation system (`src/ecs/systems/`) imports this adapter directly — access will go through World resources in D-08
- Pool sizes derive from `constants.js` exclusively: POOL_GHOSTS=4, POOL_MAX_BOMBS=10, POOL_FIRE=90, POOL_PELLETS=165, player=1
- Exhaustion: `console.warn` in dev mode, silent oldest-recycle in production

## Risks
- None for this PR — adapter is not yet wired into the game loop (that happens in D-08)

## PR checklist
- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run policy` locally — ALL CLEAR
- [x] Branch name follows `<owner>/<TRACK>-<NN>`: `medvall/D-09`
- [x] Changed files stay within Track D ownership scope
- [x] Ran applicable local checks (check, test:coverage, test:e2e, policy)
- [x] Listed each affected audit ID with execution type and test anchor
- [x] Confirmed full F-01..F-21 and B-01..B-06 audit coverage remains mapped
- [x] No Manual-With-Evidence artifacts required for this change (F-19/F-20/F-21/B-06 not affected)
- [x] Security sinks and trust boundaries checked
- [x] Architecture boundaries checked — `src/ecs/systems/` has no DOM references from this change
- [x] No dependency or lockfile impact
- [x] Human review requested

## Layer boundary confirmations
- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks — only `createElement`, `classList.add`, `style.transform`
- [x] No framework imports or canvas APIs introduced
