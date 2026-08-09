# Reference structures

Four layouts, ordered by the size of project they suit. Pick the smallest one
that fits today, and migrate when a listed trigger fires — not before.

---

## S — Flat

**Fits:** under ~20 components, one or two people, no distinct domains yet.

```
src/
  components/          every component, flat
  hooks/
  lib/                 api client, formatters
  routes/ or app/
  main.tsx
```

Rules: one file per component; no folder gets a sub-folder; `lib/` splits by
subject when a file passes ~150 lines.

**Move up when:** you scroll to find a component, or two unrelated domains
appear in `components/`.

---

## M — Feature-based (default for SPAs)

**Fits:** most growing apps. This is the bulletproof-react layout.

```
src/
  app/                 app entry, providers, router config
  components/          shared components used by 2+ features
    ui/                design primitives — no domain knowledge
  config/              global config, validated env
  features/
    reviews/
      api/             requests + query hooks for this domain
      components/
      hooks/
      stores/
      types/
      utils/
      index.ts         ← the feature's public API (see boundaries.md)
    agents/
  hooks/               generic, domain-free
  lib/                 third-party wiring: api client, storage, analytics
  stores/              global state, if any
  testing/             shared fixtures, test utils
  types/               ambient/framework types only
  utils/               generic, domain-free
```

Rules:
- Only create the sub-folders a feature actually needs. An empty `stores/` is noise.
- Dependency direction is one-way: `shared → features → app`. A feature never
  imports from `app/`, and never from a sibling feature.
- If two features need the same thing, it moves to the shared layer — it does not
  get imported across the boundary.

**Move up when:** a feature folder itself grows past ~15 files with no internal
structure, or the team needs enforced ownership boundaries.

---

## M-Next — Next.js App Router (route colocation)

**Fits:** any App Router project. This is the framework's own recommendation
("split project files by feature or route").

```
src/
  app/
    layout.tsx
    (marketing)/                  route group — no URL segment
      page.tsx
    repos/[repoId]/pulls/
      page.tsx                    thin: fetch + compose
      constants.ts                route-level, shared by its _components
      helpers.ts
      _components/                private — never routable
        PrRow/
          PrRow.tsx
          PrRow.test.tsx
          index.ts
      [number]/
        page.tsx
        _components/
  components/                     used by 2+ routes
    ui/
  lib/                            api client, hooks, formatters
```

Rules:
- Colocation is free: a folder inside `app/` becomes a route **only** when it
  contains `page` or `route`. The `_` prefix is optional insurance — it opts the
  folder out of routing entirely and avoids collisions with future framework
  file names.
- `page.tsx` stays thin: resolve params, fetch, compose. No business rules.
- Default to Server Components. Push `"use client"` down to the smallest
  interactive leaf, and pass server-fetched data down as props.
- Data access lives with the domain (a `lib/hooks/<domain>.ts` or a feature's
  `api/`), never inline in `page.tsx`.
- Route groups `(name)` organise without touching the URL. Use them for
  section-level layouts, and to scope a `loading.tsx` to one page.

**Two ways to combine with features** — pick one and be consistent:

| | `app/` holds | Features live in |
|---|---|---|
| Route-colocated | routing **and** route-specific UI in `_components/` | `_components/` next to the route |
| Feature-separated | routing only — thin `page.tsx` | `src/features/<name>/`, imported by pages |

Route-colocated is simpler and matches the docs. Feature-separated survives
better when a "feature" spans several routes or is shared with a non-Next target.

---

## L — Feature-Sliced Design

**Fits:** large codebases, multiple teams, where boundaries must be
machine-enforced rather than agreed.

Three axes: **layers** (scope of influence) → **slices** (business domain) →
**segments** (technical purpose).

```
src/
  app/          # everything that makes the app run: providers, global styles, routing
  pages/        # one slice per page/route
  widgets/      # large self-contained UI blocks
  features/     # user interaction scenarios ("add to cart")
  entities/     # domain models + their UI ("product", "user")
  shared/       # business-agnostic primitives, no slices
```

Each slice contains only the segments it needs:

| Segment | Holds |
|---|---|
| `ui/` | components, formatters, styles |
| `api/` | request functions, response types, mappers |
| `model/` | schemas, stores, **business logic** |
| `lib/` | library code this slice needs |
| `config/` | configuration, feature flags |

Rules:
- A layer may only import from layers **below** it. `shared` imports nothing.
- Slices on the same layer may not import each other — extract downward instead.
- Every slice exposes a public API via `index.ts`; nothing reaches inside.
  This is the one place a barrel file is architecture, not convenience.
- Enforce with the `steiger` linter. Its `insignificant-slice` rule (a slice used
  by only one page should be merged into that page) is a useful heuristic even
  if you never adopt full FSD.

**With Next.js:** `app/` and `pages/` collide with the framework's own folders.
The documented workaround is to keep Next's `app/` for routing only and put FSD
under `src/` with prefixed layer names (`_app`, `_pages`), which the linter
understands.

---

## Migration triggers

| Symptom | Move |
|---|---|
| `components/` needs scrolling to scan | S → M |
| Two domains' files interleaved alphabetically | S → M |
| A feature folder is 15+ flat files | M → L (add segments) |
| Cross-feature imports keep appearing in review | add boundary lint (see `boundaries.md`) before restructuring |
| A "shared" component is used by exactly one feature | move it **down** into that feature |
| A page component exceeds ~200 lines | extract to `_components/`, not a bigger page |

Migrate one feature at a time; a half-migrated tree with a lint rule pointing at
the target is healthier than a big-bang rewrite.

## What not to do

Do not spend more than a few minutes designing the structure up front. Every
layout above is reachable from every other by moving folders, and the compiler
finds the broken imports for you. Organise as you go; the trigger table tells you
when.
