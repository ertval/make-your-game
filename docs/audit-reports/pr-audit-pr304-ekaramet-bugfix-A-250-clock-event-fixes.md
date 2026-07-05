# 🛡️ Audit: `ekaramet/bugfix-A-250-clock-event-fixes` (PR #304)
## 🏁 Verdict: **FAIL** — *merge-blocked on gate hygiene only; implementation is correct*

> **Independent reviewer audit** (asmyrogl) of [PR #304](https://github.com/ertval/make-your-game/pull/304).
> Distinct from the author's self-audit that ships inside the PR
> (`docs/audit-reports/pr-audit-ekaramet-bugfix-A-250-clock-event-fixes.md`).
>
> **Read this first:** The *code* for all three issues is implemented correctly and is
> fully covered by passing unit/integration tests. The FAIL verdict is **not** about
> the implementation logic. It reflects two non-code gate items: (1) the canonical
> `npm run policy` umbrella gate exited **1** on this run (root cause = **proven-flaky**
> e2e under suite contention — all 5 failures pass in isolation in 5.8s), and (2) minor
> confirmed technical/documentation drift. The Path to PASS is trivial and listed below.

---

## 🎯 Scope & Compliance
- **Ticket IDs**: #250 = **DEAD-02**, #256 = **DEAD-08**, #238 = **BUG-03** | **Track**: `A` (single track ✔)
- **Audit Mode**: `GENERAL_DOCS_PROCESS` (bugfix-branch bypass; see Policy Matrix)
- **Base Comparison**: `merge-base(main, HEAD)=1ef20e4 .. 9e1baa8` — 11 files, +190 / −35
- **Note on tracking**: #250/#256/#238 are **GitHub issue numbers**, not internal tracker IDs
  (tracker space is `A-01..A-14`, etc.). Deliverable specs live in
  `docs/audit-reports/phase-3-4/audit-report-p3-4-consolidated-2026-07-02.md`, not in
  `ticket-tracker.md` / `track-a.md`.

### 📦 Deliverables & Verification
- ✅ **#250 (DEAD-02)** — Removed unreachable `if (processMode)` block in `assertTicketAssociation`
  (`scripts/policy-gate/run-checks.mjs`, was ~L227-234). Verified genuinely dead: an earlier
  unconditional `if (processMode) return createProcessFallback(...)` at `run-checks.mjs:190-196`
  guarantees any later statement runs only when `processMode` is falsy. No orphaned code —
  `createProcessFallback` (def L143, calls L171/L191) and `processMode` (L64,92,104,180,190,244…)
  remain in use. **Correct & behavior-preserving.**
- ✅ **#256 (DEAD-08)** — Doc comments added to `HIGH_SCORE_STORAGE_KEY` (`storage-adapter.js:11`)
  and `AUDIO_CUE_MAPPING` (`audio-integration.js:84`); exports retained; test asserts both still
  import and match. **Correct (informational ticket, fully satisfied).**
- ✅ **#238 (BUG-03)** — Canonical drain relocated to end of `stepFrame` (`bootstrap.js:1057-1060`,
  `const events = eventQueue ? drain(eventQueue) : []`), returned in the frame result
  (`bootstrap.js:1069`); audio runner switched `drain`→`peek` (`audio-integration.js:66,307`);
  redundant rAF-loop drain removed from `main.ecs.js`. **Ordering verified correct** (see Critical
  check below). **Correct — memory-leak on null-audio path is genuinely fixed.**
- **Out-of-Scope Findings**: `none` — all source edits stay within the three tickets' declared
  Track A files.

---

## 🔍 Audit Findings & Blockers

### 🚨 Critical (Blockers)
1. **None in the implementation.** The single decisive automated gate (`npm run policy`) exited **1**,
   but failure isolation proves the cause is **flaky e2e under suite contention**, not this PR
   (see Automated Gate Summary). Because the canonical gate is red on its run, merge is
   procedurally blocked until a clean gate run is produced.

### ⚠️ High/Medium/Low
1. **[LOW–MEDIUM · Technical/Doc drift]** The `audio-cue-system` now `peek`s (read-only) but still
   declares `write: [eventQueueResourceKey]` with a now-**false** comment
   *"drain() clears the queue, so this system writes the event-queue resource"* (`bootstrap.js:148-149`).
   Impact is **not** a correctness/scheduler bug — `resourceCapabilities` is a capability grant/guard,
   not a parallel-conflict scheduler (systems run sequentially per phase) — but the `write` grant is
   now vestigial/over-permissive and the comment misrepresents the code.
2. **[LOW · Doc drift]** Three additional stale "drain" comments contradict the new `peek` behavior:
   `bootstrap.js:120` ("maps **drained** gameplay events"), `bootstrap.js:361-362` ("appended last …
   so it **drains every gameplay event**"), and `audio-integration.js:53-55` (module header still says
   the runner uses `drain` and does **not** `peek` — doubly wrong).
3. **[LOW · Test fidelity #238]** The dedicated new test (`bootstrap-extended.test.js:287-298`) is a
   **10-iteration unit** test using manual `enqueue('TestEvent', …)`, whereas the ticket specified a
   **100-iteration integration** test driving **real event-producing gameplay** with a null audio
   adapter. Boundedness is proven (asserts `events.length === 0` each frame), and the two updated
   190-frame `a-05-integration.test.js` blocks (L553-575, L638-660) exercise real gameplay with an
   absent adapter — so intent is covered in aggregate, but the literal spec test does not exist.
4. **[LOW · Test quality #250]** The DEAD-02 test (`policy-utils.test.js:454-467`) is a **brittle
   source-text grep** (reads the file as a string, slices between function-name anchors, asserts no
   second `if (processMode)`), not a behavioral assertion. Meets the ticket's loose wording but breaks
   if functions are renamed/reordered.

> [!IMPORTANT]
> ### ⛑️ Path To PASS (Required if FAIL)
> 1. **Produce a green gate run** (blocker): re-run `npm run policy -- --require-approval=false` on a
>    quiet machine, or re-run `npm run test:e2e` until the flaky audit/render/stress specs pass
>    together. Proven flaky — the 5 failures pass in isolation in **5.8s** (`--workers=1 --retries=0`).
>    Consider quarantining/retry-annotating AUDIT-F-14, render-desync #84/#104/#248, and the
>    race-condition simTime stress spec to stop them gating unrelated PRs.
> 2. **(Recommended, not strictly blocking)** Fix the drift: drop the vestigial
>    `write: [eventQueueResourceKey]` grant and correct the 4 stale `drain`/`peek` comments
>    (`bootstrap.js:120,148-149,361-362`; `audio-integration.js:53-55`).
> 3. **(Optional)** Strengthen the #238 test toward the ticket's 100-iteration integration spec, and
>    make the #250 test behavioral rather than a source-text grep.

---

## 📋 Requirements, Audit & Drift
- **REQ IDs**: none (issue-driven bugfixes) | **AUDIT IDs**: DEAD-02 / DEAD-08 / BUG-03
  (defined only in the phase-3-4 consolidated report)
- ✅ **Coverage evidence**: 1298/1298 vitest tests pass (`policy:quality → test:coverage`); the 4
  changed/added test files pass in isolation (bootstrap-extended 12/12, policy-utils 36/36,
  audio-integration 36/36, a-05-integration 5/5).
- ✅ **Manual evidence (F-19/20/21/B-06)**: undisturbed — no diff references or backing files touched.
- ⚠️ **Technical/Doc drift**: **PRESENT (LOW–MEDIUM)** — vestigial `write` capability + 4 stale
  comments (findings ⚠️1–2). **Feature/audio drift: NONE** — cues still fire (ordering verified).
  **Traceability drift: LOW** — #250/#256/#238 leave no `ticket-tracker`/`audit-traceability-matrix`
  footprint (accepted under bugfix mode, but no record is created).

### 🔬 Critical check — #238 ordering (no audio regression)
`stepFrame` runs `world.runRenderCommit(...)` at `bootstrap.js:1045`, which dispatches the
render-phase `audio-cue-system` (`bootstrap.js:139`, `phase:'render'`). That system `peek`s the
queue **before** the new drain at `bootstrap.js:1059-1060`. Both use the **same** resolved
`eventQueueResourceKey` (default `'eventQueue'`) — no key divergence. `peek()` returns a sorted copy
without mutating (`event-queue.js:113-120`); `drain()` clears + resets `orderCounter`
(`event-queue.js:78-100`). **Audio observes every event, then the queue is cleared exactly once per
frame.** ✔

---

## 🛠️ Automated Gate Summary
- ❌ **`npm run policy -- --require-approval=false`** — **exit=1, duration≈731s (12m11s)**.
  Failure isolated to **Phase 1 `policy:quality` → `test:e2e`**: **5 failed / 55 passed (12.0m)**.
  Signatures: `net::ERR_NETWORK_IO_SUSPENDED`, `Target page/browser has been closed`, and multiple
  `Test timeout of 60000ms exceeded` (individual tests hung 8.4m) = severe suite contention /
  webserver suspension.
- ✅ **Failure isolation** (orchestrator, narrow):
  - `policy:checks` → **PASS** (bugfix-mode; owner `ekaramet` = Track A; ownership check skipped)
  - `policy:forbidden` → **PASS** (9 changed + 188 repo files clean)
  - `policy:header` → **PASS** (5 files; 2 new files are `docs/*.md`, no new source headers required)
  - `policy:trace` → **PASS** (repo-wide invariants; matrix/manifest untouched)
  - biome `check` → **PASS**; vitest `test:coverage` → **PASS (1298/1298)**
- ✅ **Verification pass** — the 5 failing e2e specs re-run in isolation (`--workers=1 --retries=0`):
  **5 passed (5.8s)**. Failures are **flaky/environmental, not PR-caused.** None of the failing
  specs (bomb-sprite #84, pellet-DOM #104, power-up-icon, AUDIT-F-14 HUD, pause/resume race) touch
  the PR's code paths (policy script, storage/audio adapters, drain relocation).

---

## ✅ Policy Matrix
- ✅ **Ticket/Track Context Valid** — single Track A; issue-driven bugfix via bugfix-branch mode
- ✅ **Ownership & PR Template Respected** — owner `ekaramet` owns Track A; PR body fills all required
  sections. *Observation:* PR ships the author's own **PASS** self-audit — noted, not a substitute
  for this independent review.
- ✅ **ECS DOM Boundary & Adapter Injection** — no `src/ecs/systems/` files touched; adapters resolved
  via World resources
- ✅ **Forbidden Tech (canvas/WebGL/frameworks)** — none introduced
- ✅ **Security Sinks (innerHTML/eval/timers)** — none introduced (`var`/`require`/XHR clean)
- ✅ **Timing, Input, & Rendering Invariants** — accumulator/rAF/resume unaffected; drain relocation is
  runtime-equivalent (drained every frame, correct order)
- ✅ **New Files Header Comments** — the 2 new files are docs (`.md`), no source-header requirement
- ⚠️ **Audit Traceability Matrix Mapping** — N/A for GitHub-issue bugfixes; no matrix footprint created
- ⚠️ **No Gameplay/Document/Technical Drift** — **gameplay: none**; **technical/documentation: present
  (LOW–MEDIUM)** — vestigial `write` capability + 4 stale `drain`/`peek` comments

---

## 📄 Final Report Metadata
- **Date**: 2026-07-04
- **READY_FOR_MAIN**: **NO** — *gate hygiene only.* The implementation of #250/#256/#238 is correct
  and test-covered. Merge is blocked solely on (a) a clean `npm run policy` run (current red is
  proven-flaky e2e) and, recommended, (b) the LOW–MEDIUM drift cleanup. No code-logic blocker exists.
- **Reviewer evidence**: `.agents/scratch/scope-audit.md`, `.agents/scratch/policy-audit.md`,
  `.agents/scratch/gate-audit.md`, `.agents/scratch/policy-gate-run.log`,
  `.agents/scratch/e2e-isolation-rerun.log`
