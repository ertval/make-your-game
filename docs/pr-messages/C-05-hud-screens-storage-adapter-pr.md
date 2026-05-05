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
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (not applicable).
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

## Title

`C-05: HUD Adapter, Screen Overlays, and Storage Adapter`

## What changed

- Implemented `src/adapters/dom/hud-adapter.js` as the Track C HUD DOM boundary using `textContent`-only rendering for lives, score, timer, bomb count, fire radius, and level number.
- Implemented `src/adapters/dom/screens-adapter.js` as the Track C overlay boundary for Start, Pause, Level Complete, Game Over, and Victory screens with keyboard navigation, selected-option persistence, and focus transfer behavior.
- Implemented `src/adapters/io/storage-adapter.js` with guarded `localStorage` reads/writes plus `saveHighScore()` and `getHighScore()` helpers that validate untrusted stored data and fail closed to `0`.
- Added focused integration coverage in `tests/integration/adapters/hud-adapter.test.js`, `tests/integration/adapters/screens-adapter.test.js`, and `tests/integration/adapters/storage-adapter.test.js`.
- Added browser-level keyboard coverage in `tests/e2e/c-05-screens-navigation.spec.js` for pause-menu navigation, Continue activation, Restart activation, and focus restoration.
- Updated Track C implementation docs and audit traceability mappings so C-05 is marked complete for the adapter/UI contract it owns, with broader runtime/bootstrap integration still deferred.
- Updated docs:
  - `docs/implementation/track-c.md` (C-05 marked complete for adapter scope)
  - `docs/implementation/ticket-tracker.md` (status updated)
  - `docs/implementation/audit-traceability-matrix.md` (mapped `AUDIT-F-07` through `AUDIT-F-16`)

## Summary

- This PR implements the full C-05 adapter surface owned by Track C:
  - HUD adapter with safe `textContent` updates only
  - Screen overlays adapter for start/pause/progression/end-state menus
  - Storage adapter for validated high-score persistence
- The implementation is intentionally limited to adapter ownership and does not add bootstrap/runtime wiring or DOM behavior inside ECS systems.
- This PR satisfies the adapter-layer audit requirements but does not complete full runtime gameplay integration.
- C-05 does NOT include runtime mounting or bootstrap integration.
- All adapter functionality is currently validated via integration and e2e harness tests only.

## Scope clarification

- This PR is limited to Track C ownership paths only.
- No bootstrap/runtime wiring is included in this change.
- No DOM logic was added to ECS systems.
- Pause-menu Continue and Restart actions remain adapter-level actions that emit intents/callbacks only; end-to-end orchestration remains owned by later integration work.
- C-05 is COMPLETE at adapter/UI boundary level only (system-level / adapter scope only).
- It does not represent full gameplay or runtime completion.
- Full product-level behavior (bootstrap wiring, runtime orchestration, ECS integration) is intentionally deferred to later tickets (`C-06+` / Track A integration).

## Why

- C-05 owns the browser-facing HUD and overlay boundaries that consume already-produced game state without violating ECS isolation.
- The audit gaps for pause menu visibility, keyboard navigation, restart affordance, and visible HUD metrics could not be satisfied by C-04 system-layer coverage alone.
- The high-score trust boundary needed an explicit adapter that validates `localStorage` input instead of trusting stored data.

## Implementation details

### HUD Adapter

- Uses `textContent` only for all HUD writes.
- Formats score using the canonical five-digit padding rule (`00050`).
- Formats timer as `M:SS`.
- Renders lives, bombs, fire radius, and level number.
- Throttles `aria-live` announcements and only updates live-region text when relevant values change.
- Avoids repeated writes for unchanged visible values.

### Screens Adapter

- Implements separate overlay containers for:
  - Start
  - Pause
  - Level Complete
  - Game Over
  - Victory
- Uses class/attribute visibility toggles rather than `display:none`.
- Supports keyboard navigation with:
  - `ArrowUp`
  - `ArrowDown`
  - `Enter`
- Pause menu exposes:
  - Continue
  - Restart
- Moves focus into the active overlay when opened.
- Restores focus to gameplay when the overlay closes.
- Preserves selected option index when reopening the same overlay.

### Storage Adapter

- Implements `saveHighScore(score)`.
- Implements `getHighScore()`.
- Reads through a guarded JSON parse boundary.
- Treats `localStorage` as untrusted input.
- Requires the stored score to be a finite number.
- Falls back to `0` and warns on malformed or invalid data.

## Tests

- `npm run test`
- `npm run policy`
- `npm run test:integration`
- `npm run test:e2e`
- `npx vitest run tests/integration/adapters/hud-adapter.test.js tests/integration/adapters/screens-adapter.test.js tests/integration/adapters/storage-adapter.test.js`
- `npx playwright test tests/e2e/c-05-screens-navigation.spec.js`

## Audit questions affected

- `AUDIT-F-07 | Execution type: Fully Automatable | Verification: pause menu shows Continue and Restart in tests/integration/adapters/screens-adapter.test.js and tests/e2e/c-05-screens-navigation.spec.js | Evidence path/link: tests/integration/adapters/screens-adapter.test.js + tests/e2e/c-05-screens-navigation.spec.js`
- `AUDIT-F-08 | Execution type: Fully Automatable | Verification: keyboard navigation across overlay options is covered in tests/integration/adapters/screens-adapter.test.js and tests/e2e/c-05-screens-navigation.spec.js | Evidence path/link: tests/integration/adapters/screens-adapter.test.js + tests/e2e/c-05-screens-navigation.spec.js`
- `AUDIT-F-09 | Execution type: Fully Automatable | Verification: Restart action is reachable from the pause overlay and emits the adapter action path in tests/integration/adapters/screens-adapter.test.js and tests/e2e/c-05-screens-navigation.spec.js | Evidence path/link: tests/integration/adapters/screens-adapter.test.js + tests/e2e/c-05-screens-navigation.spec.js`
- `AUDIT-F-14 | Execution type: Fully Automatable | Verification: HUD timer formatting and visible countdown contract are covered in tests/integration/adapters/hud-adapter.test.js | Evidence path/link: tests/integration/adapters/hud-adapter.test.js`
- `AUDIT-F-15 | Execution type: Fully Automatable | Verification: padded score rendering contract is covered in tests/integration/adapters/hud-adapter.test.js | Evidence path/link: tests/integration/adapters/hud-adapter.test.js`
- `AUDIT-F-16 | Execution type: Fully Automatable | Verification: visible lives HUD contract is covered in tests/integration/adapters/hud-adapter.test.js | Evidence path/link: tests/integration/adapters/hud-adapter.test.js`

## Security notes

- No unsafe DOM sinks, inline handlers, dynamic code execution, framework imports, or canvas/WebGL/WebGPU APIs were introduced.
- HUD and screen rendering use only safe DOM sinks (`textContent`, explicit attributes, and class toggles).
- The storage adapter treats `localStorage` as untrusted input and validates on read.

## Architecture / dependency notes

- ECS boundaries remain intact: adapters own DOM/browser interaction and systems remain DOM-agnostic.
- This PR does not wire adapters into bootstrap or world registration.
- Runtime integration, product-level menu orchestration, and broader pause/restart flow wiring remain deferred to later tickets (`C-06+` / Track A integration paths).
- No dependency, lockfile, or package metadata changes were made.

## Constraints

- No `innerHTML`
- No forbidden tech
- ECS boundaries respected
- Adapter-only DOM interaction

## Verification

- `npm run policy` PASS
- `npm run test` PASS
- `npm run test:integration` PASS
- `npm run test:e2e` PASS
- Targeted Track C adapter coverage maintained above the requested threshold:
  - `hud-adapter.js` branch coverage: `97.36%`
  - `screens-adapter.js` branch coverage: `84.61%`
  - `storage-adapter.js` branch coverage: `89.47%`
- Combined C-05 adapter branch coverage remains above `85%`.

## Risks

- Bootstrap/runtime registration is intentionally not part of this PR, so product-level overlay mounting still depends on later integration work.
- Continue and Restart remain adapter action outputs only in this ticket; any gameplay-flow side effects beyond emitted intents/callbacks are deferred by design.
