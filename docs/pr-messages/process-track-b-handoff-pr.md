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
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>` (for example `ekaramet/A-03`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.
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
- Re-applied the Track B ownership handoff from issue `#11` on a Track B-owned branch.
- Added `resourceCapabilities` metadata to `src/ecs/systems/input-system.js` so the system declares which World resources it reads.
- Added unit coverage in `tests/unit/systems/input-system.test.js` to lock the new metadata contract.
- Kept the change limited to Track B-owned code and tests; no Track A runtime wiring or cross-track files were touched in this PR.

## Why
- This is a `process` handoff PR that re-applies a Track B-owned change that could not stay on a Track A-owned branch under owner-scoped policy enforcement.
- `input-system.js` now exposes its resource read contract explicitly, which makes the system dependency surface inspectable by tooling and policy checks.
- The unit test prevents this metadata from silently drifting during later input-system refactors.

## Tests
- `npm test -- tests/unit/systems/input-system.test.js tests/integration/adapters/input-adapter.test.js`
- `npx @biomejs/biome check src/ecs/systems/input-system.js tests/unit/systems/input-system.test.js`
- `npm run policy`

## Audit questions affected
- None directly. This change adds system metadata and unit coverage only; it does not alter gameplay, browser behavior, or audit evidence paths.
- Coverage note: the full `npm run policy` gate passed after the handoff was reapplied on the Track B-owned branch.

## Security notes
- No unsafe DOM sinks, inline handlers, framework imports, or canvas APIs were introduced.
- The change stays inside ECS system metadata and tests and does not expand any trust boundary.

## Architecture / dependency notes
- `input-system.js` remains a pure simulation-side ECS system with no direct DOM or adapter imports beyond the existing World-resource contract.
- No dependency or lockfile changes were made.
- The added `resourceCapabilities` object is descriptive metadata; it does not change the system phase or the input snapshot behavior.

## Risks
- The only functional risk is future drift if other systems adopt similar metadata but do not keep it tested consistently.
- This PR intentionally goes slightly beyond the literal handoff diff by adding a unit test for the new contract; if reviewers want a literal-only reapplication, that test can be split out or dropped.
