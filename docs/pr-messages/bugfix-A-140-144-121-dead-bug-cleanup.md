# 🚀 [Track A] Resolve DEAD-04, DEAD-34, BUG-08
> **Summary**: Clean up dead code/config and remove unused `input` phase from ECS phase order.

---

## 📝 Description

### 🔄 What Changed
- **package.json**: Removed `--passWithNoTests` flag from `test:integration` script (DEAD-04 #140)
- **src/ecs/world/world.js**: Removed `'input'` from `DEFAULT_PHASE_ORDER` (BUG-08 #121)
- **src/**: Removed 8 stale `.gitkeep` placeholder files from non-empty directories (DEAD-34 #144)

### 🎯 Why
- **DEAD-04**: Flag masked missing integration test coverage; integration tests now exist (28 files, 262 tests)
- **BUG-08**: `input` phase had zero registered systems; wasteful empty iteration each fixed step
- **DEAD-34**: `.gitkeep` files are unnecessary once directories contain source code

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy` — ALL CLEAR

### 📋 Audit Traceability
- N/A — These are dead-code/bug-fix tickets, not audit-level features

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed AGENTS.md and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope (Track A).
- [x] **Branching**: Branch name follows `ekaramet/bugfix-A-140-144-121-dead-bug-cleanup` convention.
- [x] **No Audit Impact**: These changes do not affect F-01..F-21 or B-01..B-06 audit gates.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: No simulation systems modified; only `DEFAULT_PHASE_ORDER` constant changed.
- [x] **Safe Sinks**: No HTML injection risks.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Lockfile unchanged; `package.json` script-only change.

---

## 🛡️ Security & Architecture Notes
- **Security**: No security impact.
- **Architecture**: Removing unused `input` phase slightly reduces per-frame iteration overhead.
- **Risks**: None. All 1047 unit/integration/e2e tests pass with 0 failures.

---

## 🔗 Closes
- Closes #140
- Closes #144
- Closes #121
