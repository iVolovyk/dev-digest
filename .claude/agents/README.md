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
| [`test-writer`](./test-writer.md) | `sonnet` | Writes frontend/backend tests to the repo's per-package conventions. Never edits the source under test, never weakens a test to make it pass. | `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `Skill` |
| [`architecture-reviewer`](./architecture-reviewer.md) | `opus` | Read-only layering review against `onion-architecture` / `frontend-architecture`; every finding carries a `file:line` citation. | `Read`, `Grep`, `Glob`, `Bash` |
| [`plan-verifier`](./plan-verifier.md) | `sonnet` | Read-only, per-item PASS/FAIL check of an implementation against a `planner` plan. Not a code-quality review. | `Read`, `Grep`, `Glob`, `Bash` |
| [`doc-writer`](./doc-writer.md) | `sonnet` | Turns a plan or a finished feature into documentation with inline Mermaid, placed per the docs-placement table. Markdown only. | `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `Skill` |

Common to all seven: before acting, each agent checks whether the request is
specific enough (a Step 0 clarify gate — present in every agent in this set, not
just `planner`/`researcher`), and does not take on a role that belongs to another
agent in this set.

`researcher`, `architecture-reviewer`, and `plan-verifier` are **read-only** — each
achieves that by omitting `Edit`/`Write` from its `tools:` allowlist, not by a
separate enforcement mechanism.

`planner` and `implementer` carry the full 12-skill catalog (`onion-architecture`,
`fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
`frontend-architecture`, `next-best-practices`, `react-best-practices`,
`react-testing-library`, `zod`, `typescript-expert`, `security`, `mermaid-diagram`)
in their frontmatter, loaded into context immediately at startup — without calling
`Skill`. The newer four carry a scoped subset of the same catalog: `test-writer`
carries 10, `architecture-reviewer` 4, `doc-writer` 4, and `plan-verifier` carries
**none, deliberately** — giving it domain skills would invite it to drift into
generic code-quality commentary instead of per-item plan verification, which is
its whole reason to exist. `pr-self-review` is never listed in any `skills:` field
— it's a gate that fires automatically via the `PreToolUse` hook before
`git push`/`gh pr create`, not something any agent here invokes.

**A three-way split to keep straight:** `pr-self-review` asks "is anything in this
diff a merge blocker?" (hook-fired, normalizes to CRITICAL/WARNING/SUGGESTION);
`architecture-reviewer` asks "is this the right shape?" (rule-id + `file:line`);
`plan-verifier` asks "was the plan delivered?" (PASS/FAIL per numbered item). None
of the three substitutes for either of the other two.

## Input / output artifacts

| Agent | Input | Output |
|---|---|---|
| `planner` | Feature request (from the user); `<module>/AGENTS.md`; `<module>/INSIGHTS.md` (strategic sections — `Decisions`, `What Works`, `What Doesn't Work`); existing `<module>/specs/*-plan.md`, if any | A single `<primary-module>/specs/<feature-slug>-plan.md` file following a fixed template (`status: draft`, Context / Modules affected / Architectural constraints / Skills implementer will apply / Steps / Testing plan / Out of scope / Open questions) |
| `implementer` | Approved `<module>/specs/*-plan.md` from `planner`; `<module>/INSIGHTS.md` (tactical sections — `Recurring Errors & Fixes`, `Tool & Library Notes`, `Codebase Patterns`) | Modified code files; `pnpm test`/`pnpm typecheck` results for each affected package; new `<module>/INSIGHTS.md` entries if needed; a report (files, plan steps done/deferred, tests, hand-off list for architecture/security review) |
| `researcher` | A specific, verifiable question (internal and/or external) | A structured report in the response (no files): `## Report: repository research` or `## Report: external research`, with Findings / Evidence / References / Could not determine sections |
| `test-writer` | A behaviour/regression class to cover (from a plan or the request); `TESTING.md`; the package's `README.md` → Testing; neighbouring existing tests | New/updated test files in that package's test location; command results per package; a report incl. failures left unfixed |
| `architecture-reviewer` | A scoped diff/branch/path set; the two `references/this-project.md` files; `cd server && pnpm arch` output | A report (no files): Violations / Pre-existing (added to) / Clean / Could not determine, each finding with `file:line` |
| `plan-verifier` | A `planner` plan file + the finished diff; any requirements stated outside the plan | A report (no files): per-item PASS/FAIL/PARTIAL/NOT VERIFIABLE table + testing-plan results + out-of-scope work found |
| `doc-writer` | A plan, a diff, or a described feature; the target document; the placement table | Updated/created `*.md` with inline Mermaid; a report of files, sections, placement rationale, and hand-offs |

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

## Sources of rules — `test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer`

- **[`TESTING.md`](../../TESTING.md)** — the source for `test-writer`'s per-package
  test-layout conventions (which directory, which file suffix, hermetic vs.
  DB-backed) and its integration-leaning testing philosophy.
- **`.claude/skills/*/references/this-project.md`** (`onion-architecture` and
  `frontend-architecture`) — the source `architecture-reviewer` reads before
  reporting anything, so it reports only new violations against the documented
  backlog of known deviations, not the whole backlog as if it were new.
- **`<primary-module>/specs/*-plan.md`**, as produced by `planner` — the sole input
  `plan-verifier` enumerates against; it never verifies against an unwritten or
  implied plan.
