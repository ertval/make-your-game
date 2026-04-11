# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-wide rerun when needed: `npm run policy:repo`

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>` (for example `ekaramet/A-03`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
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
- Implemented the `B-02` keyboard input adapter in `src/adapters/io/input-adapter.js`.
- Added canonical input intent normalization for movement, bomb, pause, and confirm actions using `KeyboardEvent.code` with safe `key` fallback handling.
- Added repeat-safe held-key and pressed-key tracking so one-shot actions do not depend on OS key-repeat behavior.
- Added focus-loss safety by clearing held and pressed input state on `blur` and hidden `visibilitychange`.
- Implemented the fixed-step input snapshot system in `src/ecs/systems/input-system.js`.
- Extended `src/ecs/components/actors.js` so the `input-state` component can store the `confirm` intent required by `Enter`.
- Added focused unit coverage for adapter mapping, repeat behavior, focus-loss clearing, missing-adapter fallback, and deterministic fixed-step snapshot behavior.
- Marked `B-02` as done in `docs/implementation/ticket-tracker.md` after the ticket-specific verification gate passed.

## Why
- `B-02` requires a browser input boundary that captures keyboard intents without leaking DOM concerns into gameplay systems.
- The simulation needs a deterministic per-step snapshot layer so later gameplay systems consume stable input data instead of reading browser events directly.
- `Enter` needed a corresponding `input-state` field so confirmation actions can be represented in the same fixed-step input contract as movement, bomb, and pause.
- Focus-loss clearing is required to prevent stuck movement or stuck actions after tab switches and window blur events.

## Tests
- `npx vitest run tests/unit/adapters/input-adapter.test.js tests/unit/components/actors.test.js tests/unit/systems/input-system.test.js` (passed)
- `./node_modules/.bin/biome check src/adapters/io/input-adapter.js src/ecs/components/actors.js src/ecs/systems/input-system.js tests/unit/adapters/input-adapter.test.js tests/unit/components/actors.test.js tests/unit/systems/input-system.test.js` (passed)

## Audit questions affected
- `AUDIT-F-11`
- `AUDIT-F-12`

## Security notes
- No unsafe HTML sinks, canvas APIs, or framework imports were introduced.
- Browser keyboard handling remains isolated inside `src/adapters/io/`.
- The gameplay-facing system consumes adapter state through World resources rather than importing browser APIs directly.

## Architecture / dependency notes
- `B-02` intentionally stops at adapter and system ownership. It does not claim bootstrap/runtime integration or pause/menu flow ownership.
- The `input-system` writes only to ECS `input-state` data and contains no DOM references.
- No runtime dependencies, lockfiles, or package metadata changed.

## Risks
- The adapter/system are implemented, but runtime/bootstrap wiring is intentionally outside this ticket's ownership scope and must be integrated by the owner of that surface.
- Later gameplay systems must preserve the snapshot contract (`up`, `down`, `left`, `right`, `bomb`, `pause`, `confirm`) to avoid downstream drift.
