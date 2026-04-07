# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run policy:quality` locally
- [x] I ran `npm run policy -- --pr-body-file docs/pr-messages/d-02-map-schema-pr.md`
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
- [x] Map data is pure JSON — no browser APIs, no rendering logic
- [x] Schema validation uses Ajv 2020-12 draft (existing dependency)
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Added `assets/maps/level-1.json` — 15x11 grid (120s timer, max 2 ghosts: Blinky + Pinky).
- Added `assets/maps/level-2.json` — 15x11 grid (180s timer, max 3 ghosts: + Inky).
- Added `assets/maps/level-3.json` — 15x11 grid (240s timer, max 4 ghosts: + Clyde).
- Added `docs/schemas/map.schema.json` — JSON Schema 2020-12 for level map validation (structure, cell types 0-6, spawn points, ghost house, dimension constraints, no unknown properties).
- Added `tests/unit/schema/map-schema.test.js` — 42 unit tests: valid maps + 37 invalid fixture tests covering structural, metadata, grid, spawn, dimension, and additionalProperties rejection scenarios.
- Updated `scripts/validate-schema.mjs` — auto-discovers and validates all map JSON files in `assets/maps/` against the map schema; compiles each schema only once to avoid duplicate $id conflicts.

## Why
- Delivers the D-02 level data contract required by the map loading resource (D-03) and all rendering pipelines.
- Maps are transcribed verbatim from the ASCII blueprints in `docs/game-description.md` §8.1 — no gameplay balancing or alterations.
- The JSON Schema provides CI-time validation so that invalid map data fails the merge gate before reaching runtime.

## Tests
- `npm run test:unit` (passed — 110 tests total, 42 new map schema tests)
- `npm run validate:schema` (passed — all 3 maps + existing manifests validated)
- `npm run check` (passed — Biome lint and format clean)
- `npm run policy:quality` (passed)

## Audit questions affected
- No direct audit behaviors changed; this is data-level infrastructure.
- Provides the level data contract that D-03 (map loader) and D-06 (renderer) depend on for AUDIT-F-04 (no-canvas compliance, DOM board rendering).
- JSON Schema 2020-12 validation in CI supports the data validation audit requirement.

## Security notes
- All 3 map files are pure JSON data — no HTML, no scripts, no injection vectors.
- Schema validation runs at CI time only; no runtime parsing path exposed to untrusted input.
- No new dependencies introduced; uses existing Ajv + ajv-formats.

## Architecture / dependency notes
- Map files use the same cell type IDs defined in `src/ecs/resources/constants.js` (`CELL_TYPE` enum: 0=EMPTY, 1=INDESTRUCTIBLE, 2=DESTRUCTIBLE, 3=PELLET, 4=POWER_PELLET, 5=GHOST_HOUSE, 6=PLAYER_START).
- Level metadata (timer, max ghosts, ghost speed, active ghost types) mirrors the constants in `constants.js` (`LEVEL_TIMERS`, `LEVEL_MAX_GHOSTS`, `LEVEL_GHOST_SPEED`) for cross-reference consistency.
- The schema intentionally handles structural validation only; semantic constraints (border integrity, spawn point existence, ghost house content) are delegated to D-03's programmatic map loader.

## Risks
- If the game description's ASCII blueprints change, all 3 JSON maps must be regenerated to stay in sync.
- The schema's dimension minimums (10x10) are conservative; future maps with different sizes will require schema updates.
- The `asciiBlueprint` field is optional and stored for reference only — not used by any system yet.
