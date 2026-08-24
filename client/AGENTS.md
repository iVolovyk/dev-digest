# client (@devdigest/web)

Next.js 15 studio UI. Full picture → README.md (route map).

## Stack specifics
Next.js 15 (App Router), React 19, TanStack Query, next-intl (messages in
`messages/<locale>/*.json`), recharts, mermaid, react-markdown. UI primitives
vendored under `src/vendor/ui`, shared Zod contracts under `src/vendor/shared`.
API base = `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), consumed
via `src/lib/api.ts`; every data hook lives in `src/lib/hooks/*`.

## Test
`pnpm test` — vitest + jsdom, `fetch` mocked, so no API or browser needed.
`pnpm typecheck`. Real browser journeys (client + API + seeded DB) are covered
separately by `../e2e`, not by this package's tests.

## Non-default conventions
- Pages (`src/app/**/page.tsx`) stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in
  `src/components/app-shell`.

## Do not touch
- `src/vendor/ui`, `src/vendor/shared` — vendored; edit at the source package, not here.

## Read when
- `README.md` — read when you need the UI route map / which hook hits which endpoint.
- `docs/` — read when you need the rationale behind a UI/architecture decision here.
- `specs/` — read when implementing a feature that has a written spec.
- `INSIGHTS.md` — read via the `engineering-insights` skill before debugging
  something that feels familiar; the skill appends to it at the end of a
  non-trivial task.
