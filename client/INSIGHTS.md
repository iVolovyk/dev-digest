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

### 2026-08-06 — Extended `PrMeta` for list-row findings, ignored the `PrRowView` stub

**What:** added a `findings: {critical,warning,suggestion}` field directly to
the `PrMeta` contract (both vendor copies) and consumed it straight off `pr`
in `PRRow.tsx`, rather than mapping through the pre-existing
`PrRowView.findings` type in `client/src/lib/types.ts`.
**Why:** `PrRowView.findings` uses uppercase keys (`{CRITICAL,WARNING,
SUGGESTION}`), but the already-tested backend aggregator
(`server/src/modules/pulls/status.ts`'s `SeverityCounts`/`rollupSeverities`)
uses lowercase keys — using the stub as-is would need a second remapping
layer for no benefit, and `PRRow.tsx` already consumes every other field
straight off `PrMeta`, never through a view-model.
**Rejected:** producing/consuming `PrRowView` for real. Left the stub in
place (unrelated dead code, out of scope to delete) but it still has zero
references — a future session touching PR-list types should not assume it's
wired up.

### 2026-08-07 — PR-detail severity indicator is per-run (Timeline), not a page-wide toolbar

**What:** removed a page-wide severity toolbar above "Review runs" (3
aggregate `SeverityBadge`s filtering every `ReviewRunAccordion`
simultaneously) and replaced it with clickable severity icons on each
individual run row inside `RunHistory` (the Timeline), each opening a
popover scoped to just that run's findings of that severity. No PR-wide
filter state exists anymore — removed `?severity=` from the URL, and the
`severityFilter` prop from `FindingsPanel`/`ReviewRunAccordion`/
`FindingsTab`.
**Why:** the actual reference screenshot (PR detail, "Agent runs" tab)
shows small icon+count badges attached to each Timeline run row — not a
section-level toolbar; user pointed at the screenshot and asked for the
Timeline rows specifically, and confirmed removing the aggregate toolbar
rather than keeping both.
**Rejected:** keeping the aggregate PR-wide toolbar alongside the new
per-run icons — rejected by the user as two different ways to filter the
same thing, which would confuse rather than help.

## What Works

- **2026-08-07** — severity badges (PR list `PRRow`, PR-detail `RunHistory`
  rows) render ONLY for severities with count > 0, with a plain fallback
  (a muted "—" dash on the list, plain "{n} finding(s)" text on the
  Timeline) when every count is zero — never a 0-count badge. This matches
  the reference screenshots (e.g. a PR with only suggestions shows a single
  💡 badge, not three badges with two reading "0"), discovered by re-reading
  the screenshot closely, not from an explicit instruction.
  `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-06** — `client/src/vendor/shared/contracts/*` is a SEPARATE copy
  of the Zod contracts from `server/src/vendor/shared/contracts/*`, not a
  symlink or generated artifact — the two dirs have independent mtimes and
  `adapters.ts` differs in size (client's is a trimmed subset). Adding a
  field to a shared contract (e.g. `cost_usd` on `PrMeta`/`RunStats`/
  `RunSummary`) on the server side does NOT make it visible to the client;
  `client/AGENTS.md`'s "don't touch vendor, edit at the source" assumes one
  canonical source, but there isn't one — each package's copy must be
  hand-edited to match, or client types/consumers silently don't see the new
  field (no build error, since the client's own copy just lacks it).
  `client/src/vendor/shared/contracts/platform.ts`,
  `server/src/vendor/shared/contracts/platform.ts`

- **2026-08-07** — the enriched "findings of one severity" popover body
  (title + `CategoryTag` + `MonoLink file:line` + `ConfidenceNum` +
  truncated rationale) is a single shared presentational component,
  `FindingsSeverityList`, living under the PR-**detail** route
  (`pulls/[number]/_components/FindingsSeverityList/`) and imported
  cross-boundary by the PR-**list** route's `PRRow/FindingsPopoverContent.tsx`
  (`../../[number]/_components/FindingsSeverityList/...`). This extends the
  cross-boundary precedent already noted for `lineLabel` — list-page
  components reaching into detail-page helpers/components is an accepted
  pattern here, not an oversight. Add new findings-list consumers (list row
  popover, Timeline run popover, any future one) by reusing this component
  rather than re-implementing the enriched row markup.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsSeverityList/FindingsSeverityList.tsx`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
