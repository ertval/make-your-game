# AGENTS.md 2026 Evaluation Report

## Objective
Evaluate whether AGENTS.md is optimal for 2026 JS browser game agent instructions under the constraints in requirements.md and audit.md.

## Inputs
- Project instruction file: AGENTS.md
- Constraint docs: docs/requirements.md and docs/audit.md
- Web research: 5 independent subagent searches (instruction design, game-performance instruction patterns, contradiction prevention, audit-to-acceptance conversion, security/tooling policy encoding)

## Overall Verdict
AGENTS.md is strong but not fully optimal.

It is highly aligned with core performance and architecture requirements (DOM-only, no canvas/framework, requestAnimationFrame, smooth key-hold controls, low paint/layer usage, memory reuse), but it is missing measurable acceptance criteria and contains some instruction-quality risks that reduce reliability for autonomous agents.

Practical score:
- Requirement alignment: 8.5/10
- Audit operability (is it testable as written): 6.5/10
- 2026 instruction-engineering quality: 7/10
- Overall: 7.3/10

## Coverage Matrix: requirements.md and audit.md vs AGENTS.md

| Constraint Area | Requirement/Audit Expectation | AGENTS.md Coverage | Status |
|---|---|---|---|
| 60 FPS target | At least 60 FPS, avoid drops | Explicitly emphasizes pristine 60+ FPS and anti-GC strategy | Covered |
| requestAnimationFrame | Must use rAF properly | Explicitly requires strict rAF loop and precise timing | Covered |
| Pause behavior | Pause menu + no frame-drop effect while paused | Explicitly says logic freezes while rAF continues for smooth pause UI | Covered |
| Controls | Hold-to-move, no key-spam/stutter | Explicitly instructs key-state tracking on keydown/keyup | Covered |
| No canvas/framework | Plain JS/DOM only | Explicitly forbids canvas/WebGL/frameworks | Covered |
| Minimal paint/layers | Paint and layer use should be minimal but not zero | Explicitly calls compositor-only motion and minimal-but-nonzero layer promotion | Covered |
| Single-player | Game is single player | Not explicitly stated in AGENTS.md | Partial |
| Pre-approved game genre | Must match pre-approved list | Not explicitly constrained in AGENTS.md | Missing |
| Score/timer/lives HUD | Must exist and work | Only indirectly referenced (textContent for HUD), no explicit requirement to implement all metrics | Partial |
| Pause menu options | Must include Continue + Restart | Not explicitly required in AGENTS.md | Partial |
| Verification in DevTools | Audit requires confirming FPS/paint/layers behavior | AGENTS.md gives implementation guidance but no mandatory profiling/verification procedure | Partial |

## What AGENTS.md Does Very Well

1. Strong performance-first architecture direction.
- It directly encodes frame-jank causes and mitigation (pooling, compositor-only properties, key-state polling).

2. Correct pause-time principle for the audit profile.
- “Simulation freeze + rAF continues” is a good design for no frame drops while paused.

3. High-value rendering constraints.
- transform/opacity-only animation and layer moderation map well to DevTools paint/layer audits.

4. Security-safe DOM baseline.
- textContent preference and anti-legacy patterns reduce common DOM and maintainability risks.

5. Clear alignment with no-framework/no-canvas project rule.

## Why It Is Not Fully Optimal Yet (Main Gaps)

### 1. Missing measurable pass/fail criteria
Issue:
- The file says what to do but not how to prove it.

Impact:
- Agents may claim compliance without objective evidence.

Needed:
- Numeric thresholds and evidence requirements (for example p95 frame time target, dropped-frame threshold, long-task count, required trace artifacts).

### 2. Missing explicit mapping to audit checklist items
Issue:
- Audit asks concrete checks (pause menu options, HUD fields, genre compliance), while AGENTS.md stays generic.

Impact:
- Coverage blind spots during implementation.

Needed:
- Must-level bullets for timer/score/lives, Continue/Restart behavior, and pre-approved game genre adherence.

### 3. Instruction wording over-constrains some implementation choices
Issue:
- “Mutable state in hot loops is mandatory” can clash with pure-function architecture outside hot loops.

Impact:
- Encourages broad mutation where selective immutability is safer and easier to test.

Needed:
- Narrow scope wording: mutation mandatory only in verified hot paths, not globally.

### 4. Contradiction-risk wording for bug workflow
Issue:
- “No quick fixes” + “have subagents try to fix” is good intent, but does not define fallback when no reproduction test is feasible.

Impact:
- Potential execution stalls.

Needed:
- Fallback policy: if reproducible test cannot be created within bounded attempts, define next action.

### 5. No quality-gate workflow in instructions
Issue:
- Tooling is named (Biome), but no hard “done criteria” sequence.

Impact:
- Inconsistent completion quality.

Needed:
- Require lint + tests + perf checks before task completion for relevant changes.

## 2026 Best-Practice Upgrades Recommended

### P0: Make AGENTS.md Auditable
Add explicit measurable acceptance language:
1. FPS and frame-time threshold definition.
2. Dropped-frame tolerance threshold and measurement window.
3. Required profiling evidence (DevTools trace note) for loop/render/input changes.
4. Required checklist coverage for pause menu options and HUD metrics.

### P1: Tighten instruction reliability
1. Add precedence/conflict clause inside AGENTS.md scope (what wins if rules collide).
2. Add strict MUST/SHOULD/MAY semantics.
3. Add bounded fallback for bug workflow when reproduction is blocked.

### P2: Improve security and delivery governance
1. Add hard ban list of unsafe DOM sinks for untrusted data.
2. Add CI done criteria: Biome clean, tests pass, and relevant performance checks pass.
3. Add branch/PR gate suggestion for protected integration.

## Suggested Patch Snippets (Ready to Add)

### A. Audit-linked measurable performance clause
```md
## Performance Acceptance (Required)
- MUST maintain gameplay frame stability at 60 FPS target.
- For update/render/input changes, include verification evidence:
  - DevTools Performance trace summary
  - No sustained dropped-frame pattern during normal play and pause/resume flows
  - requestAnimationFrame remains active during pause while simulation time is frozen
```

### B. Requirement-linked gameplay coverage clause
```md
## Functional Coverage (Required)
- MUST preserve single-player gameplay design.
- MUST preserve pause menu actions: Continue and Restart.
- MUST implement and maintain HUD metrics: timer/countdown, score, and lives.
- MUST keep game concept aligned with approved genre constraints from requirements.md.
```

### C. Safer mutation scope clause
```md
## State Mutation Scope
- In-place mutation is REQUIRED only for verified hot loops where profiling shows allocation-driven risk.
- Outside hot loops, prefer clarity and testability (pure transforms are acceptable).
```

### D. Bug workflow fallback clause
```md
## Bug-Fix Workflow
- Prefer: reproduce -> write failing test -> implement fix -> prove with passing test.
- If a deterministic repro test cannot be produced after bounded attempts, document blocker, capture minimal repro evidence, and request user guidance before risky changes.
```

## Final Assessment
AGENTS.md is a high-quality foundation for this project and already aligned with most technical constraints from requirements and audit.

To be optimal for 2026 autonomous coding workflows, it should add measurable acceptance criteria, explicit audit-item coverage, and conflict/fallback semantics. With those updates, it becomes both performant and verifiable.

## Research Sources (Representative)
- GitHub Copilot custom instruction precedence and effective instruction guidance: https://docs.github.com/en/copilot/concepts/prompting/response-customization
- VS Code Copilot instruction priority and customization guidance: https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- OpenAI prompt/instruction engineering and eval guidance: https://developers.openai.com/api/docs/guides/prompt-engineering
- OpenAI Model Spec (instruction hierarchy and untrusted input handling): https://model-spec.openai.com/
- web.dev rendering performance: https://web.dev/articles/rendering-performance
- web.dev optimize long tasks: https://web.dev/articles/optimize-long-tasks
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP CI/CD Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html
