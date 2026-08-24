/**
 * Onion-architecture gate for @devdigest/reviewer-core — the innermost ring.
 *
 * reviewer-core is the pure review engine: diff -> prompt -> LLM -> grounded
 * findings. Its ONLY side effect is an injected `LLMProvider`. That purity is
 * what makes it mock-testable with no keys and no network, and what lets both
 * the server and the CI runner consume it as source.
 *
 * Lives in server/ (not reviewer-core/) on purpose: `dependency-cruiser` is
 * already a server dependency, so reviewer-core's own lockfile stays untouched.
 * Run via `pnpm arch` from server/.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle in the engine means the pipeline stages are not really separate.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'R6 — the engine must not touch the filesystem, a database, a process, or a ' +
        'transport. Anything external arrives as an injected port (LLMProvider) or as a ' +
        'plain argument. Adding an import here breaks the CI runner and every hermetic test.',
      from: {},
      to: {
        // `to.path` matches the RESOLVED path: node builtins stay bare (`fs`),
        // npm packages resolve through pnpm's store, so those patterns are unanchored.
        path: [
          '^node:(fs|child_process|http|https|net|dns|worker_threads)$',
          '^(fs|child_process|http|https|net|dns|worker_threads)$',
          'node_modules/(drizzle-orm|postgres|pg|fastify|@fastify|octokit|simple-git|@ast-grep|dotenv)/',
        ],
      },
    },
    {
      name: 'core-not-outward',
      severity: 'error',
      comment:
        'The engine is the centre of the onion — it cannot reach into the server that ' +
        'consumes it. Anything the engine needs is passed in by the caller.',
      from: {},
      to: { path: '(^|/)server/src/' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
