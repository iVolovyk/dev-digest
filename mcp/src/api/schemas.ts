import { z } from 'zod';

/**
 * Minimal zod views of the API responses this package consumes.
 *
 * This package does NOT vendor or tsconfig-alias `@devdigest/shared` (the MCP
 * SDK v2 requires zod 4; the shared contracts are authored against zod 3, and
 * standalone packages have independent `node_modules`). Instead every schema
 * below is a `.passthrough()`-free partial view declaring only the fields we
 * forward — parsed with `safeParse`, and on failure the client raises an
 * `ApiShapeError` naming the endpoint (that is the drift detector).
 *
 * Each schema cites its upstream contract + line range. When a `server/`
 * contract touching agents / repos / pulls / reviews / conventions changes,
 * run `pnpm test:live` — hermetic tests only validate the shape we expect,
 * never the shape the API actually sends.
 */

// ← Agent, server/src/vendor/shared/contracts/knowledge.ts:259-275
// `provider` kept as a bare string (not the Provider enum) on purpose: a new
// provider added server-side must not break resolution here.
export const AgentView = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type AgentView = z.infer<typeof AgentView>;
export const AgentsListView = z.array(AgentView);

// ← Repo, server/src/vendor/shared/contracts/platform.ts:140-150
// snake_case `full_name` — NOT `fullName` (that is the Drizzle column name and
// never crosses the wire).
export const RepoView = z.object({
  id: z.string(),
  full_name: z.string(),
});
export type RepoView = z.infer<typeof RepoView>;
export const ReposListView = z.array(RepoView);

// ← PrMeta, server/src/vendor/shared/contracts/platform.ts:156-186
// `id` is `.nullish()` in the contract — an absent id means the PR is not
// resolvable to a UUID and the tool says so.
export const PullView = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
});
export type PullView = z.infer<typeof PullView>;
export const PullsListView = z.array(PullView);

// ← ReviewRunResponse, server/src/vendor/shared/contracts/review-api.ts:44-58
// `reviews` is ALWAYS `[]` here (see run-agent-on-pr.ts) — not modelled.
export const ReviewRunResponseView = z.object({
  pr_id: z.string(),
  runs: z.array(
    z.object({
      run_id: z.string(),
      agent_id: z.string(),
      agent_name: z.string(),
    }),
  ),
});
export type ReviewRunResponseView = z.infer<typeof ReviewRunResponseView>;

// ← RunSummary, server/src/vendor/shared/contracts/trace.ts:99-120
// status: running | done | failed | cancelled (bare string in the contract).
export const RunSummaryView = z.object({
  run_id: z.string(),
  status: z.string().nullable(),
  error: z.string().nullable(),
});
export type RunSummaryView = z.infer<typeof RunSummaryView>;
export const RunsListView = z.array(RunSummaryView);

// ← FindingRecord, server/src/vendor/shared/contracts/review-api.ts:16-20
//   extends Finding, server/src/vendor/shared/contracts/findings.ts:46-63
export const FindingView = z.object({
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
});
export type FindingView = z.infer<typeof FindingView>;

// ← ReviewRecord, server/src/vendor/shared/contracts/review-api.ts:23-40
//   (transport shape: server/src/modules/reviews/helpers.ts:18-32 `ReviewDto`)
export const ReviewView = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.string(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  created_at: z.string(),
  findings: z.array(FindingView),
});
export type ReviewView = z.infer<typeof ReviewView>;
export const ReviewsListView = z.array(ReviewView);

// ← ConventionCandidate, server/src/vendor/shared/contracts/knowledge.ts:223-235
export const ConventionCandidateView = z.object({
  rule: z.string(),
  category: z.string(),
  evidence_path: z.string().nullable(),
  evidence_start_line: z.number().int().nullable(),
  evidence_end_line: z.number().int().nullable(),
  confidence: z.number().nullable(),
  accepted: z.boolean(),
});
export type ConventionCandidateView = z.infer<typeof ConventionCandidateView>;
export const ConventionsListView = z.array(ConventionCandidateView);
