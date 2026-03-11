---
name: review-contributor-pr
description: Review and manage pull requests from external contributors. Use when checking out, reviewing, editing, or merging a PR from a fork.
---

# Review Contributor PR

## Checkout

Contributors submit PRs from their forks. To push changes back (commit message fixes, minor tweaks), add their fork as a remote:

```bash
# Extract fork owner from PR (visible in gh pr view or the PR URL)
git remote add <owner> git@github.com:<owner>/pi-harness.git
git fetch <owner>
git checkout <owner>/<branch> -b <branch>
```

This works when the contributor has "Allow edits from maintainers" enabled (GitHub default).

To push amended commits back:

```bash
git push <owner> <local-branch>:<remote-branch> --force-with-lease
```

## Review Checklist

### 1. Relevance and Conflicts

- Verify the PR targets `main` and is rebased on current `main` (no merge conflicts).
- Confirm the fix/feature is still relevant (hasn't been addressed already).

### 2. Code Correctness

- Read the changed files and verify the code does what the PR description claims.
- Check for edge cases, error handling, and unintended side effects.
- Look for any security concerns.

### 3. Commit Format

This repo uses conventional commits with scopes. Every commit must match:

```
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `chore`, `perf`, `refactor`, `docs`, `test`.
Scopes match directory names: `scout`, `guardrails`, `scripts`, `breadcrumbs`, etc.

If commits don't follow this format, amend them (keep original author, set yourself as committer).

### 4. CI Checks

Run locally before merging:

```bash
pnpm typecheck
pnpm lint
```

Both must pass.

### 5. Merge

Prefer fast-forward merge to keep linear history:

```bash
git checkout main
git merge <branch> --ff-only
git push origin main
```

If fast-forward fails, rebase the branch on main first.

After merge, clean up the local branch:

```bash
git branch -d <branch>
```
