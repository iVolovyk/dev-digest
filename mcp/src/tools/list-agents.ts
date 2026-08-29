import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { AgentsListView } from '../api/schemas.js';
import { compactAgent } from '../shape/agents.js';
import { ok } from './result.js';
import { apiErrorToToolResult, type ToolDef, type ToolDeps } from './shared.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  'List the review agents configured in DevDigest. Use this to get a valid agent value for run_agent_on_pr.';

const inputSchema = z.object({});

const outputSchema = z.object({
  count: z.number().int(),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      provider: z.string(),
      model: z.string(),
      enabled: z.boolean(),
    }),
  ),
});

export function listAgentsTool(deps: ToolDeps): ToolDef {
  const handler = async (): Promise<CallToolResult> => {
    let agents;
    try {
      agents = await deps.client.get('/agents', AgentsListView);
    } catch (err) {
      return apiErrorToToolResult(err, 'listing agents');
    }
    if (agents.length === 0) {
      return ok(
        { count: 0, agents: [] },
        'No agents are configured. Create one in the DevDigest studio (Agents).',
      );
    }
    const compact = agents.map(compactAgent);
    return ok({ count: compact.length, agents: compact });
  };

  return {
    name: 'list_agents',
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
