---
name: pr-self-review
description: "Routes the current local diff to whichever of this repo's domain skills (onion-architecture, security, react-best-practices, etc.) actually apply to the changed files, runs each against just those files, and normalizes findings into the app's own CRITICAL/WARNING/SUGGESTION scale. A CRITICAL finding is a real merge blocker: the PreToolUse hook on `gh pr create`/`git push` reads the gate artifact this skill writes and refuses the command until it's clean or the run is stale."
when_to_use: "Triggers: self review, review before PR, pr self review, self-review, ready to open a PR, can I open a PR, pre-PR check. Also invoked by the PreToolUse hook's block message when `gh pr create` or `git push` is attempted without a fresh clean run. Ukrainian: перевір перед PR, чи можна відкривати PR, самоперевірка перед PR, зроби self review."
license: MIT
metadata:
  version: 1.0.0
  updated: "2026-08-10"
  maintainer: dev-digest
---

# PR Self Review

Diff-scoped, skill-routed review that gates PR creation. Not a generic
code reviewer (see `/code-review` for that) — it exists to run the
domain-specific skills this repo already has (`onion-architecture`,
`security`, `react-best-practices`, …) precisely against the files each
one is about, and to make a CRITICAL finding actually block `gh pr
create`/`git push`, not just show up in a report someone can ignore.

Routing table: `routing.md`. Severity normalization: `severity-map.md`.
Read both before running step 3.

## What this skill does not do

- Does not re-run `pnpm typecheck` / `pnpm test` / `pnpm arch` — those
  already run in CI (`.github/workflows/*.yml`) and via the `onion-architecture`
  dependency-cruiser gate. Running them again here would just duplicate CI.
- Does not touch GitHub branch protection. The block only holds inside a
  Claude Code session — see "Non-goals" note below.

## Step 1 — Compute diff scope and hash

```bash
DIFF_HASH=$({ git diff main...HEAD; git diff; git diff --cached; } | shasum -a 1 | awk '{print $1}')
CHANGED_FILES=$({ git diff --name-only main...HEAD; git diff --name-only; git diff --name-only --cached; } | sort -u)
```

`DIFF_HASH` must be computed with this exact command — the `PreToolUse`
hook recomputes it the same way to decide whether a prior run is still
valid. If `CHANGED_FILES` is empty, stop and say so; there's nothing to
review.

## Step 2 — Filter do-not-touch paths

Check `CHANGED_FILES` against the do-not-touch list in `routing.md`
(`server/clones/**`, `*/src/vendor/**`). Any match is reported directly
as a CRITICAL "do-not-touch" finding — do not route it to a skill for
style review, do not review its contents further.

## Step 3 — Route remaining files to skills

Match every remaining file against `routing.md`'s glob table. Build a
skill → file-list map. If the map is empty (e.g. diff is only
`*.md`/`*.json` outside the tables), skip to Step 6 with zero findings.

## Step 4 — Run each matched skill

For each skill in the map, spawn one `Agent` (read-only; `Explore` fits —
it only needs to read the skill doc and the diff, not edit anything):

> Load the `<skill-name>` skill and review ONLY these files against its
> guidance, restricted to what actually changed in the diff (not the
> whole file): `<file-list>`. Diff for reference: `<the relevant hunks>`.
> Report each finding as `{file, line, severity(native to this skill),
> title, rationale, suggestion}`. Do not report anything the skill's own
> text would rate as safe to skip (e.g. `security`'s LOW-confidence
> items — see the skill's own reporting rules).

Run the matched skills' agents independently — one skill's review does
not need another's output. If only one skill matched, skip the agent and
just apply the skill directly; spawning an agent for a single skill adds
nothing.

## Step 5 — Normalize severities

Map every finding's native severity to `CRITICAL | WARNING | SUGGESTION`
using `severity-map.md`. When a skill's scale doesn't map 1:1, follow that
file's "must/should/consider" heuristic, and when in doubt, round down.

## Step 6 — Report

Print a Markdown report, CRITICAL findings first, grouped by skill:

```markdown
## PR Self Review

### CRITICAL (blocks PR)
- **[security]** `server/src/modules/pulls/routes.ts:42` — missing ownership check on delete
  IDOR: any authenticated user can delete another user's PR review.
  Fix: compare `review.userId === req.user.id` before the delete.

### WARNING
- **[onion-architecture]** `server/src/modules/pulls/service.ts:10` — imports `db` directly
  Application ring should go through its own repository, not `src/db/**`.

### SUGGESTION
...

**N critical, M warning, K suggestion.** <Verdict: "Fix the CRITICAL items
before opening a PR." | "Nothing blocking — safe to open a PR.">
```

If nothing was found at all, say so plainly and still write the gate
artifact (Step 7) with `criticalCount: 0` — the hook needs the artifact to
exist and be fresh even on a clean run.

## Step 7 — Write the gate artifact

Write `.claude/pr-self-review-status.json` (git-ignored):

```json
{
  "diffHash": "<DIFF_HASH from step 1>",
  "ranAt": "<UTC ISO-8601, e.g. $(date -u +%Y-%m-%dT%H:%M:%SZ)>",
  "criticalCount": 0,
  "findings": [
    { "skill": "security", "file": "server/src/modules/pulls/routes.ts", "line": 42,
      "severity": "CRITICAL", "title": "...", "rationale": "...", "suggestion": "..." }
  ]
}
```

This is the only thing the `PreToolUse` hook reads — it cannot run an LLM,
so nothing here is optional: a missing or stale `diffHash` reads to the
hook exactly like a `criticalCount > 0` run (blocked, "run PR Self Review
first").

## Non-goals

This only gates `gh pr create` / `git push` run through a Claude Code
session with the hook installed. It does not stop a push from a plain
terminal or a merge via the GitHub web UI — that would need a required
GitHub Actions check plus branch protection, which is out of scope here
(see the repo's `pr-self-review` plan discussion for why).
