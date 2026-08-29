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

### 2026-08-18 — Relocate `feature-models.ts` out of `modules/settings/`

**What:** moved `resolveFeatureModel` / `getFeatureModelOverride` /
`defaultFeatureModel` from `src/modules/settings/feature-models.ts` to
`src/modules/_shared/feature-models.ts`.
**Why:** its own doc comment already declared it a dependency for several
future feature modules ("onboarding, intent, risk brief, conformance,
conventions"), but it had zero call sites and lived inside `modules/settings/`
— the first real consumer (`modules/conventions`) importing it from there
would be a `modules/a → modules/b` violation (onion-architecture R5).
**Rejected:** importing it in place from `modules/settings/feature-models.ts`
— `pnpm arch`'s `no-cross-module` rule doesn't currently flag that path only
because nothing imports it yet, not because the location is correct.

## What Works

_None yet._

## What Doesn't Work

- **2026-08-12** — a "replace the whole ordered set" endpoint cannot be a plain
  delete-then-reinsert once the link row carries state of its own.
  `POST /agents/:id/skills` (`AgentsRepository.setSkills`) is what the Skills
  tab sends for BOTH attach and reorder, so the first version silently reset
  `agent_skills.enabled` to the column default: disable a skill, move any row,
  and it is back on — quietly changing what reaches the model with no toggle
  touched. Found by exercising the live API in sequence
  (`PUT .../skills/:id {enabled:false}` → `POST .../skills {skill_ids:[…]}`),
  not by any test. `setSkills` now reads the previous links, carries `enabled`
  forward for ids that were already linked, and does the delete+insert in one
  transaction (an agent with zero skills mid-write would review without them).
  Regression: `server/test/agents-skills.it.test.ts`.
  `src/modules/agents/repository.ts`

## Codebase Patterns

- **2026-08-29** — `RepoIntelService.getBlastRadius` has TWO paths and the
  fallback re-reads the clone ON THE HOT PATH: `tryPersistentBlast` returns
  `null` when `repo_index_state.status` is missing or not in `{full, partial}`
  (`service.ts:319`), and control falls through to a ripgrep best-effort that
  calls `container.codeIndex.symbols(ref)` over the whole repo and
  `readClone(...)` + `extractEndpoints(...)` per caller file
  (`service.ts:244,291`). Fine for `run-executor`'s prompt enrichment; a
  violation for any consumer whose contract says "no AST/graph rebuild during
  the request". Such a consumer (blast) must call `getIndexState` FIRST and
  only call `getBlastRadius` when `status ∈ {full, partial}` — the gate is the
  consumer's own policy, not a facade flag.
  `src/modules/blast/service.ts` (`build`, the §3 gate)

- **2026-08-29** — the `MAX_CALLERS_PER_SYMBOL = 20` cap in
  `tryPersistentBlast` is applied to the WHOLE flat caller list, not per
  symbol: `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` runs AFTER the global
  `rank DESC` sort (`service.ts:372,386`), so a PR changing 5 symbols gets 20
  callers total and a high-rank symbol can starve the rest. Reads as a bug;
  it isn't — no consumer relied on per-symbol semantics until `modules/blast`,
  which re-caps per symbol after grouping and treats
  `blast.callers.length >= 20` as "globally truncated" (sets `partial`). If a
  real PR shows wrong per-symbol counts, the fix is a `limit` param on the
  facade call, not changing the slice.
  `src/modules/repo-intel/service.ts:386`, `src/modules/blast/service.ts`

- **2026-08-12** — `waitForPrRuns` only waits for `agent_runs.status` to go
  terminal, and `completeAgentRun` is NOT a run's last write: the executor still
  writes `run_skills` and then `run_traces` after it
  (`src/modules/reviews/run-executor.ts`). A test asserting on a trace or on
  per-run stats rows straight after `waitForPrRuns` races those writes. Poll
  `run_traces` for the runId instead — it is written last, so its presence proves
  every earlier post-completion write landed.
  `server/test/skills-injection.it.test.ts` (`waitForTrace`)

- **2026-08-12** — `Tokenizer` has no port in `src/vendor/shared/adapters.ts`;
  it is declared in the concrete adapter (`src/adapters/tokenizer/index.ts`),
  so a service that does `import type { Tokenizer }` from there adds a fresh
  `service-no-concrete-adapter` warning to `pnpm arch` even though the import
  is type-only (`tsPreCompilationDeps: true`). Until it becomes a real port,
  re-declare the one-method shape locally
  (`export interface Tokenizer { count(text: string): number }`) — the
  container's `TiktokenTokenizer` satisfies it structurally, so
  `new XService(repo, app.container.tokenizer)` still compiles.
  `src/modules/skills/service.ts:27`
  **General pattern, not just adapters:** the same fix applies to
  `no-cross-module` — a new module (`modules/conventions/service.ts`) that
  did `import type { RepoIntel } from '../repo-intel/types.js'` to type one
  constructor param tripped `no-cross-module` (would've raised the baseline
  from 41 to 42 warnings) even though the import was type-only and
  `container.repoIntel` was the actual runtime value. Fix was identical:
  declare a narrow local interface with only the method(s) actually used
  (`interface RepoIntelSamples { getConventionSamples(repoId: string, n:
  number): Promise<string[]> }`) instead of importing the sibling module's
  type — `container.repoIntel` satisfies it structurally.
  `src/modules/conventions/service.ts`

## Tool & Library Notes

- **2026-08-18** — `MockGitClient.readFile()` (`src/adapters/mocks.ts:293`)
  returns `''` for a path not in its `files` option; the real
  `SimpleGitClient.readFile()` (`src/adapters/git/simple-git.ts`) throws
  ENOENT for a missing file. Code that probes for an optional file (e.g.
  sampling config files that may or may not exist) and only wraps the read
  in `try/catch` behaves correctly against the real adapter but silently
  includes an empty-content "file" against the mock. Treat
  `content.trim().length === 0` the same as a caught exception so both
  adapters degrade the same way. `src/modules/conventions/service.ts`
  (`sampleFiles`)

- **2026-08-12** — `fflate`'s `unzipSync(bytes, { filter })` is the only way to
  LIST a zip without inflating it: the callback is invoked once per entry with
  `{ name, size, originalSize }` and returning `false` skips decompression, so
  `unzipSync(bytes, { filter: (f) => { entries.push(f); return false; } })`
  returns `{}` while collecting the full manifest. That is what makes an
  entry-count / inflated-size cap enforceable on an untrusted upload BEFORE
  the bytes are expanded; a second `unzipSync` with
  `filter: (f) => f.name === chosen` then inflates the one entry we read.
  Directory entries come through with a trailing `/`.
  `src/modules/skills/import.ts:185`

- **2026-08-09** — two ways a `dependency-cruiser` rule silently passes over a
  codebase that violates it. (1) `to.path` matches the **resolved** path, and
  pnpm resolves to
  `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.js`
  — a bare-specifier pattern like `^drizzle-orm$` matches nothing and reports
  green; use an unanchored `node_modules/(drizzle-orm|postgres)/`. Node builtins
  are the exception, they stay bare (`fs`, `node:fs`), so anchor those.
  (2) without `options.tsPreCompilationDeps: true`, `import type` lines vanish
  before the cruise — and most layer leakage here is type-only (`AgentRow`,
  `Container`, `RepoIntel`). Always prove a new rule with a throwaway probe file
  (`printf "import { eq } from 'drizzle-orm';\nexport const p = eq;\n" >
  src/modules/repos/__arch-probe.ts && pnpm arch`); an orphan file under `src/`
  is cruised even though nothing imports it. `server/.dependency-cruiser.cjs`

- **2026-08-08** — HTML comments in an agent-instruction file are stripped
  before the content reaches the model: a `<!-- canary BLIP-9090 -->` appended
  to `server/AGENTS.md` was invisible, while `The token is QUUX-3312.` as
  visible prose on the next line came back verbatim. Matters when verifying
  that `AGENTS.md`/`CLAUDE.md` is actually loaded — a commented-out canary
  yields a false `NO` and looks exactly like a broken symlink. Use visible
  text: `printf '\n## Canary\nToken is X-1234.\n' >> server/AGENTS.md &&
  (cd server && claude -p --permission-mode plan 'Do not use tools. What is
  the canary token in your instructions?')`. Applies to every module's file,
  not just `server/`.

## Recurring Errors & Fixes

- **2026-08-12** — with 9 `*.it.test.ts` files each starting its OWN Postgres,
  `pnpm test` intermittently fails ONE suite outright with
  `Error: Failed to connect to Reaper` (all of that file's tests reported as
  skipped). It moves between files run to run — twice in a row it was a
  different suite — because it is contention over testcontainers' shared
  Ryuk/reaper container, not anything in the code. Re-running the file alone
  passes. To judge a change, run `pnpm exec vitest run --no-file-parallelism`:
  27 files / 176 tests green serially, ~2 min. If it persists, clear stale
  containers first: `docker rm -f $(docker ps -aq --filter label=org.testcontainers=true)`.

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

- **2026-08-08** — the `CLAUDE.md` → `AGENTS.md` rename was repo-wide (root +
  all four packages) with no home module, so its one durable finding landed
  here by default rather than by fit. If workflow-level findings keep landing
  in `server/` for lack of anywhere better, that's the signal
  `engineering-insights` describes for adding a root `INSIGHTS.md`.
