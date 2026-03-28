# PR Message Workflow

This file records the reusable PR message workflow for ticket-sized changes. Keep it aligned with [`../.github/pull_request_template.md`](../../.github/pull_request_template.md) and [`agentic-workflow-guide.md`](agentic-workflow-guide.md).

## 1. Branch Sequencing

Follow the agreed ticket order and keep branches short-lived and single-purpose.

- Start with `TA-1`, then continue in order (`TA-2`, `TA-3`, and so on) before moving to another track.
- Use one branch per ticket slice.
- Use the same branch only for the one logical change it was created for.
- Example branch sequence: `ekaramet/TA-1`, `ekaramet/TA-2`, `ekaramet/TA-3`.

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

## 3. PR Message Template

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

## 4. Recording Rule

After a ticket is merged, append the final PR message summary here with the ticket ID, branch name, PR link, and verification notes. Keep the record concise and update it in the same sequence as the ticket order.
