# docs(audit): P3 codebase analysis audit — medvall / Track D

> **process** — This is a docs/process branch with no ticket ID (`GENERAL_DOCS_PROCESS`). It adds one audit report under `docs/audit-reports/` and changes no source, tests, or config. Owner-scoped ownership still applies; all changed files are under shared `docs/**`.

## Required checks

- [x] I read AGENTS.md and the agentic workflow guide.
- [x] I ran `npm run policy` locally (no code/test changes; suite green on the audited commit: 1293 vitest + 60 e2e).
- [x] Branch name follows the `<owner>/…` convention (`medvall/audit-P3-codebase-analysis`); PR marked `process` (no ticket ID).
- [x] Changed files stay within ownership scope — only `docs/audit-reports/phase-3/org/audit-report-P3-medvall.md` (shared `docs/**`).
- [x] No audit-coverage, security-sink, architecture-boundary, or dependency/lockfile impact (docs-only).
- [x] Requested human review.

## What changed

- Adds the **medvall / Track D** per-owner code-analysis audit for the final debug session:
  `docs/audit-reports/phase-3/org/audit-report-P3-medvall.md`.
- Read-only audit — no source, test, schema, or config files touched.

## Why

- Executes the `code-analysis-audit` workflow for the final wrap-up and produces the per-owner report that Track A's `phase-deduplicate-track-audits` step merges into the four per-track reports. Placement (`phase-3/org/audit-report-P3-<owner>.md`) matches the existing convention.

## Findings summary

**0 Blocking / 0 Critical / 0 High · 4 Medium · 5 Low** (DEAD-01 itemizes to 13 unused exports).

- **ARCH-01 (Medium):** `world.query()` allocates a fresh array on every call (~17×/fixed step) — hot-path GC pressure vs F-17/F-18.
- **BUG-01 (Medium):** power-up upgrades (`maxBombs`/`fireRadius`) reset on every level transition via a blanket `resetPlayer()` — a product decision (spec is silent on cross-level persistence).
- **SEC-01 (Medium):** no CSP declared (Trusted Types *is* installed, so the primary injection sink is already closed; CSP is defense-in-depth).
- **CI-01 (Medium):** 13 fixed `waitForTimeout` across 4 e2e specs drive the known flake cluster.
- **DEAD-01..05 (Low):** 13 unused exports; unused `sprite--explosion--*` CSS; 22 unwired `className: null` assets; deprecated test-only hatches; duplicated tile-size constant.

> Note: execution ran the 5 analysis passes inline (orchestrator) rather than 5 parallel subagents — subagent capacity was rate-limited at run time. Evidence standard and report format are unchanged; this is documented at the top of the report.

## Tests

- N/A — documentation only. No code paths changed; nothing to add or run beyond the existing green gate.

## Audit questions affected

- None. The report *references* audit IDs (F-17/F-18 perf, etc.) as finding context but changes no behavior and no audit mappings.

## Security notes

- None. Docs-only; no sinks, dependencies, or trust boundaries touched. (The report itself flags SEC-01 / missing CSP as a follow-up for Track A.)

## Architecture / dependency notes

- No code or dependency changes. The report flags ARCH-01 (`world.query()` allocation) and DEAD-05 (tile-size constant) as follow-ups; remediation is out of scope for this docs PR.

## Risks

- Minimal. A new markdown report under `docs/audit-reports/`. The only follow-on is that the listed Medium findings should be triaged (and deduplicated against the other owners' `org/audit-report-P3-*.md` reports) before being actioned.
