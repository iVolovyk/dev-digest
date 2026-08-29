import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { ApiClient } from '../api/client.js';
import { ApiError, ApiShapeError, ApiTimeoutError, ApiUnreachableError } from '../api/client.js';
import type { Resolver } from '../api/resolve.js';
import { toolError } from './result.js';

/** Everything a tool factory needs. Passed by `buildRegistry`. */
export interface ToolDeps {
  client: ApiClient;
  resolver: Resolver;
  config: Config;
  logger: Logger;
  /** DI seam for `run_agent_on_pr`'s poll loop. */
  sleep?: (ms: number) => Promise<void>;
  /** DI seam for `run_agent_on_pr`'s deadline. */
  now?: () => number;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
}

/** One registered tool. `description` is copied verbatim from plan §6.-1. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>, ctx?: unknown) => Promise<CallToolResult>;
}

/**
 * Map the client's structured failures to a forward-guiding tool error.
 * Anything unmapped rethrows — a genuine bug should surface, not be swallowed
 * into a misleading tool error.
 */
export function apiErrorToToolResult(err: unknown, whileDoing: string): CallToolResult {
  if (err instanceof ApiUnreachableError) return toolError(err.message);
  if (err instanceof ApiTimeoutError) {
    return toolError(`${err.message} Retry once the API is responsive.`);
  }
  if (err instanceof ApiShapeError) {
    return toolError(
      `The DevDigest API returned an unexpected response while ${whileDoing} (${err.message}). ` +
        `The API version may be out of step with this MCP server.`,
    );
  }
  if (err instanceof ApiError) {
    return toolError(`DevDigest API error while ${whileDoing}: ${err.message}`);
  }
  throw err;
}

const MAX_LISTED = 20;

/** "a, b, c" — or "a, b, … (+N more)" past the cap. Used in resolution errors. */
export function formatList(items: string[]): string {
  if (items.length <= MAX_LISTED) return items.join(', ');
  return `${items.slice(0, MAX_LISTED).join(', ')}, … (+${items.length - MAX_LISTED} more)`;
}
