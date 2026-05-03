# 🚀 [PR Title]
> **Summary**: [A brief description of the work done in this PR.]

---

## 📝 Description

### 🔄 What Changed
- [Component/System]: [Brief description of change]
- [Component/System]: [Brief description of change]

### 🎯 Why
- [Rationale]: [Why was this change necessary? What problem does it solve?]
- [Impact]: [How does this affect the rest of the system?]

---

## 🧪 Verification & Audit

### ✅ Verification
- [ ] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **AUDIT-XX** | `[Execution Type]` | Verification: `[Test Name]` | Evidence: `[Path/Link]`
- **AUDIT-YY** | `[Execution Type]` | Verification: `[Test Name]` | Evidence: `[Path/Link]`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [ ] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [ ] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [ ] **Ownership**: Verified files remain within declared ticket ownership scope.
- [ ] **Branching**: Branch name follows `<owner>/<TRACK>-<NN>` convention.
- [ ] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [ ] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06 (if applicable).

### 🏗️ Architecture & Security
- [ ] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [ ] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [ ] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [ ] **No Bloat**: No framework imports or canvas APIs introduced.
- [ ] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: [Notes on trust boundaries or potential sinks]
- **Architecture**: [Notes on system interactions or dependency changes]
- **Risks**: [Potential regressions or performance considerations]

---

<details>
<summary>📖 <b>Local Command Reference</b> (Click to expand)</summary>

| Command | Purpose |
| :--- | :--- |
| **`npm run policy`** | **Primary gate (runs all checks and tests)** |
| `npm run check` | Linting & formatting check |
| `npm run test` | Run all vitest suites |
| `npm run test:unit` | Debug: Unit tests only |
| `npm run test:integration` | Debug: Integration tests only |
| `npm run test:e2e` | Debug: Playwright browser tests |
| `npm run test:audit` | Debug: Audit map validation |
| `npm run validate:schema` | Schema validation |

</details>
