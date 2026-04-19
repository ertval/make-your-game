# PR Template Contract

This document includes the full PR template content used in `.github/pull_request_template.md`.

## Template Content

```md
# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-only troubleshooting rerun: `npm run policy:repo`

## Required checks

- [ ] I read AGENTS.md and the agentic workflow guide.
- [ ] I ran `npm run policy` locally.
- [ ] I confirmed changed files stay within the declared ticket ownership scope.
- [ ] I ran `npm run policy` locally.
- [ ] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [ ] I ran the applicable local checks for this change.
- [ ] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [ ] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [ ] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
- [ ] I checked security sinks and trust boundaries.
- [ ] I checked architecture boundaries.
- [ ] I checked dependency and lockfile impact.
- [ ] I requested human review.

## Layer boundary confirmation

- [ ] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [ ] Simulation systems access adapters only through World resources (no direct adapter imports)
- [ ] `src/adapters/` owns DOM and browser I/O side effects
- [ ] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [ ] No framework imports or canvas APIs were introduced in this change

## What changed
- 

## Why
- 

## Tests
- 

## Audit questions affected
- AUDIT-XX | Execution type: Fully Automatable or Semi-Automatable or Manual-With-Evidence | Verification: test name or evidence note | Evidence path/link:
- AUDIT-YY | Execution type: Fully Automatable or Semi-Automatable or Manual-With-Evidence | Verification: test name or evidence note | Evidence path/link:

## Security notes
- 

## Architecture / dependency notes
- 

## Risks
-
```

## Sync Rule

1. Update `.github/pull_request_template.md` first.
2. Update this file in the same PR.
