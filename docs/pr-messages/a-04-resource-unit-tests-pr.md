# A-04: Resource unit tests + coverage fixes (includes A-03 fixes)

## Summary
- Adds/completes resource unit tests and closes coverage gaps in resource modules.
- Adds a small map-parse test helper and stronger `event-queue` comparator tests.
- Produces PR audit evidence and updates ticket tracker.
- Branch: `ekaramet/A-04` (contains earlier A-03 commits).

## What changed
- Tests: `tests/unit/resources/event-queue.test.js`, `tests/unit/resources/map-resource.test.js`, `tests/unit/resources/constants.test.js`
- Docs: `docs/implementation/ticket-tracker.md`, `docs/audit-reports/pr-audit-ekaramet-A-04.md`
- Test helper: small parse helper to exercise parse/semantic rejection boundaries.

## Why
- Fulfill ticket A-04: ensure six resource unit tests are present and passing.
- Close coverage gaps flagged by policy/audit and ensure deterministic behavior for resource subsystems.
- Provide the audit evidence required by the repo gate.

## Tests / Checks run
- Commands: `npm run check`, `npm run test`, `npm run test:unit`, `npm run validate:schema`, `npm run policy`, `npm run ci`
- Results: Full test suite passed locally; focused resource run passed.
- Counts: Full run: ~214 tests passed. Resource-focused run: ~100 tests passed.
- Coverage: `src/ecs/resources` ≈ 96.7% statements / ≈ 96.56% lines; `map-resource` ≈ 93.44% lines; `clock`, `constants`, `event-queue`, `game-status`, `rng` at 100% lines.

## Audit
- Audit report: `docs/audit-reports/pr-audit-ekaramet-A-04.md`
- Ownership/ticket checks run and passed for A-03 / A-04 scope.

## Security / Architecture
- No new dependencies or lockfile changes.
- No DOM or adapter code introduced in simulation systems; changes limited to tests and docs.
- No unsafe HTML sinks introduced.

## Risks
- Low — changes are tests, a small parse helper, and docs. No runtime game behavior changes.

## Checklist
- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally.
- [x] Branch name follows `<owner-or-scope>/<TRACK>-<NN>` (`ekaramet/A-04`).
- [x] Changed files remain inside declared ticket scope.
- [x] I ran the applicable local checks for this change.
- [x] I listed audit IDs affected (A-04; includes prior A-03).
- [x] I checked security sinks and architecture boundaries.
- [x] I checked dependency and lockfile impact.
- [ ] I requested human review (please add reviewer(s) when opening the PR).

## Next steps
- Push and open the PR, paste this description in the PR body.
- Request reviewers and include note: "This PR closes A-04 and includes prior A-03 fixes — see audit report."

### Push command
```bash
git push origin ekaramet/A-04
```
