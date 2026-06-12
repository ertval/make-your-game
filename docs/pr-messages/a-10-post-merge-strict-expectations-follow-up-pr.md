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

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [x] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`.
- [x] Simulation systems access adapters only through World resources (no direct adapter imports).
- [x] `src/adapters/` owns DOM and browser I/O side effects.
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection.
- [x] No framework imports or canvas APIs were introduced in this change.

## What changed
- Removed level-loader compatibility fallback and restored strict runtime map-resource boundary validation.
- Added exported `assertValidMapResource` guard in map resource module.
- Restored strict post-merge expectations in compatibility test files:
  - `tests/unit/resources/game-status.test.js`
  - `tests/unit/resources/map-resource.test.js`
- Updated map-resource fixture used by level-loader unit tests to satisfy strict contract (`ghostSpeed`).
- Updated tracker remediation ledger and audit traceability status for affected audit IDs.

## Why
- Tracker remediation ledger explicitly required this follow-up after B-02, D-01, and D-03 merged.
- Temporary compatibility behavior was no longer needed and weakened strict trust-boundary enforcement.
- CI-02 closure requires executable behavior checks, not compatibility placeholders.

## Tests
- `npm run test:unit -- tests/unit/resources/game-status.test.js tests/unit/resources/map-resource.test.js tests/unit/game/level-loader.test.js` (pass)
- `npm run test:integration -- tests/integration/gameplay/game-flow.level-loader.test.js` (pass)
- `npm run check` (pass)
- `npm run policy` (fails only on branch-name format gate for current branch naming policy; all preceding quality/test/e2e/audit/schema/sbom steps passed)
- `node scripts/policy-gate/run-checks.mjs --check-set=pr --require-branch-ticket=false` (pass; confirms no policy defects beyond branch-name formatting)

## Audit questions affected
- AUDIT-F-01 | Execution type: Fully Automatable | Verification: `tests/e2e/audit/audit.browser.spec.js` runtime boot assertion path + policy audit runs | Evidence path/link: `tests/e2e/audit/audit.browser.spec.js`
- AUDIT-F-09 | Execution type: Fully Automatable | Verification: `tests/e2e/audit/audit.browser.spec.js` pause/continue/restart flow assertion path + policy audit runs | Evidence path/link: `tests/e2e/audit/audit.browser.spec.js`
- AUDIT-B-02 | Execution type: Fully Automatable | Verification: policy gate + lint/test/security obligations | Evidence path/link: `scripts/policy-gate/run-all.mjs`

## Security notes
- Strengthened runtime trust boundary by requiring map resource validation before world resource injection.
- No unsafe DOM sink changes.

## Architecture / dependency notes
- No ECS scheduling or DOM adapter boundary changes.
- No dependency additions.

## Risks
- Stricter map-resource validation can fail fast on malformed test fixtures or integration payloads; this is intended fail-closed behavior.
