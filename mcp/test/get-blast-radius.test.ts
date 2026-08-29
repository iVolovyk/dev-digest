import { describe, expect, it } from 'vitest';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { fakeFetch, makeDeps, structured, textOf } from './helpers.js';

const REPOS = [{ id: 'repo-1', full_name: 'acme/payments-api' }];
const PULLS = [{ id: 'pr-7', number: 7 }];

function blast(over: Record<string, unknown> = {}) {
  return {
    changed_symbols: [{ name: 'parseToken', file: 'src/auth/token.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'parseToken',
        callers: [
          { name: 'requireAuth', file: 'src/auth/middleware.ts', line: 42 },
          { name: 'refreshSession', file: 'src/auth/middleware.ts', line: 88 },
        ],
        endpoints_affected: ['POST /login'],
        crons_affected: [],
        callers_total: 137,
      },
    ],
    summary: '1 changed symbol in 1 file · 137 callers across 9 files. Bounded to 2 import hops.',
    index_state: 'full',
    partial: true,
    reason: 'caller_cap',
    summary_generated: false,
    ...over,
  };
}

describe('get_blast_radius', () => {
  it('resolves repo + pull, calls exactly one GET /pulls/:id/blast, returns a compact payload', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /pulls/pr-7/blast': { json: blast() },
    });
    const tool = getBlastRadiusTool(makeDeps(fetch));
    const result = await tool.handler({ repo: 'acme/payments-api', pr: 7 });

    expect(result.isError).toBe(false);
    expect(calls.filter((c) => c.path === '/pulls/pr-7/blast')).toHaveLength(1);
    expect(() => tool.outputSchema.parse(result.structuredContent)).not.toThrow();

    const out = structured(result);
    expect(out.repo).toBe('acme/payments-api');
    expect(out.pr).toBe(7);
    expect(out.index_state).toBe('full');
    expect(out.partial).toBe(true);
    // Compact: caller objects folded to "name path:line" strings.
    expect(out.changed_symbols).toEqual(['parseToken (function) src/auth/token.ts']);
    const d = (out.downstream as Record<string, unknown>[])[0]!;
    expect(d.callers).toEqual([
      'requireAuth src/auth/middleware.ts:42',
      'refreshSession src/auth/middleware.ts:88',
    ]);
    expect(d.callers_shown).toBe(2);
    expect(d.callers_total).toBe(137);
    expect(d.endpoints).toEqual(['POST /login']);
  });

  it('forwards a degraded map WITH its index_state, not flattened to an empty result', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /pulls/pr-7/blast': {
        json: blast({
          changed_symbols: [],
          downstream: [],
          index_state: 'degraded',
          partial: true,
          reason: 'index_unavailable',
          summary: 'Impact could not be computed — status: degraded. Re-index it.',
        }),
      },
    });
    const result = await getBlastRadiusTool(makeDeps(fetch)).handler({
      repo: 'acme/payments-api',
      pr: 7,
    });
    expect(result.isError).toBe(false);
    expect(structured(result).index_state).toBe('degraded');
    expect(structured(result).partial).toBe(true);
  });

  it('fails forward on an unknown repo', async () => {
    const { fetch } = fakeFetch({ 'GET /repos': { json: REPOS } });
    const result = await getBlastRadiusTool(makeDeps(fetch)).handler({
      repo: 'acme/ghost',
      pr: 7,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('acme/payments-api');
  });

  it('fails forward on an unknown PR', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
    });
    const result = await getBlastRadiusTool(makeDeps(fetch)).handler({
      repo: 'acme/payments-api',
      pr: 999,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('#999');
  });

  it('raises the drift message on an API shape mismatch', async () => {
    const { fetch } = fakeFetch({
      'GET /repos': { json: REPOS },
      'GET /repos/repo-1/pulls': { json: PULLS },
      'GET /pulls/pr-7/blast': { json: { summary: 'x' } }, // missing required fields
    });
    const result = await getBlastRadiusTool(makeDeps(fetch)).handler({
      repo: 'acme/payments-api',
      pr: 7,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unexpected response');
  });
});
