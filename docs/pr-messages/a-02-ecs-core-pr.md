# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy:quality` locally.
- [x] I ran `npm run policy` locally.
- [x] I ran `npm run policy:repo` locally.
- [x] I ran the applicable local checks.
- [x] I listed the audit IDs affected by this change.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.
- [x] I stored this PR body under `docs/pr-messages/`.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Implemented ECS core world primitives: `src/ecs/world/entity-store.js`, `src/ecs/world/query.js`, and `src/ecs/world/world.js`.
- Added unit coverage for the ECS core in `tests/unit/world/entity-store.test.js`, `query.test.js`, and `world.test.js`.
- Updated policy command documentation and workflow messaging so local gate usage is clearer (`README.md`, workflow docs, and PR message guidance).

## Why
- Delivers the A-02 deterministic ECS runtime backbone required by downstream gameplay tracks.
- Reduces policy-gate command ambiguity so PR checks are easier to run and troubleshoot.

## Tests
- `npm run policy` (passed)
- `npm run policy:repo` (passed)
- `npm run policy:quality` (passed)
- `npm run policy:checks` (passed)
- `npm run policy:forbidden` (passed)
- `npm run policy:header` (passed)
- `npm run policy:approve` (passed; approval API check skipped in local mode)
- `npm run policy:forbiddenrepo` (passed)
- `npm run policy:headerrepo` (passed)
- `npm run policy:trace` (passed)
- `npm run test:unit` (passed)
- `npm run policy:forbidden` (passed)

## Audit questions affected
- AUDIT-B-03 (memory reuse / deterministic ECS foundation via entity ID recycling and stale-handle semantics).
- No direct gameplay-facing functional audit behavior changes in this slice.

## Security notes
- ECS runtime additions do not introduce DOM sinks, unsafe HTML injection, or framework/canvas APIs.
- Documentation updates now point to the policy-gate scripts that enforce repo checks.

## Architecture / dependency notes
- ECS boundaries remain intact: world/query/entity-store are data-oriented and isolated from adapter/DOM side effects.
- The README separates all-in-one, repo, quality, and narrow policy reruns; command mapping points to `scripts/policy-gate/run-all.mjs`, `run-checks.mjs`, `run-project-gate.mjs`, and `lib/policy-utils.mjs`.

## Risks
- World-level behavior now depends on deterministic phase ordering and deferred mutation semantics; regressions here could cascade to all gameplay systems.
- Policy documentation can still drift if npm script names change without corresponding docs updates.

## Recent updates
- Added a clearer README gate hierarchy so the all-in-one gate, repo gate, quality gate, and narrow reruns are easier to distinguish.
- Added a troubleshooting table that points to the narrower commands for quality, forbidden-tech, source-header, checklist, approval, and traceability failures.
- Aligned the docs entry guide and agent workflow guide with the same PR/repo/quality command names.
- Added explicit package-level aliases for the narrow policy checks so failure messages can point to a concrete rerun command.
- Added a simplified command model where `npm run policy` is the default all-in-one gate and one-word policy subcommands are used for drill-down (`policy:checks`, `policy:forbidden`, `policy:header`, `policy:approve`, `policy:forbiddenrepo`, `policy:headerrepo`, `policy:trace`).
- Renamed the policy command surface to keep subcommands one-word and removed multi-segment names in favor of `policy:headerrepo`.
- Updated GitHub/Gitea policy workflows to run the single all-in-one policy command.
- Removed the duplicate all-in-one alias so `npm run policy` is now the single canonical all-in-one gate command.
- Updated GitHub/Gitea policy workflows to run `npm run policy`.
- Verified `npm run policy` and `npm run policy:repo` both pass after formatting drift cleanup.
- Verified all one-word narrow reruns pass: `policy:quality`, `policy:checks`, `policy:forbidden`, `policy:header`, `policy:approve`, `policy:forbiddenrepo`, `policy:headerrepo`, and `policy:trace`.
