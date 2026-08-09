/**
 * Onion-architecture gate for @devdigest/api.
 *
 * One rule: dependencies point INWARD only.
 *
 *   presentation   src/modules/*\/routes.ts, src/app.ts, src/server.ts
 *   infrastructure src/adapters/**, src/db/**, src/modules/*\/repository*
 *   application    src/modules/*\/(everything else)
 *   ports          src/vendor/shared/adapters.ts
 *   core           src/vendor/shared/contracts/**, ../reviewer-core/src/**
 *
 * `src/platform/container.ts` is the composition root — it is the ONE place
 * allowed to see every layer at once, so it is exempt from the layer rules.
 *
 * Severities: `error` = the boundary is clean today, keep it clean.
 * `warn` = pre-existing drift documented in
 * `.claude/skills/onion-architecture/references/this-project.md` — the target
 * state, not yet the real one. Never add to a `warn`; fix the rule's violations
 * and promote it to `error`.
 *
 * Run: `pnpm arch` (from server/). Docs:
 * https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
 */

/** Everything under a feature module that is not its route or its repository. */
const APPLICATION = '^src/modules/[^/]+/(?!routes\\.ts$|repository)';
const ROUTES = '^src/modules/[^/]+/routes\\.ts$';
const REPOSITORY = '^src/modules/[^/]+/repository(\\.ts$|/)';

/** The composition root + bootstrap: allowed to wire every layer together. */
const COMPOSITION_ROOT = '^src/(platform/container\\.ts|app\\.ts|server\\.ts)$';

/**
 * Infrastructure packages that must never be seen above the data layer.
 * NOTE: `to.path` is matched against the RESOLVED path, and pnpm resolves into
 * `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…` — so these patterns are
 * deliberately unanchored. A bare-specifier pattern like `^drizzle-orm$` silently
 * matches nothing here.
 */
const ORM_PACKAGES = 'node_modules/(drizzle-orm|drizzle-kit|postgres)/';
const OUTER_PACKAGES =
  'node_modules/(fastify|@fastify|drizzle-orm|postgres|octokit|simple-git|openai|@anthropic-ai|@ast-grep)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'A cycle means the two files are really one module. Split the shared part out, or ' +
        'move the dependency behind a port. Known drift: 5 cycles, all of them a symptom of ' +
        'service-no-container (service imports Container, Container constructs service) plus ' +
        'agents/helpers.ts <-> agents/repository.ts. A NEW cycle that does not run through ' +
        'platform/container.ts is a defect, not drift.',
      from: {},
      to: { circular: true },
    },

    // ---- core: the innermost ring knows nothing --------------------------
    {
      name: 'contracts-stay-pure',
      severity: 'error',
      comment:
        'src/vendor/shared is @devdigest/shared — the domain contracts + ports every ' +
        'package consumes. It may import Zod and itself, nothing else. A framework or ' +
        'ORM import here leaks all the way out to client/ and e2e/.',
      from: { path: '^src/vendor/shared' },
      to: { path: ['^src/(modules|adapters|db|platform)', OUTER_PACKAGES] },
    },

    // ---- application: depends on ports, never on implementations ---------
    {
      name: 'service-no-concrete-adapter',
      severity: 'warn',
      comment:
        'R1/R2 — a service depends on the PORT (@devdigest/shared adapters.ts), never on ' +
        'a concrete adapter. Resolve the implementation in platform/container.ts and pass ' +
        'it in. Known drift: repo-intel (astgrep, codeindex) and reviews/diff-loader ' +
        '(git/diff-parser) import adapters directly.',
      from: { path: APPLICATION, pathNot: COMPOSITION_ROOT },
      to: { path: '^src/adapters/(?!mocks\\.ts$)' },
    },
    {
      name: 'service-no-orm',
      severity: 'warn',
      comment:
        'R3 — Drizzle stops at the repository. A service works with contract types from ' +
        '@devdigest/shared; row -> domain mapping happens inside repository*. Known drift: ' +
        'reviews/{service,run-executor,diff-loader} and repos/helpers import db/schema + db/rows.',
      from: { path: APPLICATION, pathNot: COMPOSITION_ROOT },
      to: { path: ['^src/db/'], dependencyTypes: ['local'] },
    },
    {
      name: 'service-no-orm-package',
      severity: 'warn',
      comment:
        'R3 — `drizzle-orm` operators (eq, and, desc, ...) above the data layer mean query ' +
        'building has leaked into application code. Move the query into repository*. ' +
        'Known drift: settings/feature-models.ts builds its queries inline.',
      from: { path: APPLICATION, pathNot: COMPOSITION_ROOT },
      to: { path: ORM_PACKAGES, dependencyTypes: ['npm'] },
    },
    {
      name: 'service-no-container',
      severity: 'warn',
      comment:
        'R2 — taking the whole Container is service location, not dependency injection: the ' +
        'signature stops telling you what the service needs. Take the ports in the ' +
        'constructor. Known drift: ReviewService/RepoIntelService are container-shaped.',
      from: { path: APPLICATION, pathNot: COMPOSITION_ROOT },
      to: { path: '^src/platform/container\\.ts$' },
    },

    // ---- presentation: thin ----------------------------------------------
    {
      name: 'routes-no-db',
      severity: 'warn',
      comment:
        'R4 — routes.ts is Zod schema -> service call -> DTO. Data access belongs in a ' +
        'repository, reached through a service. Known drift: settings/polling/workspace/pulls ' +
        'query Drizzle straight from the route (those modules have no repository yet).',
      from: { path: ROUTES },
      to: { path: ['^src/db/', ORM_PACKAGES] },
    },

    // ---- data + infrastructure: never reach upward -----------------------
    {
      name: 'repository-no-upward',
      severity: 'error',
      comment:
        'A repository is the innermost edge of the data layer: it may see db/** and the ' +
        'contracts, never a service, a route, or an adapter.',
      from: { path: REPOSITORY },
      to: { path: ['^src/modules/[^/]+/(service|routes|run-executor)', '^src/adapters/'] },
    },
    {
      name: 'db-no-upward',
      severity: 'error',
      comment:
        'src/db is schema + client + migrations. It must not know that features exist. ' +
        '(seed*.ts is exempt — it is a script, not a layer.)',
      from: { path: '^src/db/', pathNot: '^src/db/seed' },
      to: { path: ['^src/modules/', '^src/adapters/', '^src/platform/'] },
    },
    {
      name: 'adapters-no-container',
      severity: 'error',
      comment:
        'An adapter is CONSTRUCTED by the composition root; it must never read from it. ' +
        'Everything it needs arrives through its constructor. ' +
        '(src/db/ is deliberately NOT forbidden here: adapters and repositories are the same ' +
        'outer ring, so a persistence-backed adapter such as LocalNoAuthProvider may use it.)',
      from: { path: '^src/adapters/', pathNot: '^src/adapters/mocks\\.ts$' },
      to: { path: ['^src/platform/container\\.ts$'] },
    },
    {
      name: 'adapters-no-modules',
      severity: 'warn',
      comment:
        'An adapter implements a port and knows nothing about the features that use it. ' +
        'What it needs from a feature belongs in the port contract or in its constructor. ' +
        'Known drift: adapters/{astgrep,depgraph} read modules/repo-intel/constants.ts.',
      from: { path: '^src/adapters/', pathNot: '^src/adapters/mocks\\.ts$' },
      to: { path: '^src/modules/' },
    },

    // ---- module boundaries -----------------------------------------------
    {
      name: 'no-cross-module',
      severity: 'warn',
      comment:
        'R5 — feature modules are siblings, not a hierarchy. Share through ' +
        'platform/container.ts (as agentsRepo/reviewRepo already do) or modules/_shared. ' +
        'Known drift: repos/service.ts imports repo-intel/constants.ts.',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/(index\\.ts|_shared/)' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|clones)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    /** Type-only imports count — most layer leakage is `import type`. */
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
