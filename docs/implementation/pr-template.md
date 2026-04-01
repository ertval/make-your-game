# PR Template Contract

This document makes the PR template part of the docs set.

Canonical template source:

- `.github/pull_request_template.md`

Use this rule to avoid drift:

1. Update `.github/pull_request_template.md` first.
2. Update this document in the same change if checklist labels, command guidance, or required PR sections changed.

## Operational Summary

- Default local gate command: `npm run policy`
- Optional strict PR-body validation from file: `npm run policy -- --pr-body-file docs/pr-messages/<ticket>-pr.md`
- Repo-wide gate: `npm run policy:repo`

Required PR sections and checklist labels are enforced by the policy gate scripts in `scripts/policy-gate/` when PR body text is provided.

Branch-level enforcement that does not depend on PR body files:

- Ticket ID inferred from branch name and branch commit messages
- Ticket must exist in `docs/implementation/ticket-tracker.md`
- Branch must map to a single track (`A`, `B`, `C`, or `D`)
- Changed files must stay inside the inferred track ownership paths
