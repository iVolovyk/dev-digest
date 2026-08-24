# DevDigest `client/` — actual conventions

What the code does today, not what it should do. Where this file and the general
rules disagree, **this file wins inside `client/`**.

Verified against the tree on 2026-08-09. Re-verify before trusting a count.

## Layout

```
client/src/
  app/              Next 15 App Router: routing + route-colocated feature code
  components/       shared across routes; kebab-case group folders
    app-shell/      nav, breadcrumbs, g-then-key shortcuts   ← cross-cutting chrome
    diff-viewer/    7 PascalCase sub-components + group-level segments
    mermaid-diagram/ page-shell/ repo-not-found/ showcase/
  lib/              flat, kebab-case: api.ts, types.ts, format-cost.ts,
                    github-urls.ts, model-label.ts, feature-models.ts,
                    providers.tsx, repo-context.tsx, theme.tsx, toast.tsx
    hooks/          core.ts agents.ts reviews.ts trace.ts repo-intel.ts + index.ts
  i18n/request.ts
  test/             setup.ts, smoke.test.tsx
  vendor/ui/        vendored @devdigest/ui       — DO NOT EDIT
  vendor/shared/    vendored Zod contracts       — DO NOT EDIT
client/messages/en/*.json   18 next-intl namespaces
```

There is **no** `features/`, and no top-level `hooks/`, `utils/`, `constants/`
or `types/`. The three buckets are: route-colocated, `src/components/`, `src/lib/`.

## The component folder shape

Route-specific UI lives in `_components/<PascalName>/` next to the route,
nesting up to three `_components` levels deep (deepest: `RunTraceDrawer`).

```
FindingCard/
  FindingCard.tsx        component (PascalCase, matches folder)
  FindingCard.test.tsx   colocated test — present on 11 of 38 folders
  constants.ts           17 exist — domain maps, CSS-var tokens
  helpers.ts             10 exist — pure functions
  styles.ts              22 exist — CSSProperties objects
  index.ts               44 exist — barrel
  _components/           children, same shape
```

Create only the segment files the component needs. Route-level segments exist
too, next to `page.tsx` — e.g. `app/repos/[repoId]/pulls/{constants,helpers,styles}.ts`
shared by that route's `_components`.

**Adding a component to `client/`:** create the folder, the `.tsx`, an
`index.ts`, and a `.test.tsx`. Add `constants.ts` / `helpers.ts` / `styles.ts`
only when there is something to put in them.

## Three deliberate deviations from the general rules

### 1. Barrels in every component folder — keep them

44 `index.ts` files for 38 component folders. The general rule (and
bulletproof-react, and Vercel's measurements) says a per-component convenience
barrel is pure cost. Here it is the established convention.

**Do not remove them, and do not skip them on new components.** Consistency is
worth more than the marginal bundler time at this size. Raise it as a project-wide
decision if it ever shows up in build profiling — not as a drive-by cleanup.

Existing barrel forms vary; pick the dominant one for new code:

```ts
export { FindingCard, FindingCard as default } from "./FindingCard";   // most common
export { PRRow } from "./PRRow";                                        // named only
export * from "./AppShell";                                             // group folders
```

Two folders have **no** barrel — `FindingsSeverityList` and `RunHistory`. That is
drift, not a pattern.

### 2. `styles.ts` with `CSSProperties`, not Tailwind

Styling is inline style objects (`const s = {...} satisfies CSSProperties`) in
`styles.ts`, over CSS custom properties (`var(--crit)`, `var(--text-muted)`).

This **contradicts the `react-best-practices` skill**, whose Tailwind section
says no inline `style={}` objects. Inside `client/`, this file wins: keep
`styles.ts`. Do not introduce Tailwind classes into a file that uses `styles.ts`.

Colour literals still never appear in components — they go through CSS variables
defined in `globals.css`. That part matches the general rule.

### 3. Cross-route imports between `_components/`

`app/repos/[repoId]/pulls/_components/PRRow/FindingsPopoverContent.tsx` imports
`FindingsSeverityList` from the sibling `[number]` route's `_components/`. This
is recorded in `client/INSIGHTS.md` as an accepted pattern.

Treat it as a **tolerated exception, not a template**. When a second route needs
a component, the correct move is to promote it to `src/components/`. Before
adding a new cross-route import, check whether promotion is cheap; if it is,
promote instead.

## Known drift — do not copy, and fix opportunistically

- **Deep relative imports.** `tsconfig.json` defines `@/*` → `./src/*`, but only
  ~24 imports use it while route components reach for
  `../../../../../../../lib/hooks`. **Use `@/lib/...` and `@/components/...` in
  new code.** Converting a file you are already editing is welcome; a
  repo-wide sweep is a separate task.
- **Tests.** `client/AGENTS.md` says every `_components/<Name>/` folder has its
  own `*.test.tsx`. Actually 11 of 38 do. The instruction is the target; write
  the test for anything you add.
- **Loose component files.** `PRRow/FindingsPopoverContent.tsx` and
  `RunTraceDrawer/_components/atoms.tsx` sit directly in a parent's folder rather
  than in their own. Fine for tiny private sub-parts; not the default.
- **`PrRowView`** in `src/lib/types.ts` has zero references (noted in INSIGHTS).

## Where data and logic go here

- Every data hook: `src/lib/hooks/*.ts`, exported through `src/lib/hooks/index.ts`.
  Import from `@/lib/hooks` or the domain file directly — both resolve.
- All HTTP through `src/lib/api.ts` (`NEXT_PUBLIC_API_BASE`, default
  `http://localhost:3001`).
- `page.tsx` stays thin; feature logic goes in `_components/`.
- Pure domain functions go in the nearest `helpers.ts` (e.g. `sizeOf(pr)`,
  `relativeTime(iso)` in `app/repos/[repoId]/pulls/helpers.ts`).
- Cross-cutting chrome: `src/components/app-shell`.
- i18n strings: `messages/en/<namespace>.json`, never inline in a component.

## Before adding a shared helper — check these first

`src/lib/` already has: `format-cost.ts`, `github-urls.ts`, `model-label.ts`,
`feature-models.ts`, `types.ts`. Grep `src/lib/` and the nearest `helpers.ts`
before writing a formatter or a URL builder.

## Sizes observed

Largest components: `Showcase.tsx` 265, `RunHistory.tsx` 263, `FindingsTab.tsx`
192, `page.tsx` (pr detail) 185. Anything past ~200 lines here has historically
wanted a `_components/` split.
