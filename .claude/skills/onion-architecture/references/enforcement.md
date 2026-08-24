# Enforcement — the `pnpm arch` gate

```bash
cd server && pnpm arch
```

Two `dependency-cruiser` passes:

```jsonc
"arch": "depcruise src --config .dependency-cruiser.cjs
      && depcruise ../reviewer-core/src --config .dependency-cruiser.core.cjs
                   --ts-config ../reviewer-core/tsconfig.json"
```

Both configs live in `server/` on purpose: `dependency-cruiser@17` is already a
`server` **dependency** (the `depgraph` adapter uses it as a library), so the
gate costs no new package and `reviewer-core`'s own lockfile stays untouched.

## Severity contract

- **`error`** — the boundary is clean today. The command exits non-zero.
- **`warn`** — pre-existing drift, enumerated in `this-project.md`. Exit code
  stays 0.

**Never add a violation to a `warn` rule.** The warn list is a backlog, not a
licence. Reduce a rule to zero violations, then flip it to `error` in the same
commit — that is the only way the gate gets stronger.

## `server/.dependency-cruiser.cjs`

| Rule | Catches | Sev |
|---|---|:--:|
| `no-circular` | any import cycle | warn (5) |
| `contracts-stay-pure` | `vendor/shared` reaching a feature, the DB, or a framework | **error** |
| `service-no-concrete-adapter` | application importing `adapters/<x>` instead of a port | warn (8) |
| `service-no-orm` | application importing `src/db/*` | warn (6) |
| `service-no-orm-package` | application importing `drizzle-orm` | warn (1) |
| `service-no-container` | application importing `platform/container.ts` | warn (10) |
| `routes-no-db` | `routes.ts` importing `src/db/*` or `drizzle-orm` | warn (8) |
| `repository-no-upward` | a repository importing a service, a route, or an adapter | **error** |
| `db-no-upward` | `src/db/*` (except `seed*`) importing a module, adapter, or the container | **error** |
| `adapters-no-container` | an adapter reading the composition root | **error** |
| `adapters-no-modules` | an adapter importing a feature module | warn (2) |
| `no-cross-module` | `modules/a` → `modules/b` | warn (1) |

## `server/.dependency-cruiser.core.cjs`

| Rule | Catches | Sev |
|---|---|:--:|
| `no-circular` | cycles inside the engine | **error** |
| `core-stays-pure` | `node:fs`/`child_process`/net, or an ORM, HTTP framework, or VCS SDK | **error** |
| `core-not-outward` | `reviewer-core` importing `server/src` | **error** |

`openai` is deliberately **not** forbidden — `OpenRouterProvider` uses that SDK
as the transport behind the `LLMProvider` port.

## Two things that will bite you writing rules

**1. `to.path` matches the RESOLVED path, not the specifier.** Under pnpm a
package resolves to
`node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.js`.
A pattern like `^drizzle-orm$` matches nothing and the rule silently passes.
Use an unanchored `node_modules/(drizzle-orm|postgres)/`. Node builtins are the
exception — they stay bare (`fs`, `node:fs`), so anchor those.

**2. `tsPreCompilationDeps: true` is required.** Most layer leakage in this
codebase is `import type` (`AgentRow`, `Container`, `RepoIntel`). Without this
flag those imports vanish before the cruise and the gate reports a clean run
over a leaking codebase.

## Verifying a rule actually fires

Never trust a green run. Prove the rule with a throwaway probe:

```bash
printf "import { eq } from 'drizzle-orm';\nexport const p = eq;\n" \
  > src/modules/repos/__arch-probe.ts
pnpm arch          # must report the rule by name
rm src/modules/repos/__arch-probe.ts
```

An orphan file under `src/` is cruised even though nothing imports it, so the
probe needs no wiring. Do the same for `reviewer-core` with a `node:fs` import.

## Rollout

1. Fix every violation of one warn rule.
2. Flip that rule to `error` and drop the "Known drift" sentence from its
   `comment`.
3. Update the count in `this-project.md`.

There is deliberately no CI step and no vitest architecture test — `pnpm arch`
is a local command. Add a CI step only when the warn list is short enough that a
red build means something.
