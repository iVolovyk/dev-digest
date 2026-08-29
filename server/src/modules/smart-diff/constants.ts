import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — every classification pattern, every ordering rule, and every
 * numeric threshold. `classify.ts` and `split.ts` hold control flow only and
 * import everything they need from here (smart-diff-plan.md §3, §5; acceptance
 * criterion 5).
 *
 * Prior art per set:
 *  - Lock files / generated dirs / generated extensions: GitHub Linguist's
 *    `generated.rb` + GitLab's `gitlab-generated` auto-collapse mechanism.
 *  - `too_big` line count excluding boilerplate: `noqcks/pull-request-size`.
 *  - ~400 changed lines as "too large to review": bssw.io convergence point,
 *    top of `pull-request-size`'s L band.
 *
 * The WIRING_* sets below are REPO-SPECIFIC JUDGEMENT. There is no industry
 * standard for "wiring files" — the only recognised neighbour is the barrel
 * file (an `index.*` re-export aggregator). `index.*` / `routes.ts` /
 * `container.ts` / `*.config.*` / CI workflow files are drawn from this repo's
 * own layout and are expected to need tuning against a real imported repo;
 * keeping them here is what makes that a one-line change.
 */

// ---- path helpers (used only to assemble the rule closures below) ----------
const baseNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
/** Directory segments only (the file name itself is excluded). */
const dirSegmentsOf = (path: string): string[] => path.split('/').slice(0, -1);

// ---- boilerplate: lock files (unconditional — no size or findings override) -
export const BOILERPLATE_LOCKFILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'bun.lockb',
  'Cargo.lock',
  'go.sum',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
]);

/**
 * Exact basenames beyond lock files. `package.json` lives here by product
 * decision (Open Question 1, resolved 2026-08-27): match the reference mockup,
 * which groups it with `package-lock.json` under Boilerplate. Residual risk
 * accepted: a dependency bump collapses by default like its lock file and only
 * surfaces if it carries a finding.
 */
export const BOILERPLATE_FILENAMES: ReadonlySet<string> = new Set(['package.json']);

/** Path segments that mark generated / vendored trees. */
export const BOILERPLATE_DIR_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '__generated__',
  '__snapshots__',
  'vendor',
]);

/** Multi-segment path fragments that mark generated trees. */
export const BOILERPLATE_PATH_INFIXES: readonly string[] = ['migrations/meta/'];

/** Compound file suffixes matched with `endsWith`. */
export const BOILERPLATE_EXTENSIONS: readonly string[] = [
  '.map',
  '.min.js',
  '.min.css',
  '.snap',
  '.lock',
];

/** Filename patterns for generated files. */
export const BOILERPLATE_FILENAME_RES: readonly RegExp[] = [
  /\.generated\./,
  /\.gen\.ts$/,
  /\.pb\.go$/,
  /\.d\.ts$/,
];

// ---- wiring: repo-specific judgement (see file header) --------------------
export const WIRING_FILENAMES: ReadonlySet<string> = new Set([
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'routes.ts',
  'container.ts',
]);

export const WIRING_FILENAME_RES: readonly RegExp[] = [
  /\.config\.[^.]+$/,
  /^tsconfig.*\.json$/,
  /^\.eslintrc/,
  /^Dockerfile/,
  /^docker-compose[\w.-]*\.ya?ml$/,
];

export const WIRING_PATH_INFIXES: readonly string[] = ['.github/workflows/'];

// ---- the ordered rule list (first match wins) ----------------------------
export interface SmartDiffRule {
  role: SmartDiffRole;
  matches: (path: string) => boolean;
}

/**
 * Evaluated top to bottom, first match wins. Boilerplate rules precede wiring
 * rules so a generated `dist/index.js` classifies `boilerplate`, not `wiring`
 * (it is both "generated" and "named index"; boilerplate must win).
 */
export const SMART_DIFF_RULES: readonly SmartDiffRule[] = [
  { role: 'boilerplate', matches: (p) => BOILERPLATE_LOCKFILES.has(baseNameOf(p)) },
  { role: 'boilerplate', matches: (p) => BOILERPLATE_FILENAMES.has(baseNameOf(p)) },
  {
    role: 'boilerplate',
    matches: (p) => dirSegmentsOf(p).some((seg) => BOILERPLATE_DIR_SEGMENTS.has(seg)),
  },
  { role: 'boilerplate', matches: (p) => BOILERPLATE_PATH_INFIXES.some((inf) => p.includes(inf)) },
  {
    role: 'boilerplate',
    matches: (p) => BOILERPLATE_EXTENSIONS.some((ext) => baseNameOf(p).endsWith(ext)),
  },
  { role: 'boilerplate', matches: (p) => BOILERPLATE_FILENAME_RES.some((re) => re.test(baseNameOf(p))) },
  { role: 'wiring', matches: (p) => WIRING_FILENAMES.has(baseNameOf(p)) },
  { role: 'wiring', matches: (p) => WIRING_FILENAME_RES.some((re) => re.test(baseNameOf(p))) },
  { role: 'wiring', matches: (p) => WIRING_PATH_INFIXES.some((inf) => p.includes(inf)) },
];

/**
 * The fallback role for an unrecognised path — a deliberate
 * "fail-toward-attention" default. There is no `core` pattern list: a file
 * wrongly marked `boilerplate` is silently collapsed away from the reviewer,
 * while a file wrongly marked `core` only costs a few seconds of scrolling.
 */
export const SMART_DIFF_DEFAULT_ROLE: SmartDiffRole = 'core';

/** Group emission order — the server emits `groups` already in this order. */
export const SMART_DIFF_ROLE_ORDER = ['core', 'wiring', 'boilerplate'] as const satisfies readonly SmartDiffRole[];

/**
 * Compile-time guard: `SMART_DIFF_ROLE_ORDER` must enumerate every `SmartDiffRole`.
 * `groupAndSort` only visits the roles listed here, so a role added to the shared
 * enum without being ordered here would be silently dropped from `groups`. Adding
 * one now fails the build instead.
 */
type _RoleOrderIsExhaustive =
  Exclude<SmartDiffRole, (typeof SMART_DIFF_ROLE_ORDER)[number]> extends never
    ? true
    : ['SMART_DIFF_ROLE_ORDER is missing a SmartDiffRole'];
const _roleOrderIsExhaustive: _RoleOrderIsExhaustive = true;
void _roleOrderIsExhaustive;

/** Roles whose line counts feed `split_suggestion.total_lines` (boilerplate excluded). */
export const SPLIT_COUNTED_ROLES: readonly SmartDiffRole[] = ['core', 'wiring'];

// ---- split-suggestion thresholds ----------------------------------------
/** `too_big` when counted changed lines exceed this (top of the L band). */
export const SPLIT_TOO_BIG_LINES = 400;
/** Directory-prefix depth used to bucket files into proposed splits. */
export const SPLIT_GROUP_PATH_DEPTH = 2;
/** A bucket needs at least this many files to be a proposed split. */
export const MIN_SPLIT_GROUP_FILES = 2;
/** Fewer surviving buckets than this → return `[]` (honest silence). */
export const MIN_SPLIT_BUCKETS = 2;
/** Cap on how many proposed splits are returned. */
export const MAX_PROPOSED_SPLITS = 4;
