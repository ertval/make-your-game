# Audit Traceability Matrix

This document maps every question in `docs/audit.md` to requirement intent, gameplay specification, implementation plan sections, and automated test anchors.

## Purpose

1. Prevent requirement drift between docs, planning, and tests.
2. Distinguish mapped coverage from executable assertion coverage.
3. Provide a single checklist for finishing audit compliance.

## Status Legend

- `Mapped`: Question is represented in `tests/e2e/audit/audit-question-map.js`.
- `Executable`: A real e2e assertion is implemented and passing.
- `Pending`: Placeholder assertion exists but currently throws.

## Current Automation Reality

- `tests/e2e/audit/audit-question-map.js` includes all 27 audit questions as explicit IDs.
- `tests/e2e/audit/audit.e2e.test.js` generates one test per question ID.
- The assertion hook `runAuditAssertion(question)` is currently a placeholder that throws, so executable coverage is pending for all question IDs.

## Functional Questions

| ID | Audit Question | Requirements Anchor | Game Description Anchor | Implementation Plan Anchor | Test Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-F-01 | Does the game run without crashing? | Objectives; Instructions | Sections 1, 13 | Sections 4, 8 | `audit-question-map.js` + generated case in `audit.e2e.test.js` | Mapped, Pending |
| AUDIT-F-02 | Does animation run using RequestAnimationFrame? | Objectives; Instructions | Header Target Performance; Sections 3.1, 10, 12 | Sections 1.2 Frame Pipeline; Deterministic Runtime Contract | Same as above | Mapped, Pending |
| AUDIT-F-03 | Is the game single player? | Intro paragraph | Header Players | Section 8 Done Criteria (single player) | Same as above | Mapped, Pending |
| AUDIT-F-04 | Does the game avoid the use of canvas? | Objectives | Header Renderer; Section 12 constraints | Sections 1 Source Of Truth; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-05 | Does the game avoid the use of frameworks? | Objectives | Header Renderer; Section 12 constraints | Sections 1 Source Of Truth; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-06 | Is the game chosen from the pre-approved list? | Pre-Approved List | Header Genre Alignment; Sections 1, 13 | Section 8 Done Criteria (genre-aligned gameplay) | Same as above | Mapped, Pending |
| AUDIT-F-07 | Does pause menu show continue and restart? | Objectives; Instructions | Section 10 Pause Menu | Sections 3 Track C (Pause); 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-08 | Does continue resume gameplay from pause? | Instructions | Section 10 Continue behavior | Sections 1 Pause Semantics; 3 Track C Pause system | Same as above | Mapped, Pending |
| AUDIT-F-09 | Does restart reset correctly from pause? | Instructions | Section 10 Restart behavior | Sections 3 Track C Pause and Progression | Same as above | Mapped, Pending |
| AUDIT-F-10 | While paused, no dropped frames and rAF unaffected? | Objectives; Instructions | Sections 10, 12 | Sections 1 Pause Semantics; 7 Performance Budget | Same as above | Mapped, Pending |
| AUDIT-F-11 | Does player obey movement commands? | Instructions | Section 3.1 Movement | Sections 3 Track B Input and Movement | Same as above | Mapped, Pending |
| AUDIT-F-12 | Does player move without spamming keys? | Instructions | Section 3.1 Hold-to-move | Sections 1 Input Determinism; 3 Track B Input Adapter | Same as above | Mapped, Pending |
| AUDIT-F-13 | Does game behave like pre-approved genre? | Pre-Approved List | Sections 1, 4, 5, 13 | Sections 1 Source Of Truth; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-14 | Does timer/countdown work? | Objectives scoreboard metrics | Section 7 Timer/Countdown | Sections 3 Track C Timer system; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-15 | Does score increase on scoring actions? | Objectives scoreboard metrics | Section 6 Scoring System | Sections 3 Track C Scoring system; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-16 | Do lives decrease on life-loss events? | Objectives scoreboard metrics | Section 3.3 Lives | Sections 3 Track C Life system; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-F-17 | Can you confirm there are no frame drops? | Objectives | Sections 10, 12 | Sections 7 Performance Budget; Required Evidence | Same as above | Mapped, Pending |
| AUDIT-F-18 | Does game run around 60 FPS? | Objectives; Instructions | Header Target Performance; Section 12 | Sections 7 Performance Budget | Same as above | Mapped, Pending |
| AUDIT-F-19 | Is paint used as little as possible? | Objectives layers guidance | Sections 2, 12 | Sections 3 Track D Render DOM batcher; 7 Layout Thrashing budget | Same as above | Mapped, Pending |
| AUDIT-F-20 | Are layers used as little as possible? | Objectives layers guidance | Section 12 constraints | Sections 3 Track D CSS and Render DOM; 7 Budget | Same as above | Mapped, Pending |
| AUDIT-F-21 | Is layer creation promoted properly? | Objectives layers guidance | Section 12 constraints | Sections 3 Track D CSS and batching; 7 Required Evidence | Same as above | Mapped, Pending |

## Bonus Questions

| ID | Audit Question | Requirements Anchor | Game Description Anchor | Implementation Plan Anchor | Test Anchor | Status |
|---|---|---|---|---|---|---|
| AUDIT-B-01 | Does project run quickly and effectively? | Objectives performance requirements | Sections 12, 13 | Sections 7 Performance Budget and Required Evidence | `audit-question-map.js` + generated case in `audit.e2e.test.js` | Mapped, Pending |
| AUDIT-B-02 | Does code obey good practices? | Dev Tools and best-practice references | Section 12 constraints | Sections 1 boundaries; 8 Done Criteria | Same as above | Mapped, Pending |
| AUDIT-B-03 | Does program reuse memory to avoid jank? | Objectives no frame drops | Section 12 memory reuse | Sections 1 Key Principles; 7 GC/Jank budget | Same as above | Mapped, Pending |
| AUDIT-B-04 | Does game use SVG? | Objectives permit SVG stack | Section 12 constraints | Section 2 Directory/asset planning + DOM adapter strategy | Same as above | Mapped, Pending |
| AUDIT-B-05 | Is code using asynchronicity for performance? | Objectives and Dev Tools context | Section 12 constraints (performance and architecture) | Sections 3 Track C worker offload criteria; 7 Budget | Same as above | Mapped, Pending |
| AUDIT-B-06 | Is project well done overall? | Entire requirements baseline | Entire game description | Sections 8 Done Criteria + all milestone gates | Same as above | Mapped, Pending |

## Completion Criteria For This Matrix

1. Every row must move from `Mapped, Pending` to `Mapped, Executable`.
2. Each executable row must be backed by non-placeholder e2e logic in `tests/e2e/audit/audit.e2e.test.js` (or delegated helpers invoked by it).
3. CI must fail if any audit ID lacks an executable assertion.

## Maintenance Rules

1. If `docs/audit.md` changes, update this matrix and `tests/e2e/audit/audit-question-map.js` in the same PR.
2. If gameplay rules change in `docs/requirements.md` or `docs/game-description.md`, revalidate affected rows.
3. Do not mark any row executable without a passing test run artifact.
