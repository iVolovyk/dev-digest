import type { CallToolResult } from '@modelcontextprotocol/server';

/**
 * The two — and only two — MCP result shapes, in one place, so the
 * tool-error-vs-protocol-error split (§4) is never decided ad hoc per tool.
 *
 * When a tool declares an `outputSchema` the server MUST return conforming
 * `structuredContent` and SHOULD also return the serialized JSON in a text
 * block for backwards compatibility — `ok()` does both.
 */

/**
 * A successful result. `structured` must conform to the tool's `outputSchema`.
 * `text` is an optional human/agent-facing sentence; when omitted the serialized
 * JSON is used as the text block.
 */
export function ok(structured: unknown, text?: string): CallToolResult {
  return {
    content: [{ type: 'text', text: text ?? JSON.stringify(structured, null, 2) }],
    structuredContent: structured as Record<string, unknown>,
    isError: false,
  };
}

/**
 * A tool-execution error (`isError: true`) — self-correctable by the model or
 * fixable by the user. Takes a MESSAGE, not a code: the message *is* the
 * interface (principle 4). Every call site passes a sentence naming the next
 * action.
 */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
