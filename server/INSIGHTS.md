# Insights — server

Non-obvious bugs, decisions, and gotchas hit while working in this module.
Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

    ### YYYY-MM-DD — <short title>

    **What:** the decision, in one sentence.
    **Why:** the constraint that forced it.
    **Rejected:** what we tried or considered, and how it failed.

    - **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
      `src/path/to/file.ts:42`

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

_None yet._

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

- **2026-08-06** — `pnpm test` in `server/` reliably fails every
  `*.it.test.ts` suite with `Error: Hook timed out in 120000ms` in this
  sandbox — including run alone (`pnpm exec vitest run
  test/reviews.it.test.ts`) and on a clean, unmodified `main` (verified via
  `git stash`). It's testcontainers failing to spin up its OWN throwaway
  Postgres within the hook timeout here, unrelated to the already-running
  `devdigest-postgres` docker-compose container used for `pnpm dev`. Not a
  regression signal from a code change — after touching `server/`, judge
  correctness from the hermetic (non-`.it.`) suite passing, not this one.

## Open Questions

_None yet._
