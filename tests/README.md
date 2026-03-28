# Test Suite Layout

This folder organizes all automated tests for the ECS project.

## Source Of Truth

- Requirement intent and gameplay rules: `docs/requirements.md` and `docs/game-description.md`
- Acceptance/pass criteria: `docs/audit.md`
- Requirement/audit to ticket/test traceability and coverage status: `docs/audit-traceability-matrix.md` (canonical coverage source)
- Live ticket owner/progress state and linked implementation evidence: `docs/implementation/ticket-tracker.md`

When in doubt, test behavior must be validated against those files.

## Structure

```text
tests/
├── e2e/
│   └── audit/
│       ├── audit-question-map.js
│       └── audit.e2e.test.js
├── integration/
└── unit/
```

## Completion Rule

The project is complete only when:

1. Every question in `docs/audit.md` has explicit automated test coverage.
2. All mapped audit tests pass.
3. Functional behavior remains aligned with `docs/requirements.md` and `docs/game-description.md`.
4. Coverage statuses in `docs/audit-traceability-matrix.md` are updated to match the latest passing artifacts.
5. Ticket statuses and evidence links in `docs/implementation/ticket-tracker.md` are updated for any touched implementation tickets.
