# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run policy:quality` locally
- [x] I ran `npm run policy -- --pr-body-file docs/pr-messages/d-03-map-loading-resource-pr.md`
- [x] I ran `npm run policy:repo` locally
- [x] I ran the applicable local checks
- [x] I listed the audit IDs affected by this change
- [x] I checked security sinks and trust boundaries
- [x] I checked architecture boundaries
- [x] I checked dependency and lockfile impact
- [x] I requested human review
- [x] I stored this PR body under `docs/pr-messages/`

## Layer boundary confirmation

- [x] No ECS system, component, or resource files contain DOM references in this change
- [x] `map-resource.js` is pure data — no browser APIs, no rendering logic, no side effects
- [x] No framework imports or canvas APIs were introduced in this change
- [x] `level-loader.js` imports only `cloneMap` from a pure data resource (not an adapter)
- [x] All grid storage uses `Uint8Array` (flat) and plain arrays (2D) — no DOM nodes stored

## What changed
- Added `src/ecs/resources/map-resource.js` (557 lines) — D-03 deliverable:
  - `createMapResource(rawMap)` — parses map JSON, runs 7 semantic validation checks, stores a flat `Uint8Array` grid for O(1) cell lookups
  - Semantic validation: dimension consistency, border integrity (walls only), ghost house cell type correctness, ghost spawn inside house bounds, player spawn not in ghost house, player spawn on passable tile
  - Grid access helpers: `getCell`, `setCell`, `isWall`, `isPassable`, `isPassableForGhost`, `isInGhostHouse`, `isGhostHouseCell`, `isPlayerStart`
  - Pellet tracking: `countPellets`, `countPowerPellets` for level completion checks
  - `cloneMap(map)` — deep clone for level restart determinism (independent flat grid, 2D grid, metadata arrays)
  - `validateMapSemantic(rawMap)` — public semantic validator usable by downstream consumers
- Modified `src/game/level-loader.js` (+46/-2 lines):
  - Added `createSyncMapLoader(preloadMaps)` — factory to build a sync `loadMapForLevel` from preloaded map resources
  - Added cached map storage for restart cloning via `cloneMap()`
  - Imports `cloneMap` from `map-resource.js` (pure data import, no adapter dependency)
- Added `tests/unit/resources/map-resource.test.js` (489 lines) — 44 unit tests:
  - Valid map parsing (11): all 3 level maps, metadata extraction, grid structure, spawn points, pellet counts
  - Cell access helpers (8): O(1) lookup, setCell sync, isWall, isPassable, isPassableForGhost, isPlayerStart, isGhostHouseCell, isInGhostHouse
  - Semantic validation valid (3): all 3 shipped maps pass
  - Semantic validation rejection (11): broken border (4 sides), bad ghost house cells, spawn errors, dimension mismatches, throws on bad input
  - Clone determinism (4): deep clone, independent grids, independent arrays
  - Pellet counting (3): correct counts, decrement after mutation
  - createSyncMapLoader integration (4): valid index, restart clone, out-of-bounds, NaN

## Why
- Delivers the D-03 map loading resource required by 9+ downstream tickets (D-06, B-03, B-04, B-06, B-08, C-03, C-04, A-04, A-07).
- Provides O(1) cell lookup for movement, collision, AI pathfinding, and rendering systems.
- Semantic validation rejects malformed map data before world injection, preventing runtime crashes.
- `cloneMap()` enables canonical map reset on level restart for deterministic behavior.
- `createSyncMapLoader` provides the recommended integration pattern: async preload during init, sync lookup at runtime.

## Tests
- `npm run test` (passed — 205 tests across 21 files, 44 new map-resource tests)
- `npm run test:coverage` (passed — 84.55% line coverage)
- `npm run test:unit` (passed — 196 unit tests)
- `npm run test:integration` (passed — 8 integration tests)
- `npm run test:e2e` (passed — 2 Playwright tests)
- `npm run ci` (passed — full CI gate)
- `npm run check` (passed — Biome clean)
- `npm run validate:schema` (passed — all 3 maps + manifests)
- `npm run policy -- --require-approval=false` (passed — full PR gate)

## Audit questions affected
- **AUDIT-F-01** (no crash on load): map resource validates before injection; tests cover all 3 maps + rejection paths
- **AUDIT-F-04** (no canvas): map-resource.js is pure data, zero DOM APIs
- **AUDIT-F-05** (no frameworks): ES module only, no framework imports
- **AUDIT-F-09** (restart correctness): `cloneMap()` + `createSyncMapLoader` restart path tested for canonical reset
- **AUDIT-F-13** (gameplay behavior): grid dimensions, spawn points, ghost house validated — foundational for Pac-Man maze behavior
- **AUDIT-F-14** (timer/countdown): metadata extraction tests verify `timerSeconds` per level (120/180/240)
- **AUDIT-B-01** (performance): `Uint8Array` flat grid, O(1) lookup, no per-frame allocations
- **AUDIT-B-02** (good practices): pure data resource, no side effects, full API documentation
- **AUDIT-B-03** (memory reuse): typed array grid, `cloneMap()` creates independent arrays — no jank on restart

## Security notes
- Map resource treats raw JSON as untrusted input; semantic validation rejects malformed data before world injection.
- No DOM sinks, no `innerHTML`, no code execution sinks (`eval`, `new Function`, string timers).
- No new dependencies introduced; imports only existing `CELL_TYPE` from `constants.js` (D-01).
- `level-loader.js` `fetch()` reference is a JSDoc comment only — no browser API calls in the module itself.

## Architecture / dependency notes
- Depends on D-01 (`CELL_TYPE` from `constants.js`) — imports only cell type enum values.
- Depends on D-02 (map JSON files in `assets/maps/`) — consumes existing validated map data.
- `level-loader.js` is in `src/game/` (Track A orchestration layer) and imports `cloneMap` from Track D's resource — correct cross-track dependency direction (Track A consumes Track D).
- No circular dependencies: `constants.js` has no imports of `map-resource.js` or `level-loader.js`.
- The resource is intentionally pure data to enable future Web Worker offloading for map loading without refactoring.

## Risks
- Playwright e2e restart test for canonical map reset is deferred until D-06 (board generation) lands — currently covered by 4 unit-level clone determinism tests.
- The audit-traceability-matrix.md does not yet explicitly list D-03 in the "Owning Tickets" column for directly impacted audit IDs (F-01, F-04, F-09, B-01, B-02, B-03) — should be updated in a follow-up.
- Border validation accepts both indestructible (1) and destructible (2) walls on the outer edge, matching the actual shipped map data (level-1/level-2 have destructible walls at border row 5, col 14). This is a design choice reflecting the game description's "fully enclosed" requirement rather than strict indestructible-only borders.
