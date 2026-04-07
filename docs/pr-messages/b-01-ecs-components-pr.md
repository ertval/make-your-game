# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Repo-wide rerun when needed: `npm run policy:repo`

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [ ] I ran `npm run policy` locally.
- [x] I verified my branch name or commits reference at least one ticket ID from `docs/implementation/ticket-tracker.md`, or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [x] I confirmed changed files stay within the declared ticket ownership scope.
- [x] I ran the applicable local checks for this change.
- [ ] I listed the audit IDs affected by this change.
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
- Implemented the `B-01` ECS component registry in `src/ecs/components/registry.js`.
- Implemented component stores for `spatial`, `actors`, `props`, `stats`, and `visual` in `src/ecs/components/`.
- Added unit coverage for registry integrity and component-store defaults/reset behavior in `tests/unit/components/`.
- Re-exported `VISUAL_FLAGS` from `src/ecs/components/visual.js` so the `classBits` contract is discoverable from the visual component module.
- Aligned actor and prop enum naming with the `B-01` ticket wording instead of inheriting terminology from unrelated modules.

## Why
- Delivers the canonical gameplay data model required by `B-02`, `B-03`, `B-04`, and `D-04`.
- Establishes stable component masks for ECS queries before gameplay systems start depending on them.
- Adds deterministic defaults and reset helpers so recycled entity IDs do not retain stale component data.

## Tests
- `npx vitest run tests/unit/components/registry.test.js tests/unit/components/spatial.test.js tests/unit/components/actors.test.js tests/unit/components/props.test.js tests/unit/components/stats.test.js tests/unit/components/visual.test.js` (passed)
- `npm run test:unit` (passed)
- `npm run check` (blocked by existing Biome config error in `biome.json`: `files.includes` should be `files.include`)

## Audit questions affected
- No standalone audit question is fully satisfied by `B-01` alone.
- This change provides foundational component contracts that downstream tickets will use for `AUDIT-F-11`, `AUDIT-F-12`, `AUDIT-F-13`, and related gameplay/render verification.

## Security notes
- No DOM sinks, HTML injection, framework imports, canvas APIs, or browser-side side effects were introduced.
- Component modules remain data-only and do not cross the DOM/adapters boundary.

## Architecture / dependency notes
- ECS boundaries remain intact: these files only define component data stores and masks.
- `actors.js` and `props.js` now follow the `B-01` ticket terminology directly for ghost and power-up enums.
- `visual.js` stores `classBits` as a bitmask and re-exports `VISUAL_FLAGS` for the canonical `STUNNED`, `INVINCIBLE`, `HIDDEN`, `DEAD`, and `SPEED_BOOST` values.
- No runtime dependencies or lockfiles changed.

## Risks
- `B-01` defines the component contract for later gameplay systems, so field-name changes after merge would cascade into `B-02` and onward.
- `npm run check` is currently blocked by a pre-existing Biome config issue outside this ticket's scope.
