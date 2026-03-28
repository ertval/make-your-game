# Documentation Guide — Ms. Ghostman

> **Purpose**: Reading-order guide and map of all project documents. Start here, then follow the numbered order below.

---

## Reading Order

| # | Document | Purpose | When to Read |
|---|---|---|---|
| 1 | [`requirements.md`](requirements.md) | **What** we are building — project objectives, FPS constraints, keyboard rules, approved game genres | First — establishes the hard constraints |
| 2 | [`game-description.md`](game-description.md) | **How** it plays — full gameplay rules, map layout, ghosts, bombs, scoring, timers, screens | Before any game logic work |
| 3 | [`implementation-plan.md`](implementation-plan.md) | **How** we build it — ECS architecture, directory structure, 4-track workplan, testing strategy, performance budget | Before starting any implementation task |
| 4 | [`../AGENTS.md`](../AGENTS.md) | **Coding rules** — mandatory ECS constraints, rendering rules, input rules, security, accessibility, done criteria | Reference during every coding session |
| 5 | [`audit.md`](audit.md) | **Pass/fail criteria** — every question that must pass for project acceptance | Reference during testing and review |
| 6 | [`agentic-workflow-guide.md`](agentic-workflow-guide.md) | **Team workflow** — how to use agents, PR process, review checklist, branch rules | Before starting collaborative work |
| 7 | [`audit-traceability-matrix.md`](audit-traceability-matrix.md) | **Compliance tracking** — maps every audit question to requirements, plan sections, and test anchors | During test implementation and PR review |
| 8 | [`assets-pipeline.md`](assets-pipeline.md) | **Asset authoring** — visual and audio creation standards, naming rules, CI validation | When creating or modifying assets |

---

## Document Authority Hierarchy

When documents conflict, the following order of authority applies:

```
AGENTS.md                         ← normative for all implementation constraints
  └── requirements.md             ← normative for project objectives
  └── game-description.md         ← normative for gameplay rules and feature intent
  └── audit.md                    ← normative for pass/fail acceptance
        └── implementation-plan.md  ← execution guide (canonical for track/task ownership)
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
| Audit test split (Playwright / manual) | [`AGENTS.md` — Test Categorization](../AGENTS.md#test-categorization-for-audit-questions) |
| Track ownership for tasks | [`implementation-plan.md` §3](implementation-plan.md#3-workflow-tracks-balanced-workload) |
| Asset naming and format rules | [`assets-pipeline.md`](assets-pipeline.md) |
