# 🔧 bugfix: resource/timing/map correctness — #237 #239 #244

> Three Track D correctness fixes (all assigned to @edvallm) on one `bugfix-*` branch: a clock time-regression freeze, an inconsistent `drain()` return contract, and a test-env schema fail-open. `bugfix-*` bypasses ownership; all changes are within Track D resources. #237 and #239 were committed earlier and carried on this branch; #244 is new here.

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] Branch name follows `<owner>/bugfix-<slug>` (`medvall/bugfix-correctness-237-239-244`).
- [x] Changed files are within Track D (`src/ecs/resources/*`); test fixtures updated across tracks under the bugfix bypass.
- [x] Each fix has a failing-first repro test.
- [x] Checked security sinks, architecture boundaries, dependency impact (none).
- [x] Requested human review.

## What changed

### #237 (BUG-02) — clock resyncs after a backward time regression
- `src/ecs/resources/clock.js`: on a backward jump (`now < lastFrameTime`) the baseline now resyncs `lastFrameTime`/`realTimeMs` to the new (lower) timestamp, costing a single 0-step frame instead of freezing the sim until real time re-passed the stale high baseline.
- Test: `clock.test.js` — "resynchronizes after a backward time regression instead of freezing (#237)".

### #239 (BUG-04) — `drain()` returns a consistently mutable array
- `src/ecs/resources/event-queue.js`: empty frames return a fresh mutable `[]` instead of a frozen `Object.freeze([])` singleton, so consumers that sort/splice/push in place no longer throw only on quiet frames.
- Test: `event-queue.test.js` — "returns a consistently mutable array for empty and populated drains (#239)".

### #244 (BUG-13) — structural map-schema validation runs in tests (no fail-open)
- `src/ecs/resources/map-resource.js`: `validateMapSchema` no longer returns `true` unconditionally under `NODE_ENV=test`. **Structural** checks (required fields, types, cell enum, `additionalProperties`, metadata/spawn shape) now always run; only **production dimensional limits** (level 1–3, board 10–100, grid width, metadata ranges) are relaxed by default in tests so focused small fixtures still work. `createMapResource` gains an explicit `{ validateSchema: false }` per-call escape hatch for tests that deliberately build invalid maps (e.g. the missing-`ghostSpeed` fallback repro).
- Fixed genuinely-malformed fixtures surfaced by the newly-active validation: `activeGhostTypes: ['red', …]` → integer indices `[0,1,2,3]` in `level-transition-spawn-reset` and `bootstrap-extended`.
- Test: `map-resource.test.js` — "runs structural schema validation in the test env but relaxes production dimensions (#244)" asserts a structural defect is rejected under the test env and the escape hatch still lets deliberate-invalid maps through.

## Tests

- `npx vitest run` — **1305 passed** (incl. the three repro tests).
- `npm run check` — clean. `npm run policy` — green modulo the pre-existing e2e timing-flake cluster (`#84`/`race-condition`).

## Audit questions affected

- **F-01** (runs without crashing): #237 removes a sim-freeze failure mode; #239 removes a latent `TypeError` on quiet frames.
- **Test integrity**: #244 closes a fail-open where malformed maps could pass the suite — strengthens the guarantees behind the map-loading audit coverage.

## Security notes

- #244 tightens a trust boundary: malformed map data is now rejected in tests as it is in production. No new sinks or dependencies.

## Architecture / dependency notes

- No dependency/lockfile changes. `createMapResource`'s new optional `{ validateSchema }` is backward-compatible (defaults to `true`).

## Risks

- Low. All three are localized to `src/ecs/resources/*` with direct unit coverage. The #244 change is the broadest — it was validated by bringing the full suite back to green (the previously fail-open fixtures were either legitimately small, now-relaxed, or genuinely malformed, now fixed).
