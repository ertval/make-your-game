# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran `npm run ci:quality` locally
- [x] I ran `npm run ci:quality` locally
- [x] I ran `npm run ci:policy`
- [x] I ran `npm run ci:policy`
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
- Added A-01 scaffolding files: package/tooling configs, app shell HTML/CSS, and initial entry module.
- Extracted `policy-gate.yml` logic into reusable `scripts/policy-gate/*.mjs` scripts.
- Updated workflow and process docs for manual + CI shared gate usage.

## Why
- Establishes the baseline development toolchain and merge gate automation for Track A.

## Tests
- `npm run ci:quality`
- `npm run ci:quality`
- `npm run ci:policy`
- `npm run ci:policy`
- `npm run check`
- `npm run test`
- `npm run validate:schema`
- `npm run ci:policy`

## Audit questions affected
- AUDIT-F-04
- AUDIT-F-05
- AUDIT-B-02

## Security notes
- Policy scripts enforce forbidden sink scans and ban framework imports and canvas usage.
- PR body and audit traceability checks are run locally and in CI through shared scripts.

## Architecture / dependency notes
- Keeps project on vanilla ES module stack with no framework runtime.
- Added lockfile to pair dependency metadata with deterministic installs.

## Risks
- Policy checks depend on valid ticket IDs in branch and commit metadata plus ownership-scope compliance.

## Recent updates
- Added the simplified all-in-one gate command: `npm run ci:policy`.
