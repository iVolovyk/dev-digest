# The import matrix

Every cell answers one question: *may a file in this folder name a file in that
folder?* ✅ allowed, ❌ forbidden, ⚠️ allowed but currently drifting (see
`this-project.md`).

Paths are relative to `server/` unless marked otherwise.

## Full matrix

| From ↓ / To → | `vendor/shared/contracts` | `vendor/shared/adapters.ts` | `reviewer-core/src` | `modules/<own>/service` | `modules/<own>/repository` | `modules/<other>/*` | `modules/_shared` | `db/**` | `adapters/**` | `platform/*` (non-container) | `platform/container.ts` | `fastify` | `drizzle-orm` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `reviewer-core/src` | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `vendor/shared/**` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `modules/*/service`, `run-executor`, `helpers`, `pipeline/` | ✅ | ✅ | ✅ | — | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ |
| `modules/*/repository*` | ✅ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `modules/*/routes.ts` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ⚠️ |
| `db/**` (not `seed*`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | ✅ | ❌ | ❌ | ✅ |
| `adapters/**` | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `platform/container.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `app.ts`, `server.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Why the surprising cells

**`adapters/**` → `db/**` is ✅.** Adapters and repositories are the *same* ring
— both are infrastructure. An adapter whose backing store happens to be Postgres
(`LocalNoAuthProvider` resolving the local workspace) is not violating anything.
What it must never do is name a *feature module* or the *container*.

**`modules/*/repository*` → `adapters/**` is ❌.** The reverse of the above.
A repository speaks SQL. If it needs an external call, the call belongs in the
service, which owns both the repository and the port.

**`modules/*/routes.ts` → `platform/container.ts` is ✅.** `routes.ts` is the
module's local composition root: it reads `app.container`, constructs the
service with the ports it needs, and registers handlers. That is the *only*
correct place for a `new` on a service.

**`modules/*/service` → `platform/container.ts` is ⚠️, not ❌.** It is the
target-state `error`; ten files still do it (see `this-project.md`). The reason
it must stop: it produces an import cycle (the container constructs the service,
the service imports the container) and it hides the real dependency list.

**`reviewer-core/src` → `vendor/shared/**` is ✅** even though `vendor/shared`
physically lives under `server/src/`. It resolves through the
`@devdigest/shared` path alias and is the innermost ring by role, not by
location.

**`db/seed*.ts` is exempt from `db-no-upward`.** Seeds are scripts that compose
the app, not a layer inside it.

## Exemptions encoded in the gate

| Path | Exempt from | Because |
|---|---|---|
| `platform/container.ts` | all layer rules | it *is* the composition root |
| `app.ts`, `server.ts` | all layer rules | bootstrap |
| `db/seed.ts`, `db/seed-prompts.ts` | `db-no-upward` | scripts, not a layer |
| `adapters/mocks.ts` | `adapters-no-*` | test doubles compose freely |
| `modules/_shared/**` | `no-cross-module` | that is what it is for |
| `modules/index.ts` | `no-cross-module` | the module registry |
| `test/**` | not cruised | tests reach across rings on purpose |

Adding an exemption to make a violation disappear is the wrong move in almost
every case: move the file instead. If an exemption is genuinely right, it needs
a `comment` on the rule saying why.
