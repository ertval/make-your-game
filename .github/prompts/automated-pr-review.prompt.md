---
name: automated-pr-review
description: Find open PRs not created by current user, audit them in a git worktree, approve/merge on success, comment audit report on failure, and clean up.
---

## Prompt

You are an automated PR review agent. Your goal is to find external open PRs, audit them against the project quality and architectural gates, and finalize reviews.

Always follow the RTK command prefix rule to minimize token usage when running command-line tools.

### Prerequisites
- GitHub CLI (`gh`) must be authenticated.
- Git worktree capabilities must be active.

### Procedure

#### 1. Find Target PR
1. Get the current authenticated GitHub user:
   ```bash
   rtk gh api user -q .login
   ```
2. List open PRs:
   ```bash
   rtk gh pr list --state open
   ```
3. Select an open PR that:
   - Is not authored by the current user.
   - Is open for review.
   - Note the `<PR-NUMBER>` and the `<BRANCH-NAME>`.

#### 2. Create Audit Worktree
1. Fetch latest changes from remote:
   ```bash
   rtk git fetch origin
   ```
2. Create a temporary worktree named `audit-worktree` pointing to the PR branch:
   ```bash
   rtk git worktree add audit-worktree origin/<BRANCH-NAME>
   ```

#### 3. Run PR Audit
1. Navigate to `audit-worktree` and install dependencies:
   ```bash
   rtk npm ci
   ```
2. Perform the `/pr-audit` procedure (Scope, Policy, and Gate Readiness audits).
3. Execute the final automated policy gate:
   ```bash
   rtk npm run policy -- --require-approval=false
   ```
4. Collect the final audit verdict and report content. The report should be generated at `docs/audit-reports/pr-audit-<branch-name-slug>.md`.

#### 4. Finalize Review
- **If PASS (All policy gates exit 0, no blockers or drift):**
  1. Approve the PR:
     ```bash
     rtk gh pr review <PR-NUMBER> --approve --body "PR Audit passed successfully. Verified ECS boundaries, constant consolidation, and all tests passing."
     ```
  2. Merge the PR (e.g., using `--squash` or standard merge):
     - Attempt merging via GitHub CLI:
       ```bash
       rtk gh pr merge <PR-NUMBER> --squash
       ```
     - If the API token has insufficient merge privileges (GraphQL resource not accessible), merge locally on `main` and push:
       ```bash
       rtk git checkout main
       rtk git pull origin main
       rtk git merge origin/<BRANCH-NAME> --no-ff -m "Merge pull request #<PR-NUMBER> from <BRANCH-NAME>"
       rtk git push origin main
       ```
- **If FAIL (Blocked, policy gate fails, or drift detected):**
  1. Post the generated audit report as a comment on the PR:
     ```bash
     rtk gh pr comment <PR-NUMBER> --body-file audit-worktree/docs/audit-reports/pr-audit-<branch-name-slug>.md
     ```

#### 5. Clean Up Worktree
1. Remove the worktree folder:
   ```bash
   rtk git worktree remove --force audit-worktree
   ```
2. Ensure you return your local workspace to your original active branch.
