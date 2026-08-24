---
name: engineering-insights
description: >-
  Reads and records DevDigest's curated engineering insights. Use at the START
  of any task to read the INSIGHTS.md of the module the request concerns, and
  at the END of any non-trivial task to record what was learned back into that
  same file. Covers which module a finding belongs to, which section it goes
  in, the specificity bar an entry must clear, and the duplicate check that
  runs before writing. Triggers: "insights", "INSIGHTS.md", "wrap up", "what
  did we learn", "record this", "lesson learned", "session review", "retro",
  end of a session in which something non-obvious was discovered.
---

# engineering-insights

A two-half loop over the `INSIGHTS.md` files. **Read** at the start of a task,
**record** at the end. Insights are module-local by design: a session working
in `client/` reads `client/INSIGHTS.md`, not the other three. Knowledge lives
next to the code it is about.

## Step 1 — Read first (mandatory, unconditional)

This step is not optional and does not wait for "starting to code." The
instant the user's request names or implies a module, run it — before your
first reply, even if the reply turns out to be just an answer to a question:

1. Resolve the module from the request using the table below.
2. Read that `INSIGHTS.md` in full. It is capped and short — read it, don't grep.
3. **Say in one line which file you read and whether it was relevant.** Example:
   `Read server/INSIGHTS.md — nothing on SSE.` A silent read gets skipped; the
   sentence is what makes it real.

If a curated file answers the question, cite it instead of re-deriving from
code. This is the order root `AGENTS.md` already sets out: `specs/` → `docs/`
→ `INSIGHTS.md` → source.

## Module resolution

| The work touches                                                      | File                         |
| ----------------------------------------------------------------------| ----------------------------- |
| `server/**`, including `src/vendor/shared/**`                         | `server/INSIGHTS.md`          |
| `client/**`                                                           | `client/INSIGHTS.md`          |
| `reviewer-core/**`                                                    | `reviewer-core/INSIGHTS.md`   |
| `e2e/**`, `scripts/e2e.sh`                                            | `e2e/INSIGHTS.md`             |

There is no root-level `INSIGHTS.md`. Edge cases:

- **`server/src/vendor/shared/**` → `server/INSIGHTS.md`, always** — even if
  the finding surfaced while working in `client/`. That folder is
  `@devdigest/shared`, the actual source of the Zod contracts every package
  consumes; `server/` is where it lives.
- **`client/src/vendor/ui/**`, `client/src/vendor/shared/**` → `client/
  INSIGHTS.md`,** and only for insights about *consuming* it — the vendored
  code itself is not ours to change.
- Work that spans ≥2 packages, or is about the workflow itself
  (`scripts/dev.sh`, CI, package managers): file it in the module the session
  mainly worked in, and name the other module(s) it concerns in the entry
  text. If this keeps happening, that's a signal a root `INSIGHTS.md` should
  be added — raise it as an Open Question rather than improvising a new file.

## Step 2 — Record last (conditional)

### 2a. Gate — is there anything to record?

Writing is conditional; reading (Step 1) was not. Judge the session by feel,
not by counting. A typo, a rename, a routine feature that went exactly as
expected → **write nothing, say "nothing worth recording," stop.** Recording
noise is worse than recording nothing.

If something non-obvious did happen, collect candidates and rank them —
highest signal first:

1. **User corrections** — an explicit "no, do it this way." Highest signal
   there is; the repo was wrong or the agent's default was wrong.
2. **Approaches that failed** — what was tried and abandoned, and why.
3. **Repeated friction** — the same error or workaround hit more than once.
4. **Conventions discovered by reading code** — things `AGENTS.md` doesn't say.
5. **Dependency and toolchain quirks.**

**Cap at 3 entries per session**, even if more candidates exist. If everything
looks worth writing, the bar is being applied too loosely.

### 2b. Write

For each surviving candidate:

1. **Read the target file** before writing it — even though Step 1 already
   read it once, re-read now: the point is to confirm the candidate isn't
   already covered before a single character is appended.
2. **Check for a duplicate** — `grep -i '<key identifier>' <module>/
   INSIGHTS.md`. If the insight is already there (exact or near-duplicate),
   **write nothing** for it, or **refine the existing entry** instead of
   appending a near-copy: sharpen the claim, update the date, add evidence.
3. **Append, never rewrite.** Insert the new entry directly under the right
   section heading (newest first within that section) as a targeted
   insertion — locate the heading, add the block right after it, touch
   nothing else. **Never regenerate or overwrite the file's full contents**;
   if the change you're about to make would replace the whole file rather
   than insert into it, stop and redo it as an insertion instead.
4. If an entry contradicts an existing one, do **not** write both. Correct the
   old one **in place** — edit only that entry's lines — and note what
   changed; do not touch surrounding entries.
5. **After writing, verify nothing was lost:** every entry that existed
   before this write must still be present, verbatim, after it. The diff
   should show additions only (plus, for case 4, a change confined to the one
   corrected entry) — never a deletion of unrelated content. If anything
   existing is missing or altered, treat that as a bug and stop rather than
   continuing.

Never delete an entry that still holds. When something an entry warns about
gets fixed in code, don't delete it either — mark it, so the next reader knows
the warning is historical:

```markdown
- **2026-07-31** — … original claim … **Fixed 2026-08-14 in `server/src/…`.**
```

### 2c. Report

One line per action, then stop. No trailing commentary.

```
server/INSIGHTS.md — added under What Doesn't Work: 422 on empty body …
Skipped: grounding-gate note (already covered by the 2026-07-31 entry)
```

## Which section

| Section                    | What belongs there                                                  |
| --------------------------- | --------------------------------------------------------------------|
| `Decisions`                | A choice made, with the alternative that was rejected               |
| `What Works`               | An approach that solved something and should be reused              |
| `What Doesn't Work`        | A dead end — the section most often skipped, and the most valuable  |
| `Codebase Patterns`        | A convention you had to discover by reading the code                |
| `Tool & Library Notes`     | A quirk of a dependency, CLI, or the toolchain                      |
| `Recurring Errors & Fixes` | A symptom you will hit again, and its cause                         |
| `Open Questions`           | Something left unresolved, so the next session knows                |

## Entry format

`Decisions` keeps a three-line prose form:

```markdown
### 2026-07-31 — Mechanical grounding gate, not a trusted model

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what was tried, and how it failed.
```

Every other section takes a dated bullet — claim first, evidence last:

```markdown
- **2026-07-31** — plain `npm test` in `e2e/` fails flows 02/04/05 against the
  dev DB: flow 02 follows the home redirect to the *first* repo and a dev DB
  has several. Use `npm run e2e:hermetic`.
  `e2e/specs/02-repo-overview.flow.json`
```

House style: hard-wrap at ~79 columns, backtick every path and identifier,
quote the **actual** error string, and end with a `path:line` or a runnable
command wherever one exists.

## The bar

An entry must be actionable **cold** — the next session reads it and knows
what to do without re-deriving anything.

| ✗ Noise                      | ✓ Insight                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "e2e tests can be flaky"     | "flows assume exactly one seeded repo — flow 02 follows the home redirect to the *first* one, so the dev DB fails 02/04/05; use `npm run e2e:hermetic`" |
| "be careful with migrations" | "`relation … does not exist` on a fresh clone means migrations were skipped — they do not run on boot. `cd server && pnpm db:migrate`"                 |
| "Promises can be tricky"     | "`Promise.all()` over the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10"                                       |

**The test: if it would be obvious to anyone reading the code, don't write
it.** Generic advice is the failure mode — "use async carefully" is true
everywhere and therefore useful nowhere.

## Keeping the files lean

- Roughly **5 entries per section**. Past that, signal drops.
- When an entry becomes stable reference material, **promote it into
  `<module>/docs/` and delete it here.** That's what keeps these short.
- An entry that no longer holds is worse than no entry. Correct or mark it.

## Anti-patterns

- Writing an entry because the session was long, rather than because
  something was learned.
- A title instead of content — "fixed the SSE bug" tells the next session
  nothing. Write the claim, not the label.
- Filing everything under `What Works`.
- Appending a fifth variation of an entry that already exists.
- Recording what `AGENTS.md`, `README.md`, or `docs/` already says.
- **Regenerating the whole file instead of inserting into it.** Any edit that
  isn't a clean insertion (or, for a correction, a change confined to the one
  entry being corrected) risks silently dropping earlier entries — the file
  is append-only precisely so this can't happen.

## What this skill does not do

It captures insights only. It does not review code, write documentation,
update `specs/`, or run tests. `INSIGHTS.md` is not a session diary — it holds
durable findings, not a record of what happened.
