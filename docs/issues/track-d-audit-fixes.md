# Track D — Audit Fixes: Critical Runtime Bugs (Clock, Map, Render)

Summary

This issue aggregates the blocking and high-priority Track D fixes from the Phase-0 deduplicated audit. It focuses on correctness and determinism fixes required for the runtime clock, map resource bounds and passability, render-intent wiring, and related event/queue stability issues.

Reference: [docs/audit-reports/phase-0/audit-report-p0-track-d-deduplicated-2026-04-14.md](docs/audit-reports/phase-0/audit-report-p0-track-d-deduplicated-2026-04-14.md)

Top affected audit items

- **BUG-01** (Blocking): Restart clock baseline can be reset with undefined timestamp.
- **ARCH-01** (Blocking): Render commit architecture not fully wired into runtime phases.
- **BUG-05** (High): Out-of-bounds map access can be treated as passable/readable.
- **BUG-X01** (High): `isPassableForGhost` permits destructible-wall traversal.
- **ARCH-X02** (High): CSS board dimensions mismatch map dimensions.

Phase 1 (Blocking / High) tasks

- [ ] Fix restart clock baseline corruption.
  - Replace uses of non-existent `clock.realTimeMs` with a finite timestamp source (`performance.now()` or `getNow()` wrapper).
  - Files to change: [src/game/bootstrap.js](src/game/bootstrap.js), [src/ecs/resources/clock.js](src/ecs/resources/clock.js)
  - Add unit tests asserting `lastFrameTime` is finite after restart and that deltas are numeric.

- [ ] Implement/complete render-intent collect -> single DOM commit wiring.
  - Enforce ordered phases per rAF: input snapshot -> fixed-step simulation -> render collect -> DOM commit.
  - Files to change: [src/ecs/render-intent.js](src/ecs/render-intent.js), [src/game/bootstrap.js](src/game/bootstrap.js), [src/main.ecs.js](src/main.ecs.js)
  - Add integration test that asserts only one DOM write phase occurs per rAF during a simple frame.

- [ ] Add bounds checks to map query helpers and enforce safe defaults.
  - Implement safe `getCell(map,row,col)` bounds guard returning `CELL_TYPE.INDESTRUCTIBLE` for OOB.
  - Files to change: [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js)
  - Add unit tests for `getCell`, `setCell`, and passability helpers.

- [ ] Harden ghost passability to disallow destructible-wall traversal.
  - Update `isPassableForGhost()` to reject both indestructible and destructible walls.
  - Files to change: [src/ecs/resources/map-resource.js](src/ecs/resources/map-resource.js)

- [ ] Align board CSS dimensions with active map resource.
  - Options: derive CSS variables from map resource at load or add a small runtime adapter to set board CSS.
  - Files to inspect: [styles/variables.css](styles/variables.css), map manifests in [manifests/](manifests/)

Phase 2 (Medium) tasks — follow-up fixes

- [ ] Make `tickClock` use configured `maxStepsPerFrame` instead of hardcoded multiplier.
- [ ] Reset `orderCounter` per-frame in event queue and validate `frame` input in `enqueue()`.
- [ ] Add preflight structural guards to semantic validators to avoid TypeError on malformed payloads.
- [ ] Replace fragile accumulator sentinel with robust epsilon/clamp logic and clear accumulator on resync.
- [ ] Reduce allocations in `drain()` hot path (avoid sorted copy every call).

Acceptance criteria

- Restart/resume no longer produces NaN deltas; `lastFrameTime` and `accumulator` have finite, bounded values.
- Map queries never return out-of-bounds values; ghost movement obeys passability rules; unit tests cover edge cells.
- Render pipeline performs a single DOM commit per rAF and passes integration smoke test.
- Biome checks and unit tests pass for changed files.

Labels

- `area/runtime`, `track/D`, `severity/blocking`

Suggested assignee

- `@track-d-team` (replace with person/team handle)

Estimated effort

- Phase 1: 2–4 days (depends on integration test and CSS wiring complexity)

Notes

- Prioritize reproducible tests for the restart and map-bounds issues before making broad changes.
- Follow AGENTS.md rules for separating simulation and DOM commits; systems must not call DOM APIs.
