# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the ## Tests section below):

- Baseline for every change: npm run check, npm run test, npm run policy
- Unit-only slices: npm run test:unit
- Cross-system or adapter changes: npm run test:integration
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): npm run test:e2e
- Audit-map updates: npm run test:audit
- Manifest/schema updates: npm run validate:schema
- Local checks rerun with prepared metadata: npm run policy:checks:local
- Repo-only troubleshooting rerun: npm run policy:repo

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [ ] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- Marked ticket A-07 as complete in the canonical tracker.
- Updated the audit traceability matrix row for `AUDIT-B-02` to explicitly include A-07 executable linkage to schema/asset gate enforcement.
- Added final A-07 closure audit record under `docs/audit-reports/`.
- Added this PR package message using the canonical template contract.

## Why
- Finalize Track A ticket A-07 closure artifacts after implementation and audit validation passed.
- Keep closure evidence deterministic, policy-aligned, and review-ready for merge.

## Tests
- `npm run policy`
- `npm run policy:checks:local`

## Audit questions affected
- `AUDIT-B-02` | Execution type: Fully Automatable | Verification: policy and schema/asset gate checks pass | Evidence path/link: `docs/audit-reports/audit-report-a07-phase-4-closure-2026-04-18.md`

## Security notes
- No runtime sink changes; updates are documentation-only closure artifacts.
- A-07 fail-closed CI/schema/asset governance remains validated through policy and validate-schema checks.

## Architecture / dependency notes
- No ECS runtime behavior changed.
- No dependencies, lockfile, or workflow command contracts were modified in this closure package.

## Risks
- Low: documentation/closure changes only; no gameplay/runtime code paths touched.
