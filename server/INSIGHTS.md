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
  **Update 2026-08-06 (later session):** this is environment-dependent, not
  permanent — in a session where the sandbox actually had a working Docker
  daemon, `pnpm test` ran all 22 suites including every `*.it.test.ts` (130
  tests) green in ~25s. Check whether Docker is actually reachable
  (`docker ps`) before assuming `.it.test.ts` will hang; don't skip judging
  by them on faith alone.

- **2026-08-06** — `src/db/seed.ts` inserts a sample review + findings for
  ONE PR on the seeded repo, so `*.it.test.ts` tests must not assume
  `GET /repos/:id/pulls` returns unreviewed PRs by array position (e.g.
  `.json()[0]`) against the shared seeded repo — that PR may already have a
  review. Create a fresh repo via `POST /repos` (with `MockGitClient`/
  `MockGitHubClient` overrides, per the existing "imports PRs idempotently"
  test) when a test needs a guaranteed-unreviewed PR fixture.
  `server/test/integration.it.test.ts`, `server/src/db/seed.ts:135-150`

## Open Questions

_None yet._
