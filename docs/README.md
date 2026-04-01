# Documentation Guide — Ms. Ghostman

> **Purpose**: Reading-order guide and map of all project documents. Start here, then follow the numbered order below.

---

## Reading Order

| # | Document | Purpose | When to Read |
|---|---|---|---|
| 1 | [`../AGENTS.md`](../AGENTS.md) | **Coding rules** — mandatory ECS constraints, rendering rules, input rules, security, accessibility, done criteria | First — establishes implementation constraints and quality gates |
| 2 | [`requirements.md`](requirements.md) | **What** we are building — project objectives, FPS constraints, keyboard rules, approved game genres | Before any feature implementation |
| 3 | [`game-description.md`](game-description.md) | **How** it plays — full gameplay rules, map layout, ghosts, bombs, scoring, timers, screens | Before gameplay/system logic work |
| 4 | [`audit.md`](audit.md) | **Pass/fail criteria** — every question that must pass for project acceptance | Before testing and PR review |
| 5 | [`implementation/implementation-plan.md`](implementation/implementation-plan.md) | **How** we build it — ECS architecture, directory structure, 4-track workplan, testing strategy, performance budget | Before starting any implementation task |
| 6 | [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) | **Execution board** — live line-by-line ticket status, dependencies, blockers, and branch ownership for Section 3 implementation tickets | Update continuously during implementation |
| 7 | [`implementation/agentic-workflow-guide.md`](implementation/agentic-workflow-guide.md) | **Team workflow** — how to use agents, PR process, PR message and gate workflow, review checklist, branch rules | Before starting collaborative work |
| 8 | [`implementation/pr-template.md`](implementation/pr-template.md) | **PR contract** — documentation entrypoint for required checklist labels, layer-boundary confirmations, command flow, and canonical template source | Before opening any pull request |
| 9 | [`implementation/audit-traceability-matrix.md`](implementation/audit-traceability-matrix.md) | **Coverage source of truth** — maps requirements and audit questions to implementation tickets, e2e/manual anchors, and execution status | During planning, test implementation, and PR review |
| 10 | [`implementation/assets-pipeline.md`](implementation/assets-pipeline.md) | **Asset authoring** — visual and audio creation standards, naming rules, CI validation | When creating or modifying assets |
| 11 | [`deployment/github-pages.md`](deployment/github-pages.md) | **Deployment guide** — GitHub Pages publishing options and static-hosting constraints | When publishing a static site or documentation site |

---

## Onboarding Guide: From Ticket to PR

Welcome to the Ms. Ghostman project! If you are picking up a ticket for the first time, follow this step-by-step workflow to go from an assigned task to a merged Pull Request.

### 1. Claim a Ticket
- **Find your Track**: The workload is divided into 4 tracks (A, B, C, D) defined in [`implementation/implementation-plan.md`](implementation/implementation-plan.md#section-3-workflow-tracks-balanced-workload) and detailed in [`implementation/track-a.md`](implementation/track-a.md), [`implementation/track-b.md`](implementation/track-b.md), [`implementation/track-c.md`](implementation/track-c.md), and [`implementation/track-d.md`](implementation/track-d.md).
- **Set Status and Notes**: Open [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md), find an unstarted ticket in your track, and update its status symbol to `[-]` (In Progress). Keep dependency and blocker text current on the same line.
- **Understand the Scope**: Read the ticket description carefully. Identify the bounded scope and exactly what needs to change.
- **Follow the Phase-First Order**: Execute tickets by global phase (`P0 → P1 → P2 → P3`) using [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md). Claim only tickets whose dependencies are complete. In most cases, first-ticket starting points are `A-01`, `B-01`, `C-01`, and `D-01`.

### 2. Read the Critical Constraints
Before writing any code, you **MUST** consult the canonical specs:
- **How to build it**: Read [`../AGENTS.md`](../AGENTS.md) for strict ECS rules, DOM isolation bounds, and performance requirements.
- **What to build**: Read [`requirements.md`](requirements.md) and [`game-description.md`](game-description.md) to understand the gameplay rules for your feature.
- **How it's tested**: Read [`audit.md`](audit.md) to see the exact acceptance criteria your feature must pass.

### 3. Implement the Change (The Agentic Workflow)
As detailed in the [`implementation/agentic-workflow-guide.md`](implementation/agentic-workflow-guide.md):
- **Branch Strategy**: Create a short-lived branch for your single ticket. Do not mix multiple features.
- **Code with Agents**: Provide your coding agent with a bounded prompt (e.g., "Implement hold-to-move input for player, isolated from DOM"). Treat agent output as untrusted until reviewed and verified.
- **Respect ECS**: Ensure your logic lives in pure Systems and components maintain data-only state. Do not read/write the DOM outside of the adapter layer.
- **Testing**: Write or update tests (Unit, Integration, or E2E via Playwright) to prove your implementation is deterministic and correct.
- **Agent Prompt Shape**: Give each agent the full ticket context and keep the prompt structured: Objective, Scope, Out of scope, Constraints, Acceptance, and Stop condition.
- **Verification Required**: Ask the agent to test and verify its own work, then verify the result yourself before opening a PR.
- **Implementation Plan First**: Use [`implementation/implementation-plan.md`](implementation/implementation-plan.md) as the execution map and keep changes aligned with the active track's ticket definition and verification gates.
- **Audit and Regression Check**: Audit the agent result carefully against [`../AGENTS.md`](../AGENTS.md), [`implementation/implementation-plan.md`](implementation/implementation-plan.md), [`implementation/agentic-workflow-guide.md`](implementation/agentic-workflow-guide.md), and [`audit.md`](audit.md) before you continue.

Gate hierarchy reference:

- `npm run policy` for the default all-in-one gate. Optionally add `-- --pr-body-file docs/pr-messages/<ticket>-pr.md` when validating a saved PR body.
- `npm run policy:repo` for the repo-wide gate.
- `npm run policy:quality`, `npm run policy:checks`, `npm run policy:forbid`, `npm run policy:header`, `npm run policy:forbidrepo`, `npm run policy:headerrepo`, `npm run policy:trace`, and `npm run policy:approve` when you need a narrower rerun.

### 4. Open the Pull Request
- **Use the Template**: Read [`implementation/pr-template.md`](implementation/pr-template.md), then open the PR with [`.github/pull_request_template.md`](../.github/pull_request_template.md). This template is the enforced PR contract for required checklist labels, layer boundaries, and section format. Fill out the entire checklist and follow the PR message structure in [PR Message and Gate Workflow](implementation/agentic-workflow-guide.md#12-pr-message-and-gate-workflow).
- **Attach Evidence**: If your PR touches gameplay-critical paths (e.g., performance, rendering, or pausing), attach the required performance evidence (frame stats, traces) as defined in [`../AGENTS.md`](../AGENTS.md).
- **Reference Audits**: Explicitly list which `AUDIT-*` IDs from [`implementation/audit-traceability-matrix.md`](implementation/audit-traceability-matrix.md) this PR satisfies and how each affected question was verified.
- **Review and Merge**: Ensure another dev verifies that the ECS boundaries are intact and security rules are met. Review the diff as a human before merging, and do not merge until the applicable local checks and audit coverage pass.

### 5. Review and Merge
- **Pre-PR Gates**: Run `npm run policy` first, then run `npm run policy:repo` or narrower reruns only when needed. Optionally pass a PR body file to `policy` or `policy:checks` when you want strict section/checklist validation from a saved file. Ensure scope-appropriate tests (`test:unit`, `test:integration`, `test:e2e`, `test:audit`) are covered.
- **Review**: Ensure another dev verifies that the ECS boundaries are intact and security rules are met.
- **Update Tracker**: Once merged, go back to [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) and update your task status symbol to `[x]` (Done).
- **Archive the PR Message (Optional)**: Save the final PR message and verification summary under [`pr-messages/`](pr-messages/) if you want a durable local copy.

## Gitea Actions Setup and Verification

This repository uses [`../.gitea/workflows/policy-gate.yml`](../.gitea/workflows/policy-gate.yml) as the main PR gate for Gitea.

### Set Up

1. Enable Actions for the Gitea instance and repository, and make sure a runner is registered for Linux jobs.
2. Keep the workflow file on the default branch so PR events can trigger it.
3. Open PRs with the required sections from [`../.github/pull_request_template.md`](../.github/pull_request_template.md) in the body. If your Gitea instance does not auto-apply that template, paste it manually.
4. Add a repo secret named `GITEA_TOKEN` if you want the approval API check to run. If the secret is missing, the workflow will skip that step and you should enforce approvals with branch protection instead.
5. The npm quality gate runs when `package.json` is present and currently enforces `npm run policy:quality` (`check`, `test`, plus coverage/SBOM when configured).

### Test It

1. Push a small branch change, open a PR in Gitea, and confirm the workflow starts on the PR event.
2. Verify a valid PR passes the checklist, traceability, and boundary scans.
3. Remove one required checklist item or introduce an audit traceability mismatch, then confirm the workflow fails at the expected step.
4. Verify the PR gate and repo gate run as expected (`npm run policy` and `npm run policy:repo`) by checking workflow logs.

---

## Document Authority Hierarchy

When documents conflict, the following order of authority applies:

```
AGENTS.md                         ← normative for all implementation constraints
  └── requirements.md             ← normative for project objectives
  └── game-description.md         ← normative for gameplay rules and feature intent
  └── audit.md                    ← normative for pass/fail acceptance
        └── implementation/implementation-plan.md  ← execution guide (canonical for track/task ownership)
              └── implementation/ticket-tracker.md  ← live line-by-line ticket execution status and branch ownership board
              └── implementation/audit-traceability-matrix.md  ← canonical requirement/audit/ticket/test coverage mapping
              └── implementation/agentic-workflow-guide.md  ← process guide (references plan for ownership)
              └── implementation/assets-pipeline.md  ← visual/audio asset authoring and validation workflow
```

---

## Quick-Reference: Key Rules by Domain

| Domain | Canonical Source |
|---|---|
| ECS architecture and boundaries | [`AGENTS.md` — ECS Architecture Rules](../AGENTS.md#ecs-architecture-rules) |
| Game loop and pause semantics | [`AGENTS.md` — Loop, Timing, and Pause](../AGENTS.md#loop-timing-and-pause) |
| Input hold-to-move contract | [`AGENTS.md` — Input Rules](../AGENTS.md#input-rules) |
| Rendering batch and pool rules | [`AGENTS.md` — Rendering and DOM Rules](../AGENTS.md#rendering-and-dom-rules) |
| Performance budget | [`AGENTS.md` — Performance Acceptance Criteria](../AGENTS.md#performance-acceptance-criteria-auditable) |
| Ghost AI rules and bomb interactions | [`game-description.md` §4](game-description.md#4-the-bomb--explosion) + [`game-description.md` §5](game-description.md#5-the-enemies--ghosts) |
| Scoring values | [`game-description.md` §6](game-description.md#6-scoring-system) |
| Live ticket progress | [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) |
| Audit test split (Playwright / manual) | [`AGENTS.md` — Test Categorization](../AGENTS.md#test-categorization-for-audit-questions) |
| Track ownership for tasks | [`implementation/implementation-plan.md` §3](implementation/implementation-plan.md#section-3-workflow-tracks-balanced-workload) |
| Asset naming and format rules | [`implementation/assets-pipeline.md`](implementation/assets-pipeline.md) |
