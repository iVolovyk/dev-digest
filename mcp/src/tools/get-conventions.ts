import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { ConventionsListView } from '../api/schemas.js';
import { seg } from '../api/client.js';
import { compactConventions } from '../shape/conventions.js';
import { ok, toolError } from './result.js';
import { apiErrorToToolResult, type ToolDef, type ToolDeps } from './shared.js';
import { repoMissMessage } from './resolution-messages.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  'Get the coding conventions DevDigest has already extracted for a repo. Read-only — this never triggers extraction.';

const inputSchema = z.object({
  repo: z.string().describe('GitHub repo as "owner/name", e.g. "acme/payments-api"'),
});

const outputSchema = z.object({
  status: z.enum(['ok', 'no_conventions_cached']),
  repo: z.string(),
  count: z.number().int(),
  accepted_count: z.number().int(),
  conventions: z.array(
    z.object({
      rule: z.string(),
      category: z.string(),
      evidence: z.string().nullable(),
      confidence: z.number().nullable(),
      accepted: z.boolean(),
    }),
  ),
});

export function getConventionsTool(deps: ToolDeps): ToolDef {
  const handler = async (args: Record<string, unknown>): Promise<CallToolResult> => {
    const { repo } = inputSchema.parse(args);

    let repoId: string;
    try {
      const resolved = await deps.resolver.resolveRepo(repo);
      if (!resolved.ok) return toolError(repoMissMessage(repo, resolved));
      repoId = resolved.repoId;
    } catch (err) {
      return apiErrorToToolResult(err, 'looking up the repo');
    }

    let candidates;
    try {
      // ONLY this endpoint. `POST /repos/:id/conventions/extract` must never
      // appear in this package: it samples files, calls an LLM, costs money and
      // minutes, and REPLACES the repo's existing candidates — a destructive,
      // expensive write triggered by a tool the model believes is a read.
      candidates = await deps.client.get(
        `/repos/${seg(repoId)}/conventions`,
        ConventionsListView,
      );
    } catch (err) {
      return apiErrorToToolResult(err, 'reading conventions');
    }

    if (candidates.length === 0) {
      return ok(
        { status: 'no_conventions_cached', repo, count: 0, accepted_count: 0, conventions: [] },
        `No conventions have been extracted for ${repo} yet. This tool only reads already-extracted ` +
          `conventions — it deliberately does not run the extraction pipeline, which calls an LLM. ` +
          `Run it from the DevDigest studio (Skills Lab → Conventions) and then call get_conventions again.`,
      );
    }

    const conventions = compactConventions(candidates);
    return ok({
      status: 'ok',
      repo,
      count: conventions.length,
      accepted_count: conventions.filter((c) => c.accepted).length,
      conventions,
    });
  };

  return {
    name: 'get_conventions',
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
