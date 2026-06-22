# 🛡️ Audit: `asmyrogl/bugfix-130-135-123`
## 🏁 Verdict: `**FAIL**`
---
## 🎯 Scope & Compliance
- **Ticket ID**: `BUG-17 (#130), BUG-22 (#135), BUG-10 (#123)` → impl ticket `B-08`; `constants.js` = `D-01` | **Track**: `B`
- **Audit Mode**: `BUGFIX`
- **Base Comparison**: `merge-base(main, HEAD)=5f1a11b ..HEAD + working tree` (HEAD == merge-base; all changes uncommitted)
### 📦 Deliverables & Verification
- ✅ PASS: `BUG-17 — GHOST_DEFAULT_SPEED=4.5 terminal fallback` (constants.js:124; resolveGhostSpeed precedence STUNNED→stored→map→default preserved, ghost-ai-system.js:250-270; movement guard `speed>0` at :948 now satisfied)
- ✅ PASS: `BUG-22 — findBlinkyTile returns null + Inky chase fallback` (findBlinkyTile null in all 3 paths :592-625; `hasBlinky` gate :820-824; Inky `computeBlinkyTarget` fallback :894-913; no off-map (0,0) targeting; scratch-tile reuse preserved)
- ✅ PASS: `BUG-10 — module-level scratch Set, clear+refill` (releasedGhostScratch :87; per-frame clear/refill :795-806; null-vs-empty semantics preserved; per-frame `new Set()` removed)
- ✅ PASS: `New + updated tests` (unit BUG-17/22/10 cases; integration ghost-default-speed-fallback.test.js, inky-without-blinky.test.js; a-05 adapted for BUG-17 — affected suite 50 passed; biome clean on 6 changed files)
- **Out-of-Scope Findings**: `none` (every hunk maps to BUG-17/22/10; a-05 edit is a required BUG-17 consequence)
---
## 🔍 Audit Findings & Blockers
### 🚨 Critical (Blockers)
1. **Primary policy gate `npm run policy -- --require-approval=false` returned exit=1.** Root cause is a single E2E assertion `tests/e2e/audit/audit.browser.spec.js:254 › AUDIT-B-05` (long-task threshold: expected `taskCount <= 0`, received `3`). This is **flaky / environment-load-sensitive** — on isolated re-run it PASSES (1 passed, 3.0s vs 15.0s under full-suite contention). It is **unrelated to the audited ghost-AI changes** (it measures main-thread long tasks at runtime boot, not ghost speed/targeting/allocation). Under the canonical rule "PASS requires ALL gates to satisfy requirements," a non-green primary gate forces a strict FAIL even though the changed scope is sound.
### ⚠️ High/Medium/Low
1. (Low, cosmetic) `GHOST_DEFAULT_SPEED = 4.5` comment says it "mirrors PLAYER_BASE_SPEED"; 4.5 happens to equal level-2 ghostSpeed (level-1=4.0, level-3=5.0). Any positive finite value satisfies the fix; not a defect.
2. (Low, informational) Checked-in `.policy-pr-meta.json` was stale (referenced `chbaikas/bugfix-ARCH-01...` / #153) before the run; `run-all.mjs`→`prepare-context.mjs` regenerated it. `changed-files.txt` resolved to 0 files because all changes are uncommitted working-tree, so narrow `--scope=changed` forbidden/header checks scanned 0 files (they still PASSED; repo-scope scans covered 177/70 files clean).
> [!IMPORTANT]
> ### ⛑️ Path To PASS (Required if FAIL)
> 1. Re-run the primary gate to get a clean pass: `npm run policy -- --require-approval=false`. The AUDIT-B-05 long-task assertion is flaky under full-suite load; it passed in isolation (`npx playwright test tests/e2e/audit/audit.browser.spec.js -g "AUDIT-B-05"` → 1 passed). If it recurs, re-run on a quiescent machine or quarantine/stabilize that perf threshold separately — it is owned by the audit/perf suite, NOT by this bugfix scope.
> 2. (Optional, not blocking) Commit the working-tree changes so policy narrow `--scope=changed` checks exercise the actual changed files instead of 0.
---
## 📋 Requirements, Audit & Drift
- **REQ IDs**: `REQ-14, REQ-15` | **AUDIT IDs**: `AUDIT-F-06, AUDIT-F-13` (B-08 mappings already in audit-traceability-matrix.md:64-65,80,87)
- ✅ PASS: Coverage evidence status — B-08 REQ/AUDIT pre-mapped; new BUG-specific tests add direct coverage; bugfix branch needs no new matrix rows (matrix is REQ→AUDIT→ticket→test, not per-bug)
- ✅ PASS (N/A): Manual evidence status (F-19/20/21/B-06) — deterministic logic fixes; no perf-trace artifact required for allocation-reducing, non-rendering change
- ✅ PASS: Feature/Technical Drift Assessment — no drift; fixes degrade gracefully toward documented genre behavior (game-description.md §5.1) and reinforce AGENTS.md no-silent-failure + no-hot-loop-allocation rules
---
## 🛠️ Automated Gate Summary
- ❌ FAIL: `npm run policy -- --require-approval=false` (exit=1, duration=136s) — failure isolated to Phase 1 `policy:quality` → `test:e2e` → AUDIT-B-05 flaky long-task assertion. All policy-specific enforcements PASSED: policy:checks (bugfix-mode ownership bypass), policy:forbidden, policy:header, policy:trace, policy:approve(skipped).
- ✅ PASS: Verification pass — re-ran the sole failing test once in isolation: `npx playwright test ... -g "AUDIT-B-05"` → **1 passed (3.0s)**, confirming non-reproducible under normal load (flaky, environment-sensitive). No failure-isolation needed for policy:checks/forbidden/header/trace — those passed in the primary run.
---
## ✅ Policy Matrix
- ✅ PASS: Ticket/Track Context Valid (BUGFIX mode detected, owner=asmyrogl ∈ registered, Track B)
- ✅ PASS: Ownership & PR Template Respected (bugfix ownership bypass; cross-track B+D allowed)
- ✅ PASS: ECS DOM Boundary & Adapter Injection (no DOM, no adapter imports in changed scope)
- ✅ PASS: Forbidden Tech (canvas/WebGL/frameworks) (static scan + policy:forbidden clean)
- ✅ PASS: Security Sinks (innerHTML/eval/timers) (none introduced)
- ✅ PASS: Timing, Input, & Rendering Invariants (untouched)
- ✅ PASS: New Files Header Comments (both new test files have `/** ... */` block headers; tests/ not gated by header check)
- ✅ PASS: Audit Traceability Matrix Mapping (B-08→REQ-14/15, AUDIT-F-06/F-13 present; policy:trace passed)
- ✅ PASS: No Gameplay/Document/Technical Drift
---
## 📄 Final Report Metadata
- **Date**: 2026-06-09
- **READY_FOR_MAIN**: `**NO**`
