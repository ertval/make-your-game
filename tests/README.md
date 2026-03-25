# Test Suite Layout

This folder organizes all automated tests for the ECS project.

## Source Of Truth

- Requirement intent and gameplay rules: `docs/requirements.md` and `docs/game-description.md`
- Acceptance/pass criteria: `docs/audit.md`
- Audit question traceability and implementation status: `docs/audit-traceability-matrix.md`

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
