import { describe, expect, it } from 'vitest';
import { getFindingsTool } from '../src/tools/get-findings.js';
import { fakeFetch, makeDeps, structured, textOf } from './helpers.js';

const REPOS = [{ id: 'repo-1', full_name: 'acme/payments-api' }];
const PULLS = [{ id: 'pr-7', number: 7 }];

function review(over: Record<string, unknown> = {}) {
  return {
    id: 'rev-1',
    run_id: 'run-1',
    agent_id: 'a-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'comment',
    summary: 's',
    score: 70,
    created_at: '2026-08-20T10:00:00Z',
    findings: [],
    ...over,
  };
}

describe('get_findings', () => {
  it('errors forward when the PR has no review', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /pulls/pr-7/reviews': { json: [] },
    });
    const result = await getFindingsTool(makeDeps(fetch)).handler({ repo: 'acme/payments-api', pr: 7 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('run_agent_on_pr');
  });

  it('picks the newest review and lists the others', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /pulls/pr-7/reviews': {
        json: [
          review({ id: 'old', created_at: '2026-08-01T00:00:00Z', agent_name: 'General Reviewer' }),
          review({ id: 'new', created_at: '2026-08-25T00:00:00Z', agent_name: 'Security Reviewer' }),
        ],
      },
    });
    const tool = getFindingsTool(makeDeps(fetch));
    const result = await tool.handler({ repo: 'acme/payments-api', pr: 7 });
    const out = structured(result);
    expect(() => tool.outputSchema.parse(result.structuredContent)).not.toThrow();
    expect(out.agent).toBe('Security Reviewer');
    expect(out.other_reviews).toEqual([
      { agent: 'General Reviewer', created_at: '2026-08-01T00:00:00Z' },
    ]);
  });

  it('narrows to one agent and errors forward when that agent has no review', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /agents': { json: [] },
      'GET /pulls/pr-7/reviews': { json: [review({ agent_name: 'General Reviewer' })] },
    });
    const result = await getFindingsTool(makeDeps(fetch)).handler({
      repo: 'acme/payments-api',
      pr: 7,
      agent: 'Security Reviewer',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('General Reviewer');
  });
});
