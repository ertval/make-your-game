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
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
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
- Added `src/ecs/systems/scoring-system.js` as the C-01 scoring authority.
- Implemented deterministic scoring for collision intents from `B-04`: pellet, power pellet, power-up, normal ghost chain scoring, and fixed stunned-ghost scoring.
- Added canonical `scoreState` handling with sanitization, combo tracking, and duplicate-frame protection.
- Added unit coverage in `tests/unit/systems/scoring-system.test.js` for canonical values, chain behavior, malformed inputs, and the level-clear helper formula.
- Kept level-clear scoring at system-helper scope only; runtime/gameplay integration remains deferred.

## Why
- C-01 owns point authority and combo rules at the ECS system layer.
- Keeping scoring logic isolated in a pure system preserves deterministic behavior and maintains Track C boundary discipline.
- Runtime HUD/progression integration belongs to later tickets, so this PR limits itself to the scoring authority and its direct unit coverage.

## Tests
- `npm run policy:forbidden`
  PASS: forbidden scan passed for changed scope.
- `npm run policy:header`
  PASS: changed-source header check passed.

## Audit questions affected
- `AUDIT-F-15` | Execution type: Fully Automatable | Evidence: `tests/unit/systems/scoring-system.test.js` covers canonical score values, chain scoring, stunned-ghost scoring, duplicate-frame protection, and malformed input handling.

## Security notes
- No DOM sinks, HTML injection paths, eval-like APIs, storage reads, or network surfaces were added.
- The scoring system mutates only ECS world resources and stays within the simulation boundary.

## Architecture notes
- Change stays within Track C scope: system-level scoring logic plus scoped unit coverage.
- `src/ecs/systems/scoring-system.js` remains simulation-only and does not import adapters or browser APIs.
- Runtime integration into the bootstrap/system stack is deferred to later tickets (`A-05`, `C-05`, `B-09`).
- Level-clear scoring is implemented as a pure helper and will be integrated in `C-04`.

## Risks
- Gameplay-visible score updates are not introduced by this PR alone because runtime integration is deferred.
- Level-clear points are not awarded in gameplay yet; only the pure helper formula exists in C-01.
- Later tickets must preserve C-01 as the single scoring authority when wiring HUD, progression, or event-queue consumers.
