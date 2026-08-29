/**
 * PURE. Agent contract row → compact agent row.
 *
 * Drops `system_prompt` (the single largest field, often thousands of tokens
 * and useless to a tool caller), `output_schema`, `version`, `strategy`,
 * `ci_fail_on`, `repo_intel`. Keeps `description` truncated — enough to tell
 * General from Security, cheap at ~5 agents.
 */

export const MAX_AGENT_DESCRIPTION_CHARS = 140;

export interface RawAgent {
  id: string;
  name: string;
  description?: string | null | undefined;
  provider: string;
  model: string;
  enabled: boolean;
}

export interface CompactAgent {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  enabled: boolean;
}

export function compactAgent(a: RawAgent): CompactAgent {
  const description =
    a.description != null && a.description.length > MAX_AGENT_DESCRIPTION_CHARS
      ? `${a.description.slice(0, MAX_AGENT_DESCRIPTION_CHARS)}…`
      : (a.description ?? null);
  return {
    id: a.id,
    name: a.name,
    description,
    provider: a.provider,
    model: a.model,
    enabled: a.enabled,
  };
}
