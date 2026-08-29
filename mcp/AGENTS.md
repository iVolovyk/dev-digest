# mcp (@devdigest/mcp)

Local MCP (stdio) server over the **running** DevDigest API. A thin HTTP client +
protocol adapter: five tools that forward to `@devdigest/api` on
`http://localhost:3001`. Full picture → README.md. Design rationale →
`specs/mcp-server-plan.md`.

## Stack specifics
- Standalone package, **pnpm** (`pnpm-lock.yaml` committed). Not a monorepo
  member — no root `pnpm-workspace.yaml`, no cross-package dependency.
- Owns **no** data, no Postgres pool, no job runner, no LLM key. The API must
  already be running (`./scripts/dev.sh`, or `cd server && pnpm dev`).
- **No secret of any kind.** `~/.devdigest/secrets.json` is not read here and
  must not be. Config is a base URL + two timeouts (`src/config.ts`), plain env
  vars with defaults.
- MCP SDK: `@modelcontextprotocol/server` v2, pinned to an **exact** version
  (not `^`) — it is the fastest-moving dependency in the repo. Requires zod 4;
  this package declares its own zod 4 and does **not** vendor or alias
  `@devdigest/shared` (which is zod 3).

## Layers (dependencies point inward)
`src/shape/` (pure: no fetch, no SDK, no `node:*`) ← `src/api/` (fetch + zod
views) ← `src/tools/` ← `src/index.ts` (the only file that calls `serveStdio`
and constructs the client). `pnpm arch` / dependency-cruiser is **not** extended
to this package — enforce the direction by review, and by the fact that
`shape/`'s tests import nothing else.

## Test
`pnpm test` (vitest) + `pnpm typecheck` — hermetic, no network, no API, no
Docker. `fetch` is injected via `createApiClient({ fetch })`. There is **no
DB-backed tier**: CI has no API and no Postgres.

`pnpm test:live` (`test/live.manual.ts`) is a manual `tsx` script, never in CI,
needs a running API. It is the **only** check that catches API-shape drift —
run it after any `server/` contract change touching agents, repos, pulls,
reviews, or conventions.

## Gotchas
- **stdout is the JSON-RPC wire.** A single `console.log`,
  `process.stdout.write`, or stray logger destination on stdout corrupts the
  stream and the MCP client reports an opaque parse failure. **All logging goes
  to stderr** — use `createLogger` (`src/logger.ts`), never `console.log`.
- **`POST /pulls/:id/review` is NOT synchronous.** The server route's own
  doc-comment says the run is synchronous and returns persisted reviews — it is
  wrong. The service fires `void executeRuns(...)` and returns immediately with
  `reviews: []`, always. `run_agent_on_pr` polls `GET /pulls/:id/runs` for the
  terminal status, then fetches `GET /pulls/:id/reviews` and selects the review
  by `run_id`.
- **Never call `POST /repos/:id/conventions/extract`.** It samples files, calls
  an LLM, costs money and minutes, and *replaces* the repo's existing
  candidates. `get_conventions` is cache-only — `GET /repos/:id/conventions`
  and nothing else.
- **Never call `GET /pulls/:id`.** It deletes and re-inserts `pr_files` /
  `pr_commits` on every call and returns the full diff — the heaviest read in
  the app, and none of its payload is forwarded. Resolve PRs via
  `GET /repos/:id/pulls`.
- **Tool descriptions are verbatim from `specs/mcp-server-plan.md` §6.-1.**
  `test/registry.test.ts` asserts each one byte-for-byte. Do not paraphrase.
- **Confirmation for `run_agent_on_pr` is the host's job.** The tool sets
  `openWorldHint: true` + `idempotentHint: false`; a conforming client prompts.
  Do not add a `confirm` argument.

## Read when
- `specs/mcp-server-plan.md` — the full design: every tool, the HTTP-client
  decision, the resolution strategy, the polling policy.
- `README.md` — tool table, how to register the server, the pinned SDK version.
- `INSIGHTS.md` — read via `engineering-insights` before debugging something
  that feels familiar.
- `onion-architecture` skill — its one rule (dependencies point inward) applies;
  its folder/ring table governs `server/` and `reviewer-core/`, not this package.
