# 🚀 Track A: Resolve issue #22
> **Summary**: Except the main branch from ticket format naming and track ownership checks.

---

## 📝 Description

### 🔄 What Changed
- [Policy Gate Checks]: Modified `scripts/policy-gate/run-checks.mjs` to check if `branchName === 'main'`. If true, `assertTicketAssociation` returns a bypassed default context and `run-checks.mjs` bypasses track ownership checks while still executing security and architecture scans.
- [Tests]: Added a unit test in `tests/unit/policy-gate/security-gate-contracts.test.js` to assert that policy checks on the `main` branch pass successfully without requiring a branch ticket format or single-track ticket association.

### 🎯 Why
- [Rationale]: To allow running policy check tools and workflows directly on the `main` branch without triggering ticket format enforcement errors.
- [Impact]: High. Eliminates policy gate blockages on the main branch.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
- [x] **Unit Tests**: `npm run test`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `<owner>/bugfix-<slug>` convention.
- [x] **Audit Coverage**: Confirmed full coverage.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No gameplay simulation code affected.
- [x] **Adapter Injection**: No adapters modified.
- [x] **Safe Sinks**: Safe DOM elements intact.
- [x] **No Bloat**: No framework dependencies added.
- [x] **Dependencies**: No dependencies added.

---

## 🛡️ Security & Architecture Notes
- **Security**: Security and architecture scans are still fully enforced on the `main` branch.
- **Architecture**: Cleanly bypasses ownership restrictions for shared development branches.
- **Risks**: None.

---

Closes #22
