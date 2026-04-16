# Agentic Workflow Guide for Ms. Ghostman

This document is the working guide for a 4-developer team using coding agents in this repository. It turns the repo constraints into an operating model for planning, coding, review, testing, security, and release readiness.

If this guide conflicts with [AGENTS.md](../../AGENTS.md), [docs/requirements.md](../requirements.md), [docs/game-description.md](../game-description.md), or [docs/audit.md](../audit.md), those files win.

## 1. Operating Principles

1. One human owns one slice of work. The agent drafts code, but a human is accountable for the result.
2. Keep every task small enough to review in one pass. Prefer one feature, one ECS system, or one bug fix per branch.
3. Make behavior deterministic. If a change affects timing, input, pause, scoring, or replay state, prove it with tests.
4. Keep simulation pure and DOM side effects isolated. Simulation code must not reach into the DOM.
5. Treat agent output as untrusted until reviewed and tested.
6. Optimize for mergeability. Small PRs and clear ownership reduce conflicts more than parallelism does.

## 2. Team Model for 4 Developers

> **Canonical track ownership is defined in [`docs/implementation/implementation-plan.md` §3](implementation-plan.md#section-3-workflow-tracks-balanced-workload) and detailed in [`docs/implementation/track-a.md`](track-a.md), [`docs/implementation/track-b.md`](track-b.md), [`docs/implementation/track-c.md`](track-c.md), and [`docs/implementation/track-d.md`](track-d.md)**. The tracks are: **Track A** (Engine/CI/Testing), **Track B** (Simulation Gameplay Systems), **Track C** (Gameplay Feedback + Audio), **Track D** (Resources/Rendering/Visual). When this guide conflicts with those documents on task ownership, the implementation docs win.

This guide describes the *process layer* on top of those tracks:

- **Track A owner** (Dev 1): game loop, timing, CI gates, schema validation, and all testing/QA rails. Track A can modify all tests; Tracks B/C/D can modify tests that correspond to files they own.
- **Track B owner** (Dev 2): gameplay simulation systems (components, input, movement, collisions, bombs/explosions, power-ups, ghost AI, gameplay events).
- **Track C owner** (Dev 3): gameplay feedback systems (scoring/timer/lives, pause/progression, HUD/screens/storage) and audio adapter/cue/SFX/music/preload.
- **Track D owner** (Dev 4): resources/map loading, renderer adapter, DOM batching, sprite pools, and visual assets/manifests.

That split is not rigid, but each task must have a single DRI. If a task crosses ownership boundaries, write down the boundary before the agent starts.

Recommended rule for all four devs:

- Do not let two people or agents edit the same subsystem at the same time unless the work is intentionally paired.
- Keep branches short-lived.
- Rebase or sync early and often.
- Use `ticket-tracker.md` as the visible work board with status symbols, Depends on links, and Blocks mapping.

## 3. How to Use Agents Well

Use an agent for bounded work, not open-ended exploration.

A good task brief includes:

- Objective: what must change.
- Scope: exact files or subsystems allowed.
- Out of scope: what the agent must not touch.
- Constraints: performance, ECS boundaries, DOM safety, and style rules.
- Acceptance: tests and manual checks that define done.
- Stop condition: the smallest proof that the task is complete.

Good examples:

- Implement hold-to-move input for one player system and add regression tests.
- Add pause-state timer freeze coverage and verify resume behavior.
- Replace unsafe DOM writes in one HUD path with safe sinks and test them.

Bad examples:

- Make the game better.
- Fix performance.
- Improve architecture everywhere.

If the task is risky, require the agent to work in a draft PR and stop at the first verified pass of the relevant tests.

## 4. Workflow for Each Task

1. Define the slice.
2. Assign one human owner.
3. Give the agent a bounded prompt.
4. Have the agent implement the smallest viable change.
5. Add or update tests in the same branch.
6. Run the relevant checks.
7. Review the diff as a human.
8. Merge only after the PR gate passes.

For bug fixes, follow the repo bug-fix workflow:

1. Reproduce the issue.
2. Add a failing test.
3. Implement the minimal fix.
4. Prove the fix passes.
5. Check nearby systems for regressions.

If no deterministic repro is possible after 2 bounded attempts, document the blocker and attempted repro paths, capture minimal evidence (logs, steps, observed vs expected), and request guidance before broad or risky changes.

## 5. Branch and PR Rules

Every branch should represent one logical change.

- Keep the branch focused on one feature, bug, or refactor.
- Avoid mixing cleanup and behavior changes unless they are inseparable.
- Delete the branch after merge.
- Do not use a feature branch as a shared workspace.
- Rebase or sync before the PR gets large.

PRs should be easy to scan in under 15 minutes.

A good PR description answers:

- What changed?
- Why was it needed?
- How was it tested?
- What is risky or still unknown?

## 6. Pre-PR Gate

A PR is not ready until the following are true.

### Required checks

- Formatting and linting pass for the changed scope.
- Relevant unit tests pass.
- Relevant integration tests pass.
- For each affected audit ID, verification is listed by execution category: Fully Automatable, Semi-Automatable, or Manual-With-Evidence.
- Audit coverage remains explicit and intact for F-01 through F-21 and B-01 through B-06 (no orphaned mappings).
- If this change affects F-19, F-20, F-21, or B-06, required manual evidence artifacts are attached.
- Gameplay-critical changes include performance evidence.
- The diff does not introduce forbidden APIs or unsafe DOM patterns.
- The change does not break the repo’s ECS boundaries.
- Documentation is updated if behavior, constraints, or testing expectations changed.
- The script-driven gate baseline passes locally: `npm run policy`. Run `npm run policy:repo` only as a targeted repo-only rerun.

### Required evidence for gameplay-critical changes

Attach a short note with:

- Scenario tested.
- Browser and machine context.
- Frame-time observations (`p50`, `p95`, `p99`).
- Pause and resume observations.
- Paint usage observations when rendering/compositing changed.
- Layer count and promotion observations when rendering/compositing changed.
- Memory or allocation notes if relevant.
- Evidence artifact paths for any affected Manual-With-Evidence audit IDs.

### Required audit category mapping

For each affected audit ID in `docs/audit.md`, include the execution category in the PR:

- Fully Automatable: automated checks (Vitest and/or Playwright) for F-01 through F-16 and B-01 through B-04.
- Semi-Automatable: Playwright Performance API measurement for F-17, F-18, and B-05.
- Manual-With-Evidence: signed evidence note plus DevTools trace artifacts for F-19, F-20, F-21, and B-06.

## 7. Audit Queries to Check Before PR

Use `../audit.md` as the acceptance checklist. For any change that touches gameplay, input, pause, HUD, rendering, or performance, ask these questions before opening the PR:

### Core functionality

- Does the game run without crashing?
- Does animation run using `requestAnimationFrame`?
- Is the game single player?
- Does the game avoid `canvas`?
- Does the game avoid frameworks?
- Is the game aligned with the approved genre?

### Pause and resume

- Does the pause menu show Continue and Restart?
- Does Continue resume gameplay from the same state?
- Does Restart reset the current run correctly?
- While paused, does rAF stay active without advancing simulation?

### Input and HUD

- Does the player obey movement commands?
- Does hold-to-move work without key spamming?
- Does the timer or countdown work?
- Does score increase on scoring actions?
- Do lives decrease on life-loss events?

### Performance and rendering

- Are there no dropped frames in the relevant scenario?
- Does the game run around 60 FPS?
- Is paint used as little as possible?
- Are layers used as little as possible?
- Is layer promotion intentional and minimal?
- Does the code reuse memory to avoid jank?

### Quality and bonus checks

- Does the project run quickly and effectively?
- Does the code obey the repo’s good practices?
- Is the game implemented with SVG where appropriate for visuals?
- Is the code using asynchronous work only where it actually improves performance?
- Is the project well done overall?

If a PR touches one of these areas, list each affected audit ID, its execution category, and the exact verification artifact or passing test output.

## 8. Security Rules

Security is part of code review, not a separate afterthought.

### DOM and browser safety

- Prefer `textContent`, `createElement`, `appendChild`, and explicit attribute APIs.
- Avoid `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, and string-based event handlers.
- Never route untrusted data into `eval`, `Function`, or string timers.
- Treat local storage and session storage as untrusted input on read.
- Keep rendering and simulation separate so untrusted data does not flow into DOM sinks by accident.

### Input and validation

- Validate external or persisted data on read.
- Use allowlists and length bounds instead of denylists.
- Reject malformed map data, configuration, and saved state early.
- Keep client-side validation as UX only; do not rely on it for trust.

### Dependency and supply-chain hygiene

- Keep lockfiles committed and current.
- Review new dependencies before adding them.
- Minimize lifecycle scripts and other installation-time surprises.
- Do not commit secrets, tokens, or private keys.
- Do not print sensitive data in logs, tests, or debug output.

### Trusted Types and CSP

- Use CSP and Trusted Types where deployment allows.
- Prefer failing closed when a sink can execute script or HTML.
- If a feature needs a richer sink, require a clear justification and a safe path.

## 9. Code Review Checklist

Reviewers should check the following before approving:

- The change is small enough to understand quickly.
- The implementation matches the stated requirement.
- The code keeps ECS boundaries intact.
- The code is deterministic where expected.
- The code does not add unsafe DOM access.
- The code does not add unnecessary allocations in hot paths.
- The code has tests that fail before the fix and pass after it.
- The PR description explains the impact and the verification.
- The change does not break audit coverage.

## 10. Suggested Review Questions

Ask these questions on every non-trivial PR:

- What is the smallest behavior change this PR makes?
- What could regress if this lands?
- How is the behavior verified automatically?
- Which audit questions does this affect?
- Does the PR add any new trust boundary?
- Is there any safer API or simpler approach?
- Could this be split into two smaller PRs?

## 11. Team Cadence

For a 4-dev team, this cadence works well:

- Morning: claim or confirm one task each.
- During work: keep short status updates on blockers and handoffs.
- Before PR: run the local gate and attach evidence.
- During review: review one PR at a time per developer whenever possible.
- After merge: clean up the branch and update `ticket-tracker.md`.

If a task stalls, stop adding scope. Either finish the slice or split it.

### Phase Transitions & Codebase Audits

> **Important Instruction:**
> Every time a phase of the plan tracker is finished, all tracks MUST run prompt `codebase-analysis-audit` (repository prompt file: `.github/prompts/code-analysis-audit.prompt.md`) against the whole codebase and merge their reports.
>
> Then Track A MUST run `.github/prompts/phase-deduplicate-track-audits.prompt.md` to create four deduplicated issue reports (one per track: A/B/C/D) in `docs/audit-reports/<phase>/`.
>
> Each track MUST fix all issues assigned in its track report before closing that phase.

## 12. PR Message and Gate Workflow

This is the canonical workflow for PR messages and gate execution. Keep PR descriptions, local gate runs, and message archival aligned with this section.

The docs entrypoint for the PR contract lives in `docs/implementation/pr-template.md`, with canonical template source in `.github/pull_request_template.md`. This section mirrors that checklist and command flow.

### Branch sequencing

Follow the agreed ticket order and keep branches short-lived and single-purpose.

- Follow the phase-first execution order (`P0 -> P1 -> P2 -> P3 -> P4`) from `ticket-tracker.md` and claim only tickets whose dependencies are complete.
- Typical first-ticket starts are `A-01`, `B-01`, and `D-01`; Track C starts in `P2` only after `A-11`, where `C-03` can begin after `D-01` and `D-03` plus `A-11`, while `C-01` and `C-02` start after `B-04` plus `A-11`.
- Use one branch per ticket slice.
- Use the same branch only for the one logical change it was created for.
- Branches must follow: `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]`.
- Example branch sequence (Track A): `ekaramet/A-01`, `ekaramet/A-02`, `ekaramet/A-03`.
- If you intentionally work without a ticket ID on a docs/process branch, include `process` in the PR body (preferred explicit marker). Policy may also detect process mode from branch name or branch commit text. GENERAL_DOCS_PROCESS still enforces changed-file ownership against the branch owner's mapped track.

### PR message checklist

Before opening a PR, confirm the description and checklist cover all required items:

- [ ] I read AGENTS.md and the agentic workflow guide.
- [ ] I ran `npm run policy` locally.
- [ ] I verified my branch name follows `<owner-or-scope>/<TRACK>-<NN>[-<COMMENT>]` (for example `ekaramet/A-03` or `asmyrogl/B-03-runtime-integration`), or I marked the PR body with `process` for a GENERAL_DOCS_PROCESS branch.
- [ ] I confirmed changed files stay within the declared ticket track ownership scope.
- [ ] I ran the applicable local checks for this change.
- [ ] I listed each affected audit ID with execution type (Fully Automatable, Semi-Automatable, or Manual-With-Evidence) and linked the test output or evidence artifact.
- [ ] I confirmed full audit coverage remains mapped for `F-01..F-21` and `B-01..B-06`.
- [ ] If affected, I attached Manual-With-Evidence artifacts for `F-19`, `F-20`, `F-21`, and `B-06`.
- [ ] I checked security sinks and trust boundaries.
- [ ] I checked architecture boundaries.
- [ ] I checked dependency and lockfile impact.
- [ ] I requested human review.

Layer boundary confirmations (repository-specific):

- [ ] `src/ecs/systems/` has no DOM references except `render-dom-system.js`.
- [ ] Simulation systems access adapters only through World resources (no direct adapter imports).
- [ ] `src/adapters/` owns DOM and browser I/O side effects.
- [ ] Untrusted UI content uses safe sinks (`textContent` / explicit attributes), not HTML injection.
- [ ] No framework imports or canvas APIs were introduced in this change.

Local test command reference (run what applies to your change and list what you ran in the PR `## Tests` section):

- Baseline for every change: `npm run check`, `npm run test`, `npm run policy`
- Unit-only slices: `npm run test:unit`
- Cross-system or adapter changes: `npm run test:integration`
- Browser/runtime behavior changes (pause, input, HUD, rendering, gameplay): `npm run test:e2e`
- Audit-map updates: `npm run test:audit`
- Manifest/schema updates: `npm run validate:schema`
- Local checks rerun with prepared metadata: `npm run policy:checks:local`
- Repo-only troubleshooting rerun: `npm run policy:repo`

### Manual gate workflow (required)

Run the local checks before opening a PR. For ticketed branches, include the branch ticket ID in commit messages before running local checks (policy scripts analyze commit metadata). For intentional docs/process branches without a ticket ID, include `process` in the PR body so policy can classify GENERAL_DOCS_PROCESS mode; this mode relaxes ticket association only and still applies owner-scoped file ownership checks.

1. Commit your changes:

```bash
git commit -a -m "feat(<TICKET-ID>): <description>"
```

2. Run the single PR gate:

```bash
npm run policy
```

3. If that fails, rerun the narrower command that matches the failure:

```bash
npm run policy:quality
npm run policy:checks:local
npm run policy:forbid
npm run policy:header
npm run policy:approve
```

4. Run the repo gate only when you need an isolated repo-only rerun:

```bash
npm run policy:repo
```

5. If the isolated repo rerun fails, run the narrower command that matches the failure:

```bash
npm run policy:forbidrepo
npm run policy:headerrepo
npm run policy:trace
```

6. If you changed HTML/JS tech stack boundaries, run explicit static scan:

```bash
npm run check:forbidden
```

### PR message template

Use this structure in PR descriptions:

```md

## What changed
- 

## Why
- 

## Tests
- 

## Audit questions affected
- 

## Security notes
- 

## Architecture / dependency notes
- 

## Risks
- 
```

### Recording rule

After a ticket is merged, update the matching ticket entry in `ticket-tracker.md` to `[x]`. Storing the final PR body in `docs/pr-messages/` is **required**. You must also ensure that the final PR audit report produced by `.github/prompts/pr-audit-verification.prompt.md` is saved in `docs/audit-reports/`.

### Gate hierarchy

- `npm run policy` runs the default all-in-one gate. It covers quality/checks/scans/approval when PR metadata is present, and falls back to repo-wide checks when it is not.
- `npm run policy:repo` runs the repo-wide gate. It covers repo forbidden-tech scans, repo source headers, and traceability and dependency pairing checks.
- `npm run policy:quality` is the narrow quality-only rerun.
- `npm run policy:checks:local` is the preferred local rerun for checks because it runs `policy:prep` before `policy:checks`.
- `npm run policy:checks` is the direct rerun for branch-ticket format validation, ticket list membership, single-track ownership checks, and the GENERAL_DOCS_PROCESS process-marker fallback (owner-scoped ownership enforcement still applies).
- `npm run policy:forbid` and `npm run policy:forbidrepo` isolate forbidden-tech failures.
- `npm run policy:header` and `npm run policy:headerrepo` isolate source-header failures.
- `npm run policy:trace` isolates repo traceability and dependency pairing failures.
- `npm run policy:approve` isolates approval failures.

## 13. Practical Standard

If you only remember one rule, use this one:

> Every agent task must be small, owned, testable, and reviewable before it becomes a PR.

That single rule keeps the team fast without turning the repository into a pile of unreviewable agent output.

## 14. Automated Enforcement

Use repository automation to block unsafe or incomplete PRs before merge.

### What the gate enforces

- Independent human approval on every PR.
- Required PR checklist completion.
- Audit doc and audit test synchronization.
- Security sink checks for unsafe DOM and script-adjacent APIs.
- Architecture boundaries, especially ECS system isolation from the DOM.
- Dependency lockfile pairing when dependency metadata changes.
- Local project checks when code or test files are touched.

### What the gate should block

- `../audit.md` changes without matching traceability and test updates.
- Source changes that introduce `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, string timers, or CommonJS imports.
- ECS system changes that touch the DOM outside the dedicated render adapter.
- Dependency edits that skip the lockfile.
- PRs that are still missing the required human review approval.

### How to use it

- Keep the PR template filled out.
- Treat a green gate as the minimum for review readiness, not the finish line.
- If the gate fails, fix the root cause in the same branch before asking for another review.
- The workflow now delegates policy enforcement to `scripts/policy-gate/*.mjs`, so local and CI gates share the same implementation.
