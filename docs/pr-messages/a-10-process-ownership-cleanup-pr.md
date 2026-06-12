## What changed
- Restored cross-track ownership files to `main` versions so this owner-scoped process branch no longer carries Track B or Track D implementation edits:
  - src/ecs/systems/input-system.js
  - src/ecs/resources/game-status.js
  - src/ecs/resources/map-resource.js
- Added ownership handoff requests with exact diffs for re-application by the correct owners:
  - docs/pr-messages/process-track-b-ownership-handoff.md
  - docs/pr-messages/process-track-d-ownership-handoff.md

## Why
- `GENERAL_DOCS_PROCESS` mode relaxes ticket-track conflicts when `process` marker exists, but it still enforces changed-file ownership against the branch owner track.
- This branch is owner `ekaramet` (Track A), so keeping Track B or D implementation files causes hard failure in owner-scoped checks.

## Tests
- `npm run policy:checks` (PASS)
- `npm run policy` (FAIL expected after ownership cleanup because tests currently depend on reverted Track D behavior)
  - Primary failures: `assertValidMapResource is not a function` from `src/game/level-loader.js` call sites and tests that expect Track D updates.
  - Additional failure: `tests/unit/resources/game-status.test.js` expects PLAYING -> PLAYING transition that was restored to main behavior in this branch.

## Audit questions affected
- No direct gameplay/audit behavior change in this cleanup PR.

## Security notes
- No new security sinks or trust-boundary changes.

## Architecture / dependency notes
- No ECS behavior changes included; this PR removes cross-track code deltas from this branch.

## Risks
- Track B and Track D functional deltas are deferred until their owners re-apply in owner-compliant branches.
- Full project quality gate remains red until dependent Track A integration/test changes are reconciled with the reverted ownership files.
