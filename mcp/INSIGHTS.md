# Insights — mcp

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

### 2026-08-29 — `pnpm inspect` runs the MCP Inspector via `pnpm dlx`, not a devDependency

**What:** the `inspect` script is
`pnpm dlx @modelcontextprotocol/inspector@2.4.0 tsx src/index.ts` — pinned, but
not installed. `package.json:scripts.inspect`.
**Why:** adding `@modelcontextprotocol/inspector` as a devDependency pulls ~187
packages and its esbuild postinstall is blocked by pnpm
(`ERR_PNPM_IGNORED_BUILDS`); `pnpm typecheck`/`test` run a deps-status check that
then fails the whole package on a fresh install until someone runs
`pnpm approve-builds`. A dev-only debugging UI isn't worth that or the lockfile
churn.
**Rejected:** devDependency + `pnpm.onlyBuiltDependencies` allow-listing the
inspector's build scripts — runs third-party install scripts through the
supply-chain gate for a tool used occasionally by hand.

### 2026-08-29 — Re-declare local zod views; do not alias `@devdigest/shared`

**What:** `src/api/schemas.ts` hand-declares minimal zod views of the six
consumed API responses instead of importing the shared contracts.
**Why:** `@modelcontextprotocol/server` v2 pulls `zod@^4.2.0`; every other
package here pins `zod@^3.24.1` and the contracts are authored against zod 3.
A tsconfig path alias (the `reviewer-core` pattern) would compile zod-3 schemas
against a zod-4 runtime inside this package's own `node_modules` — confusing
type errors at best, different parse behaviour at worst.
**Rejected:** vendoring a byte-copy (a third hand-maintained copy — `client`'s
already drifts silently); aliasing into `server/src/vendor/shared` (the zod
version clash above). The local views also enforce principle 3 — we forward a
strict subset, so typing against the full contract would invite over-forwarding.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-29** — `POST /pulls/:id/review` returns immediately with
  `reviews: []`, **always** — despite the server route doc-comment calling the
  run "(synchronous)". The service creates the `agent_runs` rows then fires
  `void this.executor.executeRuns(...).catch(...)` and returns
  (`server/src/modules/reviews/service.ts:117-137`). A tool that trusts the
  comment returns an empty findings list and looks like it worked. Poll
  `GET /pulls/:id/runs` to a terminal `status`, then `GET /pulls/:id/reviews`
  and select by `run_id`. Persistence order is safe: `insertReview` →
  `insertFindings` → `completeAgentRun` (`server/src/modules/reviews/run-executor.ts:293,304,318`),
  so `status === 'done'` ⇒ the review is readable.
  `src/tools/run-agent-on-pr.ts`

## Tool & Library Notes

- **2026-08-29** — stdio MCP server: **stdout is the JSON-RPC wire.** One
  `console.log` / `process.stdout.write` / logger pointed at stdout corrupts
  the stream and the client reports an opaque JSON parse failure with no
  pointer to the cause. All logging goes to stderr via `createLogger`
  (`src/logger.ts`). Symptom to recognise: the MCP client shows a parse error
  the moment a tool runs, not at startup.

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
