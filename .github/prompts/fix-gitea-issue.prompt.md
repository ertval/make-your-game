---
name: fix-gitea-issue
description: Automated loop to retrieve, group, resolve, and verify Gitea issues assigned to Track A (ertval) following TDD.
---

# Fix Gitea Issue Automator

You are an automated agent responsible for processing, resolving, and verifying Gitea issues assigned to **Track A (ertval) — Ertval Karameta** in the `real-time-forum` repository. You must strictly follow the development workflows, architectural constraints, and validation standards of the project.

## Workflow Goal
Your objective is to identify assigned issues in Gitea, group them in batches of three small issues, resolve them using Test-Driven Development (TDD), audit the changes, open a PR with proper linkages, and ensure that both local and remote CI gates pass completely before declaring success.

---

## Step-by-Step Instructions

### Step 1: Issue Discovery and Scoping
1. Use the Gitea CLI (`tea`) to retrieve all open issues assigned to `ekaramet`:
   ```bash
   tea issues list --assignee ekaramet --state open --repo asmyrogl/real-time-forum --fields index,title,state --output simple
   ```
2. **Double-check assignment**: For each issue from the list, run:
   ```bash
   tea issues list --repo asmyrogl/real-time-forum --fields index,assignees --output simple | grep "^<issue-number> "
   ```
   and verify the assignee field contains **only** `Erti Karameta` (one assignee). Discard any issue that also has other names — it must be exclusively assigned to this user.
3. Filter the retrieved issues to identify those that have no open PRs already linked to them. IF THERE ARE open PRs referencing these issues skip them and select others.
4. Group exactly **3 small/related issues** into a single batch. If fewer than 3 issues remain, group the remaining ones together.
5. For the selected batch of issues:
   - Read their descriptions, requirements, and comments in detail.
   - Run:
     ```bash
     tea issues <issue-number> --repo asmyrogl/real-time-forum
     ```
     for each issue to extract precise acceptance criteria and requirements.

### Step 2: Branch Setup
1. Define a branch name that reflects the track and issues being resolved, adhering to the convention in [docs/implementation/agentic-workflow-guide.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/agentic-workflow-guide.md).
   - Format: `ekaramet/A-<NN>-<short-description>` (where `<NN>` is the main ticket or issue number being addressed, or a batch ID).
2. Create and switch to the new branch:
   ```bash
   git checkout -b <branch-name>
   ```

### Step 3: Test-Driven Development (TDD) Implementation
You must strictly follow the bug-fix and implementation workflow from [AGENTS.md](file:///home/ertval/code/zone-modules/make-your-game/AGENTS.md) and [docs/implementation/agentic-workflow-guide.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/agentic-workflow-guide.md):
1. **Write Failing Tests First**: For each issue in the batch, write one or more unit, integration, or E2E tests (using Vitest or Playwright) that reproduce the issue or check the new requirement. Run the test suite and confirm that these new tests fail.
2. **Implement Minimal Fix**: Edit the source files to resolve the issue with the minimal amount of code possible. Adhere to:
   - ECS boundary rules (simulation systems in `src/ecs/systems/` must NOT call DOM APIs; adapters in `src/adapters/` own DOM side effects).
   - No forbidden tech (no canvas, WebGL, or rendering frameworks).
   - Safe DOM sinks (`textContent` / explicit attribute APIs, NO `innerHTML`).
3. **Verify Tests Pass**: Run the tests and confirm they now pass:
   ```bash
   npm run test
   ```
4. **Iterate**: Repeat this cycle for each of the 3 issues until all of them are resolved and all tests pass.

### Step 4: Local PR Audit
Before creating a PR, you must run the PR audit workflow to ensure compliance. THIS IS A MUST:
1. Run the `/pr-audit` workflow (located at `.github/prompts/pr-audit.prompt.md`) in your terminal or trigger the subagent if applicable.
2. Inspect the audit report generated at `docs/audit-reports/pr-audit-<branch-name>.md`.
3. If any checks or requirements fail, fix them on your branch and rerun the audit. Do not proceed until the PR audit passes.

### Step 5: Local Validation
The task is not complete until local policy gates pass.
1. **Run Validation in a New Context**:
   - If possible, spawn a new tool-use context or subagent to perform clean, isolated checks.
   - Run the local policy gate check:
     ```bash
     npm run policy
     ```
2. **Handle Failures**:
   - If the local `npm run policy` gate fails:
     - Retrieve the failure output.
     - Diagnose the failure.
     - Implement the necessary fixes on your branch.
     - Commit and push the updates.
     - Restart this verification loop.
   - Loop this step until all local checks pass completely.

### Step 6: Pull Request Creation
Once local checks and the PR audit pass:
1. Format a conventional commit message with ticket IDs per agentic-workflow-guide convention:
   ```bash
   git commit -a -m "feat(A-<NN>): resolve issues #X, #Y, #Z"
   ```
2. Push the branch to the Gitea remote:
   ```bash
   git push gitea <branch-name>
   ```
3. Generate a PR description that strictly follows the template at [.github/pull_request_template.md]. Save it to the [pr message folder](../../docs/pr-messages).
   - Clearly state the component changes, rationale, and list/link all 3 issue numbers using closing keywords (e.g. `Closes #X, Closes #Y, Closes #Z`).
4. Create the PR using the Gitea CLI (`tea`):
   ```bash
   tea pulls create \
     --title "Track A: Resolve issues #X, #Y, #Z" \
     --description "$(cat <path-to-pr-body-markdown>)" \
     --head <branch-name> \
     --base main \
     --repo asmyrogl/real-time-forum
   ```

---

## Definition of Done
You may only conclude your execution when:
1. All 3 grouped issues are marked as resolved in code and verified by passing tests.
2. A PR is created and linked to the issues.
3. The local `npm run policy` command executes with an exit code of `0`.