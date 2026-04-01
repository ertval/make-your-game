# PR Message Workflow

This file records the reusable PR message workflow for ticket-sized changes. Keep it aligned with [`../.github/pull_request_template.md`](../../.github/pull_request_template.md) and [`agentic-workflow-guide.md`](agentic-workflow-guide.md).

## 1. Branch Sequencing

Follow the agreed ticket order and keep branches short-lived and single-purpose.

- Follow the phase-first execution order (`P0 → P1 → P2 → P3`) from `ticket-tracker.md` and claim only tickets whose dependencies are complete.
- Typical first-ticket starts are `A-01`, `B-01`, `C-01`, and `D-01`.
- Use one branch per ticket slice.
- Use the same branch only for the one logical change it was created for.
- Example branch sequence (Track A): `ekaramet/A-01`, `ekaramet/A-02`, `ekaramet/A-03`.

## 2. PR Message Checklist

Before opening a PR, confirm the message covers the same items as the PR template.

- [ ] What changed
- [ ] Why
- [ ] Tests
- [ ] Audit questions affected
- [ ] Security notes
- [ ] Architecture / dependency notes
- [ ] Risks
- [ ] Required local checks completed
- [ ] Required audit and review steps completed

## 3. Manual Policy Gate (Required)

The PR policy gate is now script-driven. Run the same checks locally before opening a PR.

1. Save the final PR message to a local file (example: `docs/pr-messages/<ticket>-pr.md`).
2. Run the full pre-PR gate with that message body:

```bash
npm run pr:gate -- --pr-body-file docs/pr-messages/<ticket>-pr.md
```

3. If you only need policy checks (without rerunning all project checks), run:

```bash
npm run policy:checks -- --pr-body-file docs/pr-messages/<ticket>-pr.md
```

4. If you changed HTML/JS tech stack boundaries, run explicit static scan:

```bash
npm run check:forbidden
```

## 4. PR Message Template

Use this structure for each PR description.

```md
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

## Verification summary
- 

## Branch
- 

## Ticket
- 
```

## 5. Recording Rule

After a ticket is merged, append the final PR message summary here with the ticket ID, branch name, PR link, and verification notes. Keep the record concise and preserve the same phase-first ordering used in `ticket-tracker.md`.
