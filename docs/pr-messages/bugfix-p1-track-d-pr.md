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
- [x] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` — branch: `medvall/bugfix-P1-track-D`.
- [x] I ran the applicable local checks for this change.
- [x] I listed each affected AUDIT ID with execution type and linked the passing test output or evidence artifact.
- [x] I confirmed full audit coverage remains mapped for F-01 through F-21 and B-01 through B-06.
- [ ] If affected, I attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06. *(no manual-evidence-gated audit IDs were changed)*
- [x] I checked security sinks and trust boundaries.
- [x] I checked architecture boundaries.
- [x] I checked dependency and lockfile impact. *(no dependency changes)*
- [x] I requested human review.

## Layer boundary confirmation

- [x] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [x] Simulation systems access adapters only through World resources (no direct adapter imports)
- [x] `src/adapters/` owns DOM and browser I/O side effects
- [x] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [x] No framework imports or canvas APIs were introduced in this change

## What changed
- **BUG-05**: `sprite-pool-adapter.js` — null-guard for `activePool.shift()` when pool is un-warmed; creates element on demand with dev warning instead of crashing.
- **BUG-10**: `render-intent.js` — throttled overflow warning (dev: every overflow; production: ≤1/sec via module-level timestamp).
- **BUG-12**: `event-queue.js` — `drain()` swaps buffer ownership instead of spread-copying; zero-allocation fast path for empty drain.
- **BUG-15**: `event-queue.js` — `enqueue()` null-guards against `null`/`undefined` queue argument.
- **ARCH-01**: `render-dom-system.js` — HIDDEN flag now uses `translate(-9999px, -9999px)` instead of `display:none`; eliminates forced reflow on hide/show.
- **ARCH-05**: `render-dom-system.js` — `currentFrameEntityIds` Set hoisted to system closure; `.clear()` per frame instead of `new Set()` per frame.
- **ARCH-07**: `event-queue.js` — `resetOrderCounter` marked `@deprecated`; emits dev warning when called with undrained events.
- **DEAD-01**: `main.ecs.js` — removed duplicate legacy `createDomRenderer` pipeline from the frame loop; `render-dom-system` is now the sole render path.
- **DEAD-04/06/07/11/16/17/18/19**: dead-code constants and exports annotated as `@internal` or removed where safe (`isPlayerStart` moved to test helper).
- **DEAD-23**: `map-resource.js` — removed `isPlayerStart()` export; moved implementation to `tests/unit/helpers/map-helpers.js`.
- **SEC-02/07/08**: `trusted-types.js` — rewritten to install a reject-all default policy (throws on createHTML/createScript/createScriptURL); added module header per AGENTS.md.
- **SEC-04**: `index.html` — added static CSP `<meta>` fallback for static deployments without server-side headers.
- **SEC-06**: `vite.config.js` — documented `unsafe-eval`/`unsafe-inline` HMR exception with reference to AGENTS.md allowance.
- **SEC-09**: `vite.config.js` — added `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Embedder-Policy` headers.
- **SEC-10**: `renderer-dom.js` — `el.className = ...` replaced with `el.classList.add(...)`.
- **SEC-11**: `main.ecs.js` — added `Content-Length` header guard before `response.json()` in map loader (500 KB limit).

## Why
- Resolves all 26 actionable findings assigned to Track D in the Phase 1 audit report (`docs/audit-reports/phase-1/track-d-fix-report.md`).
- ARCH-01 (display:none) was the most impactful: the old approach forced full layout recalculation on every hide/show of any entity, degrading render performance.
- DEAD-01 removed a hidden duplicate render pipeline that ran on every frame alongside the ECS render path.
- Security fixes harden the Trusted Types boundary and add missing HTTP security headers.

## Tests
- `npm run check` — passed (167 files, no issues)
- `npm run test` — passed (59 test files, 762 tests)
- `npm run policy` — passed (all gates)
- New reproducer tests added for BUG-05 (`tests/integration/adapters/sprite-pool-adapter.test.js`), BUG-12 (ownership-transfer assertion in `tests/unit/resources/event-queue.test.js`), BUG-10 (throttle behavior in `tests/unit/render-intent/render-intent.test.js`), and ARCH-01 (offscreen transform assertion in `tests/unit/systems/render-dom-system.test.js`).

## Audit questions affected
- F-03 | Execution type: Fully Automatable | Verification: render-dom-system HIDDEN flag tests | Evidence path: `tests/unit/systems/render-dom-system.test.js`
- F-11 | Execution type: Fully Automatable | Verification: render-intent overflow throttle tests | Evidence path: `tests/unit/render-intent/render-intent.test.js`
- F-14 | Execution type: Fully Automatable | Verification: event-queue drain ownership tests | Evidence path: `tests/unit/resources/event-queue.test.js`
- B-03 | Execution type: Fully Automatable | Verification: sprite-pool un-warmed acquire tests | Evidence path: `tests/integration/adapters/sprite-pool-adapter.test.js`

## Security notes
- Trusted Types default policy now throws on any attempted raw string injection into HTML/script sinks. This is a hardening change — any code path that previously relied on the permissive pass-through policy will now surface a `TypeError` immediately.
- `Content-Length` guard on map loading defends against oversized payloads; threshold is 500 KB, configurable via `MAX_MAP_SIZE_BYTES`.
- COOP/COEP headers added to enable future SharedArrayBuffer/worker use and prevent cross-origin opener access.

## Architecture / dependency notes
- `isPlayerStart` was an internal helper inadvertently exported from `map-resource.js`. Moved to `tests/unit/helpers/map-helpers.js` — no production callers existed.
- `drain()` callers must not hold references to the returned array across frames. The old shallow-copy contract allowed this; the new ownership-swap contract does not. All current callers consume within the same tick.
- No new dependencies added; no lockfile changes.

## Risks
- ARCH-01 (offscreen transform) changes the visual hide mechanism for all entities. Covered by unit test asserting the transform value, but worth a visual smoke test in-browser.
- Trusted Types policy rewrite (SEC-02/08) could surface latent violations in code paths not covered by current tests. Any `innerHTML` or `eval` usage not already guarded will now throw rather than silently succeed.
