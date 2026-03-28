# Documentation Guide — Ms. Ghostman

> **Purpose**: Reading-order guide and map of all project documents. Start here, then follow the numbered order below.

---

## Reading Order

| # | Document | Purpose | When to Read |
|---|---|---|---|
| 1 | [`requirements.md`](requirements.md) | **What** we are building — project objectives, FPS constraints, keyboard rules, approved game genres | First — establishes the hard constraints |
| 2 | [`game-description.md`](game-description.md) | **How** it plays — full gameplay rules, map layout, ghosts, bombs, scoring, timers, screens | Before any game logic work |
| 3 | [`implementation/implementation-plan.md`](implementation/implementation-plan.md) | **How** we build it — ECS architecture, directory structure, 4-track workplan, testing strategy, performance budget | Before starting any implementation task |
| 4 | [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) | **Execution board** — live ticket-by-ticket status, owner, PR links, and evidence links for Section 3 implementation tickets | Update continuously during implementation |
| 5 | [`../AGENTS.md`](../AGENTS.md) | **Coding rules** — mandatory ECS constraints, rendering rules, input rules, security, accessibility, done criteria | Reference during every coding session |
| 6 | [`audit.md`](audit.md) | **Pass/fail criteria** — every question that must pass for project acceptance | Reference during testing and review |
| 7 | [`agentic-workflow-guide.md`](agentic-workflow-guide.md) | **Team workflow** — how to use agents, PR process, review checklist, branch rules | Before starting collaborative work |
| 8 | [`audit-traceability-matrix.md`](audit-traceability-matrix.md) | **Coverage source of truth** — maps requirements and audit questions to implementation tickets, e2e/manual anchors, and execution status | During planning, test implementation, and PR review |
| 9 | [`assets-pipeline.md`](assets-pipeline.md) | **Asset authoring** — visual and audio creation standards, naming rules, CI validation | When creating or modifying assets |

---

## Onboarding Guide: From Ticket to PR

Welcome to the Ms. Ghostman project! If you are picking up a ticket for the first time, follow this step-by-step workflow to go from an assigned task to a merged Pull Request.

### 1. Claim a Ticket
- **Find your Track**: The workload is divided into 4 tracks (A, B, C, D) defined in [`implementation/implementation-plan.md`](implementation/implementation-plan.md#3-workflow-tracks-balanced-workload) and detailed in [`implementation/track-a.md`](implementation/track-a.md), [`implementation/track-b.md`](implementation/track-b.md), [`implementation/track-c.md`](implementation/track-c.md), and [`implementation/track-d.md`](implementation/track-d.md).
- **Assign Yourself**: Open [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md), find an unassigned ticket in your track, and update its status to **In Progress** with your name.
- **Understand the Scope**: Read the ticket description carefully. Identify the bounded scope and exactly what needs to change.

### 2. Read the Critical Constraints
Before writing any code, you **MUST** consult the canonical specs:
- **How to build it**: Read [`../AGENTS.md`](../AGENTS.md) for strict ECS rules, DOM isolation bounds, and performance requirements.
- **What to build**: Read [`requirements.md`](requirements.md) and [`game-description.md`](game-description.md) to understand the gameplay rules for your feature.
- **How it's tested**: Read [`audit.md`](audit.md) to see the exact acceptance criteria your feature must pass.

### 3. Implement the Change (The Agentic Workflow)
As detailed in the [`agentic-workflow-guide.md`](agentic-workflow-guide.md):
- **Branch Strategy**: Create a short-lived branch for your single ticket. Do not mix multiple features.
- **Code with Agents**: Provide your coding agent with a bounded prompt (e.g., "Implement hold-to-move input for player, isolated from DOM"). Treat agent output as untrusted until reviewed and verified.
- **Respect ECS**: Ensure your logic lives in pure Systems and components maintain data-only state. Do not read/write the DOM outside of the adapter layer.
- **Testing**: Write or update tests (Unit, Integration, or E2E via Playwright) to prove your implementation is deterministic and correct.

### 4. Open the Pull Request
- **Use the Template**: When opening a PR, the [`../.github/pull_request_template.md`](../.github/pull_request_template.md) will automatically apply. Fill out the entire checklist.
- **Attach Evidence**: If your PR touches gameplay-critical paths (e.g., performance, rendering, or pausing), attach the required performance evidence (frame stats, traces) as defined in `AGENTS.md`.
- **Reference Audits**: Explicitly list which IDs from `audit.md` this PR satisfies.

### 5. Review and Merge
- **Pre-PR Gates**: Ensure Biome linting, unit tests, and Playwright tests all pass locally.
- **Review**: Ensure another dev verifies that the ECS boundaries are intact and security rules are met.
- **Update Tracker**: Once merged, go back to [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) and update your task status to **Done** with a link to the merged PR.

---

## Document Authority Hierarchy

When documents conflict, the following order of authority applies:

```
AGENTS.md                         ← normative for all implementation constraints
  └── requirements.md             ← normative for project objectives
  └── game-description.md         ← normative for gameplay rules and feature intent
  └── audit.md                    ← normative for pass/fail acceptance
        └── implementation/implementation-plan.md  ← execution guide (canonical for track/task ownership)
              └── implementation/ticket-tracker.md  ← live ticket execution status and ownership board
              └── audit-traceability-matrix.md  ← canonical requirement/audit/ticket/test coverage mapping
              └── agentic-workflow-guide.md  ← process guide (references plan for ownership)
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
| Ghost AI rules and bomb interactions | [`game-description.md` §4–§5](game-description.md#4-the-bomb--explosion) |
| Scoring values | [`game-description.md` §6](game-description.md#6-scoring-system) |
| Live ticket progress | [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) |
| Audit test split (Playwright / manual) | [`AGENTS.md` — Test Categorization](../AGENTS.md#test-categorization-for-audit-questions) |
| Track ownership for tasks | [`implementation/implementation-plan.md` §3](implementation/implementation-plan.md#3-workflow-tracks-balanced-workload) |
| Asset naming and format rules | [`assets-pipeline.md`](assets-pipeline.md) |
