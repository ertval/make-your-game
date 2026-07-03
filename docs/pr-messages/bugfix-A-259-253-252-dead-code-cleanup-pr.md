# 🚀 Track A: Resolve issues #259, #253, #252 (DEAD-11, DEAD-05, DEAD-04)
> **Summary**: This PR cleans up deprecated test-only escape hatches and redundant code exports to resolve DEAD-11, DEAD-05, and DEAD-04.

---

## 📝 Description

### 🔄 What Changed
- **Event Queue / Bootstrap [DEAD-11, Issue #259]**: Pruned the deprecated `resetOrderCounter` function from `src/ecs/resources/event-queue.js` and removed it from top docstrings. Removed the legacy `adapterResourceKey` fallback from `src/game/bootstrap.js`. Updated corresponding unit tests to assert they are not exported or utilized.
- **Run-All [DEAD-05, Issue #253]**: Completed the truncated comment at line 155 of `scripts/policy-gate/run-all.mjs` to explain why `describePolicyResolution` was removed from the PR checklist run path.
- **Policy Utils [DEAD-04, Issue #252]**: Removed the `export` keyword from six helper functions/constants (`TICKET_ID_PATTERN`, `escapeRegex`, `normalizePolicyPath`, `extractTicketIds`, `pathMatchesPattern`, `commandSucceeded`) in `scripts/policy-gate/lib/policy-utils.mjs` that are only used internally. Added unit tests to assert that they are not exported.

### 🎯 Why
- **DEAD-11**: Pre-existing, unused, and deprecated APIs (`resetOrderCounter` and `adapterResourceKey` fallback option) left in production files increase code debt and risk collision.
- **DEAD-05**: Confusing truncated comment left the rationale for a cleanup task cut off.
- **DEAD-04**: Internal functions were exported publicly, leaking encapsulation.
- **Impact**: Improves maintainability, cleans up module boundaries, and eliminates dead code vectors.

Closes #259
Closes #253
Closes #252

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **DEAD-11** | `[Fully Automatable]` | Verification: `tests/unit/resources/event-queue.test.js`, `tests/unit/game/bootstrap.test.js` | Evidence: passing test suite
- **DEAD-05** | `[Fully Automatable]` | Verification: manual documentation review | Evidence: completed comments in code
- **DEAD-04** | `[Fully Automatable]` | Verification: `tests/unit/policy-gate/policy-utils.test.js` | Evidence: passing test suite

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/bugfix-<NN>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts (N/A for these backend cleanups).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references.
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: The changes only prune unused parameters and internal functions, retaining secure code constructs.
- **Architecture**: Pruning deprecated parameters aligns components strictly to the standard explicit bootstrap APIs.
- **Risks**: None. Tests confirm that the changes did not impact any external modules.
