# Track C — Audit Fixes: Dependency Sync & Storage Validation

Summary

This issue captures Track C–owned medium-priority fixes from the Phase-0 audit: canonical dependency synchronization and implementing storage trust-boundary validation.

Reference: [docs/audit-reports/phase-0/audit-report-p0-track-c-deduplicated-2026-04-14.md](docs/audit-reports/phase-0/audit-report-p0-track-c-deduplicated-2026-04-14.md)

Affected items (from audit)

- **ARCH-X07**: Canonical dependency sources disagree on `C-06` readiness.
- **SEC-X05**: Storage trust-boundary validation requirement not yet implemented.

Goals

- Reconcile and update canonical docs so `track-c.md` and the ticket tracker agree on prerequisites.
- Enforce schema validation on reads from `localStorage`/`sessionStorage` for any future storage adapter or HUD persistence code.

Tasks

- [ ] Normalize dependency statements in documentation.
  - Files to update: [docs/implementation/track-c.md](docs/implementation/track-c.md), [docs/implementation/ticket-tracker.md](docs/implementation/ticket-tracker.md)
  - Action: decide whether `A-11` is a hard prerequisite for `C-06` and document the decision.
- [ ] Implement storage read boundary validation (JSON Schema 2020-12) for storage-backed adapters.
  - Add a storage utility that validates on read and gracefully falls back to a safe default.
- [ ] Add unit tests for storage adapter validation and error-handling.
- [ ] Document the trust-boundary and validation contract in Track C docs.

Acceptance criteria

- Canonical docs are synchronized and reference a single truth for `C-06` dependency status.
- Storage reads perform schema validation; malformed data triggers warnings and safe fallback behavior.
- Unit tests cover both happy and malformed storage cases.
- Biome checks pass for changed files.

Labels

- `area/adapter`, `track/C`, `severity/medium`

Suggested assignee

- `@track-c-team` (replace with person/team handle)

Estimated effort

- 0.5–1.5 days depending on schema definition size

Notes

- Use existing JSON Schema tooling in the repo or add a minimal validator; follow the repository policy that JSON maps are validated against JSON Schema 2020-12 in CI.
