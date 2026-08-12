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

### 2026-08-09 — Local `client/` conventions override the generic frontend skills

**What:** the per-component `index.ts` barrel (44 barrels over 38 component
folders) and `styles.ts` holding `CSSProperties` objects are deliberate
project conventions, and `.claude/skills/frontend-architecture/references/
this-project.md` records them as binding inside `client/` — do NOT "clean
them up" to match generic guidance.
**Why:** both lose head-to-head against the general rule but win on
consistency at this size: Vercel/bulletproof-react argue a per-component
barrel is pure bundler cost, and the `react-best-practices` skill's Tailwind
section forbids inline `style={}` objects — yet every existing component here
does both, so a partial migration is strictly worse than either end state.
**Rejected:** removing the convenience barrels, and migrating `styles.ts` to
Tailwind. Both were rejected as drive-by cleanups; either would need to be a
deliberate, project-wide decision with build profiling behind it.
`FindingsSeverityList/` and `RunHistory/` are the only two component folders
with no `index.ts` — that is drift, not an exemption.

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

- **2026-08-09** — the `@/*` → `./src/*` alias IS configured
  (`client/tsconfig.json`), but only ~24 imports use it; route components
  reach for deep relative chains instead, e.g.
  `import { useTestConnection } from "../../../../../../../lib/hooks"` —
  seven `../` from a `_components/` leaf. Copying a neighbouring file
  propagates the chain, and it silently breaks on every folder move. Write
  `@/lib/...` and `@/components/...` in new code; converting a file you are
  already editing is fine, a repo-wide sweep is a separate task.
  `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx:6`

- **2026-08-09** — `client/AGENTS.md` says feature logic lives in
  `_components/<Name>/` folders "each with its own `*.test.tsx`". Only 11 of
  38 component folders actually have one. Read that line as the target, not
  as a description of the tree — do not assume a component you are changing
  has test coverage, and do add the test when you create a folder.
  `find client/src -name '*.test.tsx' -not -path '*/vendor/*' | wc -l`

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

- **2026-08-12** — `Donut` (`@devdigest/ui`) is built for money: its legend
  renders `{valuePrefix}{value.toFixed(2)}` with `valuePrefix` defaulting to
  `"$"`. Charting counts (e.g. skill findings by category) MUST pass
  `valuePrefix=""` or every slice reads `$3.00`; even then the legend still
  shows `3.00`, since the two-decimal format is not configurable. Accepted as
  cosmetic in `StatsTab` — don't "fix" it by editing the vendored component.
  `client/src/app/skills/_components/SkillDetailPanel/_components/StatsTab/StatsTab.tsx`,
  `client/src/vendor/ui/charts/Donut.tsx:52`

## Recurring Errors & Fixes

- **2026-08-12** — the FIRST runtime (non-`import type`) import from
  `@devdigest/shared` 500s every page that transitively touches it:
  `Module not found: Can't resolve './contracts/findings.js'` from
  `src/vendor/shared/index.ts:17`. The vendored barrel is authored for NodeNext
  (`./contracts/findings.js` → a `.ts` file on disk) and Next's webpack has no
  `.js`→`.ts` extension alias by default; until now every client import of that
  package was type-only, TypeScript erased it, and webpack was never asked to
  resolve the barrel — so the gap was invisible for the whole project's life.
  `pnpm test` and `pnpm typecheck` both stay green (vitest and tsc resolve it
  fine), so ONLY a running dev/build catches this. Fixed by
  `resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }` in
  `client/next.config.mjs`; if the dev script ever moves to Turbopack that
  webpack hook is ignored and the error comes back.
  `client/next.config.mjs`, `client/src/app/skills/_components/SkillCard/SkillCard.tsx:10`

- **2026-08-12** — adding a route makes `pnpm typecheck` fail with
  `.next/types/validator.ts(NN,52): error TS2344: Type '"/skills"' does not
  satisfy the constraint 'AppRoutes'` — nothing is wrong with the page.
  `tsconfig.json` includes `.next/types/**/*.ts`, and Next regenerates
  `validator.ts` (which lists the new page) before `routes.d.ts` (which holds
  the `AppRoutes` union), so a half-written cache typechecks against a stale
  union. Re-run `pnpm typecheck` after `pnpm dev`/`pnpm build` has settled, or
  `rm -rf .next/types`; do not "fix" the page.

## Open Questions

_None yet._
