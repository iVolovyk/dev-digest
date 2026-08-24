# DevDigest today — actual layout and known drift

Snapshot: **2026-08-09**, 41 warnings across 8 rules, 0 errors
(`cd server && pnpm arch`).

## Actual layout

```
reviewer-core/src/          core — prompt.ts, grounding.ts, review/, output/, llm/
server/src/
  vendor/shared/
    contracts/*.ts          domain contracts (Zod) — findings, trace, platform, …
    adapters.ts             the ports: LLMProvider, GitClient, GitHubClient,
                            CodeIndex, Embedder, SecretsProvider, AuthProvider
  modules/<m>/
    routes.ts               presentation + the module's composition root
    service.ts              application
    repository.ts | repository/<agg>.repo.ts
    helpers.ts constants.ts
    _shared/{context,schemas}.ts
  db/                       schema/, migrations/, client.ts, rows.ts, seed*.ts
  adapters/                 llm/, github/, git/, codeindex/, astgrep/, depgraph/,
                            embedder/, secrets/, auth/, tokenizer/, mocks.ts
  platform/                 container.ts (composition root) + config, errors,
                            jobs, sse, resilience, prompt, model-router, …
```

Modules with a repository: `repos`, `reviews`, `agents`.
Modules without one (they query Drizzle from `routes.ts`): `settings`,
`polling`, `workspace`, `pulls`.

## Known drift — legacy, do not copy

Each item is a live `warn` rule. New code must not add to any of them.

### D1 — services take `Container` (10 files, `service-no-container`)

`modules/{reviews,repos,repo-intel,agents}/service.ts`,
`reviews/run-executor.ts`, `reviews/diff-loader.ts`,
`repo-intel/pipeline/{full,incremental}.ts`, `settings/feature-models.ts`,
`_shared/context.ts`.

Service location, not injection: the constructor admits nothing about what the
class needs. It is also the direct cause of D5 (the container constructs the
service, the service imports the container). Target: constructor takes the
ports. `_shared/context.ts` is the mildest case — it is a helper over
`AuthProvider` and could take that port instead of the whole container.

### D2 — Drizzle above the repository (7 files, `service-no-orm` + `service-no-orm-package`)

`reviews/{service,run-executor,diff-loader}.ts` import `db/schema.ts` and
`db/rows.ts`; `repos/helpers.ts` imports `db/schema.ts`;
`settings/feature-models.ts` imports both plus `drizzle-orm` itself.

`AgentRow`/`FindingRow`/`PullRow` are `$inferSelect` aliases — the ORM is
choosing the domain model. Target: repositories return contract types.

### D3 — concrete adapters in the application ring (8 files, `service-no-concrete-adapter`)

`repo-intel/service.ts` and `repo-intel/pipeline/{full,incremental,repo-map}.ts`
import `adapters/astgrep`, `adapters/codeindex/extract`, `adapters/tokenizer`
directly; `reviews/diff-loader.ts` imports `adapters/git/diff-parser`.

Related: `DepGraph` and `Tokenizer` are declared **inside**
`adapters/depgraph/index.ts` and `adapters/tokenizer/index.ts`, next to their
only implementation — an interface in the outer ring is not a port. Target:
move both interfaces to `vendor/shared/adapters.ts`.

(`adapters/git/diff-parser` is arguably a pure function that belongs in
`reviewer-core` or a helper, not an adapter at all — decide that when the file
is next touched.)

### D4 — routes query the database (8 imports, `routes-no-db`)

`settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`,
`pulls/routes.ts` import `db/schema.ts` and `drizzle-orm`.

These four modules have no repository. Target: give each one a `repository.ts`
and a `service.ts`, even if they start small. **A new module must not repeat
this** — the gate's `warn` exists for these four files, not as permission.

### D5 — import cycles (5, `no-circular`)

Four run through `platform/container.ts` (`repo-intel/service.ts`,
`repo-intel/pipeline/{full,incremental}.ts` ↔ container) and are a direct
symptom of D1. The fifth is genuine and local:
`agents/helpers.ts` ↔ `agents/repository.ts`.

A **new** cycle that does not run through `container.ts` is a defect, not drift.

### D6 — adapters reading a feature module (2, `adapters-no-modules`)

`adapters/astgrep/index.ts` and `adapters/depgraph/index.ts` import
`modules/repo-intel/constants.ts`. Target: those constants belong in the port
contract or arrive through the constructor.

### D7 — one cross-module import (1, `no-cross-module`)

`repos/service.ts` → `repo-intel/constants.ts`. Target: move the shared
constants to `modules/_shared/` or the contracts.

## Things that are correct and should be imitated

- `platform/container.ts` — lazy getters, `ContainerOverrides` for tests,
  secrets resolved through `SecretsProvider`, `ConfigError` instead of a crash
  when a key is missing. This is the reference for adding a port.
- `adapters/mocks.ts` — a mock per port, which is what makes the hermetic suite
  possible. A new port ships with its mock.
- `modules/reviews/repository/` — one repository class composing per-aggregate
  query modules (`review.repo.ts`, `run.repo.ts`, `pull.repo.ts`). This is the
  shape to reach for when a repository outgrows one file.
- `modules/_shared/context.ts` — one `getContext` so workspace scoping is never
  re-implemented per module.
- `reviewer-core` — zero violations. The engine is genuinely pure.

## When this file goes stale

Re-run `cd server && pnpm arch`, recount per rule with:

```bash
pnpm exec depcruise src --config .dependency-cruiser.cjs 2>/dev/null \
  | grep -oE "^  warn [a-z-]+" | sort | uniq -c | sort -rn
```

and update the counts and the snapshot date above.
