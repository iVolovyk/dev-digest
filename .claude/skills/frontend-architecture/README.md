# frontend-architecture — skill README

**Version 1.0.0** · updated 2026-08-09 · scope: `client/` and any React/Next.js code

This document is for humans. The agent reads `SKILL.md` and the files in
`references/`; it does not read this file.

## What this skill is for

One question, answered consistently: **where does this code go?**

Folder structure, component placement, constants, `utils` vs `lib` vs `services`
vs `model`, type placement, business-logic layering, barrel files, import
boundaries, naming.

## How it relates to the other two frontend skills

| Skill | Answers |
|---|---|
| `react-best-practices` | *How* to write a component/hook — state, effects, memoization, rendering |
| `next-best-practices` | What the **framework** requires — `app/` special files, RSC boundaries, metadata, caching |
| **`frontend-architecture`** | **Where** any of it goes on disk, and what may import what |

They were left untouched when this skill was added. `react-best-practices` had a
6-line "Code Organization" section and never mentioned barrel files;
`next-best-practices` covered only framework-mandated layout. Neither answered
placement questions, which is the gap this fills.

One deliberate conflict: `react-best-practices` forbids inline `style={}`
objects (its Tailwind section). `client/` uses `styles.ts` with `CSSProperties`
throughout. `references/this-project.md` states that inside `client/` the local
convention wins, so the agent does not "fix" 22 files.

## Files

| File | Contents | Read by agent |
|---|---|---|
| `SKILL.md` | The rules. Kept under ~4k tokens because skill bodies stay in context for the rest of the session | always, once invoked |
| `references/placement-rules.md` | Full what-goes-where table; env vs constants; types; tests; assets | on demand |
| `references/structures.md` | The four reference layouts in full, plus migration triggers | on demand |
| `references/boundaries.md` | ESLint configs for boundaries, rollout order, barrel-file detail, path aliases | on demand |
| `references/this-project.md` | DevDigest `client/` actual conventions, three deliberate deviations, known drift | on demand |
| `README.md` | this file | no |

## Versioning

`metadata.version` in `SKILL.md` frontmatter, semver:

- **MAJOR** — the recommended structure changes (a rule reverses)
- **MINOR** — a new rule or section
- **PATCH** — wording, corrections, source updates

Claude Code has no top-level `version` frontmatter field; an unrecognised key
produces `Unexpected key(s) in SKILL.md frontmatter`. `metadata` is the
spec-sanctioned free-form map, so the version lives there.

## Changelog

### 1.0.0 — 2026-08-09
Initial release. Three principles (colocation, second-consumer rule, AHA);
structure decision table (flat / feature-based / App Router / FSD); placement
table; `utils` vs `lib` vs `api` vs `model` distinction; business-logic layering;
barrel-file rule; `shared → features → app` boundary rule with four enforcement
options; naming; anti-patterns; `client/` conventions with its three deliberate
deviations.

---

# Sources

Every rule in the skill traces to something below. Tier: **A** official docs or
canonical repo · **B** recognised practitioner · **C** secondary write-up used
only for phrasing.

## Official framework documentation

1. **[Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)** (A) — primary source for the App Router row of the structure table. Colocation is safe because a folder is routable only once it holds `page`/`route`; private `_folder`; route groups `(name)`; the three named strategies (files outside `app`, top-level inside `app`, split by feature or route). Also the explicit "Next.js is unopinionated… choose a strategy and be consistent."
2. **[Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)** (A) — default to Server Components, push `"use client"` to the smallest interactive leaf, pass data down as props. Behind the data-fetching placement rule.
3. **[Next.js 13 — Project Organization / colocation](https://nextjs.org/docs/13/app/building-your-application/routing/colocation)** (A) — earlier, longer version of #1; kept for its worked colocation examples.
4. **[react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)** (A) — what belongs in a hook: stateful logic, not state; hooks hide the details of an external system. Behind "a hook is the React adapter, not the rules."
5. **[react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)** (A) — if you can compute it during render, it is not effect logic. Draws the line between derived values and synchronisation, which is what decides whether code goes in a hook at all.

## Architectural methodologies

6. **[bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)** (A) — **primary source for the feature-based layout.** The `features/<name>/{api,components,hooks,stores,types,utils}` shape; "only include the ones that are necessary"; the unidirectional rule `shared → features → app`; `import/no-restricted-paths` zones for cross-feature bans; and the explicit stance that barrel files "can cause issues for Vite to do tree shaking and can lead to performance issues."
7. **[bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)** (A) — kebab-case file and folder naming as an enforced standard.
8. **[bulletproof-react](https://github.com/alan2207/bulletproof-react)** (A) — the working reference implementation.
9. **[FSD — Overview](https://feature-sliced.design/docs/get-started/overview)** (A) — the three-axis model: scope of influence, domain, technical purpose.
10. **[FSD — Layers](https://feature-sliced.design/docs/reference/layers)** (A) — the layer list and the "import only downward" constraint.
11. **[FSD — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)** (A) — **the sharpest published answer to "what goes in which file"**: `ui` (display), `api` (requests, response types, mappers), `model` (schemas, stores, **business logic**), `lib` (code this slice needs), `config` (config, feature flags). Also the public-API rule: every slice must expose one, and nothing may reach inside. Directly behind the four-bucket table in `SKILL.md` §3.
12. **[FSD — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)** (A) — the `app`/`pages` name collision and the `_app`/`_pages` workaround.
13. **[FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide)** (A) — `app/` for routing only, `src/` for architecture; `page.tsx` reads as orchestration; queries live with the domain rather than in a global `services` bucket; the slice that mutates data owns its cache invalidation.
14. **[Steiger — FSD linter](https://github.com/feature-sliced/steiger)** (A) — machine-enforced boundaries. Its `insignificant-slice` rule (a slice used by one page should be merged into it) is the source of the "things also move down" corollary.

## Structure guides

15. **[Robin Wieruch — React Folder Structure Best Practices (2026)](https://www.robinwieruch.de/react-folder-structure/)** (B) — **primary source for the size-based decision tree.** The progression single file → component folders → technical folders → feature folders → domains → packages; the promote/demote rule ("if exactly one feature uses something it lives inside that feature; once two or more need it, it moves up"); singular folder names; plural only for collection files.
16. **[React Handbook — Project Standards](https://reacthandbook.dev/project-standards)** (B) — builds on bulletproof-react; source of "do not spend more than five minutes planning a structure that meets all future needs — organise as you go," which is the §2 closing rule and the last anti-pattern.

## Colocation and abstraction principles

17. **[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)** (B) — the origin of principle 1: "place code as close to where it's relevant as possible"; things that change together live together.
18. **[Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)** (B) — colocation as a performance argument, not only a tidiness one.
19. **[Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming)** (B) — principle 3. "Avoid hasty abstractions," resting on Sandi Metz's "prefer duplication over the wrong abstraction."
20. **[htmx — Locality of Behaviour](https://htmx.org/essays/locality-of-behaviour/)** (B) — the counterweight to reflexive separation of concerns: behaviour should be obvious from the unit you are reading; splitting by file type creates action at a distance.
21. **[TkDodo — Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw)** (B) — the concern boundary does not run along file types. Behind "compose upward" as the alternative to a cross-feature import.

## Types and constants

22. **[Total TypeScript — Where To Put Your Types in Application Code](https://www.totaltypescript.com/where-to-put-your-types-in-application-code)** (A/B) — Matt Pocock's three rules, quoted almost verbatim in the placement table: one place → same file; more than one → shared location at the smallest scope; more than one package → shared package.
23. **[Where Your Types Live Matters More Than You Think](https://blog.serghei.pl/posts/where-your-types-live-matters/)** (B) — why a global `types/` folder degrades, and what legitimately belongs there (framework-level plumbing that belongs to no feature).
24. **[T3 Env — Next.js](https://env.t3.gg/docs/nextjs)** (A) — validated env with a server/client split; the mechanism behind "env is not constants."
25. **[Create T3 App — Environment Variables](https://create.t3.gg/en/usage/env-variables)** (A) — validate at build time, in `next.config`, so a missing variable fails the build instead of a request.

## Barrel files

26. **[Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)** (A) — **the measured numbers quoted in §4**: barrel-exporting packages costing 200–800 ms each to import; `@material-ui/icons` dev boot 10.2 s → 2.9 s; ~28% faster production compilation; up to 40% faster cold starts. Also the scope limit: `optimizePackageImports` targets external dependencies, and Vercel's own advice is to lint against internal barrel imports rather than optimise them.
27. **[next.js#12557 — Tree shaking doesn't work with TypeScript barrel files](https://github.com/vercel/next.js/issues/12557)** (A) — the underlying failure mode.
28. **[next.js Discussion #92926 — Barrel imports](https://github.com/vercel/next.js/discussions/92926)** (A) — current maintainer guidance; source of "import directly inside a module, through the barrel across a boundary."

## Boundary enforcement

29. **[Tim Deschryver — Enforce module boundaries with no-restricted-imports](https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports)** (B) — the zero-plugin option, first config in `boundaries.md`.
30. **[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)** (A) — element types and an allow-matrix; the right fit for a non-monorepo like this one.
31. **[Nx — Enforce Module Boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)** (A) — tag-based `depConstraints`; listed with the caveat not to adopt Nx for this alone.

## Business-logic placement

32. **[Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)** (B) — the hook as the presentation/logic boundary; presentational components render only.
33. **[Lib vs Utils vs Services folders](https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers)** (C) — the phrasing that made the four-bucket table workable: if it talks to the outside world it is `lib`/`services`; if it only organises your logic it is `utils`.

Note: the model layer's independence from React — the other half of this rule —
is carried by FSD's `model` segment (#11) rather than a standalone source; see
"Reviewed and dropped" below.

## UI primitive layer

34. **[shadcn/ui — Docs](https://ui.shadcn.com/docs)** (A) — `components/ui/` as code you own; the basis for "primitives carry no domain knowledge."
35. **[Vercel Academy — Extending shadcn/ui with custom components](https://vercel.com/academy/shadcn-ui/extending-shadcn-ui-with-custom-components)** (A) — wrap, do not edit the primitive.

## How this skill itself was written

36. **[Claude Code — Extend Claude with skills](https://code.claude.com/docs/en/skills)** (A) — frontmatter reference (`name`, `description`, `when_to_use`, `metadata`, `license`); `metadata` as the only sanctioned place for a version; skill content stays in context for the rest of the session, and auto-compaction keeps only the first 5 000 tokens of each — hence the size budget for `SKILL.md`.
37. **[Agent Skills — Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)** (A) — progressive disclosure: name and description load at startup, the body only on match.
38. **[Agent Skills open standard](https://agentskills.io)** (A) — the six portable frontmatter fields.
39. **[anthropics/skills — skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)** (A) — reference skill layout (`SKILL.md` + `references/`).
40. **[Anthropic Engineering — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)** (A) — writing descriptions that state both what and when; keeping a skill's scope narrow.

All 40 links above were checked on 2026-08-09 and returned HTTP 200.

## In-repo sources for `references/this-project.md`

- `client/AGENTS.md` — thin pages, `_components/<Name>/` colocation, `app-shell` for chrome, hooks in `src/lib/hooks/*`, vendored `src/vendor/{ui,shared}` off-limits
- `client/README.md` — route map, route → hook → endpoint table
- `client/INSIGHTS.md` — the accepted cross-route import between `_components/`; vendored contracts are a hand-maintained copy; `PrRowView` is dead code
- `client/src/` itself — the counts in `this-project.md` (44 `index.ts`, 38 component folders, 22 `styles.ts`, 17 `constants.ts`, 10 `helpers.ts`, 11 tests) were measured, not assumed

## Reviewed and dropped

**Unreachable.** `profy.dev/article/react-architecture-business-logic-and-dependency-injection`
("Path To A Clean(er) React Architecture — Business Logic Separation") informed
the model-layer rule during research, but the domain no longer resolves
(`ENOTFOUND`, checked 2026-08-09), so it is not listed as a citable source.
If it returns, it is the best long-form treatment of that rule.

**Redundant or out of scope.** Read but not cited: the `react.dev` hooks
reference, the React Handbook landing page, Sandro Roth's project-structure post,
Web Dev Simplified's folder-structure post, TkDodo's blog index, `manupa.dev`'s
shadcn anatomy piece, and thepassle's barrel-files guide for library authors.
Each was either covered better by a source above or outside the placement scope.
