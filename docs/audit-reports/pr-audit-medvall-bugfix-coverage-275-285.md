# 🛡️ Audit: `medvall/bugfix-coverage-275-285`
## 🏁 Verdict: **FAIL**

> PR [#291](https://github.com/ertval/make-your-game/pull/291) — grading issues **#275 (CI-11, reduced-motion)** and **#285 (CI-13, dev-mode DOM budget)**.
> The code is architecturally clean and the failing gate is caused by pre-existing e2e flakes (not this PR), but the PR does **not** meet the strict merge bar: a blocking narrative/implementation drift and two unmet *mandatory* verification requirements.

---

## 🎯 Scope & Compliance
- **Ticket ID**: `#275 (label CI-11)` + `#285 (label CI-13)` — labels are **ad-hoc**, not `ticket-tracker.md` / `AUDIT-*` IDs | **Track**: `D` (owner `medvall`), spanning `D/C` (#275) and `D/A` (#285)
- **Audit Mode**: `GENERAL_DOCS_PROCESS` (bugfix-branch → owner-scoped process checks; confirmed by the gate's own resolution banner)
- **Base Comparison**: PR scope = `37e24a6..HEAD` (4 commits, +223 lines, 5 files): `805c862` #285, `0c5276c` #275, `072120d` pr-message, `9548f28` `!important`→custom-props

### 📦 Deliverables & Verification
- **PASS**: `#275` CSS reduced-motion override — every current animation/transition routes through one of the 8 zeroed `--anim-*-duration` custom properties (`animations.css:203-211`); no hardcoded non-zero duration exists anywhere in `styles/`, so nothing is missed **today**.
- **PASS**: `#275` e2e spec shape — `emulateMedia({reducedMotion:'reduce'})`, triggers the start overlay, asserts `animation`/`transition` durations `=== 0` (`tests/e2e/reduced-motion.spec.js`). Passed in the full run.
- **PASS**: `#285` `assertDomElementBudget` function + wiring — `> 500` throws / `= 500` passes, dev-gated via `isDevelopment()`, surfaced through the startup `catch → renderCriticalError` (`src/main.ecs.js:277,290-302,855-861`). 4 unit tests exercise it; e2e `AUDIT-CI-09` DOM-budget test passed (10.0s).
- **FAIL**: `#275` **mandatory red-first TDD** — the issue states *"You MUST write a FAILING test that reproduces this issue BEFORE implementing the fix."* The PR body openly admits the e2e "passed against unmodified code" — the test was **green from the start**.
- **PARTIAL**: `#285` verification requirement — the issue requires asserting *"the **application** throws a **visible** initialization error"* with a mocked >500-element load. The 4 tests exercise the **standalone function only**; no test drives `bootstrapApplication` → `renderCriticalError` with an over-budget document.
- **Out-of-Scope Findings**: `none` — `src/main.ecs.js` (Track A) is legitimately carried under the bugfix bypass; no dependency/lockfile changes.

---

## 🔍 Audit Findings & Blockers
### 🚨 Critical (Blockers)
1. **Documentation ⇆ implementation drift (blocking).** The PR body and `docs/pr-messages/bugfix-coverage-275-285-pr.md:26,44` describe the #275 fix as a **universal `!important` safety net** — `*, *::before, *::after { …-duration: 0s !important }`. The **shipped** code (commit `9548f28`) is a **different, narrower** approach: `:root { --anim-*-duration: 0s }` zeroing **8 enumerated variables**. The body's central claim — *"compliance no longer depends on every future selector being hand-added"* — is **false for what shipped**: the custom-property approach only neutralizes declarations that reference one of those 8 variables, and is therefore **weaker/more fragile** for any future or literal-duration animation than the `!important` net it describes. `!important` is **not** forbidden anywhere (no stylelint, AGENTS.md silent, policy gate does not scan it), so the swap was stylistic — but the narrative was never updated. Merging would land a PR whose description materially misrepresents the merged code.

### ⚠️ High/Medium/Low
1. **(Medium)** `#275` violates the ticket's explicit *MUST write a failing test first* (self-admitted green-from-start).
2. **(Medium)** `#285` verification is incomplete — tests the function, not the mandated **application-level visible init error** (`bootstrap → renderCriticalError` path is never driven with >500 elements).
3. **(Low)** Site-wide e2e omits the animation assertion — `reduced-motion.spec.js:78` checks `site.maxTransition` only; `scanMotion` already computes `maxAnimation` but it's unused site-wide, so a stray non-overlay decorative **animation** would escape both tests.
4. **(Low)** Traceability — `#275`/`#285`/`CI-11`/`CI-13` map to **no** row in `docs/implementation/audit-traceability-matrix.md`; the reduced-motion and DOM≤500 MUSTs remain unmapped even after adding their tests.
5. **(Low)** PR-template — bespoke bugfix layout, no canonical `AUDIT-* | Execution Type | Verification | Evidence` block.

> [!IMPORTANT]
> ### ⛑️ Path To PASS (Required)
> 1. **Fix the narrative (blocker).** Rewrite the #275 section of the PR body + pr-message to describe the shipped `:root` custom-property approach and **delete** the false "no longer depends on every future selector" guarantee — **or** restore a genuinely universal `*, *::before, *::after { animation-duration:0s; transition-duration:0s }` fallback (it can coexist with the custom props) and keep the claim honest.
> 2. **Satisfy #285's mandated test.** Add a `bootstrapApplication` test with `isDevelopment()=true` and a `documentRef` whose `querySelectorAll('*')` returns `{length:501}`, asserting the app throws **and** `renderCriticalError`/overlay surfaced the error.
> 3. **Address #275 red-first** — either provide failing-first evidence or explicitly reclassify the ticket (its premise "zero implementation" was inaccurate; per-animation handling already existed).
> 4. *(Recommended)* Add `expect(site.maxAnimation).toBe(0)` to the site-wide test; add matrix rows mapping both MUSTs to their new tests; register/replace the `CI-11`/`CI-13` labels.

---

## 📋 Requirements, Audit & Drift
- **REQ IDs**: reduced-motion is an `AGENTS.md:161` MUST (not in `requirements.md`); DOM≤500 is `AGENTS.md:208` MUST (mirrored `README.md:287`) | **AUDIT IDs**: none mapped (labels are ad-hoc)
- **PARTIAL**: Coverage evidence — new tests exist and pass, but neither MUST is mapped in the traceability matrix.
- **PASS**: Manual evidence (F-19/F-20/F-21/B-06) unaffected — reduced-motion only zeroes durations; DOM guard is dev-only; no paint/layer/promotion or production render path changes (matrix sign-off intact).
- **FAIL**: Drift — **documentation drift** (PR body describes unshipped `!important` net; false robustness claim). **No** feature/gameplay drift and **no** technical/architecture drift.

---

## 🛠️ Automated Gate Summary
- **FAIL**: `npm run policy -- --require-approval=false` (**exit=1**, duration≈**354s**). Failure isolated to `policy:quality` → `test:e2e` (**4 failed / 58 passed**). Unit: **1298 passed**. Biome, schema, sbom, forbidden, header, trace all green.
- **Root cause = pre-existing e2e flakes, NOT this PR.** The 4 failures were all `Test timeout of 60000ms exceeded` (contention), in code paths this PR does not touch:
  - `audit.browser.spec.js:324` AUDIT-B-05 long-task • `race-condition.spec.js:34` pause/resume simTime • `render-desync-bugs.spec.js:84` bomb sprite • `track-c-integration.spec.js:9` pause menu
- **Verification Pass (isolation re-run)**: all 4 **PASS alone**, collapsing from 60s+ timeouts to **2.7s / 2.5s / 1.1s / 2.6s**. Confirmed environmental flakes (match the repo's documented flaky clusters), not regressions. The new `reduced-motion.spec.js` and `AUDIT-CI-09` DOM-budget test passed in the full run.
- **Net**: the gate as-run is **red on known flakes**; a clean serial/isolated run of the changed-scope tests is green. The gate must be green (or flakes quarantined) for merge, but no PR-attributable test failure exists.

---

## ✅ Policy Matrix
- **PASS**: Ticket/Track Context — bugfix mode resolved to Track D (owner `medvall`); cross-track bundle explicitly allowed.
- **PASS**: Ownership & PR Template — ownership bypass **legitimate** (`medvall` is a registered Track-D owner; `BUGFIX_BRANCH_PATTERN` match; owner-prefix vs GitHub login `edvallm` is irrelevant to the gate). *Template body PARTIAL (non-blocking).*
- **PASS**: ECS DOM Boundary & Adapter Injection — `src/ecs/systems/` untouched; the only new DOM access (`document.querySelectorAll('*')`) is at the composition root, dev-gated.
- **PASS**: Forbidden Tech (canvas/WebGL/frameworks) — none introduced (scan of 3 changed JS files + repo-wide 189-file scan green).
- **PASS**: Security Sinks (innerHTML/eval/timers) — none; breach message is plain `textContent` via `renderCriticalError`.
- **PASS**: Timing, Input, & Rendering Invariants — unaffected (dev-only guard; CSS scoped to the reduced-motion media query).
- **PASS**: New Files Header Comments — the one new file (`reduced-motion.spec.js`) has a conformant header; header gate green.
- **PARTIAL**: Audit Traceability Matrix Mapping — no rows for reduced-motion / DOM≤500; ad-hoc CI-11/CI-13.
- **FAIL**: No Gameplay/Document/Technical Drift — **documentation drift** present (see Blocker #1).

---

## 📄 Final Report Metadata
- **Date**: 2026-07-04
- **READY_FOR_MAIN**: **NO**
- **Note**: Failure is driven by (a) a blocking PR-narrative/implementation drift and (b) two unmet *mandatory* per-ticket verification requirements — **not** by the flaky e2e gate, which is confirmed PR-neutral. The underlying code (reduced-motion CSS + dev-mode DOM budget assertion) is sound and close to mergeable once the narrative is corrected and #285's application-level test is added.
