# Audit Traceability Matrix

This document is the single source of truth for requirement-to-audit-to-ticket-to-test coverage.

## Purpose

1. Prevent requirement drift between requirements, implementation tickets, and tests.
2. Keep one canonical mapping for coverage status.
3. Track whether mapped coverage is executable and passing.

## Scope And Ownership

1. Requirement and audit coverage mapping lives only in this file.
2. The implementation plan defines ticket details and verification gates, then references this file for consolidated coverage mapping.
3. Ticket execution progress (owner/status/PR/evidence links) is tracked in `docs/ticket-tracker.md`.
4. Test ownership remains in `tests/e2e/audit/` and must stay synchronized with this file.

## Status Legend

- `Mapped`: The row has an explicit mapping.
- `Planned`: Ticket ownership and a verification path are defined.
- `Executable`: Real assertions/evidence are implemented and passing.
- `Pending`: Not yet executable or not yet validated by passing artifacts.

## Current Automation Reality

- `tests/e2e/audit/audit-question-map.js` includes all 27 audit IDs.
- `tests/e2e/audit/audit.e2e.test.js` generates one test per audit ID.
- `runAuditAssertion(question)` currently throws a placeholder error, so executable automation is pending.

## Alignment Verification Summary

1. REQ-01 through REQ-14 are mapped to owning tickets and audit IDs below.
2. AUDIT-F-01 through AUDIT-F-21 and AUDIT-B-01 through AUDIT-B-06 are mapped to ticket anchors and test/evidence anchors below.
3. E2E coverage is mapped for every audit ID, but execution status is still pending until placeholder logic is replaced and tests pass.

## Requirement Coverage Matrix (Canonical)

| Requirement ID | Requirement Summary | Owning Tickets (`docs/implementation-plan.md` Section 3) | Covered By Audit IDs | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|
| REQ-01 | Run at least 60 FPS and avoid frame drops | A-4, D-5, A-7 | AUDIT-F-17, AUDIT-F-18, AUDIT-B-01 | `tests/e2e/audit/audit.e2e.test.js` + performance evidence artifacts | Mapped, Planned, Pending |
| REQ-02 | Use `requestAnimationFrame` correctly | A-4 | AUDIT-F-02, AUDIT-F-10 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-03 | Pause menu contains Continue and Restart | C-5, D-2 | AUDIT-F-07, AUDIT-F-08, AUDIT-F-09 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-04 | HUD shows countdown/timer | C-4, D-2 | AUDIT-F-14 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-05 | HUD shows score and score increments | C-4, D-2, B-6 | AUDIT-F-15 | `tests/e2e/audit/audit.e2e.test.js` + integration event tests | Mapped, Planned, Pending |
| REQ-06 | HUD shows lives and lives decrement | C-4, D-2, B-5 | AUDIT-F-16 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-07 | Keyboard-only control path | B-2, C-5, D-2 | AUDIT-F-11, AUDIT-F-12 | `tests/e2e/audit/audit.e2e.test.js` + adapter focus tests | Mapped, Planned, Pending |
| REQ-08 | Hold-to-move without key spamming | B-2, B-3 | AUDIT-F-12 | `tests/e2e/audit/audit.e2e.test.js` + input adapter tests | Mapped, Planned, Pending |
| REQ-09 | Pause/continue/restart at any time and paused frames unaffected | A-4, C-5, D-5, A-7 | AUDIT-F-08, AUDIT-F-09, AUDIT-F-10, AUDIT-F-17 | `tests/e2e/audit/audit.e2e.test.js` + pause performance traces | Mapped, Planned, Pending |
| REQ-10 | Layers minimal but non-zero | D-1, D-5, A-7 | AUDIT-F-20, AUDIT-F-21 | DevTools evidence artifacts linked in matrix updates | Mapped, Planned, Pending |
| REQ-11 | No canvas | A-1, D-2 | AUDIT-F-04 | Static scan + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-12 | No frameworks (vanilla JS/DOM only) | A-1 | AUDIT-F-05 | CI dependency gate + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-13 | Single-player only | B-2, C-5 | AUDIT-F-03 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| REQ-14 | Genre aligns with pre-approved list | B-3, B-4, C-2, C-4, C-5 | AUDIT-F-06, AUDIT-F-13 | `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |

## Audit Coverage Matrix (Canonical)

### Functional Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation-plan.md` Section 3) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-F-01 | Does the game run without crashing? | REQ-01, REQ-14 | Fully automatable | A-4, C-5 | `tests/e2e/audit/audit-question-map.js` + `tests/e2e/audit/audit.e2e.test.js` | Mapped, Planned, Pending |
| AUDIT-F-02 | Does animation run using `requestAnimationFrame`? | REQ-02 | Fully automatable | A-4 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-03 | Is the game single player? | REQ-13 | Fully automatable | B-2, C-5 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-04 | Does the game avoid the use of canvas? | REQ-11 | Fully automatable | A-1, D-2 | Same as above + static scan gate | Mapped, Planned, Pending |
| AUDIT-F-05 | Does the game avoid the use of frameworks? | REQ-12 | Fully automatable | A-1 | Same as above + dependency gate | Mapped, Planned, Pending |
| AUDIT-F-06 | Is the game chosen from the pre-approved list? | REQ-14 | Fully automatable | B-4, C-2, C-4 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-07 | Does pause menu show continue and restart? | REQ-03, REQ-09 | Fully automatable | C-5, D-2 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-08 | Does continue resume gameplay from pause? | REQ-03, REQ-09 | Fully automatable | C-5, A-4 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-09 | Does restart reset correctly from pause? | REQ-03, REQ-09 | Fully automatable | C-5, A-5 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-10 | While paused, no dropped frames and rAF unaffected? | REQ-02, REQ-09 | Fully automatable | A-4, D-5, A-7 | Same as above + pause trace evidence | Mapped, Planned, Pending |
| AUDIT-F-11 | Does player obey movement commands? | REQ-07 | Fully automatable | B-2, B-3 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-12 | Does player move without spamming keys? | REQ-07, REQ-08 | Fully automatable | B-2 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-13 | Does game behave like pre-approved genre? | REQ-14 | Fully automatable | B-4, C-2, C-4, C-5 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-14 | Does timer/countdown work? | REQ-04 | Fully automatable | C-4, D-2 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-15 | Does score increase on scoring actions? | REQ-05 | Fully automatable | C-4, B-6, D-2 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-16 | Do lives decrease on life-loss events? | REQ-06 | Fully automatable | C-4, B-5, D-2 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-17 | Can you confirm there are no frame drops? | REQ-01, REQ-09 | Semi-automatable | A-7, D-5 | `tests/e2e/audit/audit.e2e.test.js` + Performance API (`page.evaluate`) | Mapped, Planned, Pending |
| AUDIT-F-18 | Does game run around 60 FPS? | REQ-01 | Semi-automatable | A-4, A-7 | Same as above | Mapped, Planned, Pending |
| AUDIT-F-19 | Is paint used as little as possible? | REQ-10 | Manual-with-evidence | D-5, A-7 | DevTools paint evidence linked from PR artifacts | Mapped, Planned, Pending |
| AUDIT-F-20 | Are layers used as little as possible? | REQ-10 | Manual-with-evidence | D-1, D-5, A-7 | DevTools layer evidence linked from PR artifacts | Mapped, Planned, Pending |
| AUDIT-F-21 | Is layer creation promoted properly? | REQ-10 | Manual-with-evidence | D-1, D-5, A-7 | DevTools layer-promotion evidence linked from PR artifacts | Mapped, Planned, Pending |

### Bonus Questions

| ID | Audit Question | Requirement IDs | Execution Type | Owning Tickets (`docs/implementation-plan.md` Section 3) | Test/Evidence Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-B-01 | Does project run quickly and effectively? | REQ-01 | Fully automatable | A-2, A-4, D-5, A-7 | `tests/e2e/audit/audit.e2e.test.js` + performance checks | Mapped, Planned, Pending |
| AUDIT-B-02 | Does code obey good practices? | REQ-12 | Manual-with-evidence | A-1, A-2, D-2 | Lint/CI artifacts + review checklist evidence | Mapped, Planned, Pending |
| AUDIT-B-03 | Does program reuse memory to avoid jank? | REQ-01 | Fully automatable | A-2, B-4, D-2, D-4 | `tests/e2e/audit/audit.e2e.test.js` + allocation evidence | Mapped, Planned, Pending |
| AUDIT-B-04 | Does game use SVG? | REQ-14 | Manual-with-evidence | D-6, A-6 | Manifest validation + runtime asset evidence | Mapped, Planned, Pending |
| AUDIT-B-05 | Is code using asynchronicity for performance? | REQ-01 | Manual-with-evidence | A-5, C-6 | Async loading/decode evidence + traces | Mapped, Planned, Pending |
| AUDIT-B-06 | Is project well done overall? | REQ-01 through REQ-14 | Manual-with-evidence | All tracks, A-7 | All audit assertions + evidence bundle + review sign-off | Mapped, Planned, Pending |

## Completion Criteria For This Matrix

1. Every requirement row must map to ticket owners, audit IDs, and a verification anchor.
2. Every audit row must map to ticket owners and a concrete execution type.
3. Every `Pending` audit row must become `Executable` only after passing artifacts exist.
4. CI must fail if any audit ID is missing from `tests/e2e/audit/audit-question-map.js`.
5. CI must fail if `runAuditAssertion(question)` remains placeholder logic.

## Maintenance Rules

1. If `docs/audit.md` changes, update this matrix and `tests/e2e/audit/audit-question-map.js` in the same PR.
2. If Section 3 tickets in `docs/implementation-plan.md` change, update this matrix in the same PR.
3. Keep coverage tables out of `docs/implementation-plan.md`; that file should reference this matrix.
4. If ticket ownership or execution status changes, update `docs/ticket-tracker.md` in the same PR.
5. Do not mark any row `Executable` without a passing test run artifact or linked evidence artifact.
