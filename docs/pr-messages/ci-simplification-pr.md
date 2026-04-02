# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
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
- Simplified the policy gate so `npm run policy` is the single top-level command.
- Kept PR-specific checks branch-driven when ticket metadata exists, and fell back to repo-wide checks when it does not.
- Removed the old `ci:` command aliases from the npm surface.
- Normalized the ticket tracker so `Blocks` entries use ticket numbers only.
- Updated the PR template, workflow docs, and archived PR notes to match the new policy flow.
- Installed dependencies locally and normalized repository formatting so Biome passes.
- Merged `docs/implementation/tickets.md` into `docs/implementation/ticket-tracker.md` and updated all policy and documentation references to use the tracker as the single ticket source.
- Upgraded the toolchain to Biome 2.4.10 and refreshed the other outdated dev dependencies (`@playwright/test`, `vite`, `vitest`, and `@vitest/coverage-v8`).
- Fixed policy-gate behavior for ticket lookup, header scanning, and generated-file handling so the local and repo policy paths run correctly.
- Fixed the proper req ID references from the audit traceability matrix in the policy checks instead of the original requirements.md.

## Why
- Makes the policy workflow easier to understand and removes the split between old CI aliases and policy commands.
- Avoids requiring a PR body file for policy enforcement while still keeping ticket-aware checks when metadata is available.
- Keeps the repository documentation aligned with the actual gate behavior.
- Keeps ticket tracking centralized in one file instead of split across two docs.
- Brings the formatter/linter and test tooling up to current releases.
- Preserves the policy contract by making the checks behave correctly under Biome 2 and on Windows paths.

## Tests
- `npm run policy -- --require-approval=true`
- `npm run policy:repo`
- `npm run check`
- `npm run test`
- `npm run test:coverage`
- `npm run sbom`

## Audit questions affected
- None directly; this change is policy and documentation only.

## Security notes
- No new DOM sinks, unsafe HTML injection, or framework/canvas APIs were introduced.
- The policy gate still enforces approval, traceability, and repository boundary checks.

## Architecture / dependency notes
- No ECS runtime behavior changed.
- The main change is the policy gate routing and documentation around it.
- `npm run policy` now handles both PR-scoped and repo-scoped validation paths.

## Risks
- Branches without ticket metadata intentionally fall back to repo-wide checks, so ticket-aware validation only happens when the branch name and commit metadata clearly identify a ticket.
- The policy command now depends on generated metadata being cleaned up between runs.

---
