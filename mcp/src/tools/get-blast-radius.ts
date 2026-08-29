import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { ok } from './result.js';
import type { ToolDef, ToolDeps } from './shared.js';

// Verbatim from plan §6.-1 — do not paraphrase.
const DESCRIPTION =
  "Not implemented yet. Reserved for impact analysis of a PR's changes (which symbols and callers it affects).";

// The final signature, declared now so it never changes.
const inputSchema = z.object({
  repo: z.string(),
  pr: z.number().int().positive(),
});

const outputSchema = z.object({
  status: z.literal('not_implemented'),
  feature: z.literal('blast_radius'),
  message: z.string(),
});

const PAYLOAD = {
  status: 'not_implemented' as const,
  feature: 'blast_radius' as const,
  message:
    'get_blast_radius is not implemented yet. It is registered so the tool surface stays stable, and will return impacted symbols and callers in a later DevDigest release. For risk signals on this PR today, use get_findings (or run_agent_on_pr if it has not been reviewed).',
};

export function getBlastRadiusTool(_deps: ToolDeps): ToolDef {
  // Makes no HTTP call at all — it does not even resolve repo/pr (no point
  // validating inputs it will not use, and resolution costs a GitHub round-trip).
  const handler = async (): Promise<CallToolResult> => ok(PAYLOAD);

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
