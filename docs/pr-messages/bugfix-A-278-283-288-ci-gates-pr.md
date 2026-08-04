# 🚀 Track A: Resolve issues #278, #283, #288 (CI & Gate Hardening)
> **Summary**: Resolves issues #278, #283, and #288 by hardening the branch validation logic, enforcing complete requirement-to-test mapping in the traceability matrix, and refining CI headless runner budgets to adhere strictly to the 2x target envelope.

---

## 📝 Description

### 🔄 What Changed
- **`scripts/policy-gate/lib/policy-utils.mjs` & `run-checks.mjs`**: Restricted integration branch ownership bypass to only match valid owners and non-empty slugs using the `<owner>/integration-<slug>` convention (#278 / CI-04). Enforced ticket validation on all bugfix (`<owner>/bugfix-<slug>`) and integration branches before allowing ownership bypass, throwing if no ticket ID is present in branch name, commits, or metadata. Supported 2-3 digit ticket IDs (`A-278`).
- **`scripts/policy-gate/README.md`**: Updated constraints table to clarify non-empty integration slug requirement and ticket validation enforcement on bugfix and integration branches.
- **`tests/unit/policy-gate/traceability-matrix-anchors.test.js`**: Created a new test suite that parses `docs/implementation/audit-traceability-matrix.md` and validates that every backticked path exists on disk. More importantly, it enforces that behavioral requirement rows do not cite only the metadata inventory suite (`audit.e2e.test.js`), ensuring direct traceability to real E2E/integration/unit suites (#283 / CI-07).
- **`docs/implementation/audit-traceability-matrix.md`**: Updated matrix anchors to map REQ-01, REQ-02, and REQ-09 to their actual runtime test files instead of the metadata inventory test file.
- **`tests/e2e/audit/audit.browser.spec.js` & `audit.e2e.test.js`**: Wired `CI_SEMI_AUTOMATABLE_THRESHOLDS` into `audit.browser.spec.js` as a hard cap on active thresholds (capping relaxation at 2x frame time = 33.4ms and 1/2 FPS = 30 FPS). Validated that default `CI_TOLERANCE_FACTOR` (1.3) produces effective thresholds of ~21.7ms frame time and 46 FPS (#288 / CI-17).

### 🎯 Why
- **#278**: Bypassing ownership checks for integration and bugfix branches must enforce ticket validation so developers cannot bypass ticket checks with arbitrary branch names.
- **#283**: To guarantee that functional requirements are verified by real runtime execution/assertions instead of just listing them in the metadata inventory mapping.
- **#288**: Wiring CI threshold limits into `audit.browser.spec.js` ensures that slow runner VM relaxation remains bounded by a hard 2x cap while asserting effective CI targets (21.7ms / 46 FPS).

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **AUDIT-F-17** | `[Semi-Automatable]` | Verification: `tests/e2e/audit/audit.browser.spec.js` + `tests/e2e/audit/audit.e2e.test.js`
- **AUDIT-F-18** | `[Semi-Automatable]` | Verification: `tests/e2e/audit/audit.browser.spec.js` + `tests/e2e/audit/audit.e2e.test.js`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///home/ertval/code/zone-modules/make-your-game/AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (if applicable).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: Strictly validates branch ownership check bypass scopes to prevent unauthorized track boundary bypasses.
- **Architecture**: Enforces requirement traceability to actual test suites, preventing false verification signals.
- **Risks**: None. Refined CI thresholds remain strict but resilient to VM performance fluctuations.

---

Closes #278
Closes #283
Closes #288
