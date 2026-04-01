# PR Gate Checklist

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide
- [x] I ran the applicable local checks
- [x] I listed the audit IDs affected by this change
- [x] I checked security sinks and trust boundaries
- [x] I checked architecture boundaries
- [x] I checked dependency and lockfile impact
- [x] I ran `npm run pr:gate -- --pr-body-file <path-to-pr-message>`
- [x] I requested human review

## What changed
- Added A-01 scaffolding files: package/tooling configs, app shell HTML/CSS, and initial entry module.
- Extracted `policy-gate.yml` logic into reusable `scripts/policy-gate/*.mjs` scripts.
- Updated workflow and process docs for manual + CI shared gate usage.

## Why
- Establishes the baseline development toolchain and merge gate automation for Track A.

## Tests
- `npm run check`
- `npm run test`
- `npm run validate:schema`
- `npm run pr:gate -- --pr-body-file docs/pr-messages/a-01-project-scaffolding-pr.md`

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
- Local PR gate requires a prepared PR body file; if not provided, local `policy:local` will fail by design.
