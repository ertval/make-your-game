# PR Gate Checklist

## Required checks

- [ ] I read AGENTS.md and the agentic workflow guide
- [ ] I ran `npm run ci:quality` locally
- [ ] I ran `npm run ci:policy -- --pr-body-file docs/pr-messages/<ticket>-pr.md`
- [ ] I ran the applicable local checks
- [ ] I listed the audit IDs affected by this change
- [ ] I checked security sinks and trust boundaries
- [ ] I checked architecture boundaries
- [ ] I checked dependency and lockfile impact
- [ ] I requested human review
- [ ] I stored this PR body under `docs/pr-messages/`

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
