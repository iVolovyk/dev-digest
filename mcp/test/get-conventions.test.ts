import { describe, expect, it } from 'vitest';
import { getConventionsTool } from '../src/tools/get-conventions.js';
import { fakeFetch, makeDeps, structured, textOf } from './helpers.js';

const REPOS = [{ id: 'repo-1', full_name: 'acme/payments-api' }];

describe('get_conventions', () => {
  it('never calls the extraction endpoint', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/conventions': {
        json: [
          {
            rule: 'Use safeParse at boundaries',
            category: 'validation',
            evidence_path: 'src/lib/api.ts',
            evidence_start_line: 12,
            evidence_end_line: 40,
            evidence_snippet: 'RAW FILE CONTENT THAT MUST NOT LEAK',
            confidence: 0.9,
            accepted: true,
          },
        ],
      },
    });
    const tool = getConventionsTool(makeDeps(fetch));
    const result = await tool.handler({ repo: 'acme/payments-api' });
    expect(calls.some((c) => c.path.includes('/extract'))).toBe(false);
    const out = structured(result);
    expect(() => tool.outputSchema.parse(result.structuredContent)).not.toThrow();
    expect(out.status).toBe('ok');
    expect(out.accepted_count).toBe(1);
    const convention = (out.conventions as Record<string, unknown>[])[0]!;
    expect(convention.evidence).toBe('src/lib/api.ts:12-40');
    expect(JSON.stringify(out)).not.toContain('RAW FILE CONTENT');
  });

  it('reports the empty case as a non-error that explains cache-only behaviour', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/conventions': { json: [] },
    });
    const result = await getConventionsTool(makeDeps(fetch)).handler({ repo: 'acme/payments-api' });
    expect(result.isError).toBe(false);
    expect(structured(result).status).toBe('no_conventions_cached');
    expect(textOf(result)).toContain('does not run the extraction pipeline');
  });

  it('fails forward on an unknown repo', async () => {
    const { fetch } = fakeFetch({ 'GET /repos': { json: REPOS } });
    const result = await getConventionsTool(makeDeps(fetch)).handler({ repo: 'acme/ghost' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('acme/payments-api');
  });
});
