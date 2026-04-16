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
| 6 | [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) | **Execution board** — live line-by-line ticket status with Depends on and Blocks mapping for Section 3 implementation tickets | Update continuously during implementation |
| 7 | [`implementation/ticket-tracker.md#-ticket-id-index-merged`](implementation/ticket-tracker.md#-ticket-id-index-merged) | **Ticket ID index** — merged canonical ticket list consumed by automated branch policy checks | Before branch naming and PR gate runs |
| 8 | [`implementation/agentic-workflow-guide.md`](implementation/agentic-workflow-guide.md) | **Team workflow** — how to use agents, PR process, PR message and gate workflow, review checklist, branch rules, and the `process` marker fallback for docs/process branches | Before starting collaborative work |
| 9 | [`implementation/pr-template.md`](implementation/pr-template.md) | **PR contract** — documentation entrypoint for required checklist labels, layer-boundary confirmations, command flow, and canonical template source | Before opening any pull request |
| 10 | [`implementation/audit-traceability-matrix.md`](implementation/audit-traceability-matrix.md) | **Coverage source of truth** — maps requirements and audit questions to implementation tickets, e2e/manual anchors, and execution status | During planning, test implementation, and PR review |
| 11 | [`implementation/assets-pipeline.md`](implementation/assets-pipeline.md) | **Asset authoring** — visual and audio creation standards, naming rules, CI validation | When creating or modifying assets |
| 12 | [`deployment/github-pages.md`](deployment/github-pages.md) | **Deployment guide** — GitHub Pages publishing options and static-hosting constraints | When publishing a static site or documentation site |

---

## Onboarding Guide: From Ticket to PR

Welcome to the Ms. Ghostman project! If you are picking up a ticket for the first time, follow this step-by-step workflow to go from an assigned task to a merged Pull Request.

### 1. Claim a Ticket
- **Find your Track**: The workload is divided into 4 tracks (A, B, C, D) defined in [`implementation/implementation-plan.md`](implementation/implementation-plan.md#section-3-workflow-tracks-balanced-workload) and detailed in [`implementation/track-a.md`](implementation/track-a.md), [`implementation/track-b.md`](implementation/track-b.md), [`implementation/track-c.md`](implementation/track-c.md), and [`implementation/track-d.md`](implementation/track-d.md).
- **Set Status and Notes**: Open [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md), find an unstarted ticket in your track, and update its status symbol to `[-]` (In Progress). Keep dependency and blocker text current on the same line.
- **Understand the Scope**: Read the ticket description carefully. Identify the bounded scope and exactly what needs to change.
- **Follow the Prototype-First Phase Order**: Execute tickets by global phase (`P0 → P1 → P2 → P3 → P4`) using [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md). Claim only tickets whose dependencies are complete. Typical first-ticket starting points are `A-01`, `B-01`, and `D-01`. Track C starts in `P2` only after `A-11` is complete: `C-03` begins after `D-01` and `D-03` plus `A-11`, while `C-01` and `C-02` begin after `B-04` plus `A-11`.

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

Gate command reference:

- `npm run policy` for the default all-in-one gate.
- `npm run policy:repo` for repo-only troubleshooting reruns.
- `npm run policy:quality`, `npm run policy:checks:local`, `npm run policy:checks`, `npm run policy:forbid`, `npm run policy:header`, `npm run policy:forbidrepo`, `npm run policy:headerrepo`, `npm run policy:trace`, and `npm run policy:approve` when you need a narrower rerun.

### 4. Run Pre-PR Gates
- **Commit changes**: Commit your changes using the branch's ticket ID in the commit message before running local checks (as the policy scripts analyze commit metadata).
- **Pre-PR Gates**: Run `npm run policy` first, then run `npm run policy:repo` or narrower reruns only when needed. Ensure scope-appropriate tests (`test:unit`, `test:integration`, `test:e2e`, `test:audit`) are covered.

### 5. Open the Pull Request
- **Use the Template**: Read [`implementation/pr-template.md`](implementation/pr-template.md), then open the PR with [`.github/pull_request_template.md`](../.github/pull_request_template.md). This template is the enforced PR contract for required checklist labels, layer boundaries, and section format. Fill out the entire checklist and follow the PR message structure in [PR Message and Gate Workflow](implementation/agentic-workflow-guide.md#12-pr-message-and-gate-workflow).
- **Attach Evidence**: If your PR touches gameplay-critical paths (e.g., performance, rendering, or pausing), attach required evidence with scenario, environment, frame stats (`p50`, `p95`, `p99`), and trace notes as defined in [`../AGENTS.md`](../AGENTS.md).
- **Reference Audits**: Explicitly list each affected `AUDIT-*` ID from [`implementation/audit-traceability-matrix.md`](implementation/audit-traceability-matrix.md) with execution type (Fully Automatable, Semi-Automatable, Manual-With-Evidence) and the exact verification artifact or test output.
- **Manual-With-Evidence IDs**: If affected, include signed evidence and artifact links for `F-19`, `F-20`, `F-21`, and `B-06`.
- **Review and Merge**: Ensure another dev verifies that the ECS boundaries are intact and security rules are met. Review the diff as a human before merging, and do not merge until the applicable local checks and audit coverage pass.

### 6. Review and Merge
- **Review**: Ensure another dev verifies that the ECS boundaries are intact and security rules are met.
- **Update Tracker**: Once merged, go back to [`implementation/ticket-tracker.md`](implementation/ticket-tracker.md) and update your task status symbol to `[x]` (Done).
- **Archive the PR Message (Required)**: Save the final PR message and verification summary under [`pr-messages/`](pr-messages/) and the audit report under [`audit-reports/`](audit-reports/).

### 7. Phase Transitions & Codebase Audits

> **Important Instruction:**
> Every time a phase is finished, all tracks MUST run prompt `codebase-analysis-audit` (repository prompt file: [code-analysis-audit.prompt.md](../.github/prompts/code-analysis-audit.prompt.md)) against the whole codebase and merge those reports.
>
> Then Track A MUST run [phase-deduplicate-track-audits.prompt.md](../.github/prompts/phase-deduplicate-track-audits.prompt.md) to produce four deduplicated fix reports (one per track A/B/C/D) under `docs/audit-reports/<phase>/`.
>
> After report publication, each track MUST fix all issues assigned to its report before the phase is considered closed.

## Actions Setup and Verification

This repository uses [`../.github/workflows/policy-gate.yml`](../.github/workflows/policy-gate.yml) as the main PR gate.

### Set Up

1. Enable Actions for the repository and make sure a runner is registered for Linux jobs.
2. Keep the workflow file on the default branch so PR events can trigger it.
3. Open PRs with the required sections from [`../.github/pull_request_template.md`](../.github/pull_request_template.md) in the body.
4. The repository workflow currently runs `npm run policy -- --mode=ci --scope=all --require-approval=false`; approval enforcement is delegated to repository branch-protection settings.
5. The npm quality gate runs when `package.json` is present and currently enforces `npm run policy:quality` (`check`, `test`, coverage, schema validation, and SBOM when configured). Use `npm run ci` for the broader local wrapper.

### Test It

1. Push a small branch change, open a PR on GitHub, and confirm the workflow starts on the PR event.
2. Verify a valid PR passes the checklist, traceability, and boundary scans.
3. Remove one required checklist item or introduce an audit traceability mismatch, then confirm the workflow fails at the expected step.
4. Verify the PR gate and repo gate run as expected (`npm run policy` and `npm run policy:repo`) by checking workflow logs.

---

## Document Authority Hierarchy

When documents conflict, the following order of authority applies:

```
AGENTS.md                                           ← canonical implementation constraints; wins implementation conflicts
  └── docs/requirements.md + docs/game-description.md  ← canonical gameplay/feature intent
        └── docs/audit.md                           ← canonical acceptance/pass-fail gates
              └── implementation/implementation-plan.md  ← execution guide (track/task ownership)
                    └── implementation/ticket-tracker.md  ← live ticket execution/dependency board
                    └── implementation/audit-traceability-matrix.md  ← requirement/audit/ticket/test mapping
                    └── implementation/agentic-workflow-guide.md  ← process guide
                    └── implementation/assets-pipeline.md  ← asset workflow guidance
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
