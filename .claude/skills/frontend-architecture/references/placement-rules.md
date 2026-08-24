# Placement rules — what goes where

The full lookup table. `SKILL.md` carries the short version; come here for the
edge cases, the reasoning, and the "is it already there?" checks.

## The one question that resolves most cases

> **How many things import this, and are they in the same feature?**

| Importers | Placement |
|---|---|
| 1 file | same file, module scope — no new file |
| 2+ files, 1 feature | own file inside that feature folder |
| 2+ features | smallest folder that is an ancestor of all of them |
| 2+ packages | shared package |

Never place higher than the lowest common ancestor of the actual importers.
"We'll probably need it elsewhere later" is not an importer.

---

## Components

| Kind | Test | Goes in |
|---|---|---|
| Route-specific | rendered by exactly one route | `app/<route>/_components/Name/` (Next) or `features/<feature>/components/` (SPA) |
| Feature-shared | 2+ components in one feature | `features/<feature>/components/` |
| App-shared, domain-aware | knows about your entities (`PrRow`, `AgentCard`) | `src/components/<group>/` |
| Design primitive | no domain knowledge, no data fetching, no routing | `src/components/ui/` |
| Layout / chrome | nav, breadcrumbs, shells, global shortcuts | `src/components/app-shell/` (or `layouts/`) |

Rules:
- A primitive in `components/ui/` must never import from `features/`, `app/`, or
  a data hook. If it needs to, it is not a primitive.
- Do not promote a component to shared on its *second* render site inside the
  same route — promote when a *second route* needs it.
- Extend a primitive by wrapping it, not by editing it (shadcn/ui convention).
  `components/ui/button.tsx` stays generic; `features/billing/components/pay-button.tsx`
  wraps it with domain behaviour.

### One file per folder, or a flat folder?

Both work. Pick one per project:

```
# Folder-per-component — good when components carry siblings (test, styles, constants)
components/PrRow/
  PrRow.tsx
  PrRow.test.tsx
  constants.ts
  helpers.ts
  index.ts        # only if you treat the folder as a module boundary

# Flat — good when components are single files
components/
  pr-row.tsx
  pr-row.test.tsx
```

Do not mix within one folder tree. Do not create a folder for a component that
will only ever be one file.

---

## Constants

| Kind | Goes in | Notes |
|---|---|---|
| Used once, inside one component | module scope of that file, above the component | Never inside the component body — it reallocates every render |
| Used by 2+ files in a feature | `constants.ts` next to them | |
| Domain maps / lookup tables (`SEVERITY_COLOR`, `STATUS_LABEL`) | `constants.ts` of the feature that owns the domain concept | Promote only when a second feature reads it |
| Design tokens (spacing, colour, radius) | CSS custom properties / theme file, not a TS constant | One source of truth for the designer and the code |
| Route paths / query keys | one `routes.ts` / `query-keys.ts` per app | These *are* genuinely global — typo-prone strings referenced everywhere |
| Feature flags | `config/` segment, not `constants.ts` | They change at runtime; constants do not |
| Anything read from `process.env` | a dedicated validated `env.ts` | See below |

**`env` is not `constants`.** Constants are literals you can read in the file.
Env values are untyped strings that may be missing at runtime. Validate them once
at the edge with a schema (Zod / `@t3-oss/env-nextjs`), export typed values, and
import from there — never `process.env.X` scattered through components.

```ts
// env.ts — one file, validated at build time, server/client split enforced
export const env = createEnv({
  server:  { DATABASE_URL: z.string().url() },
  client:  { NEXT_PUBLIC_API_BASE: z.string().url() },
  runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL,
                NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE },
})
```

Magic numbers with a name are constants; magic numbers without a name are bugs
waiting to happen. `if (lines < 200)` → `if (lines < SIZE_SMALL_MAX)`.

---

## Functions: utils vs helpers vs lib vs services vs model

These four folder names get used interchangeably and then mean nothing. Pick a
definition and enforce it. The one that holds up:

| Bucket | Knows about your domain? | Talks to the outside world? | Example |
|---|---|---|---|
| `utils/` (or `helpers.ts`) | **no** | no | `formatBytes`, `clamp`, `groupBy`, `debounce` |
| `lib/` | no | **yes** | API client wrapper, storage adapter, analytics SDK setup |
| `api/` (or `services/`) | **yes** | **yes** | `fetchPullRequests(repoId)`, `runReview(prId)` |
| `model/` (domain logic) | **yes** | no | `sizeOf(pr)`, `canApprove(review, user)`, `verdictFor(findings)` |

Practical consequences:
- If it takes a domain type in and returns a domain answer, it is **model**, not utils.
  This is the bucket teams forget, and it is where business logic belongs.
- A file named `utils.ts` that imports a domain type is misfiled.
- One `utils.ts` per feature is fine. A single app-wide `utils.ts` past ~150 lines
  is a junk drawer — split by subject (`format.ts`, `array.ts`, `url.ts`).
- Do not create `helpers/` *and* `utils/`. They mean the same thing to every
  reader; two folders just means coin-flipping on every new file.

### Where business logic lives

Business logic is **plain functions that do not import React**. That makes it
testable without a renderer, reusable on the server, and immune to hook rules.

```
model/verdict.ts        pure:  (findings) => verdict           ← business logic
hooks/use-verdict.ts    React: state + effects + calls model   ← adapter
components/Verdict.tsx  JSX:   renders what the hook returns   ← presentation
```

The layering rule:
- **Component** — markup, event wiring, and nothing else. No `fetch`, no
  branching on business rules, no data reshaping.
- **Hook** — the *React* adapter: state, subscriptions, cache, lifecycle. A hook
  should mostly call other things, not implement rules itself.
- **Pure function** — the rules. No `useState`, no `window`, no network.

A hook that contains 60 lines of calculation is hiding a pure function. Extract
the calculation; keep the hook as the shell.

---

## Hooks

| Kind | Goes in |
|---|---|
| Used by one component | same file, below the component, or `use-x.ts` in that component's folder |
| Used across one feature | `features/<feature>/hooks/use-x.ts` |
| Data fetching for a domain | with that domain's API code (`features/<feature>/api/`) or a shared `lib/hooks/<domain>.ts` |
| Generic, domain-free (`useDebounce`, `useMediaQuery`) | `src/hooks/` — and check whether the library you already use ships it |

Keep all data fetching in hooks (client) or server components (RSC) — never
inline in a component body.

---

## Types

Matt Pocock's three rules, and they are enough:

1. Used in **one place** → the same file. Inline it if it is only a prop shape.
2. Used in **more than one place** → `*.types.ts` at the smallest shared level.
3. Used in **more than one package** → a shared package.

Anti-pattern: a top-level `types/` folder that accumulates every interface in the
app. It has no cohesion, it grows without bound, and it forces an import from the
far side of the tree for a type used twice next door. A global `types/` should
hold only framework plumbing that belongs to no feature — ambient declarations,
`*.d.ts` module augmentation.

Types that describe an API response belong next to the code that calls the API,
or are generated from the contract (OpenAPI/Zod) — not hand-copied into `types/`.

---

## Tests

Colocate: `PrRow.tsx` + `PrRow.test.tsx` in the same folder.

Rationale: a test that lives in a mirrored `__tests__/` tree gets forgotten when
the component moves and deleted last when the component dies. Colocated tests
move with the code and are visible when you open the folder.

Exceptions that legitimately live elsewhere: end-to-end suites (own package),
and fixtures shared across many features (`src/testing/`).

---

## Styles

| Approach | Placement |
|---|---|
| Utility classes (Tailwind) | inline in JSX; no separate file |
| CSS Modules | `Name.module.css` next to the component |
| CSS-in-JS / style objects | `styles.ts` next to the component |
| Design tokens | global stylesheet as CSS custom properties |

Whichever you pick, the token layer is global and the component layer is
colocated. Never define a colour literal in a component.

---

## Assets

- Used by one feature → `features/<feature>/assets/`
- Used app-wide → `public/` (served) or `src/assets/` (bundled)
- Inline SVG icons: an icon **component** is a component; put it with the other
  primitives, not in an `assets/` barrel (a barrel of SVGs is the single most
  expensive barrel you can write).

---

## Quick "already exists?" check

Before creating any of the above, grep first. The most common structural defect
is not the wrong folder — it is a second copy of something that already exists
two folders over. Search by behaviour, not by name:

```bash
rg -n "toFixed\(2\).*\\$|formatCost|currency" src   # before writing a money formatter
rg -n "export function .*Date|dayjs|date-fns"  src   # before writing a date helper
```
