import { describe, expect, it } from 'vitest';
import { runAgentOnPrTool } from '../src/tools/run-agent-on-pr.js';
import { fakeFetch, makeDeps, structured, textOf } from './helpers.js';

const REPOS = [{ id: 'repo-1', full_name: 'acme/payments-api' }];
const PULLS = [{ id: 'pr-7', number: 7 }];
const AGENTS = [
  { id: 'a-sec', name: 'Security Reviewer', provider: 'openai', model: 'gpt-4o', enabled: true },
];
const RUN_CREATED = {
  pr_id: 'pr-7',
  runs: [{ run_id: 'run-9', agent_id: 'a-sec', agent_name: 'Security Reviewer' }],
};

const baseRoutes = () => ({
  'GET /repos': { json: REPOS },
  'GET /repos/repo-1/pulls': { json: PULLS },
  'GET /agents': { json: AGENTS },
});

function args(over: Record<string, unknown> = {}) {
  return { repo: 'acme/payments-api', pr: 7, agent: 'Security Reviewer', ...over };
}

describe('run_agent_on_pr', () => {
  it('creates one run, polls to done, and returns the run-matched review', async () => {
    const { fetch, calls } = fakeFetch({
      ...baseRoutes(),
      'POST /pulls/pr-7/review': { json: RUN_CREATED },
      'GET /pulls/pr-7/runs': [
        { json: [{ run_id: 'run-9', status: 'running', error: null }] },
        { json: [{ run_id: 'run-9', status: 'running', error: null }] },
        { json: [{ run_id: 'run-9', status: 'done', error: null }] },
      ],
      'GET /pulls/pr-7/reviews': {
        json: [
          {
            id: 'other',
            run_id: 'run-OTHER',
            agent_id: 'a-gen',
            agent_name: 'General',
            kind: 'review',
            verdict: 'approve',
            summary: 'not mine',
            score: 99,
            created_at: '2026-08-25T00:00:00Z',
            findings: [],
          },
          {
            id: 'mine',
            run_id: 'run-9',
            agent_id: 'a-sec',
            agent_name: 'Security Reviewer',
            kind: 'review',
            verdict: 'request_changes',
            summary: 'mine',
            score: 40,
            created_at: '2026-08-25T00:01:00Z',
            findings: [
              {
                severity: 'CRITICAL',
                category: 'security',
                title: 'SQLi',
                file: 'src/db.ts',
                start_line: 5,
                end_line: 5,
                rationale: 'unsanitised input',
                suggestion: 'parameterise',
              },
            ],
          },
        ],
      },
    });
    const tool = runAgentOnPrTool(makeDeps(fetch));
    const result = await tool.handler(args());
    const out = structured(result);
    expect(() => tool.outputSchema.parse(result.structuredContent)).not.toThrow();
    expect(out.status).toBe('completed');
    expect(out.summary).toBe('mine');
    expect(out.findings_count).toBe(1);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('carries a failed run error through with a next action', async () => {
    const { fetch } = fakeFetch({
      ...baseRoutes(),
      'POST /pulls/pr-7/review': { json: RUN_CREATED },
      'GET /pulls/pr-7/runs': {
        json: [{ run_id: 'run-9', status: 'failed', error: 'No LLM API key configured' }],
      },
    });
    const result = await runAgentOnPrTool(makeDeps(fetch)).handler(args());
    expect(structured(result).status).toBe('failed');
    expect(textOf(result)).toContain('No LLM API key configured');
    expect(textOf(result)).toContain('Settings');
  });

  it('returns timed_out (not an error) pointing at get_findings', async () => {
    let clock = 0;
    const { fetch } = fakeFetch({
      ...baseRoutes(),
      'POST /pulls/pr-7/review': { json: RUN_CREATED },
      'GET /pulls/pr-7/runs': { json: [{ run_id: 'run-9', status: 'running', error: null }] },
    });
    const deps = makeDeps(fetch, {
      now: () => clock,
      sleep: async () => {
        clock += 10_000;
      },
    });
    const result = await runAgentOnPrTool(deps).handler(args({ wait_seconds: 30 }));
    expect(result.isError).toBe(false);
    expect(structured(result).status).toBe('timed_out');
    expect(textOf(result)).toContain('get_findings');
  });

  it('does not retry a 429 on the POST and tells the caller to wait', async () => {
    const { fetch, calls } = fakeFetch({
      ...baseRoutes(),
      'POST /pulls/pr-7/review': { status: 429, json: { error: { code: 'rate', message: 'slow' } } },
    });
    const result = await runAgentOnPrTool(makeDeps(fetch)).handler(args());
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Wait about a minute');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('keeps polling through a 429 on the GET', async () => {
    const { fetch } = fakeFetch({
      ...baseRoutes(),
      'POST /pulls/pr-7/review': { json: RUN_CREATED },
      'GET /pulls/pr-7/runs': [
        { status: 429, json: { error: { code: 'rate', message: 'slow' } } },
        { json: [{ run_id: 'run-9', status: 'done', error: null }] },
      ],
      'GET /pulls/pr-7/reviews': {
        json: [
          {
            id: 'mine',
            run_id: 'run-9',
            agent_id: 'a-sec',
            agent_name: 'Security Reviewer',
            kind: 'review',
            verdict: 'approve',
            summary: 'ok',
            score: 95,
            created_at: '2026-08-25T00:01:00Z',
            findings: [],
          },
        ],
      },
    });
    const result = await runAgentOnPrTool(makeDeps(fetch)).handler(args());
    expect(structured(result).status).toBe('completed');
  });

  it('fails forward on an unknown agent', async () => {
    const { fetch } = fakeFetch(baseRoutes());
    const result = await runAgentOnPrTool(makeDeps(fetch)).handler(args({ agent: 'secrity' }));
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('list_agents');
    expect(textOf(result)).toContain('Security Reviewer');
  });
});
