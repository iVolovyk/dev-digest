import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { BlastRadiusView } from '../api/schemas.js';
import { seg } from '../api/client.js';
import { compactBlast } from '../shape/blast.js';
import { ok, toolError } from './result.js';
import { apiErrorToToolResult, type ToolDef, type ToolDeps } from './shared.js';
import { pullMissMessage, repoMissMessage } from './resolution-messages.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  'Get the blast radius of a pull request: which symbols changed, who calls them, ' +
  'and which HTTP endpoints and cron jobs sit downstream. Read-only; served from ' +
  'the repository index.';

// The final signature, declared now so it never changes.
const inputSchema = z.object({
  repo: z.string(),
  pr: z.number().int().positive(),
});

const outputSchema = z.object({
  repo: z.string(),
  pr: z.number().int(),
  summary: z.string(),
  index_state: z.enum(['full', 'partial', 'degraded', 'failed']),
  partial: z.boolean(),
  reason: z.string().nullable(),
  summary_generated: z.boolean(),
  changed_symbols: z.array(z.string()),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.string()),
      callers_shown: z.number().int(),
      callers_total: z.number().int(),
      endpoints: z.array(z.string()),
      crons: z.array(z.string()),
    }),
  ),
});

export function getBlastRadiusTool(deps: ToolDeps): ToolDef {
  const handler = async (args: Record<string, unknown>): Promise<CallToolResult> => {
    const { repo, pr } = inputSchema.parse(args);

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

    let blast;
    try {
      blast = await deps.client.get(`/pulls/${seg(pullId)}/blast`, BlastRadiusView);
    } catch (err) {
      return apiErrorToToolResult(err, 'reading the blast radius');
    }

    return ok({ repo, pr, ...compactBlast(blast) });
  };

  return {
    name: 'get_blast_radius',
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
