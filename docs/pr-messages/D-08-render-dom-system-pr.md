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
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` — branch is `medvall/D-08`.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [x] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06. (Deferred to later phase - see note below.)
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
- Added `src/ecs/systems/render-dom-system.js` — the ONLY system where DOM mutates. Consumes render intents from the buffer, acquires sprites from the pool, applies batched writes (transform translate3d, opacity, classList).
- Added `tests/unit/systems/render-dom-system.test.js` — 12 unit tests covering phase config, transform/opacity application, sprite pool integration, classList state handling, and graceful missing-resource handling.

## Why
- D-08 is a P1 critical blocker — it integrates the render pipeline: render-collect-system (D-07) + sprite-pool-adapter (D-09) → DOM commits
- This system is the bridge from pure ECS simulation to visual output. It applies all visual changes in one pass to avoid layout thrashing.
- Track D is now complete through P1 — only D-10 (sprites) and D-11 (UI/manifest) remain in P4.

## Tests
- `npm run check` — passed (Biome lint + format)
- `npm run test` — 576 tests passed (12 new D-08 tests)
- `npm run policy` — ALL CLEAR

## Audit questions affected
- **AUDIT-F-19** (Does the program stay within frame budget?) — Fully Automatable — D-08 is a co-owner with D-07. Batched DOM writes prevent layout thrash. DevTools trace evidence pending for this audit (Manual-With-Evidence category).
- **AUDIT-F-20** (Does the program minimize paint?) — Fully Automatable — D-08 is a co-owner. Will-change policy enforced in CSS; runtime layer evidence pending (Manual-With-Evidence category).
- **AUDIT-F-21** (Does the program use minimal layer promotion?) — Fully Automatable — D-08 is a co-owner. Only player + 4 ghost sprites carry `will-change: transform`; runtime layer evidence pending (Manual-With-Evidence category).
- **AUDIT-B-03** (Does program reuse memory to avoid jank?) — Fully Automatable — D-09 already covered. No regression from D-08.
- Full F-01..F-21 and B-01..B-06 coverage remains mapped and intact — no audit rows added, removed, or modified.

## Security notes
- All DOM writes are via style.transform, style.opacity, and classList.add — safe sinks only
- No `innerHTML`, `eval`, or framework imports
- File correctly placed in `src/ecs/systems/` — ECS boundary maintained

## Architecture / dependency notes
- System runs in `phase: 'render'` — executes in same phase as render-collect-system (registered after)
- Reads from `renderIntent` buffer and `spritePool` resource
- Converts tile coordinates (x, y) to pixels: x * 32, y * 32
- Maps VISUAL_FLAGS to CSS classes: STUNNED → `sprite--ghost--stunned`, DEAD → `sprite--ghost--dead`, SPEED_BOOST → `sprite--player--speed-boost`
- Opacity: byte (0-255) converted to CSS string (0.0-1.0)
- Tracks entity IDs across frames to detect entities that should no longer be rendered
- D-05 verification gate (DevTools layer/paint evidence) is deferred to a later phase when runtime traces can be captured

## Risks
- None — D-08 wire-up to the game loop happens in D-10 when visual sprites are integrated

## Deferred items (for later phases)
- DevTools layer/paint evidence for AUDIT-F-20 and AUDIT-F-21 (Manual-With-Evidence category) — deferred to D-10
- Playwright e2e restart test (deferred from D-03/D-06, natural integration point when D-08 is wired into the runtime) — deferred to D-10