# PR Gate Checklist

Local test command reference (run what applies to your change and list what you ran in the `## Tests` section below):

- Baseline for every change: `npm run check`, `npm run test`, `npm run ci:quality`, `npm run ci:policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Repo-wide rerun when needed: `npm run policy:repo`

## Required checks

- [ ] I read AGENTS.md and the agentic workflow guide.
- [ ] I ran `npm run ci:quality` locally.
- [ ] I ran `npm run ci:policy` locally.
- [ ] I verified my branch commits reference at least one ticket ID from `docs/tickets.md`.
- [ ] I confirmed changed files stay within the declared ticket ownership scope.
- [ ] I ran the applicable local checks for this change.
- [ ] I listed the audit IDs affected by this change.
- [ ] I checked security sinks and trust boundaries.
- [ ] I checked architecture boundaries.
- [ ] I checked dependency and lockfile impact.
- [ ] I requested human review.

## Layer boundary confirmation

- [ ] `src/ecs/systems/` has no DOM references except `render-dom-system.js`
- [ ] Simulation systems access adapters only through World resources (no direct adapter imports)
- [ ] `src/adapters/` owns DOM and browser I/O side effects
- [ ] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection
- [ ] No framework imports or canvas APIs were introduced in this change

## What changed
- 

## Why
- 

## Tests
- 

## Audit questions affected
- 

## Security notes
- 

## Architecture / dependency notes
- 

## Risks
- 
