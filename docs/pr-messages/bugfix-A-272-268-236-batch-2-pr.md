# 🚀 Track A: Resolve issues #272, #268, #236
> **Summary**: Resolves issues #272, #268, and #236 by adding named hard-failing test steps in CI workflows, implementing frame-busting breakout clickjacking protection alongside Netlify/Cloudflare Pages static security headers, and adding missing transitions to MENU in the game-status FSM.

---

## 📝 Description

### 🔄 What Changed
- **CI Workflows**: Added explicit, named, hard-failing steps for coverage (`npm run test:coverage`) and E2E tests (`npm run test:e2e`) in `.github/workflows/policy-gate.yml` and `.github/workflows/deploy.yml`, with Playwright browser installation configured for the deploy run.
- **Clickjacking Protection**:
  - Implemented `/src/security/frame-busting.js` script to detect framing and redirect the parent window to the game URL.
  - Injected the frame-busting script inside the `<head>` of `index.html`.
  - Added a same-origin E2E framing test page `/public/framing-test.html` and a robust Playwright E2E test `/tests/e2e/sec-01-csp-frame-busting.spec.js` using page route interception to verify frame breakout behavior.
  - Created a static `public/_headers` configuration file to define CSP and anti-framing headers on compatible platforms.
- **FSM Transitions**: Added `GAME_STATE.MENU` to the valid transition lists for `PAUSED` and `LEVEL_COMPLETE` in `src/ecs/resources/game-status.js`. Added unit tests verifying these transitions in `tests/unit/resources/game-status.test.js`.
- **Documentation**: Documented clickjacking and CSP limitations/defenses in `docs/deployment/github-pages.md`.

### 🎯 Why
- **Issue #272**: Running coverage and E2E checks under a soft-fail orchestrator meant test regressions could merge undetected. Direct named steps ensure immediate failure.
- **Issue #268**: GitHub Pages does not support custom headers, meaning the `frame-ancestors` directive specified in the meta tag is ignored. The frame-busting script ensures clickjacking protection.
- **Issue #236**: FSM constraints blocked quit-to-menu implementations.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **SEC-01** | `[Automated]` | Verification: `tests/e2e/sec-01-csp-frame-busting.spec.js` | Evidence: `docs/audit-reports/pr-audit-ekaramet-bugfix-A-272-268-236-batch-2.md`
- **CI-01** | `[Automated]` | Verification: `GitHub Actions logs` | Evidence: `docs/audit-reports/pr-audit-ekaramet-bugfix-A-272-268-236-batch-2.md`
- **BUG-10** | `[Automated]` | Verification: `tests/unit/resources/game-status.test.js` | Evidence: `docs/audit-reports/pr-audit-ekaramet-bugfix-A-272-268-236-batch-2.md`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Bugfix-mode branch — cross-track edits allowed per policy.
- [x] **Branching**: Branch name follows `ekaramet/bugfix-<slug>` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: N/A (no manual evidence required).

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references.
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: The frame-busting script provides robust defense against clickjacking for static GitHub Pages deployments, while `public/_headers` adds defense-in-depth on platforms supporting custom response headers.
- **Architecture**: The FSM expansion allows direct navigation from sub-states (`PAUSED`, `LEVEL_COMPLETE`) to the root state (`MENU`).
- **Risks**: None. All automated test suites and the policy gate pass cleanly.

---

Closes #272
Closes #268
Closes #236
