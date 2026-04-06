# Test Suite Layout

This folder organizes all automated tests for the ECS project.

## Source Of Truth

- Requirement intent and gameplay rules: `docs/requirements.md` and `docs/game-description.md`
- Acceptance/pass criteria: `docs/audit.md`
- Requirement/audit to ticket/test traceability and coverage status: `../docs/implementation/audit-traceability-matrix.md` (canonical coverage source)
- Live ticket owner/progress state and dependency/block mapping: `../docs/implementation/ticket-tracker.md`

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

1. Every question in `docs/audit.md` has explicit verification coverage following `AGENTS.md` categories (Fully Automatable, Semi-Automatable, or Manual-With-Evidence).
2. All mapped automated audit checks pass.
3. Required manual evidence artifacts are attached and linked for Manual-With-Evidence audit IDs only.
4. Functional behavior remains aligned with `docs/requirements.md` and `docs/game-description.md`.
5. Coverage statuses in `../docs/implementation/audit-traceability-matrix.md` are updated to match the latest passing artifacts.
6. Ticket statuses and Depends on/Blocks mappings in `../docs/implementation/ticket-tracker.md` are updated for any touched implementation tickets.
