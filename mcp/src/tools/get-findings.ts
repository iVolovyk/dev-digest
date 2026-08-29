import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { ReviewsListView, type ReviewView } from '../api/schemas.js';
import { seg } from '../api/client.js';
import { compactReview } from '../shape/findings.js';
import { ok, toolError } from './result.js';
import { apiErrorToToolResult, formatList, type ToolDef, type ToolDeps } from './shared.js';
import { pullMissMessage, repoMissMessage } from './resolution-messages.js';
import { findingsOutputShape } from './review-output.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  'Get the findings from the most recent completed review of a pull request. Use run_agent_on_pr first if the PR has not been reviewed.';

const inputSchema = z.object({
  repo: z.string().describe('GitHub repo as "owner/name", e.g. "acme/payments-api"'),
  pr: z.number().int().positive().describe('Pull request number, e.g. 42'),
  agent: z.string().optional().describe('Optional: narrow to one agent\'s review (name or id)'),
});

const outputSchema = z.object({
  ...findingsOutputShape,
  other_reviews: z.array(z.object({ agent: z.string(), created_at: z.string() })),
});

function reviewAgentLabel(r: ReviewView): string {
  return r.agent_name ?? r.agent_id ?? 'unknown';
}

function matchesAgent(r: ReviewView, agent: string, agentId: string | null): boolean {
  if (agentId && r.agent_id === agentId) return true;
  return (r.agent_name ?? '').toLowerCase() === agent.toLowerCase() || r.agent_id === agent;
}

export function getFindingsTool(deps: ToolDeps): ToolDef {
  const handler = async (args: Record<string, unknown>): Promise<CallToolResult> => {
    const { repo, pr, agent } = inputSchema.parse(args);

    let pullId: string;
    try {
      const repoRes = await deps.resolver.resolveRepo(repo);
      if (!repoRes.ok) return toolError(repoMissMessage(repo, repoRes));
      const pullRes = await deps.resolver.resolvePull(repoRes.repoId, pr);
      if (!pullRes.ok) return toolError(pullMissMessage(repo, pr, pullRes));
      pullId = pullRes.pullId;
    } catch (err) {
      return apiErrorToToolResult(err, 'looking up the pull request');
    }

    let agentId: string | null = null;
    if (agent !== undefined) {
      try {
        const agentRes = await deps.resolver.resolveAgent(agent);
        if (agentRes.ok) agentId = agentRes.agentId;
      } catch {
        /* fall back to name/id string matching below */
      }
    }

    let reviews;
    try {
      reviews = await deps.client.get(`/pulls/${seg(pullId)}/reviews`, ReviewsListView);
    } catch (err) {
      return apiErrorToToolResult(err, 'reading reviews');
    }

    const all = reviews.filter((r) => r.kind === 'review');
    if (all.length === 0) {
      return toolError(
        `No review has been run on ${repo}#${pr} yet. Call run_agent_on_pr with ` +
          `repo="${repo}", pr=${pr} and an agent from list_agents.`,
      );
    }

    const scoped =
      agent === undefined ? all : all.filter((r) => matchesAgent(r, agent, agentId));
    if (scoped.length === 0) {
      const withReviews = [...new Set(all.map(reviewAgentLabel))];
      return toolError(
        `No review by agent "${agent}" on ${repo}#${pr}. Agents with a review here: ${formatList(withReviews)}.`,
      );
    }

    const sorted = [...scoped].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const selected = sorted[0]!;
    const compact = compactReview(selected);

    const other_reviews = all
      .filter((r) => r.id !== selected.id)
      .map((r) => ({ agent: reviewAgentLabel(r), created_at: r.created_at }));

    return ok({
      repo,
      pr,
      agent: reviewAgentLabel(selected),
      ...compact,
      other_reviews,
    });
  };

  return {
    name: 'get_findings',
    description: DESCRIPTION,
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler,
  };
}
