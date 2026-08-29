import { describe, expect, it } from 'vitest';
import { listAgentsTool } from '../src/tools/list-agents.js';
import { fakeFetch, makeDeps, structured, textOf } from './helpers.js';

const AGENTS = [
  {
    id: 'a-1',
    name: 'General Reviewer',
    description: 'x'.repeat(300),
    provider: 'openai',
    model: 'gpt-4o',
    enabled: true,
    system_prompt: 'SECRET LONG PROMPT '.repeat(500),
    version: 3,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
];

describe('list_agents', () => {
  it('returns compact rows with system_prompt absent and description truncated', async () => {
    const { fetch } = fakeFetch({ 'GET /agents': { json: AGENTS } });
    const tool = listAgentsTool(makeDeps(fetch));
    const result = await tool.handler({});
    const out = structured(result);
    expect(() => tool.outputSchema.parse(result.structuredContent)).not.toThrow();
    expect(out.count).toBe(1);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('system_prompt');
    expect(serialized).not.toContain('SECRET LONG PROMPT');
    const agent = (out.agents as Record<string, unknown>[])[0]!;
    expect(agent).toEqual({
      id: 'a-1',
      name: 'General Reviewer',
      description: `${'x'.repeat(140)}…`,
      provider: 'openai',
      model: 'gpt-4o',
      enabled: true,
    });
  });

  it('reports an empty list as a non-error with studio guidance', async () => {
    const { fetch } = fakeFetch({ 'GET /agents': { json: [] } });
    const result = await listAgentsTool(makeDeps(fetch)).handler({});
    expect(result.isError).toBe(false);
    expect(textOf(result)).toContain('Create one in the DevDigest studio');
  });

  it('fails forward when the API is unreachable', async () => {
    const { fetch } = fakeFetch({ 'GET /agents': { throw: 'TypeError' } });
    const result = await listAgentsTool(makeDeps(fetch)).handler({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Start it first: ./scripts/dev.sh');
  });
});
