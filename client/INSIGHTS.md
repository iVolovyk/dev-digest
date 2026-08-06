# Insights — client

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

### 2026-08-06 — No `RunCostBadge` component; reuse plain text + `Stat`

**What:** the cost feature's design brief named a dedicated `RunCostBadge`
component ("2 kinds"), but we did not build it — cost is rendered as plain
mono text via `formatCost()` in the PR list
(`app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`) and via the
existing `Stat` atom in the trace drawer
(`app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`).
**Why:** the actual reference screenshots (PR list, Agent Run sidebar) show
cost as plain text/a plain stat tile — no pill/badge chrome anywhere; user
confirmed explicitly when asked to choose between building the badge or
matching the screenshots as-is.
**Rejected:** building a `RunCostBadge` wrapping the `Badge` primitive, per
the written design brief — rejected as unnecessary chrome that the real
screens don't show. Don't "fix" this later by adding it back; the omission
was intentional and user-approved, not an oversight.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-06** — `client/src/vendor/shared/contracts/*` is a SEPARATE copy
  of the Zod contracts from `server/src/vendor/shared/contracts/*`, not a
  symlink or generated artifact — the two dirs have independent mtimes and
  `adapters.ts` differs in size (client's is a trimmed subset). Adding a
  field to a shared contract (e.g. `cost_usd` on `PrMeta`/`RunStats`/
  `RunSummary`) on the server side does NOT make it visible to the client;
  `client/CLAUDE.md`'s "don't touch vendor, edit at the source" assumes one
  canonical source, but there isn't one — each package's copy must be
  hand-edited to match, or client types/consumers silently don't see the new
  field (no build error, since the client's own copy just lacks it).
  `client/src/vendor/shared/contracts/platform.ts`,
  `server/src/vendor/shared/contracts/platform.ts`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
