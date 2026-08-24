---
name: onion-architecture
description: "Onion Architecture for DevDigest's backend packages (server/, reviewer-core/): which ring a file belongs to, which imports each ring is allowed, ports vs adapters, service vs repository vs route, transactions, and the dependency-cruiser gate that enforces it. Use BEFORE creating or moving any file under server/src/ or reviewer-core/src/. Complements fastify-best-practices (how to write a route) and drizzle-orm-patterns (how to write a query)."
when_to_use: "Triggers: new endpoint, new route, new module, new service, new repository, new adapter, new integration, new table, where does this file go, layering, layers, dependency rule, coupling, ports and adapters, DI, container, transaction, unit of work, pnpm arch, dependency-cruiser. Ukrainian: новий ендпоїнт, новий модуль, нова інтеграція, куди покласти, шари, залежності, архітектура бекенду."
license: MIT
metadata:
  version: 1.0.0
  updated: "2026-08-09"
  maintainer: dev-digest
  sources: README.md
---

# Onion architecture — `server/` and `reviewer-core/`

Placement and direction only. For *how* to write a route see
`fastify-best-practices`; for *how* to write a query see `drizzle-orm-patterns`;
for `client/` see `frontend-architecture`. This skill does not govern `client/`
or `e2e/`.

**`references/this-project.md` records where the code already diverges from the
rules below. Read it before "fixing" anything you did not write.**

## 1. The one rule

Dependencies point **inward**. An outer ring may name an inner ring; an inner
ring must not know an outer ring exists. When the centre needs something from
the edge, it declares an **interface** (a port) and the edge implements it.

Everything else in this file is that sentence applied to concrete folders.

## 2. The rings, as folders

| Ring | Lives in | May import |
|---|---|---|
| **Core** | `reviewer-core/src/**`, `server/src/vendor/shared/contracts/**` | Zod, itself |
| **Ports** | `server/src/vendor/shared/adapters.ts` | contracts, Zod |
| **Application** | `server/src/modules/<m>/` — `service.ts`, `run-executor.ts`, `helpers.ts`, `pipeline/` | core, ports, its own repository |
| **Data** | `server/src/modules/<m>/repository.ts`, `repository/`, `server/src/db/**` | core, Drizzle |
| **Infrastructure** | `server/src/adapters/**` | core, ports, its SDK |
| **Presentation** | `server/src/modules/<m>/routes.ts`, `src/app.ts` | its service, contracts, Fastify |
| **Composition root** | `server/src/platform/container.ts` | everything — this is the point |

`src/platform/` (config, errors, jobs, sse, resilience) is cross-cutting: any
ring may use it. `src/vendor/**` is vendored — edit at the source.

Data and Infrastructure are the **same** ring, not two. A persistence-backed
adapter may use `src/db/` (`LocalNoAuthProvider` does); a repository may not use
an adapter.

## 3. Allowed imports

Summary — the full matrix with the reasoning per cell is in
`references/import-matrix.md`.

| From ↓ | contracts | ports | reviewer-core | own service | own repository | `db/**` | `adapters/**` | fastify |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `reviewer-core/src` | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| `vendor/shared` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `modules/*/service` | ✅ | ✅ | ✅ | — | ✅ | ❌ | ❌ | ❌ |
| `modules/*/repository` | ✅ | ❌ | ❌ | ❌ | — | ✅ | ❌ | ❌ |
| `modules/*/routes` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `adapters/**` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `db/**` | ✅ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ |
| `platform/container` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Never `modules/a` → `modules/b`. Cross-module sharing goes through
`platform/container.ts` (as `agentsRepo` / `reviewRepo` already do) or
`modules/_shared/`.

## 4. Six rules

**R1 — A port is declared inward, implemented outward.**
The interface goes in `src/vendor/shared/adapters.ts` next to `LLMProvider`,
`GitClient`, `GitHubClient`, `CodeIndex`, `Embedder`, `SecretsProvider`,
`AuthProvider`. The implementation goes in `src/adapters/<name>/`, and a mock
goes in `src/adapters/mocks.ts` in the same commit. An interface declared in the
same file as its only implementation is not a port — it is a type alias with
extra steps.

**R2 — A service takes ports, not the `Container`.**
```ts
// ✅ the signature says what the service needs
class RepoService {
  constructor(private repo: RepoRepository, private github: GitHubClient) {}
}
// ❌ service location: needs everything, admits nothing, and creates a cycle
class RepoService { constructor(private container: Container) {} }
```
`Container` is resolved in `routes.ts` (the module's local composition root) and
stops there. It is the only file that may construct concrete adapters.

**R3 — Drizzle stops at the repository.**
`drizzle-orm`, `src/db/schema.ts`, `src/db/client.ts`, `$inferSelect` and the
`*Row` types in `src/db/rows.ts` are data-layer vocabulary. A service works with
contract types from `@devdigest/shared`; the row → domain mapping happens inside
`repository*`. A `*Row` type in a service signature means the ORM chose your
domain model.

**R4 — `routes.ts` is thin.**
Zod schema → `getContext` → one service call → return. No branching on domain
state, no reshaping beyond the DTO, no `db`. Validation and serialization both
come from the one Zod schema via `fastify-type-provider-zod` — do not hand-roll
`Schema.parse(req.body)` in the handler.

**R5 — Feature modules are siblings, not a hierarchy.**
No `modules/a` → `modules/b`. If two modules need the same thing, it moves down
(to `_shared/`, `platform/`, or the contracts) or is wired up through the
container.

**R6 — `reviewer-core` stays sterile.**
TypeScript + Zod + an injected `LLMProvider`. No filesystem, no database, no
network client, no Fastify. That purity is why its tests need no keys and no
Docker, and why the CI runner can consume it as source.

## 5. Transactions (Unit of Work)

A repository method takes an optional transaction and falls back to the
connection; the service owns the boundary:

```ts
// repository — the query does not care who owns the transaction
insertFindings(reviewId: string, findings: Finding[], tx?: DbLike) {
  return (tx ?? this.db).insert(t.findings).values(...);
}
// service — one boundary around one use case
await this.db.transaction(async (tx) => {
  const review = await this.repo.insertReview(values, tx);
  await this.repo.insertFindings(review.id, kept, tx);
});
```

Declare the transaction handle as a structural type owned by the data layer —
never leak `PgTransaction<...>` generics into a service signature. A write that
spans more than one table is one transaction or it is a bug waiting for a
crash between the statements.

## 6. Where does this file go?

1. Does it call something outside this process (HTTP, git, an LLM, the shell)?
   → **port** in `shared/adapters.ts` + **adapter** in `adapters/<name>/`.
2. Does it write SQL? → **repository**. If the module has none, create
   `repository.ts` — do not query from the route because the module is small.
3. Is it a rule that would still be true without HTTP and without Postgres?
   → **core** (`reviewer-core/` if the reviewer needs it, otherwise a pure
   function in the module).
4. Is it HTTP-shaped (status codes, headers, SSE, request parsing)?
   → **`routes.ts`**.
5. Does it choose *which* implementation to use? → **`platform/container.ts`**.
   That is the only correct answer to "where do I `new` this?".

Otherwise it is application logic: `modules/<m>/service.ts`.

## 7. The gate

```bash
cd server && pnpm arch
```

`dependency-cruiser` over `src` and `../reviewer-core/src`. Configs:
`server/.dependency-cruiser.cjs`, `server/.dependency-cruiser.core.cjs`.

- **`error`** — the boundary is clean today. Breaking it fails the command.
- **`warn`** — pre-existing drift, listed in `references/this-project.md`.
  Never add to a warn. Reduce it to zero, then promote the rule to `error`.

The gate counts `import type` (`tsPreCompilationDeps: true`) — most layer
leakage is type-only. Details and the rollout in `references/enforcement.md`.

## 8. Anti-patterns

- Passing `Container` into a service, then into the classes it constructs.
- A repository that returns `$inferSelect` rows straight to a route.
- `db.select(...)` in `routes.ts` because "the module is too small for a repo".
- An interface and its single implementation in one file under `adapters/`.
- A "shared" helper in `modules/a/` imported by `modules/b/`.
- A service that only forwards to the repository, one method per method — that
  is a repository with a longer import path; either give it a job or let the
  route call the repository through a service that has one.
- `node:fs` or an SDK in `reviewer-core/` "just for this one case".
- Adding a `pathNot` exception to the gate instead of moving the file.

## 9. In this repo

Read `references/this-project.md`. It lists 41 known warnings across 8 rules —
including services that take `Container`, four modules that query Drizzle from
`routes.ts`, and `repo-intel` reaching into concrete adapters. Those are the
target-state backlog, **not** the pattern to copy.

## References

- `references/import-matrix.md` — full from×to matrix, exemptions, and why
- `references/placement-rules.md` — "I have X, where does it go", per artefact
- `references/recipes.md` — new endpoint, new integration, new table, new module
- `references/enforcement.md` — the two configs rule by rule, running, rollout
- `references/this-project.md` — actual layout + every known deviation
- `README.md` — sources behind these rules (for humans, not for the agent)
