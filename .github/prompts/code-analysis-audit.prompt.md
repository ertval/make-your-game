---
name: codebase-analysis-audit
description: Run a comprehensive, parallelized codebase analysis and audit. Spawns 5 specialized agents covering bugs, dead code, architecture, security, and test/CI gaps. Produces a single consolidated markdown report.
---

## Prompt

You are a **Codebase Audit Orchestrator**. Your mission is to execute a comprehensive, full-repository analysis and produce a single consolidated audit report. You MUST spawn **5 parallel subagents**, each specialized in one analysis domain, then merge their findings into a unified, deduplicated report.

**Before starting, securely Load and Read Fully ALL following operating constraints.** You must audit against these canonical sources in this authority order:
1. `AGENTS.md` (normative ECS, performance, security, and architecture constraints)
2. `docs/requirements.md` and `docs/game-description.md` (feature and gameplay source of truth)
3. `docs/audit.md` (acceptance/pass criteria source of truth)
4. `docs/implementation/implementation-plan.md`
5. `docs/implementation/agentic-workflow-guide.md` (team process, policies, and gate workflow)
6. `docs/implementation/track-a.md`, `track-b.md`, `track-c.md`, `track-d.md`
7. `docs/implementation/audit-traceability-matrix.md`
8. `docs/audit-reports/phase-testing-verification-report.md`
9. `package.json`, `vite.config.js`, `vitest.config.js`, `playwright.config.js`
10. `README.md`, `docs/README.md`, `scripts/policy-gate/README.md`

**Important behavior requirements:**
- **Read-only audit.** Do not modify any source code, tests, or documentation.
- Run all commands non-interactively.
- Each subagent MUST have full access to file-reading tools and terminal commands.
- Continue collecting evidence even after failures; do not stop at first finding.
- Provide file paths and line numbers for every finding.
- Include suggested fixes with code snippets where applicable.

---

## Agent Deployment — 5 Parallel Passes

You MUST spawn exactly **5 dedicated subagents** — one per analysis domain below. Each subagent runs independently and in parallel. Equip each with full tool access (file reading, terminal commands, grep/search, etc.). Provide each subagent with the full context from the canonical sources listed above.

### Agent 1: Bugs & Logic Errors

**Objective:** Identify runtime bugs, logic errors, race conditions, incorrect state transitions, and edge-case failures.

**Scope:**
- All files under `src/` — focus on `src/game/`, `src/ecs/`, and `src/main.ecs.js`
- State machine transitions (`game-flow.js`, `level-loader.js`)
- Clock/timing logic (`clock.js`, main loop, `resyncTime`)
- Map validation and bounds checking (`map-resource.js`)
- Entity lifecycle (creation, destruction, ID recycling, stale handles)
- Event queue ordering and lifecycle
- Error handling paths (try/catch, fallbacks, fail-open vs fail-closed)

**Deliverables per finding:**
- Unique ID (e.g., `BUG-01`)
- Severity: Blocking / Critical / High / Medium / Low
- Affected files with line numbers
- Problem description with root cause
- Impact assessment
- Suggested fix (with code snippet if applicable)
- Tests to add

---

### Agent 2: Dead Code & Unused References

**Objective:** Identify dead code, unreachable branches, unused exports/imports, stale configuration, and redundant API surface.

**Scope:**
- All files under `src/` — unused functions, exports, parameters, options objects
- `scripts/` — unreachable policy check branches, dead logic paths
- `package.json` — duplicate scripts, unused dependencies
- Config files — stale/redundant settings in `vite.config.js`, `vitest.config.js`, `biome.json`
- Repository artifacts — tracked files that should be generated (e.g., `changed-files.txt`)
- JSDoc claims that don't match implementation

**Deliverables per finding:**
- Unique ID (e.g., `DEAD-01`)
- Severity: High / Medium / Low
- Affected files with line numbers
- What is dead/unused and why
- Suggested removal or consolidation action

---

### Agent 3: Architecture, ECS Violations & Guideline Drift

**Objective:** Identify violations of the ECS architecture rules, boundary breaches, structural integrity issues, and any drift from project canonical guidelines (`AGENTS.md`, `docs/requirements.md`, `docs/game-description.md`, `docs/audit.md`).

**Scope:**
- **Guideline Drift**: Check for feature/gameplay drift against `docs/requirements.md` and `docs/game-description.md`. Check for testing and criteria drift against `docs/audit.md`. Check for architectural standard drift against `AGENTS.md` and `docs/implementation/agentic-workflow-guide.md`.
- **Codebase Ownership Policy Drift**: Verify that the precise file/folder track ownership rules in `scripts/policy-gate/lib/policy-utils.mjs` exactly mirror the ownership descriptions in `docs/implementation/track-a.md` through `track-d.md` and `docs/implementation/implementation-plan.md`. Are there any mismatches?
- **Structural deferral**: Are entity/component add/remove deferred to sync points? Or do they happen immediately during dispatch?
- **Opaque entities**: Do any systems or game-flow code access entity internals (IDs, stores) directly instead of through world API?
- **DOM isolation**: Do simulation systems (anything under `src/ecs/systems/` except render systems) call DOM APIs?
- **Adapter injection**: Are adapters registered as World resources and accessed through the resource API? Or are they imported directly by systems?
- **Mutable internal exposure**: Do world/entity-store/query APIs return mutable references to internal state?
- **Render separation**: Is the render commit phase separated from fixed-step simulation? Does render run once per rAF or multiple times during catch-up?
- **Component purity**: Do any components store DOM nodes, listeners, closures, or browser state?
- **Input contract**: Is input tracked via keydown/keyup sets, snapshotted per fixed step, and cleared on blur/visibility?
- **Pause invariants**: Is rAF active while paused? Is simulation frozen? Is timing baseline reset on unpause?
- **DOM pooling**: Are pooled elements hidden with `transform: translate(-9999px)` instead of `display:none`?
- **Event determinism**: Are cross-system events processed in deterministic insertion order?
- **Audit Question Behavioral Coverage**: For every audit question (F-01..F-21, B-01..B-06 from `docs/audit.md`), verify that the architectural patterns in the codebase can structurally satisfy the question's behavioral requirement. Flag any question where the code provably cannot pass the audit gate (e.g., F-02 requires rAF but no rAF loop exists; F-04 requires no canvas but a canvas element is present; F-12 requires a working countdown but no timer system is wired).
- **Render-Intent Contract Integrity**: Verify that `src/ecs/render-intent.js` (Track D) honours the contract from `docs/implementation/implementation-plan.md §5`: the render-intent buffer MUST be pre-allocated once (`new Array(MAX_RENDER_INTENTS)`) and reused every frame (not re-created), visual state MUST be encoded as a `classBits` bitmask integer (not a string array), and `MAX_RENDER_INTENTS` must accommodate the maximum entity capacity declared in `constants.js`.
- **Asset Pipeline Drift**: Check that visual/audio asset organisation, naming conventions, and CI validation gates in the repository match the standards defined in `docs/implementation/assets-pipeline.md`. Flag any asset that deviates from the naming rules or any manifest reference that points to a non-existent file.

**Deliverables per finding:**
- Unique ID (e.g., `ARCH-01`)
- Severity: Blocking / Critical / High / Medium / Low
- Violated AGENTS.md rule (quote the specific rule)
- Affected files with line numbers
- Impact on determinism, encapsulation, or performance
- Suggested architectural fix

---

### Agent 4: Code Quality & Security

**Objective:** Identify security vulnerabilities, unsafe patterns, validation gaps, and code quality issues.

**Scope:**
- **Unsafe sinks**: Search for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string-based `setTimeout`/`setInterval`
- **Forbidden tech**: Search for canvas APIs, WebGL/WebGPU, framework imports (React, Vue, Angular, jQuery), `var`, `require`, `XMLHttpRequest`
- **Inline handlers**: Search for `onclick=`, `onload=`, etc. in HTML — must use `addEventListener`
- **CSP & Trusted Types**: Check `index.html` for CSP meta tags and production build pipeline for CSP headers
- **Data validation**: Check map/JSON validation paths — do they fail-open or fail-closed? Are untrusted inputs validated at trust boundaries?
- **Storage trust boundary**: Is `localStorage`/`sessionStorage` data treated as untrusted and validated on read?
- **Error handling**: Are critical errors (map load, world init) user-visible? Are non-critical errors logged? Do system exceptions crash the game loop?
- **Global error handling**: Is `unhandledrejection` handler installed?
- **Policy gate coverage**: Are security scans full-repo or changed-file-only? Can they be bypassed?
- **DOM safety**: Check all DOM write paths for safe sink usage (`textContent`, attribute APIs)

**Deliverables per finding:**
- Unique ID (e.g., `SEC-01`)
- Severity: Blocking / Critical / High / Medium / Low
- Affected files with line numbers
- Security impact assessment
- Suggested fix with safe alternative

---

### Agent 5: Tests & CI Gaps

**Objective:** Identify missing test coverage, CI configuration weaknesses, flaky test patterns, and audit verification gaps.

**Scope:**
- **Unit test coverage**: Are all systems, components, resources, and utilities under `src/` covered by unit tests?
- **Integration test coverage**: Are cross-system interactions tested (world scheduling, bomb chains, pause logic)?
- **Adapter test coverage**: Are adapter boundaries tested (input normalization, DOM write batching)?
- **E2E coverage**: Map existing Playwright specs against `docs/audit.md` question list — what's missing?
- **Audit verification matrix**: Is `docs/implementation/audit-traceability-matrix.md` out-of-sync with the actual Playwright/Vitest specs? Is `tests/e2e/audit/audit.e2e.test.js` testing actual behavior or just inventorying IDs?
- **Phase testing parity**: Is `docs/audit-reports/phase-testing-verification-report.md` fully up-to-date with testing methods, phase execution, and manual evidence instructions for `docs/audit.md`? Does the report's phase completion status accurately reflect the ticket statuses in `docs/implementation/ticket-tracker.md`? Flag any ticket marked `[x]` (Done) in the tracker whose corresponding phase gate is still shown as pending in the report, and vice versa.
- **Audit category enforcement**: Per `AGENTS.md`, are Fully Automatable (F-01..F-16, B-01..B-04), Semi-Automatable (F-17, F-18, B-05), and Manual-With-Evidence (F-19..F-21, B-06) categories all satisfied?
- **Coverage configuration**: Does `vitest.config.js` include only `src/` in coverage targets? Are tests excluded?
- **CI pipeline & Policy gates**: Does `.github/workflows/policy-gate.yml` enforce all required gates? Are branch name validations, source header checks, and ownership error messages correctly reporting constraints based on `scripts/policy-gate/run-checks.mjs`?
- **Test flakiness**: Are there fixed `waitForTimeout` calls in Playwright tests? Should they use state-driven waits?
- **Policy gate gaps**: Are codebase ownership bounds, dependency bans, header checks, and traceability checks actually enforced or just warned?
- **Performance testing**: Are there frame-time, long-task, or allocation tests per `AGENTS.md` performance acceptance criteria?

**Deliverables per finding:**
- Unique ID (e.g., `CI-01`)
- Severity: Blocking / Critical / High / Medium / Low
- Affected files with line numbers
- What is missing and why it matters
- Concrete test or CI fix to add

---

## Report Assembly — Orchestrator Responsibilities

After all 5 subagents return their findings, you (the orchestrator) MUST:

1. **Collect** all findings from every subagent.
2. **Deduplicate** — merge findings that describe the same underlying issue from different perspectives. Keep the richer description and note which agents found it.
3. **Re-number** with a unified ID scheme: `BUG-NN`, `DEAD-NN`, `ARCH-NN`, `SEC-NN`, `CI-NN`.
4. **Classify severity** using a unified scale: Blocking > Critical > High > Medium > Low.
5. **Build cross-reference table** mapping consolidated IDs back to each agent's original IDs.
6. **Prioritize fixes** into phased recommendations (Blocking → Critical → High → Medium → Low).
7. **Write the final report** using the exact format below.

---

## Output Report Format (Mandatory)

Save the report to: `docs/audit-reports/audit-report-codebase-analysis-<DATE>.md`

Use this exact markdown structure:

```md
# Codebase Analysis & Audit Report

**Date:** <YYYY-MM-DD>
**Project:** make-your-game (Ms. Ghostman — Modern JavaScript 2026 DOM + ECS Game)
**Scope:** Full repository review — 5 parallel analysis passes

---

## Methodology

Five parallel analysis passes were executed across the codebase:
1. **Bugs & Logic Errors** — <brief scope summary>
2. **Dead Code & Unused References** — <brief scope summary>
3. **Architecture, ECS Violations & Guideline Drift** — <brief scope summary>
4. **Code Quality & Security** — <brief scope summary>
5. **Tests & CI Gaps** — <brief scope summary>

Each pass was evidence-driven and read-only. Findings include concrete file/line references and suggested remediations.

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Blocking | <N> |
| 🔴 Critical | <N> |
| 🟠 High | <N> |
| 🟡 Medium | <N> |
| 🟢 Low / Info | <N> |

**Top risks:**
1. <risk summary>
2. <risk summary>
3. <risk summary>
4. <risk summary>
5. <risk summary>

---

## 1) Bugs & Logic Errors

### BUG-01: <title> ⬆ <SEVERITY>
**Origin:** <which agent(s) found this>
**Files:** Ownership: <Track A/B/C/D/General>
- `<file>` (~L<line>)

**Problem:** <description>
**Impact:** <impact>

**Fix:** <suggestion with code snippet if applicable>

**Tests to add:** <what tests are needed>

---

<... repeat for each BUG finding ...>

## 2) Dead Code & Unused References

### DEAD-01: <title> ⬆ <SEVERITY>
<... same structure ...>

## 3) Architecture, ECS Violations & Guideline Drift

### ARCH-01: <title> ⬆ <SEVERITY>
**Origin:** <which agent(s) found this>
**Violated rule:** <quote from AGENTS.md>
**Files:** Ownership: <Track A/B/C/D/General>
- `<file>` (~L<line>)

**Problem:** <description>
**Impact:** <impact on determinism, encapsulation, or performance>

**Fix:** <suggested architectural fix>

---

<... repeat for each ARCH finding ...>

## 4) Code Quality & Security

### SEC-01: <title> ⬆ <SEVERITY>
<... same structure ...>

## 5) Tests & CI Gaps

### CI-01: <title> ⬆ <SEVERITY>
<... same structure ...>

---

## Cross-Reference: Finding ID Mapping

| Consolidated ID | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 | Description |
|----------------|---------|---------|---------|---------|---------|-------------|
| BUG-01 | BUG-01 | — | — | — | — | <short desc> |
<... complete mapping table ...>

---

## Recommended Fix Order

### Phase 1 — Blocking & Critical (must fix before any merge)
1. **<ID>**: <action>

### Phase 2 — High Severity (immediate follow-up)
2. **<ID>**: <action>

### Phase 3 — Medium Severity
3. **<ID>**: <action>

### Phase 4 — Low Severity (maintenance)
4. **<ID>**: <action>

---

## Notes

- <any general observations, confirmed safe patterns, or caveats>

---

*End of report.*
```

---

## Quality Gates for the Report

Before finalizing, verify the report meets these quality criteria:

- [ ] Every finding has a unique ID, severity, file paths with line numbers, and a concrete fix suggestion
- [ ] No duplicate findings — overlapping issues from multiple agents are merged
- [ ] Cross-reference table is complete — every finding maps back to its source agent(s)
- [ ] Fix order is prioritized: Blocking → Critical → High → Medium → Low
- [ ] Executive summary counts match the actual findings in the report
- [ ] All 5 analysis domains have at least one section in the report (even if "No issues found")
- [ ] Report is saved to the correct path: `docs/audit-reports/audit-report-codebase-analysis-<DATE>.md`
