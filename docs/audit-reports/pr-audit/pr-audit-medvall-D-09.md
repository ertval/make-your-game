# Audit: `medvall/D-09`
## Verdict: **FAIL**

---

## Scope & Compliance
- **Ticket ID**: `D-09` | **Track**: `D`
- **Audit Mode**: `TICKET`
- **Base Comparison**: `debd316345b8d8a470547dfb3447d698aba5c8f1..c5307ad`
- **Grade**: `B- implementation quality, FAIL merge readiness`

### Deliverables & Verification
- PASS: `src/adapters/dom/sprite-pool-adapter.js` exists and implements a pool API.
- PASS: Pool sizes derive from `src/ecs/resources/constants.js`.
- PASS: Hidden/released/recycled elements use `transform: translate(-9999px, -9999px)`; no `display:none` was introduced.
- PASS: `acquire`, `release`, `reset`, `stats`, and `warmUp` are exposed for render-DOM consumption.
- PASS: Focused adapter tests cover sizing, hiding, acquire/release, exhaustion, and reset.
- FAIL: `docs/implementation/track-d.md:198` requires pools to be pre-warmed during level load, but no production code imports `createSpritePool()` or calls `warmUp()`. The branch provides the API only.
- **Out-of-Scope Findings**: Existing local modification to `docs/pr-messages/process-track-D-ownership-handoff.md` is unrelated to `main...HEAD` and was not reviewed as D-09 scope.

---

## Audit Findings & Blockers
### Critical (Blockers)
1. D-09 is marked complete while the level-load prewarm deliverable is not implemented. `src/adapters/dom/sprite-pool-adapter.js:68` defines `warmUp(containerElement)`, but there is no production call site under `src/`; `docs/pr-messages/D-09-sprite-pool-adapter-pr.md:38-39` also states the adapter is not wired into the game loop until D-08.

### High/Medium/Low
1. Medium: `release(type, element)` pushes the element into the idle pool even when it was not active (`src/adapters/dom/sprite-pool-adapter.js:116-120`). A double release or foreign element can inflate the pool and break pool ownership invariants. This is not the merge blocker, but it should be covered before D-08 depends on the API.

> [!IMPORTANT]
> ### Path To PASS
> 1. Wire sprite pool creation into the runtime level-load/bootstrap path and call `warmUp()` against the intended sprite container before render usage.
> 2. Register/expose the pool through the intended World resource or render adapter boundary so D-08 can consume it without DOM leakage into simulation systems.
> 3. Add a narrow runtime/bootstrap test proving level load pre-warms the pool.
> 4. Either harden `release()` against duplicate/foreign releases or document and test the stricter ownership contract.

---

## Requirements, Audit & Drift
- **REQ IDs**: `REQ-01`, `REQ-14`
- **AUDIT IDs**: `AUDIT-B-03`, `AUDIT-B-04`
- PASS: `AUDIT-B-03` traceability now references `tests/integration/adapters/sprite-pool-adapter.test.js` and remains `Mapped, Covered, Pending`, which is accurate because D-08 still owns runtime allocation evidence.
- PASS: `AUDIT-B-04` remains `Mapped, Planned, Pending`; D-09 introduces no SVG coverage regression and does not claim completion.
- PASS: Manual evidence status is unchanged; F-19/F-20/F-21/B-06 are not activated by this adapter-only branch.
- FAIL: Technical/documentation drift exists at the ticket level because `track-d.md` and `ticket-tracker.md` mark D-09 complete despite the missing level-load prewarm.

---

## Automated Gate Summary
- PASS: `npm run policy -- --require-approval=false` (exit=0, rerun outside sandbox after local Playwright server bind was blocked by sandbox `EPERM`)
- PASS: `npm run check`
- PASS: `npm run test:coverage` (40 files, 435 tests)
- PASS: `npm run test:audit:e2e` (7 tests)
- PASS: `npm run test:e2e` (12 tests)
- PASS: `npm run validate:schema`
- PASS: `npm run sbom`
- PASS: `policy:checks`, `policy:forbidden`, `policy:header`, `policy:trace`

---

## Policy Matrix
- PASS: Ticket/Track Context Valid
- PASS: Ownership & PR Template Respected
- PASS: ECS DOM Boundary & Adapter Injection
- PASS: Forbidden Tech (canvas/WebGL/frameworks)
- PASS: Security Sinks (innerHTML/eval/timers)
- FAIL: Timing, Input, & Rendering Invariants (`pre-warm pools during level load` not wired)
- PASS: New Files Header Comments
- PASS: Audit Traceability Matrix Mapping
- FAIL: No Gameplay/Document/Technical Drift

---

## Final Report Metadata
- **Date**: 2026-05-01
- **READY_FOR_MAIN**: **NO**
