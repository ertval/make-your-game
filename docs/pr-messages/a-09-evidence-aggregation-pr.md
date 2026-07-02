# 🚀 Track A: A-09 Evidence Aggregation & Final QA Polish

> **Summary**: Compiles final runtime performance evidence, asset size comparisons, manual evidence sign-offs, and details of the 3-level manual playthrough report for the P4 release milestone.

---

## 📝 Description

### 🔄 What Changed
- **Playthrough Verification Report**: Created [playthrough-report.md](../audit-reports/evidence/playthrough-report.md) detailing the step-by-step verification of Levels 0, 1, and 2, validating keyboard controls, HUD metrics, and audio setting preservation.
- **Asset Size Report**: Created [asset-size-report.md](../audit-reports/evidence/asset-size-report.md) showing detailed visual/audio optimizations. Reduced visual asset footprint by **89.68%** (1.21 MB vs 11.7 MB).
- **Performance Timing Evidence**: Collected real frame Probe stats (`p50`, `p95`, `p99` frame times and FPS) under headless browser execution, compiled into [AUDIT-F-17-F-18.performance.md](../audit-reports/evidence/AUDIT-F-17-F-18.performance.md) and [perf-stats-raw.json](../audit-reports/evidence/perf-stats-raw.json). Meeting all `AGENTS.md` thresholds, including p50 frame time of **0.85 ms** (average 0.94 ms, p95 1.50 ms, p99 2.20 ms).
- **Manual Evidence Sign-Off**: Updated [manual-evidence.manifest.json](../audit-reports/manual-evidence.manifest.json) with verified sign-offs and notes for `AUDIT-F-19`, `AUDIT-F-20`, `AUDIT-F-21`, and `AUDIT-B-06`, including trace recordings.
- **Traceability Matrix**: Updated status of `AUDIT-F-17` through `AUDIT-F-21` and `AUDIT-B-01` through `AUDIT-B-06` to `Executable` in [audit-traceability-matrix.md](../implementation/audit-traceability-matrix.md), linking to their respective markdown evidence files, playwright traces, and correcting test anchors.

### 🎯 Why
- **Validation**: Enforce quality, performance, and correctness gates before shipping the final product.
- **Traceability**: Document empirical evidence showing Ms. Ghostman runs efficiently and adheres to all constraints.

---

## 🧪 Verification & Audit

### ✅ Verification
- [x] **Master Check**: `npm run policy`
> *Note: This command includes linting, all test suites (unit, integration, e2e), and policy gate validations.*

### 📋 Audit Traceability
- **AUDIT-F-17** | `Semi-Automatable` | Verification: `tests/e2e/audit/audit.browser.spec.js` | Evidence: `docs/audit-reports/evidence/AUDIT-F-17-F-18.performance.md`
- **AUDIT-F-18** | `Semi-Automatable` | Verification: `tests/e2e/audit/audit.browser.spec.js` | Evidence: `docs/audit-reports/evidence/AUDIT-F-17-F-18.performance.md`
- **AUDIT-F-19** | `Manual-With-Evidence` | Verification: `docs/audit-reports/manual-evidence.manifest.json` | Evidence: `docs/audit-reports/evidence/AUDIT-F-19.paint.md`
- **AUDIT-F-20** | `Manual-With-Evidence` | Verification: `docs/audit-reports/manual-evidence.manifest.json` | Evidence: `docs/audit-reports/evidence/AUDIT-F-20.layers.md`
- **AUDIT-F-21** | `Manual-With-Evidence` | Verification: `docs/audit-reports/manual-evidence.manifest.json` | Evidence: `docs/audit-reports/evidence/AUDIT-F-21.promotion.md`
- **AUDIT-B-01** | `Fully Automatable` | Verification: `tests/e2e/audit/audit.browser.spec.js` | Evidence: `docs/audit-reports/evidence/AUDIT-F-17-F-18.performance.md`
- **AUDIT-B-02** | `Fully Automatable` | Verification: `vitest tests/e2e/audit/audit.e2e.test.js` | Evidence: `docs/audit-reports/evidence/AUDIT-B-01-B-04.quality.md`
- **AUDIT-B-03** | `Fully Automatable` | Verification: `tests/e2e/audit/audit.browser.spec.js` | Evidence: `docs/audit-reports/evidence/AUDIT-B-01-B-04.quality.md`
- **AUDIT-B-04** | `Fully Automatable` | Verification: `vitest tests/e2e/audit/audit.e2e.test.js` | Evidence: `docs/audit-reports/evidence/AUDIT-B-01-B-04.quality.md`
- **AUDIT-B-05** | `Semi-Automatable` | Verification: `tests/e2e/audit/audit.browser.spec.js` | Evidence: `docs/audit-reports/evidence/AUDIT-B-05.preload-timing.md`
- **AUDIT-B-06** | `Manual-With-Evidence` | Verification: `docs/audit-reports/manual-evidence.manifest.json` | Evidence: `docs/audit-reports/evidence/AUDIT-B-06.overall.md` + `docs/audit-reports/evidence/playthrough-report.md`

---

## ✅ PR Gate Checklist

### 📋 Required Checks
- [x] **Read Standards**: I have reviewed [AGENTS.md](file:///AGENTS.md) and the agentic workflow guide.
- [x] **Policy Compliance**: Ran `npm run policy` locally; all checks pass.
- [x] **Ownership**: Verified files remain within declared ticket ownership scope.
- [x] **Branching**: Branch name follows `ekaramet/A-09` convention.
- [x] **Audit Coverage**: Confirmed full coverage for F-01 through F-21 and B-01 through B-06.
- [x] **Evidence**: Attached Manual-With-Evidence artifacts for F-19, F-20, F-21, and B-06.

### 🏗️ Architecture & Security
- [x] **ECS Isolation**: `src/ecs/systems/` has no DOM references (except `render-dom-system.js`).
- [x] **Adapter Injection**: Simulation systems access adapters only through World resources.
- [x] **Safe Sinks**: Untrusted content uses `textContent` or explicit attribute APIs.
- [x] **No Bloat**: No framework imports or canvas APIs introduced.
- [x] **Dependencies**: Checked dependency and lockfile impact.

---

## 🛡️ Security & Architecture Notes
- **Security**: Strict boundaries enforced: localStorage settings are parsed safely with schema validations. DOM updates use safe textContent properties to prevent injection risks.
- **Architecture**: Time clock is separated cleanly from simulation clock. Inactive clock checks are frozen on pause.
- **Risks**: None. All components have automated unit/integration or E2E tests, and potential flakiness under CI contention has been mitigated with warmup delays.

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
