# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run ci:quality` locally
- [x] I ran `npm run policy:quality` locally
- [x] I ran `npm run ci:policy -- --pr-body-file docs/pr-messages/<ticket>-pr.md`
- [x] I ran `npm run policy -- --pr-body-file docs/pr-messages/<ticket>-pr.md`
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
- Updated the README scripts section to explain the command hierarchy more clearly.
- Added a nested breakdown for app, quality, policy, and final gate commands.
- Added a small reference map showing which script files implement each gate layer.

## Why
- Makes the repository documentation easier to use by showing what each npm command includes and where its implementation lives.

## Tests
- `npm run test`
- `npm run ci:quality`
- `npm run policy:quality`
- `npm run ci:policy -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md`
- `npm run policy -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md`
- `npm run check`
- `npm run pr:gate -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md`
- `npm run policy:repo` (passed after the gate hierarchy updates)
- `npm run ci:quality` (blocked by pre-existing formatting drift in unrelated files outside this docs-only change)
- `npm run policy:pr -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md` (blocked by the same formatting drift)
- `npm run policy:checks -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md` (passed)
- `npm run policy:repo` (passed after one-word command rename)
- `npm run policy -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md` (blocked by pre-existing Biome formatting drift in unrelated files)
- `npm run policy:all -- --pr-body-file docs/pr-messages/a-02-ecs-core-pr.md` (blocked by the same formatting drift)

## Audit questions affected
- None. This is a documentation-only change.

## Security notes
- No runtime code changed.
- The documentation now points readers to the policy-gate scripts that enforce repo checks.

## Architecture / dependency notes
- The README now separates `policy:pr`, `policy:repo`, `ci:policy`, `ci:quality`, and `pr:gate` so their responsibilities are easier to distinguish.
- The implementation pointers now map the README commands to `scripts/policy-gate/run-all.mjs`, `run-checks.mjs`, `run-project-gate.mjs`, and `lib/policy-utils.mjs`.

## Risks
- This is a documentation-only update, so the main risk is stale wording if the npm script graph changes again without a matching docs refresh.

## Recent updates
- Added a clearer README gate hierarchy so `policy:pr`, `policy:repo`, `ci:policy`, and `policy:quality` are easier to distinguish.
- Added a troubleshooting table that points to the narrower commands for quality, forbidden-tech, source-header, checklist, approval, and traceability failures.
- Aligned the docs entry guide and agent workflow guide with the same PR/repo/quality command names.
- Added explicit package-level aliases for the narrow policy checks so failure messages can point to a concrete rerun command.
- Added a simplified command model where `npm run policy` is the default all-in-one gate and one-word policy subcommands are used for drill-down (`policy:checks`, `policy:forbid`, `policy:header`, `policy:approve`, `policy:forbidrepo`, `policy:headerrepo`, `policy:trace`).
- Renamed the policy command surface to keep subcommands one-word and removed multi-segment names (for example, `policy:headers:repo` -> `policy:headerrepo`).
- Updated GitHub/Gitea policy workflows to run a single all-in-one command: `npm run policy:all -- --require-approval=true`.
- Removed the duplicate `policy:all` alias so `npm run policy` is now the single canonical all-in-one gate command.
- Updated GitHub/Gitea policy workflows to run `npm run policy -- --require-approval=true`.
- Verified `npm run policy` and `npm run policy:repo` both pass after formatting drift cleanup.
- Verified all one-word narrow reruns pass: `policy:quality`, `policy:checks`, `policy:forbid`, `policy:header`, `policy:approve`, `policy:forbidrepo`, `policy:headerrepo`, and `policy:trace`.
