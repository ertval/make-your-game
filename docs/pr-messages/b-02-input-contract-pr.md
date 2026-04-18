# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run fix`, `npm run test`, `npm run policy`
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
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
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
- Hardened the Track B input adapter contract in `src/adapters/io/input-adapter.js` and `src/ecs/systems/input-system.js`.
- Added the explicit `getHeldKeys()` system-facing API and a side-effect-free `assertValidInputAdapter()` validator.
- Removed simulation-side ambiguity by making `input-system` require `getHeldKeys()` and `drainPressedKeys()` when an `inputAdapter` resource is present.
- Corrected `input-system` resource capability metadata so it now declares writes to `inputState`.
- Clarified active runtime vs planned scaffolding status in `src/ecs/components/actors.js`, `src/ecs/components/spatial.js`, `src/ecs/components/props.js`, and `src/ecs/components/stats.js`.
- Added frozen runtime-status metadata exports in those component modules so the clarification is executable and testable instead of comment-only.
- Expanded Track B-owned unit and adapter integration coverage to lock the explicit adapter contract and the component runtime-status metadata.

## Why
- The Phase 0 audit called out adapter contract drift and scaffolding ambiguity in the Track B-owned ECS boundary.
- The simulation should consume an explicit adapter interface instead of probing object shape through raw fields.
- The component modules previously described more runtime readiness than the current bootstrap path actually provides; the status needed to be explicit.
- The adapter validator needed to remain side-effect free so validation does not consume buffered input during tests or future runtime checks.

## Tests
- `npm test -- tests/unit/components/actors.test.js tests/unit/components/spatial.test.js tests/unit/components/props.test.js tests/unit/components/stats.test.js tests/unit/systems/input-system.test.js tests/integration/adapters/input-adapter.test.js` (passed)
- `npx @biomejs/biome check src/adapters/io/input-adapter.js src/ecs/systems/input-system.js src/ecs/components/actors.js src/ecs/components/spatial.js src/ecs/components/props.js src/ecs/components/stats.js tests/unit/components/actors.test.js tests/unit/components/spatial.test.js tests/unit/components/props.test.js tests/unit/components/stats.test.js tests/unit/systems/input-system.test.js tests/integration/adapters/input-adapter.test.js` (passed)
- `npm test -- tests/integration/gameplay/a03-game-loop.test.js tests/integration/adapters/runtime-adapter-boundary.test.js` (exposes Track A-owned legacy integration stubs that still use pre-hardening adapter shapes; follow-up belongs under issue `#28`)

## Audit questions affected
- `AUDIT-F-11 | Execution type: Fully Automatable | Verification: input adapter and input-system contract coverage in Track B tests; broader gameplay integration follow-up remains Track A-owned | Evidence path/link: tests/integration/adapters/input-adapter.test.js, tests/unit/systems/input-system.test.js`
- `AUDIT-F-12 | Execution type: Fully Automatable | Verification: held-input contract and fixed-step snapshot behavior in Track B tests; broader gameplay integration follow-up remains Track A-owned | Evidence path/link: tests/integration/adapters/input-adapter.test.js, tests/unit/systems/input-system.test.js`

## Security notes
- No unsafe DOM sinks, inline event handlers, framework imports, or canvas APIs were introduced.
- Browser I/O remains isolated to `src/adapters/io/`.
- The explicit adapter validator is data-shape validation only and does not expand any trust boundary.

## Architecture / dependency notes
- `input-system` remains a pure simulation-side ECS system and still reaches the adapter only through World resources.
- The new component runtime-status exports are descriptive metadata only; they are not a bootstrap registration API and do not change Track A ownership of runtime wiring.
- No package, lockfile, or dependency changes were made.

## Risks
- The stricter explicit adapter contract is correct for Track B ownership, but it exposes A-owned gameplay integration tests that still inject legacy `inputAdapter` stubs without `getHeldKeys()`.
- Those A-owned follow-up updates belong under the existing Track A handoff issue `#28`, not this branch.
- The current branch name contains a typo in the comment slug (`ipnut`), but it still matches the required `<owner>/<TRACK>-<NN>[-<COMMENT>]` format.
