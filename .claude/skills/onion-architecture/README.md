# onion-architecture — sources

For humans. The agent reads `SKILL.md` and `references/`.

## Why this skill exists

`server/` already had the shape — a pure engine (`reviewer-core/`), Zod
contracts, ports in `vendor/shared/adapters.ts`, adapters behind a DI container,
repositories per module. Nothing wrote the shape down and nothing checked it, so
every new `modules/<name>/` plugin was a fresh chance to put `db.select` in a
route. This skill states the rules and `pnpm arch` enforces them.

Scope is `server/` and `reviewer-core/` only. `client/` is covered by
`frontend-architecture`; `e2e/` has no layering to enforce.

## Where each rule comes from

| Rule | Source |
|---|---|
| The dependency rule; the ring metaphor | Palermo's original two posts |
| Ports as interfaces owned by the inside, adapters as implementations owned by the outside | Cockburn, Hexagonal Architecture |
| Onion vs Hexagonal vs Clean — same rule, different vocabulary | Graça, NDepend |
| Composition root as the only place that knows both the use case and the concrete adapter | Stemmler, Bazaglia |
| Optional `tx` on repository methods; transaction interface without ORM generics | Sentry, *Atomic Repositories in Clean Architecture and TypeScript* |
| Forbidden-rule style, `warn → error` rollout | dependency-cruiser rules reference; lastminute.com; cubic.dev |

## Reading list

**Onion / Clean / Hexagonal**

- [The Onion Architecture: Part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — Jeffrey Palermo, 2008 (the original)
- [The Onion Architecture: Part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) — Palermo
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) — Alistair Cockburn (ports & adapters)
- [Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) — Herberto Graça, The Software Architecture Chronicles
- [Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/) — NDepend
- [Chop Onions Instead of Layers](https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php) — Methods & Tools
- [Clean Architecture: Layers, the Dependency Rule, and How It Compares to Onion and Hexagonal](https://generalistprogrammer.com/tutorials/clean-architecture-complete-guide)

**Node.js / TypeScript practice**

- [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) — Khalil Stemmler
- [Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/) — André Bazaglia
- [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — Sentry (Unit of Work with Drizzle `tx`; basis for §5 of `SKILL.md`)
- [Building Production-Ready REST APIs with Node.js, TypeScript, and Clean Architecture](https://sandeshrathnayake.medium.com/building-production-ready-rest-apis-with-node-js-57be767d1405)
- [fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) — Fastify 5 + clean architecture / DDD / CQRS reference project

**Enforcement**

- [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
- [How to maintain clean architecture with dependency rules in your codebase](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase) — cubic.dev
- [How We Enforce Architecture Boundaries at Scale](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/) — lastminute.com
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)

## Deliberate deviations from the textbook

- **No separate `domain/` folder in `server/`.** The domain lives in
  `reviewer-core/` and in the Zod contracts. Adding a third home for it would
  split the model across two packages for no gain.
- **No `application/`, `infrastructure/` top-level folders.** DevDigest slices
  by feature (`modules/<name>/`) and marks the ring by filename
  (`routes.ts` / `service.ts` / `repository.ts`). The gate keys off those names.
- **Data and infrastructure are one ring.** A persistence-backed adapter may use
  `src/db/`; the textbook diagram usually draws them apart.
- **No entity classes, no aggregates, no domain events.** Zod contracts plus
  pure functions. DDD tactical patterns are not part of this skill.
