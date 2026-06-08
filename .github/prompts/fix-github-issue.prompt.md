---
name: fix-github-issue
description: Automated loop to retrieve, group, resolve, and verify GitHub issues assigned to Track A (ertval) following TDD.
---

# Fix GitHub Issue Automator

You are an automated agent responsible for processing, resolving, and verifying GitHub issues assigned to **Track A (ertval) — Ertval Karameta** in the `make-your-game` repository. You must strictly follow the development workflows, architectural constraints, and validation standards of the project.

## Workflow Goal
Your objective is to identify assigned issues, group them in batches of three small issues, resolve them using Test-Driven Development (TDD), audit the changes, open a PR with proper linkages, and ensure that both local and remote (GitHub Actions CI) gates pass completely before declaring success.

---

## Step-by-Step Instructions/

### Step 1: Issue Discovery and Scoping
1. Use the GitHub CLI (`gh`) to retrieve all open issues assigned to `ertval`:
   ```bash
   gh issue list --assignee ertval --json number,title,body,labels,state
   ```
2. Filter the retrieved issues to identify those belonging to **Track A (ertval) — Ertval Karameta** AND there are no open PRs to resolve them! IF THERE ARE open PRs for these issues skip them and select others!
3. Group exactly **3 small/related issues** into a single batch. If fewer than 3 issues remain, group the remaining ones together.
4. For the selected batch of issues:
   - Read their descriptions, requirements, and comments in detail.
   - Run:
     ```bash
     gh issue view <issue-number>
     ```
     for each issue to extract precise acceptance criteria and requirements.

### Step 2: Branch Setup
1. Define a branch name that reflects the track and issues being resolved, **the branch name always starts with `bugfix-`**, adhering to the convention in [docs/implementation/agentic-workflow-guide.md](file:///home/ertval/code/zone-modules/make-your-game/docs/implementation/agentic-workflow-guide.md).
   - Format: `ekaramet/bugfix-A-<NN>-<short-description>` (where `<NN>` is the main ticket or issue number being addressed, or a batch ID).
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
Before creating a PR, you must run the PR audit workflow to ensure compliance:
1. Run the `/pr-audit` workflow (located at `.github/prompts/pr-audit.prompt.md` or `.agents/workflows/pr-audit.md`) in your terminal or trigger the subagent if applicable.
2. Inspect the audit report generated at `docs/audit-reports/pr-audit-<branch-name>.md`.
3. If any checks or requirements fail, fix them on your branch and rerun the audit. Do not proceed until the PR audit passes.

### Step 5: Pull Request Creation
Once local checks and the PR audit pass:
1. Format a conventional commit message:
   ```bash
   git commit -a -m "feat(Track A): resolve issues #X, #Y, #Z"
   ```
2. Push the branch to the remote repository:
   ```bash
   git push origin <branch-name>
   ```
3. Generate a PR description that strictly follows the template at [.github/pull_request_template.md]. Save it to the [pr message folder](../../docs/pr-messages).
   - Clearly state the component changes, rationale, and list/link all 3 issue numbers using GitHub closing keywords (e.g. `Closes #X, Closes #Y, Closes #Z`).
4. Create the PR using the GitHub CLI:
   ```bash
   gh pr create --title "Track A: Resolve issues #X, #Y, #Z" --body-file <path-to-pr-body-markdown> --head <branch-name> --base main
   ```

### Step 6: Post-PR Validation and CI Verification Loop
The task is not complete until both local policies and remote GitHub CI gates pass.
1. **Run Validation in a New Context**:
   - If possible, spawn a new tool-use context or subagent to perform clean, isolated checks.
   - Run the local policy gate check:
     ```bash
     npm run policy
     ```
2. **Monitor GitHub CI Gate**:
   - Query the GitHub CLI to monitor the status of the PR's check runs:
     ```bash
     gh pr checks
     ```
   - Poll or schedule checks to verify if the CI checks are still running or have finished:
     - Target state: All checks pass (green).
3. **Handle Failures**:
   - If the local `npm run policy` gate fails, or if any remote GitHub Action CI check fails:
     - Retrieve the failure logs (either locally or via `gh run view` / `gh pr checks --watch`).
     - Diagnose the failure.
     - Implement the necessary fixes on your branch.
     - Commit and push the updates.
     - Restart this verification loop.
   - Loop this step until all local checks and remote CI checks pass completely.

---

## Definition of Done
You may only conclude your execution when:
1. All 3 grouped issues are marked as resolved in code and verified by passing tests.
2. A PR is created and linked to the issues.
3. The local `npm run policy` command executes with an exit code of `0`.
4. The remote GitHub CI checks for the PR are reported as successful by the GitHub CLI.
