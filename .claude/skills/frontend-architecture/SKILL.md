---
name: frontend-architecture
description: "Where code goes in a React/Next.js codebase: folder structure, component placement, constants, utils vs lib vs services, types, business logic, barrel files, import boundaries, file naming. Use when creating a component/hook/util, deciding where a file belongs, or reviewing and refactoring folder structure. Complements react-best-practices (how to write components) and next-best-practices (framework file conventions)."
when_to_use: "Triggers: where should this live, where to put this, folder structure, project structure, new component, extract a helper, barrel file, index.ts, feature folder, colocation, utils vs lib, shared component, import boundaries, cross-feature import, naming convention. Ukrainian: де покласти, куди винести, структура папок, структура проєкту."
license: MIT
metadata:
  version: 1.0.0
  updated: "2026-08-09"
  maintainer: dev-digest
  sources: README.md
---

# Frontend architecture — where code goes

Placement only. For *how* to write a component see `react-best-practices`; for
framework file semantics see `next-best-practices`.

**In `client/` of this repo, `references/this-project.md` overrides everything
below.** Read it before restructuring anything there.

## 1. Three principles

1. **Colocate by default.** Place code as close to where it is used as possible.
   Things that change together live together.
2. **Second-consumer rule.** Code stays inside the feature that uses it until a
   *second* feature imports it; then it moves to the lowest common ancestor of
   the actual importers. Anticipated future use is not an importer.
3. **Avoid hasty abstractions.** Do not extract on the first duplicate. Prefer
   duplication over the wrong abstraction; extract on the third occurrence, when
   the shape has stopped changing.

Corollary: things also move **down**. A "shared" component with one consumer
belongs inside that consumer.

## 2. Pick a structure

| Situation | Structure |
|---|---|
| Under ~20 components | Flat: `components/`, `hooks/`, `lib/` |
| Growing SPA, distinct domains | Feature-based: `src/features/<name>/{api,components,hooks,types,utils}` + shared layer |
| Next.js App Router | `app/` = routing; route-specific UI in `_components/`, `_lib/` next to the route; cross-route code in `src/components`, `src/lib` |
| Large, multi-team, needs enforced boundaries | FSD: layers → slices → segments (`ui`, `api`, `model`, `lib`, `config`) |

Pick the smallest that fits **today**. Do not spend more than a few minutes on
this — every layout is reachable from every other by moving folders.
Full layouts and migration triggers: `references/structures.md`.

## 3. Where things go

| What | Where | Promote when |
|---|---|---|
| Component used by one route | `_components/Name/` beside the route, or `features/<f>/components/` | a **second route** needs it → `src/components/` |
| Design primitive (Button, Input) | `components/ui/` — no domain knowledge, no data fetching, no routing | never; wrap it instead of editing it |
| Layout / nav / global shortcuts | `components/app-shell/` | — |
| Constant used in one file | module scope of that file (never inside the component body) | 2nd file → `constants.ts` beside them |
| Domain map / lookup table | `constants.ts` of the owning feature | 2nd feature → shared |
| Route paths, query keys | one `routes.ts` / `query-keys.ts` per app | — |
| Anything from `process.env` | a validated `env.ts` (Zod / t3-env), **not** `constants.ts` | — |
| Design tokens | CSS custom properties, not TS constants | — |
| Generic function, no domain knowledge | `utils/` or a local `helpers.ts` | — |
| Talks to the outside world, no domain knowledge | `lib/` (api client, storage, analytics) | — |
| Domain + network | `features/<f>/api/` or `lib/api.ts` | — |
| **Business rules** | pure functions that do not import React | — |
| React state / effects / cache | a hook, `use-x.ts` | — |
| Type used once | the same file | 2nd place → `*.types.ts` at the smallest shared level |
| Test | beside the file it tests | — |

Full table with edge cases: `references/placement-rules.md`.

### The distinction that decides most files

| Bucket | Knows the domain | Touches the outside world |
|---|---|---|
| `utils` / `helpers` | no | no |
| `lib` | no | yes |
| `api` / `services` | yes | yes |
| `model` (business logic) | yes | no |

A file in `utils.ts` that imports a domain type is misfiled — it is `model`.
Do not create both `utils/` and `helpers/`; they mean the same thing.

### Business logic

```
model/verdict.ts       pure function: (findings) => verdict     ← the rules
hooks/use-verdict.ts   React adapter: state, cache, lifecycle   ← the shell
components/Verdict.tsx JSX only                                  ← presentation
```

- Component: markup and event wiring. No `fetch`, no business branching, no
  data reshaping.
- Hook: mostly *calls* things. A hook with 60 lines of calculation is hiding a
  pure function — extract it.
- Pure function: no `useState`, no `window`, no network. Testable without a
  renderer, reusable on the server.

## 4. Barrel files (`index.ts`)

A barrel is architecture **or** it is cost. Never both.

- **Keep** one barrel per package / feature / slice — it declares the module's
  public API and lets you refactor internals freely.
- **Avoid** a barrel per component folder created only to shorten imports. One
  import pulls in the whole module graph; tree-shaking often cannot recover it.
  Vercel measured barrel remapping taking dev boot from 10.2s to 2.9s on one
  benchmark.
- **Never** barrel icons/SVGs, and never barrel other barrels.
- `optimizePackageImports` fixes **external** packages only, not your own `src/`.

Inside a module import files directly; across a module boundary import the
barrel. On a codebase that already barrels everything: leave it, follow the
local convention, clean up only where you are already editing.

## 5. Import boundaries

Direction is one-way: **`shared → features → app`**.

- Shared code never imports from `features/` or `app/`.
- A feature never imports from a sibling feature. Move the shared thing **down**,
  or compose **upward** (let the page pass B's component into A as a prop).
- Enforce it, or it decays: `import/no-restricted-paths` (bulletproof-react's
  choice), `no-restricted-imports` (no plugin), `eslint-plugin-boundaries`, Nx
  `enforce-module-boundaries`, or `steiger` for FSD.
- Roll out as `warn` → fix shared-layer violations first → flip to `error`.

Use the path alias (`@/*`) for anything crossing a folder boundary; relative
imports only for siblings. Three or more `../` is a defect when an alias exists.

Configs and rollout: `references/boundaries.md`.

## 6. Naming

Pick one scheme per project and never mix:

- **kebab-case** for files and folders (`pr-row.tsx`, `use-reviews.ts`) — the
  bulletproof-react / Wieruch default, and safe on case-insensitive filesystems.
- **PascalCase folder + matching file** (`PrRow/PrRow.tsx`) — the
  folder-per-component style; used in this repo's `client/`.

Either way: folder names singular (`review/`, not `reviews/`); plural only for
collection files (`constants.ts`, `utils.ts`); suffixes `.test.tsx`,
`.types.ts`, `use-*` for hooks.

## 7. Anti-patterns

- `components/` as a 200-file dump with no grouping.
- A single app-wide `utils.ts` past ~150 lines — a junk drawer; split by subject.
- A global `types/` folder holding every interface. It should hold only ambient
  and framework types.
- Creating `api/ components/ hooks/ types/ utils/` inside every feature whether
  or not they have contents.
- A barrel in every folder "for tidy imports".
- Business logic in a component body, or `fetch` in JSX.
- Promoting to `shared/` on the guess that something will be reused.
- Designing the folder tree before writing the feature.
- Adding a new file when the function already exists two folders over — **grep by
  behaviour before creating anything**.

## 8. Order within a file

Imports → module constants → types → helper functions → the component → exports.
Helpers stay outside the component body. Static arrays and objects stay at module
scope.

## 9. In this repo

`client/` is Next.js 15 App Router with route-colocated `_components/<Name>/`
folders, `src/components/` for cross-route UI, and `src/lib/` for the API client,
hooks, and formatters. It deliberately diverges on three points — per-component
barrels, `styles.ts` with `CSSProperties` instead of Tailwind, and one tolerated
cross-route import. **Read `references/this-project.md` before changing structure
there, and do not "fix" those three.**

`server/`, `reviewer-core/`, and `e2e/` are separate packages with their own
`AGENTS.md`; this skill's rules are frontend rules and do not govern them.

## References

- `references/placement-rules.md` — full what-goes-where table, env vs constants, types, tests
- `references/structures.md` — the four layouts in full, with migration triggers
- `references/boundaries.md` — ESLint configs, rollout, barrel-file detail, aliases
- `references/this-project.md` — DevDigest `client/` actual conventions and known drift
- `README.md` — sources behind every rule here (for humans, not for the agent)
