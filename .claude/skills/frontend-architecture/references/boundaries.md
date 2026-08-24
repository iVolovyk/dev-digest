# Import boundaries and barrel files

Structure that is not enforced decays. A folder layout is a suggestion; a lint
rule is a boundary.

---

## The dependency rule

```
shared  →  features  →  app
```

Read arrows as "may be imported by".

- **shared** (`components/`, `ui/`, `hooks/`, `lib/`, `utils/`, `types/`) imports
  nothing from `features/` or `app/`.
- **features** import from shared, and from **nothing in a sibling feature**.
- **app** (routes, providers, entry) imports from features and shared.

Two violations account for nearly all structural rot:

1. **Upward import** — a shared component imports a feature type "just for this
   one prop". The shared layer now cannot be reused or moved.
2. **Cross-feature import** — feature A reaches into feature B's internals.
   Now B cannot be refactored without breaking A, and neither can be deleted.

The fix for a cross-feature need is always the same: **move the shared thing
down** into the shared layer, or **compose upward** — let the page pass B's
component into A as a prop/child rather than letting A import it.

---

## Enforcement, cheapest first

### 1. `no-restricted-imports` — no plugin needed

```js
// eslint.config.js
{
  files: ["src/features/reviews/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/features/*", "!@/features/reviews"], message: "No cross-feature imports. Move the shared code to src/ or compose from the page." },
        { group: ["@/app/*"], message: "Features must not import from the app layer." },
      ],
    }],
  },
}
```

Good for a handful of boundaries. Becomes repetitive at scale.

### 2. `import/no-restricted-paths` — what bulletproof-react uses

Declares the whole graph once, in zone form:

```js
// eslint.config.js — with eslint-plugin-import
"import/no-restricted-paths": ["error", {
  zones: [
    // enforce unidirectional flow: shared -> features -> app
    { target: "./src/features", from: "./src/app" },
    { target: ["./src/components", "./src/hooks", "./src/lib", "./src/types", "./src/utils"],
      from: ["./src/features", "./src/app"] },

    // disable cross-feature imports
    { target: "./src/features/reviews", from: "./src/features", except: ["./reviews"] },
    { target: "./src/features/agents",  from: "./src/features", except: ["./agents"] },
  ],
}]
```

The `except` entries are per-feature, so this list grows by one line per feature.
That is the cost of the guarantee.

### 3. `eslint-plugin-boundaries` — element types and a rule matrix

Best when you have named layers rather than just folders. You tag each path with
an element type, then declare which types may import which:

```js
settings: {
  "boundaries/elements": [
    { type: "shared",  pattern: "src/{components,hooks,lib,utils}/**" },
    { type: "feature", pattern: "src/features/*/**", capture: ["name"] },
    { type: "app",     pattern: "src/app/**" },
  ],
},
rules: {
  "boundaries/element-types": ["error", {
    default: "disallow",
    rules: [
      { from: "shared",  allow: ["shared"] },
      { from: "feature", allow: ["shared", ["feature", { name: "${from.name}" }]] },
      { from: "app",     allow: ["shared", "feature"] },
    ],
  }],
}
```

### 4. Nx `@nx/enforce-module-boundaries` — only if you already use Nx

Tag-based `depConstraints` in `nx.json`. Do not adopt Nx for this alone.

### 5. `steiger` — if you adopted FSD

Checks layer order, public-API violations, and slice granularity, without ESLint
config.

---

## Rollout on an existing codebase

A boundary rule turned on cold produces hundreds of errors and gets disabled.
Instead:

1. Turn the rule on as `"warn"` and count violations.
2. Fix the shared layer first (upward imports) — usually a small number and the
   most damaging.
3. Convert cross-feature violations into either a downward move or composition.
4. Flip to `"error"` once the count is zero. Any remaining exception gets an
   inline `eslint-disable` **with a comment explaining why**, so it is visible in
   review rather than invisible in a config file.

---

## Barrel files (`index.ts`)

A barrel re-exports a folder's contents so consumers can `import { X } from "./folder"`.
They are simultaneously the standard way to declare a module's public API and a
measurable performance problem. Both are true; the distinction is *what the
barrel is for*.

### The cost

Importing one symbol from a barrel pulls the barrel's **entire module graph**
into the compiler and often into the bundle. Vercel measured popular
barrel-exporting packages costing 200–800 ms each just to import; after
remapping barrel imports to direct paths, dev boot on one benchmark went from
10.2 s to 2.9 s and production compilation dropped ~28%. Tree-shaking frequently
fails to recover it, because a re-export chain with any side-effectful module in
it is not statically prunable.

Next's `optimizePackageImports` fixes this **for external packages only**. It
does nothing for the barrels you write inside your own `src/`.

### The rule

| Barrel at… | Verdict |
|---|---|
| A package / slice / feature root — the module's declared public API | **Keep.** This is architecture: it lets you refactor internals freely and lets a lint rule forbid deep imports. |
| Every component folder, purely so imports look shorter | **Avoid.** Pure cost, no boundary. Import the file directly. |
| A folder of icons / SVGs | **Never.** The worst case: one icon drags in all of them. |
| Aggregating other barrels (`export * from "./a"` where `a` is itself a barrel) | **Never.** Compounds the graph. |

Concretely:

```ts
// GOOD — feature public API, one per feature
// src/features/reviews/index.ts
export { ReviewsPage } from "./components/reviews-page"
export { useReviews } from "./api/use-reviews"
export type { Review } from "./types"

// BAD — convenience barrel with no boundary
// src/features/reviews/components/index.ts
export * from "./review-card"
export * from "./review-list"
export * from "./review-filter"
```

Inside a module, import files directly (`./components/review-card`). Across a
module boundary, import the barrel (`@/features/reviews`).

### If a codebase already has barrels everywhere

Leave them. Removing them is a large, risky, low-visibility diff. Add the rule
for *new* code, and clean up opportunistically when you touch a folder anyway.
The exception worth doing eagerly: barrels over icons or over large third-party
re-exports, where the payoff is immediate and measurable.

### Guarding the boundary once you have one

```js
// forbid deep imports into a feature, so the barrel is the only entrance
"no-restricted-imports": ["error", {
  patterns: [{ group: ["@/features/*/*"], message: "Import from the feature root (@/features/x), not its internals." }],
}]
```

---

## Path aliases

Configure one alias (`@/*` → `./src/*`) and use it for anything crossing a
folder boundary. Keep relative imports for siblings inside the same folder.

`import { X } from "../../../../../../lib/api"` is not just ugly — it is
unreadable in review, breaks on every file move, and hides boundary violations
that an aliased path would make obvious. If a project defines an alias, a deep
relative chain is a defect regardless of whether it compiles.

Rule of thumb: **two `../` or fewer → relative; three or more → alias.**
