# Custom subagents

A map of the subagents defined in this folder (`.claude/agents/*.md`). Each file is
the agent's full system prompt; this is just a summary, without duplicating that text.
See the agent's own file for details.

Not to be confused with `docs/agent-prompts/` — that holds the system prompts of the
product's *built-in reviewer agents* (security/performance/general reviewer), which
run in the `reviewer-core` engine over PR diffs in the DB. The agents below are a
development tool for DevDigest itself in Claude Code.

## Summary table

| Agent | Model | Responsibility | Permissions (tools) |
|---|---|---|---|
| [`planner`](./planner.md) | `opus` | Turns a feature request into a structured Development Plan. Does not write code. | `Read`, `Grep`, `Glob`, `Bash`, `Skill`, `WebFetch`, `WebSearch`, `Write` |
| [`implementer`](./implementer.md) | `sonnet` | Executes an already-approved plan: edits code, runs tests/typecheck. Does not issue an architecture/security verdict. | `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `Skill` |
| [`researcher`](./researcher.md) | `sonnet` | Gathers facts (in the repository and/or externally) and returns a structured report. Does not modify files. | `Read`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch` |

Common to all three: before acting, each agent checks whether the request is
specific enough (Step 0 in `planner`/`researcher`), and does not take on a role that
belongs to another agent in this set.

`planner` and `implementer` additionally carry the same `skills:` catalog (12
project skills — `onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `frontend-architecture`,
`next-best-practices`, `react-best-practices`, `react-testing-library`, `zod`,
`typescript-expert`, `security`, `mermaid-diagram`) in their frontmatter, loaded
into context immediately at startup — without calling `Skill`. `pr-self-review` is
mentioned in both only as a gate that they don't run themselves, but that fires
automatically via the `PreToolUse` hook before `git push`/`gh pr create`.

## Input / output artifacts

| Agent | Input | Output |
|---|---|---|
| `planner` | Feature request (from the user); `<module>/AGENTS.md`; `<module>/INSIGHTS.md` (strategic sections — `Decisions`, `What Works`, `What Doesn't Work`); existing `<module>/specs/*-plan.md`, if any | A single `<primary-module>/specs/<feature-slug>-plan.md` file following a fixed template (`status: draft`, Context / Modules affected / Architectural constraints / Skills implementer will apply / Steps / Testing plan / Out of scope / Open questions) |
| `implementer` | Approved `<module>/specs/*-plan.md` from `planner`; `<module>/INSIGHTS.md` (tactical sections — `Recurring Errors & Fixes`, `Tool & Library Notes`, `Codebase Patterns`) | Modified code files; `pnpm test`/`pnpm typecheck` results for each affected package; new `<module>/INSIGHTS.md` entries if needed; a report (files, plan steps done/deferred, tests, hand-off list for architecture/security review) |
| `researcher` | A specific, verifiable question (internal and/or external) | A structured report in the response (no files): `## Report: repository research` or `## Report: external research`, with Findings / Evidence / References / Could not determine sections |

## Sources of rules — `planner` and `implementer`

Both agents inherit and explicitly reference rules from the root `AGENTS.md`
(symlinked as `CLAUDE.md`), rather than reinventing them:

- **[`AGENTS.md`](../../AGENTS.md) → "Read when"** — the "Reading is mandatory" rule:
  as soon as a request names or implies a module, that module's `INSIGHTS.md` is
  read via the `engineering-insights` skill before responding. `planner` reads the
  strategic sections, `implementer` the tactical ones (split so they don't
  duplicate each other's work).
- **[`AGENTS.md`](../../AGENTS.md) → "Build/test"** — the source for `implementer`'s
  "Run tests and typecheck" step (`pnpm test` / `pnpm typecheck` from the package's
  directory).
- **The `engineering-insights` skill** — defines the read/write format for
  `INSIGHTS.md` and the "when to write" condition (a non-trivial, not-yet-documented
  finding), which `implementer`'s step 6 relies on.
- **The `pr-self-review` skill** + the [`pr-self-review-gate.sh`](../hooks/pr-self-review-gate.sh)
  hook — the source of the constraint "don't call `pr-self-review` yourself and
  don't run `git commit`/`push`/`gh pr create`" in `implementer`: the gate already
  fires forcibly via `PreToolUse`, so the agent doesn't need to and must not
  intervene.
- **The catalog of 12 project skills** (see table above) — the shared "dictionary"
  of architecture and best-practice rules; `planner` is required to populate the
  plan's "Skills implementer will apply" section from this catalog only, so that
  `implementer` can physically cover everything the plan specifies.
