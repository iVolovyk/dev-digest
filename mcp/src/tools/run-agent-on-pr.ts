import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import {
  ReviewRunResponseView,
  ReviewsListView,
  RunsListView,
} from '../api/schemas.js';
import { ApiError, seg } from '../api/client.js';
import { compactReview } from '../shape/findings.js';
import { ok, toolError } from './result.js';
import { apiErrorToToolResult, type ToolDef, type ToolDeps } from './shared.js';
import { agentMissMessage, pullMissMessage, repoMissMessage } from './resolution-messages.js';
import { findingsOutputShape } from './review-output.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  'Run a DevDigest review agent on a pull request and return its findings. Creates the run, waits for it to finish, and returns the result — one call, no polling needed. Takes up to several minutes.';

const inputSchema = z.object({
  repo: z.string().describe('GitHub repo as "owner/name", e.g. "acme/payments-api"'),
  pr: z.number().int().positive().describe('Pull request number, e.g. 42'),
  agent: z.string().describe('Agent name or id — call list_agents for valid values'),
  wait_seconds: z
    .number()
    .int()
    .min(10)
    .max(900)
    .optional()
    .describe('How long to wait for the review. Default 300.'),
});

const outputSchema = z.object({
  status: z.enum(['completed', 'timed_out', 'failed']),
  ...findingsOutputShape,
});

const TERMINAL_OK = 'done';
const TERMINAL_BAD = new Set(['failed', 'cancelled']);
const FAST_POLL_MS = 2_000;
const SLOW_POLL_MS = 5_000;
const FAST_POLL_WINDOW_MS = 30_000;

function emptyReview(): { verdict: null; score: null; summary: null; findings: [] } {
  return { verdict: null, score: null, summary: null, findings: [] };
}

export function runAgentOnPrTool(deps: ToolDeps): ToolDef {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  const handler = async (args: Record<string, unknown>): Promise<CallToolResult> => {
    const { repo, pr, agent, wait_seconds } = inputSchema.parse(args);
    const ctx = { repo, pr, agent };

    // ---- Resolve all three ONCE (cached, §6.0) --------------------------
    let pullId: string;
    let agentId: string;
    try {
      const repoRes = await deps.resolver.resolveRepo(repo);
      if (!repoRes.ok) return toolError(repoMissMessage(repo, repoRes));
      const pullRes = await deps.resolver.resolvePull(repoRes.repoId, pr);
      if (!pullRes.ok) return toolError(pullMissMessage(repo, pr, pullRes));
      const agentRes = await deps.resolver.resolveAgent(agent);
      if (!agentRes.ok) return toolError(agentMissMessage(agent, agentRes));
      pullId = pullRes.pullId;
      agentId = agentRes.agentId;
    } catch (err) {
      return apiErrorToToolResult(err, 'resolving repo, PR and agent');
    }

    // ---- Step 1: create the run --------------------------------------
    // NOTE: `POST /pulls/:id/review` ALWAYS returns `reviews: []`. Its
    // doc-comment (server .../review-api.ts) calls the run "synchronous" — it
    // is not: the service fires `void executeRuns(...)` and returns
    // immediately. Trusting the comment yields a tool that returns an empty
    // findings list and looks like it worked. We poll, then fetch.
    // Never send `{ all: true }` — this tool targets exactly one agent.
    let runId: string;
    try {
      const created = await deps.client.post(
        `/pulls/${seg(pullId)}/review`,
        { agentId },
        ReviewRunResponseView,
      );
      const first = created.runs[0];
      if (!first) {
        return toolError(
          `DevDigest accepted the request but started no run for agent "${agent}" on ${repo}#${pr}. ` +
            `Check the agent is configured, then try again.`,
        );
      }
      runId = first.run_id;
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        return toolError(
          'DevDigest is rate-limiting review starts (10 per minute). Wait about a minute and call run_agent_on_pr again.',
        );
      }
      return apiErrorToToolResult(err, 'starting the review');
    }

    // ---- Step 2: wait (poll GET /pulls/:id/runs) --------------------
    const deadlineMs = (wait_seconds ?? Math.round(deps.config.runTimeoutMs / 1000)) * 1_000;
    const startedAt = now();
    let failed = false;
    let terminalError: string | null = null;
    let completed = false;

    for (;;) {
      let runs;
      try {
        runs = await deps.client.get(`/pulls/${seg(pullId)}/runs`, RunsListView);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          // A GET is idempotent — back off and keep polling.
          await sleep(SLOW_POLL_MS);
          if (now() - startedAt >= deadlineMs) break;
          continue;
        }
        return apiErrorToToolResult(err, 'waiting for the review');
      }

      const run = runs.find((r) => r.run_id === runId);
      const status = run?.status ?? null;
      if (status === TERMINAL_OK) {
        completed = true;
        break;
      }
      if (status != null && TERMINAL_BAD.has(status)) {
        failed = true;
        terminalError = run?.error ?? null;
        break;
      }

      const elapsed = now() - startedAt;
      if (elapsed >= deadlineMs) break;
      await sleep(elapsed < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS);
    }

    if (failed) {
      return ok(
        {
          status: 'failed',
          ...ctx,
          ...emptyReview(),
          findings_count: 0,
          truncated: false,
        },
        `The review run failed: ${terminalError ?? 'no error message was recorded'}. ` +
          `Check the LLM API key in the DevDigest studio (Settings) and try again.`,
      );
    }

    if (!completed) {
      const waited = wait_seconds ?? Math.round(deps.config.runTimeoutMs / 1000);
      return ok(
        {
          status: 'timed_out',
          ...ctx,
          ...emptyReview(),
          findings_count: 0,
          truncated: false,
        },
        `The review is still running after ${waited}s. It will finish in the background — call ` +
          `get_findings with repo="${repo}" and pr=${pr} to collect the result.`,
      );
    }

    // ---- Step 3: fetch (select the review by run_id, not "newest") ----
    let reviews;
    try {
      reviews = await deps.client.get(`/pulls/${seg(pullId)}/reviews`, ReviewsListView);
    } catch (err) {
      return apiErrorToToolResult(err, 'fetching the finished review');
    }
    const mine = reviews.find((r) => r.run_id === runId);
    if (!mine) {
      return toolError(
        `The review for ${repo}#${pr} finished but could not be read back. Call get_findings with ` +
          `repo="${repo}" and pr=${pr}.`,
      );
    }

    const compact = compactReview(mine);
    return ok({ status: 'completed', ...ctx, ...compact });
  };

  return {
    name: 'run_agent_on_pr',
    description: DESCRIPTION,
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler,
  };
}
